// Template script Lua (Roblox executor) untuk status akun.
// Disajikan oleh /scripts/account_status.lua dengan alamat endpoint diisi dari domain yang
// sedang dipakai, jadi tidak ada domain atau API key yang tertanam di repositori.
// Dijalankan dengan: loadstring(game:HttpGet("https://<domain>/scripts/account_status.lua"))()

export const ENDPOINT_PLACEHOLDER = '__DBDATAENTRY_ENDPOINT__';

export const ACCOUNT_STATUS_LUA = String.raw`--[[
  dbdataentry - klien status akun Roblox (v4)
  Mengirim status ke Universal Webhook Endpoint. Tidak ada API key di script ini.

  Kolom yang dikirim: username, displayName, state, gameName, userId, placeId, jobId,
  event, latencyMs, sessionStart, timestamp, avatarUrl, type = "account_status".
  lastUpdate TIDAK dikirim: server mengisinya dari jamnya sendiri.
]]

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local HttpService = game:GetService("HttpService")

if not game:IsLoaded() then
	game.Loaded:Wait()
end

local LocalPlayer = Players.LocalPlayer
while not LocalPlayer do
	task.wait()
	LocalPlayer = Players.LocalPlayer
end

-- ===== KONFIGURASI =====
local CONFIG = {
	URL = "__DBDATAENTRY_ENDPOINT__",
	INTERVAL = 20, -- detik. Server: STALLED > 30 dtk, OFFLINE > 45 dtk. Jangan lebih dari 25.
	MAX_ATTEMPTS = 4, -- percobaan per pengiriman
	OFFLINE_ATTEMPTS = 2, -- Offline dikirim saat game menutup, waktunya sempit
	BASE_DELAY = 1.5, -- jeda retry awal (detik), dikali 2 tiap gagal
	MAX_DELAY = 12,
}
-- =======================

local httpRequest = (syn and syn.request) or (http and http.request) or http_request or request
if not httpRequest then
	warn("[dbdataentry] Executor tidak mendukung HTTP Request!")
	return
end

-- Cegah dua instance berjalan bersamaan (auto-execute + manual): yang lama dihentikan.
local sharedEnv = (getgenv and getgenv()) or _G
if type(sharedEnv.__dbdataentry_stop) == "function" then
	pcall(sharedEnv.__dbdataentry_stop)
end

local stopped = false
local offlineSent = false
local firstSent = false
local lastLatencyMs = nil -- RTT pengiriman sukses terakhir, dilaporkan di payload berikutnya
local warnedStatus = {}
local cachedGameName = nil

local SESSION_START = os.date("!%Y-%m-%dT%H:%M:%SZ")

sharedEnv.__dbdataentry_stop = function()
	stopped = true
end

local function getGameName()
	if cachedGameName then
		return cachedGameName
	end
	local ok, info = pcall(function()
		return MarketplaceService:GetProductInfo(game.PlaceId)
	end)
	if ok and info and info.Name then
		cachedGameName = info.Name
		return cachedGameName
	end
	return "Unknown Game"
end

local function warnOnce(status, body)
	if warnedStatus[status] then
		return
	end
	warnedStatus[status] = true
	if status == 400 then
		warn("[dbdataentry] Payload ditolak (400): " .. tostring(body))
	elseif status == 401 then
		warn("[dbdataentry] Server menolak request (401). Endpoint memakai token? Hubungi admin.")
	elseif status == 429 then
		warn("[dbdataentry] Terkena rate limit (429). Naikkan CONFIG.INTERVAL.")
	else
		warn("[dbdataentry] Server membalas status " .. tostring(status))
	end
end

local function shouldRetry(status)
	return status == nil or status == 408 or status == 429 or status >= 500
end

local function buildPayload(eventType)
	local payload = {
		type = "account_status",
		username = LocalPlayer.Name,
		displayName = LocalPlayer.DisplayName,
		state = (eventType == "Offline") and "OFFLINE" or "ONLINE",
		gameName = getGameName(),
		userId = LocalPlayer.UserId,
		placeId = game.PlaceId,
		jobId = game.JobId ~= "" and game.JobId or "Local/Private",
		event = eventType,
		latencyMs = lastLatencyMs, -- nil di pengiriman pertama: field dilewati
		sessionStart = SESSION_START,
		timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
		avatarUrl = "https://www.roblox.com/headshot-thumbnail/image?userId="
			.. LocalPlayer.UserId
			.. "&width=420&height=420&format=png",
	}
	local ok, encoded = pcall(function()
		return HttpService:JSONEncode(payload)
	end)
	return ok and encoded or nil
end

-- Kirim satu payload dengan retry (backoff eksponensial + jitter). Mengembalikan true jika sukses.
local function send(eventType, maxAttempts)
	local body = buildPayload(eventType)
	if not body then
		warn("[dbdataentry] Gagal meng-encode payload")
		return false
	end

	local delay = CONFIG.BASE_DELAY
	for attempt = 1, maxAttempts do
		-- Jika Offline sudah dikirim, retry yang tertinggal tidak boleh menimpanya.
		if eventType ~= "Offline" and (offlineSent or stopped) then
			return false
		end

		local startedAt = os.clock()
		local ok, res = pcall(httpRequest, {
			Url = CONFIG.URL,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = body,
		})
		local rtt = math.floor((os.clock() - startedAt) * 1000 + 0.5)
		local status = (ok and type(res) == "table" and type(res.StatusCode) == "number") and res.StatusCode or nil

		if status and status >= 200 and status < 300 then
			lastLatencyMs = rtt
			return true
		end

		if status then
			warnOnce(status, type(res) == "table" and res.Body or nil)
			if not shouldRetry(status) then
				return false -- 400/401/403/404: mengulang tidak akan membantu
			end
		end

		if attempt < maxAttempts then
			local wait = delay
			local headers = type(res) == "table" and res.Headers or nil
			local retryAfter = headers and tonumber(headers["Retry-After"] or headers["retry-after"])
			if retryAfter then
				wait = math.min(retryAfter, CONFIG.MAX_DELAY)
			end
			task.wait(wait + math.random() * 0.5)
			delay = math.min(delay * 2, CONFIG.MAX_DELAY)
		end
	end
	return false
end

local function sendOffline()
	if offlineSent then
		return
	end
	offlineSent = true
	send("Offline", CONFIG.OFFLINE_ATTEMPTS)
end

-- Pengiriman pertama bernama "Online" (dicatat di log); berikutnya "Heartbeat" (hanya memperbarui status).
local function sendActive()
	local eventType = firstSent and "Heartbeat" or "Online"
	if send(eventType, CONFIG.MAX_ATTEMPTS) then
		firstSent = true
	end
end

sendActive()

task.spawn(function()
	while not offlineSent and not stopped do
		-- jitter kecil agar banyak akun tidak mengirim serentak
		task.wait(CONFIG.INTERVAL + math.random() * 2)
		if not offlineSent and not stopped then
			sendActive()
		end
	end
end)

pcall(function()
	game:BindToClose(sendOffline)
end)

Players.PlayerRemoving:Connect(function(player)
	if player == LocalPlayer then
		sendOffline()
	end
end)
`;

import { obfuscateLuaSource } from '@/lib/lua/obfuscate';

// `obfuscate` dikontrol sakelar LUA_OBFUSCATION_ENABLED (Pengaturan Sistem, khusus Superadmin).
// Saat aktif: URL endpoint webhook dienkripsi (XOR runtime-decrypt) + seluruh skrip dibungkus
// control-flow obfuscation, sehingga endpoint tidak langsung terbaca dari hasil dekompilasi.
export function renderAccountStatusLua(endpoint: string, options: { obfuscate?: boolean } = {}): string {
  const rendered = ACCOUNT_STATUS_LUA.replace(ENDPOINT_PLACEHOLDER, endpoint);
  if (!options.obfuscate) return rendered;
  return obfuscateLuaSource(rendered, [{ configField: 'URL', value: endpoint }]).source;
}
