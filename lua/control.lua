-- lua/control.lua: polling perintah kontrol (KILL / PAUSE / RESUME) dari server.
-- Dirakit server sebagai badan fungsi dengan parameter G = modul guard (G.request / G.wipe). Mengembalikan tabel M.
--
-- Skrip utama menyediakan hook di getgenv() (lihat lib/lua/accountStatus.ts):
--   __dbdataentry_stop       hentikan semua loop + hancurkan UI
--   __dbdataentry_offline    kirim status OFFLINE (agar dashboard langsung benar)
--   __dbdataentry_setpaused  true = jeda pengiriman, false = lanjut
--   __dbdataentry_ready      true setelah inisialisasi selesai (KILL menunggu ini)
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local env = (getgenv and getgenv()) or _G

local POLL_INTERVAL = 5 -- detik; server membatasi 600 poll/menit per key
local MAX_BACKOFF = 6 -- pengali jeda maksimum saat server tak terjangkau (tidak pernah menghentikan skrip)
local HOOKS = { "__dbdataentry_stop", "__dbdataentry_offline", "__dbdataentry_setpaused", "__dbdataentry_ready" }

local M = { running = false, killed = false }
local lastId = nil -- id perintah PAUSE/RESUME terakhir yang dijalankan (dedupe: server mengirim ulang sampai ack)

local function callHook(name, ...)
	local fn = env[name]
	if type(fn) == "function" then
		return pcall(fn, ...)
	end
	return false
end

local function accountName()
	local player = Players.LocalPlayer
	return player and player.Name or nil
end

local function ack(id)
	local name = accountName()
	if id and name then
		G.request("PUT", "/api/receiver/control", { account = name, id = id })
	end
end

-- KILL bisa tiba saat skrip utama masih booting (hook & UI belum dibuat). Tunggu penanda siap dulu (maks. timeout detik);
-- bila skrip utama berhenti lebih awal dan tidak pernah siap, tetap lanjut agar kill tidak tertahan selamanya.
local function waitForMain(timeout)
	local waited = 0
	while not env.__dbdataentry_ready and waited < timeout do
		task.wait(0.25)
		waited = waited + 0.25
	end
end

-- Hentikan seluruh proses lalu lepas semua jejaknya. Urutan penting: ack dulu (butuh token), baru wipe.
local function secureKill(reason, id)
	if M.killed then
		return
	end
	M.killed = true
	M.running = false
	warn("[dbdataentry] dihentikan oleh server (" .. tostring(reason) .. ")")
	ack(id) -- 1. konfirmasi ke server selagi token masih ada
	waitForMain(20)
	callHook("__dbdataentry_offline") -- 2. tandai akun OFFLINE di dashboard
	callHook("__dbdataentry_stop") -- 3. hentikan loop + hancurkan UI + putuskan koneksi
	for _, name in ipairs(HOOKS) do
		env[name] = nil -- 4. lepas hook global (instance baru tidak akan "menghentikan" bangkai lama)
	end
	G.wipe() -- 5. hapus token & HWID dari memori
	lastId = nil
	-- Lua tidak bisa membebaskan kodenya sendiri secara paksa: semua thread berhenti dan semua referensi dilepas,
	-- sehingga GC mengambilnya pada siklus berikutnya.
	pcall(collectgarbage)
end

local function handle(data)
	local cmd = data.cmd
	if cmd == "KILL" then
		secureKill(data.reason or "remote", data.id)
	elseif (cmd == "PAUSE" or cmd == "RESUME") and type(data.id) == "string" then
		if data.id ~= lastId then
			lastId = data.id
			callHook("__dbdataentry_setpaused", cmd == "PAUSE")
		end
		ack(data.id) -- ulangi ack bila ack sebelumnya gagal di jaringan; idempotent di server
	end
end

function M.start()
	if M.running or M.killed then
		return
	end
	M.running = true
	task.spawn(function()
		local failures = 0
		while M.running and not M.killed do
			local name = accountName()
			if name then
				local status, data = G.request("GET", "/api/receiver/control?account=" .. HttpService:UrlEncode(name))
				-- KILL dipercaya pada status apa pun (server menolak salinan tak sah dengan 403 + cmd = KILL).
				if type(data) == "table" and (status == 200 or data.cmd == "KILL") then
					failures = 0
					handle(data)
				else
					failures = math.min(failures + 1, MAX_BACKOFF)
				end
			end
			if M.killed then
				break
			end
			task.wait(POLL_INTERVAL * (1 + failures) + math.random())
		end
	end)
end

return M
