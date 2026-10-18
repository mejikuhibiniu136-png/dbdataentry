-- lua/guard_public.lua: pengganti guard.lua untuk skrip publik (/scripts/account_status.lua, tanpa API Key / HWID).
-- Hanya menyediakan antarmuka yang dipakai control.lua: G.request(method, path, body) dan G.wipe().
-- Dirakit server sebagai badan fungsi; placeholder token + base diisi PER PERMINTAAN.
local HttpService = game:GetService("HttpService")
local httpRequest = (syn and syn.request) or (http and http.request) or http_request or request

local WM_TOKEN, BASE = "__WM_TOKEN__", "__WM_BASE__"

local S = { token = WM_TOKEN }

local M = {}

-- Mengembalikan (status, body JSON atau nil); nil bila gagal jaringan / sudah di-wipe.
function M.request(method, path, body)
	if not S.token or not httpRequest then
		return nil
	end
	local headers = { ["x-wm"] = S.token }
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

function M.wipe()
	S.token = nil
end

return M
