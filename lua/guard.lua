-- lua/guard.lua: verifikasi HWID + lapor kebocoran.
-- Dirakit server (lib/scriptguard/compose.ts) sebagai badan fungsi: placeholder WM (token, salt, fp, jti, base) diisi PER UNDUHAN, dan
-- modul ini mengembalikan tabel M. Variabel di sini lokal, bukan global, jadi tidak bocor ke skrip lain di executor.
--
-- Batas jujur: pemeriksaan lokal ini hanya jaring pertama (menolak salinan yang dibawa ke perangkat lain dan
-- melapor). Kode klien selalu bisa dipatch; penegakan sebenarnya ada di server: setiap request kontrol membawa
-- HWID perangkat nyata + token watermark, dan ditolak/dicatat bila perangkat tidak terdaftar.
local HttpService = game:GetService("HttpService")
local httpRequest = (syn and syn.request) or (http and http.request) or http_request or request

local WM_TOKEN, SALT, FP, JTI, BASE = "__WM_TOKEN__", "__WM_SALT__", "__WM_FP__", "__WM_JTI__", "__WM_BASE__"

local MOD = 4294967296

-- HARUS identik dengan fingerprint() di lib/scriptguard/hwid.ts (perkalian < 2^53: eksak di double).
local function fingerprint(hwid, salt)
	local s = salt .. "|" .. hwid
	local a, b = 2166136261, 5381
	for i = 1, #s do
		local c = s:byte(i)
		a = (bit32.bxor(a, c) * 65599) % MOD
		b = (b * 33 + c) % MOD
	end
	return string.format("%08x%08x", a, b)
end

-- Urutan sumber HWID HARUS sama dengan public/loader/loader.lua (loader mengirimnya saat mengunduh).
local function readHwid()
	local sources = {
		function()
			return gethwid and gethwid()
		end,
		function()
			return game:GetService("RbxAnalyticsService"):GetClientId()
		end,
	}
	for _, source in ipairs(sources) do
		local ok, value = pcall(source)
		if ok and type(value) == "string" and #value >= 8 and #value <= 128 and not value:find("[^%g]") then
			return value
		end
	end
	return nil
end

-- Rahasia ditaruh di satu tabel agar bisa dihapus (wipe) saat skrip dihentikan.
local S = { token = WM_TOKEN, hwid = readHwid() }

local M = {}

-- Request terautentikasi ke server. Mengembalikan (status, body JSON atau nil); nil bila gagal jaringan / sudah di-wipe.
function M.request(method, path, body)
	if not S.token or not httpRequest then
		return nil
	end
	local headers = { ["x-wm"] = S.token, ["x-hwid"] = S.hwid or "unavailable" }
	local encoded
	if body ~= nil then
		headers["Content-Type"] = "application/json"
		local okEnc, value = pcall(function()
			return HttpService:JSONEncode(body)
		end)
		if not okEnc then
			return nil
		end
		encoded = value
	end
	local ok, res = pcall(httpRequest, { Url = BASE .. path, Method = method, Headers = headers, Body = encoded })
	if not ok or type(res) ~= "table" then
		return nil
	end
	local decoded
	if type(res.Body) == "string" then
		local okDec, value = pcall(function()
			return HttpService:JSONDecode(res.Body)
		end)
		if okDec and type(value) == "table" then
			decoded = value
		end
	end
	return res.StatusCode, decoded
end

-- true = boleh lanjut. Cocok lokal -> lanjut. Tidak cocok -> lapor ke server (yang memutuskan: server membandingkan
-- HWID dengan daftar perangkat terdaftar dan mencatat kebocoran ke Redis); gagal menghubungi server = tolak.
function M.enforce()
	if not httpRequest then
		warn("[dbdataentry] executor tidak mendukung HTTP request")
		return false
	end
	if not S.hwid then
		warn("[dbdataentry] HWID perangkat tidak terbaca")
		return false
	end
	if fingerprint(S.hwid, SALT) == FP then
		return true
	end
	local status, data = M.request("POST", "/api/scripts/report", { token = S.token, hwid = S.hwid, jti = JTI, reason = "local_mismatch" })
	if status == 200 and type(data) == "table" and data.match == true then
		return true
	end
	warn("[dbdataentry] salinan skrip ini tidak terdaftar untuk perangkat ini")
	S.token, S.hwid = nil, nil
	return false
end

-- Hapus token & HWID dari memori (dipanggil saat kill).
function M.wipe()
	S.token, S.hwid = nil, nil
end

return M
