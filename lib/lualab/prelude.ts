// Shim Roblox untuk Fengari (Lua 5.3). Dijalankan SEKALI di state global VM; skrip uji hanya melihat tabel ENV
// (daftar putih) yang dibangun di sini. Satu-satunya jembatan ke JavaScript adalah fungsi `host(op, ...)` yang
// ditangkap sebagai upvalue (tidak ada di ENV, jadi skrip tidak bisa memanggilnya).
// Nilai Roblox (UDim2, Color3, Enum, ...) diserialisasi ke string singkat "tag:isi" untuk renderer DOM.
export const PRELUDE_LUA = String.raw`
local host = ...
local realos, realload = os, load
local floor, huge = math.floor, math.huge

local function now() return host("now") / 1000 end

-- ================= Nilai =================
local function tagged(tag, fields, extra)
  local mt = { __tag = tag }
  mt.__index = mt
  if extra then for k, v in pairs(extra) do mt[k] = v end end
  return mt
end
local UDimMT = tagged("UDim")
local UDim2MT = tagged("UDim2")
local Vec2MT = tagged("Vector2")
local C3MT = tagged("Color3")
local ItemMT = tagged("EnumItem")
ItemMT.__tostring = function(s) return "Enum." .. s.EnumType .. "." .. s.Name end

local UDim, UDim2, Vector2, Color3 = {}, {}, {}, {}
function UDim.new(s, o) return setmetatable({ Scale = s or 0, Offset = o or 0 }, UDimMT) end
function UDim2.new(a, b, c, d)
  if type(a) == "table" then return setmetatable({ X = a, Y = b }, UDim2MT) end
  return setmetatable({ X = UDim.new(a, b), Y = UDim.new(c, d) }, UDim2MT)
end
function UDim2.fromOffset(x, y) return UDim2.new(0, x, 0, y) end
function UDim2.fromScale(x, y) return UDim2.new(x, 0, y, 0) end
function Vector2.new(x, y) return setmetatable({ X = x or 0, Y = y or 0 }, Vec2MT) end
function Color3.new(r, g, b) return setmetatable({ R = r or 0, G = g or 0, B = b or 0 }, C3MT) end
function Color3.fromRGB(r, g, b) return Color3.new((r or 0) / 255, (g or 0) / 255, (b or 0) / 255) end

local Enum = setmetatable({}, { __index = function(self, name)
  local t = setmetatable({}, { __index = function(tt, item)
    local it = setmetatable({ Name = item, EnumType = name }, ItemMT)
    rawset(tt, item, it)
    return it
  end })
  rawset(self, name, t)
  return t
end })

local function enc(v)
  local tv = type(v)
  if tv == "number" then return "n:" .. tostring(v) end
  if tv == "boolean" then return v and "b:1" or "b:0" end
  if tv == "string" then return "s:" .. v end
  if tv == "table" then
    local mt = getmetatable(v)
    local tag = mt and mt.__tag
    if tag == "UDim2" then return "u2:" .. v.X.Scale .. "," .. v.X.Offset .. "," .. v.Y.Scale .. "," .. v.Y.Offset end
    if tag == "UDim" then return "u:" .. v.Scale .. "," .. v.Offset end
    if tag == "Vector2" then return "v2:" .. v.X .. "," .. v.Y end
    if tag == "Color3" then return "c:" .. v.R .. "," .. v.G .. "," .. v.B end
    if tag == "EnumItem" then return "e:" .. v.EnumType .. "." .. v.Name end
  end
  return nil
end

-- ================= Penjadwal (task.*) =================
local threads, byCo = {}, {}
local function runThread(t, ...)
  local ok, err = coroutine.resume(t.co, ...)
  if not ok then host("log", "error", tostring(err)) end
  if coroutine.status(t.co) == "dead" then t.dead = true end
end
local function spawn(f, ...)
  local t = { co = coroutine.create(f), wake = 0 }
  byCo[t.co] = t
  threads[#threads + 1] = t
  runThread(t, ...)
  return t
end
local function wait(n)
  local t = byCo[coroutine.running()]
  local start = now()
  if t then
    t.wake = start + (n or 0.03)
    coroutine.yield()
  end
  return now() - start
end
local task = {
  spawn = function(f, ...) return spawn(f, ...) end,
  defer = function(f, ...) return spawn(f, ...) end,
  wait = wait,
  delay = function(n, f, ...)
    local args = table.pack(...)
    return spawn(function() wait(n); f(table.unpack(args, 1, args.n)) end)
  end,
  cancel = function(t) if t then t.cancelled = true end end,
}

-- ================= Signal =================
local ConnMT = {}
ConnMT.__index = ConnMT
function ConnMT:Disconnect() self.Connected = false end
local Signal = {}
Signal.__index = Signal
function Signal.new() return setmetatable({ conns = {}, waiters = {} }, Signal) end
function Signal:Connect(f)
  local c = setmetatable({ f = f, Connected = true }, ConnMT)
  self.conns[#self.conns + 1] = c
  return c
end
Signal.connect = Signal.Connect
function Signal:Fire(...)
  local live = {}
  for _, c in ipairs(self.conns) do
    if c.Connected then live[#live + 1] = c; spawn(c.f, ...) end
  end
  self.conns = live
  local ws = self.waiters
  self.waiters = {}
  for _, w in ipairs(ws) do w.resume = table.pack(...); w.wake = 0 end
end
function Signal:Wait()
  local t = byCo[coroutine.running()]
  if not t then return end
  self.waiters[#self.waiters + 1] = t
  t.wake = huge
  return coroutine.yield()
end

-- ================= Instance =================
local store = setmetatable({}, { __mode = "k" })
local byId = {}
local nextId = 1
local EVENTS = {
  Activated = true, MouseEnter = true, MouseLeave = true, MouseButton1Down = true, MouseButton1Up = true,
  MouseButton1Click = true, InputBegan = true, InputChanged = true, InputEnded = true, Changed = true,
  ChildAdded = true, ChildRemoved = true, AncestryChanged = true, Destroying = true,
}
local GUI = { Frame = true, TextLabel = true, TextButton = true, ImageLabel = true, ImageButton = true, ScrollingFrame = true, TextBox = true, CanvasGroup = true }
local DEFAULTS = {
  Visible = true, Enabled = true, BackgroundTransparency = 0, Active = false, ZIndex = 1, Text = "", TextTransparency = 0,
  Position = UDim2.new(0, 0, 0, 0), Size = UDim2.new(0, 100, 0, 100), AnchorPoint = Vector2.new(0, 0),
}
local InstMT = {}
local Methods = {}

local function detach(self)
  local d = store[self]
  local p = d.parent
  if p then
    local pd = store[p]
    for i, c in ipairs(pd.children) do if c == self then table.remove(pd.children, i); break end end
    d.parent = nil
  end
end
local function setParent(self, p)
  local d = store[self]
  if d.destroyed then return end
  detach(self)
  if p ~= nil then
    local pd = store[p]
    pd.children[#pd.children + 1] = self
    d.parent = p
    if pd.signals.ChildAdded then pd.signals.ChildAdded:Fire(self) end
  end
  host("parent", d.id, p and store[p].id or 0)
end
local function destroy(self)
  local d = store[self]
  if d.destroyed then return end
  d.destroyed = true
  for _, c in ipairs({ table.unpack(d.children) }) do destroy(c) end
  detach(self)
  for _, s in pairs(d.signals) do s.conns = {} end
  byId[d.id] = nil
  host("destroy", d.id)
end

InstMT.__index = function(self, k)
  local d = store[self]
  if k == "Parent" then return d.parent end
  if k == "ClassName" then return d.class end
  if k == "Name" then return d.name end
  local m = Methods[k]
  if m then return m end
  if EVENTS[k] then
    local s = d.signals[k]
    if not s then s = Signal.new(); d.signals[k] = s end
    return s
  end
  local v = d.props[k]
  if v ~= nil then return v end
  for _, c in ipairs(d.children) do if store[c].name == k then return c end end
  return DEFAULTS[k]
end
InstMT.__newindex = function(self, k, v)
  local d = store[self]
  if k == "Parent" then return setParent(self, v) end
  if k == "Name" then d.name = tostring(v); host("set", d.id, "Name", "s:" .. d.name); return end
  d.props[k] = v
  local e = enc(v)
  if e then host("set", d.id, k, e) end
end
InstMT.__tostring = function(self) return store[self].name end

function Methods.Destroy(self) destroy(self) end
function Methods.GetChildren(self) return { table.unpack(store[self].children) } end
function Methods.FindFirstChild(self, name)
  for _, c in ipairs(store[self].children) do if store[c].name == name then return c end end
end
function Methods.FindFirstChildOfClass(self, class)
  for _, c in ipairs(store[self].children) do if store[c].class == class then return c end end
end
function Methods.WaitForChild(self, name, timeout)
  local t0 = now()
  while true do
    local c = Methods.FindFirstChild(self, name)
    if c then return c end
    if timeout and now() - t0 > timeout then return nil end
    wait(0.1)
  end
end
function Methods.IsA(self, class)
  local c = store[self].class
  return c == class or (class == "GuiObject" and GUI[c] == true) or class == "Instance"
end

local Instance = {}
function Instance.new(class)
  local id = nextId
  nextId = nextId + 1
  local self = setmetatable({}, InstMT)
  store[self] = { id = id, class = class, name = class, props = {}, children = {}, signals = {} }
  byId[id] = self
  host("create", id, class)
  return self
end

-- ================= JSON =================
local function jsonStr(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
    return map[c] or string.format("\\u%04x", c:byte())
  end) .. '"'
end
local function jsonEncode(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == huge or v == -huge then return "null" end
    if v == floor(v) and math.abs(v) < 2^53 then return string.format("%d", v) end
    return tostring(v)
  end
  if t == "string" then return jsonStr(v) end
  if t == "table" then
    local n, max = 0, 0
    for k in pairs(v) do
      n = n + 1
      if type(k) == "number" and k > max then max = k end
    end
    if n == 0 then return "[]" end
    local parts = {}
    if max == n then
      for i = 1, n do parts[i] = jsonEncode(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, val in pairs(v) do parts[#parts + 1] = jsonStr(tostring(k)) .. ":" .. jsonEncode(val) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  error("tipe tidak bisa di-encode JSON: " .. t)
end
local function jsonDecode(s)
  local i = 1
  local function ws() i = s:find("%S", i) or #s + 1 end
  local value
  local function str()
    local out = {}
    i = i + 1
    while true do
      local c = s:sub(i, i)
      if c == "" then error("JSON: string tidak ditutup") end
      if c == '"' then i = i + 1; break end
      if c == "\\" then
        local n = s:sub(i + 1, i + 1)
        local map = { n = "\n", r = "\r", t = "\t", b = "\b", f = "\f" }
        if n == "u" then
          out[#out + 1] = utf8.char(tonumber(s:sub(i + 2, i + 5), 16) or 63)
          i = i + 6
        else
          out[#out + 1] = map[n] or n
          i = i + 2
        end
      else
        out[#out + 1] = c
        i = i + 1
      end
    end
    return table.concat(out)
  end
  function value()
    ws()
    local c = s:sub(i, i)
    if c == "{" then
      local o = {}
      i = i + 1
      ws()
      if s:sub(i, i) == "}" then i = i + 1; return o end
      while true do
        ws()
        local k = str()
        ws()
        if s:sub(i, i) ~= ":" then error("JSON: ':' diharapkan") end
        i = i + 1
        o[k] = value()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == "}" then return o end
        if d ~= "," then error("JSON: ',' atau '}' diharapkan") end
      end
    elseif c == "[" then
      local a = {}
      i = i + 1
      ws()
      if s:sub(i, i) == "]" then i = i + 1; return a end
      while true do
        a[#a + 1] = value()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == "]" then return a end
        if d ~= "," then error("JSON: ',' atau ']' diharapkan") end
      end
    elseif c == '"' then return str()
    elseif s:sub(i, i + 3) == "true" then i = i + 4; return true
    elseif s:sub(i, i + 4) == "false" then i = i + 5; return false
    elseif s:sub(i, i + 3) == "null" then i = i + 4; return nil
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[+-]?%d*", i)
      if not num or num == "" then error("JSON: token tidak dikenal di posisi " .. i) end
      i = i + #num
      return tonumber(num)
    end
  end
  local v = value()
  return v
end

-- ================= Tween =================
local function ease(style, dir, a)
  if style == "Linear" then return a end
  if style == "Sine" and dir == "InOut" then return -(math.cos(math.pi * a) - 1) / 2 end
  if style == "Sine" then return math.sin(a * math.pi / 2) end
  if dir == "In" then return a * a end
  if dir == "InOut" then return a < 0.5 and 2 * a * a or 1 - ((-2 * a + 2) ^ 2) / 2 end
  return 1 - (1 - a) * (1 - a)
end
local function lerp(a, b, t)
  if type(a) == "number" then return a + (b - a) * t end
  local mt = getmetatable(a)
  local tag = mt and mt.__tag
  if tag == "UDim2" then return UDim2.new(lerp(a.X.Scale, b.X.Scale, t), lerp(a.X.Offset, b.X.Offset, t), lerp(a.Y.Scale, b.Y.Scale, t), lerp(a.Y.Offset, b.Y.Offset, t)) end
  if tag == "Color3" then return Color3.new(lerp(a.R, b.R, t), lerp(a.G, b.G, t), lerp(a.B, b.B, t)) end
  if tag == "Vector2" then return Vector2.new(lerp(a.X, b.X, t), lerp(a.Y, b.Y, t)) end
  return b
end
local TweenInfo = {}
function TweenInfo.new(time, style, dir, repeatCount, reverses, delay)
  return { Time = time or 1, Style = style and style.Name or "Quad", Dir = dir and dir.Name or "Out", Repeat = repeatCount or 0, Reverses = reverses or false, Delay = delay or 0 }
end
local TweenService = {}
function TweenService:Create(inst, info, goal)
  local tw = { cancelled = false }
  function tw:Play()
    self.cancelled = false
    local run = {}
    self.run = run
    spawn(function()
      local from = {}
      for k in pairs(goal) do from[k] = inst[k] end
      if info.Delay > 0 then wait(info.Delay) end
      local cycles, c = info.Repeat, 0
      while not run.stop and not self.cancelled do
        local forward = (not info.Reverses) or c % 2 == 0
        local t0 = now()
        while not run.stop do
          local a = math.min((now() - t0) / math.max(info.Time, 0.001), 1)
          local e = ease(info.Style, info.Dir, a)
          if not forward then e = 1 - e end
          for k, to in pairs(goal) do pcall(function() inst[k] = lerp(from[k], to, e) end) end
          if a >= 1 then break end
          wait(0)
        end
        c = c + 1
        if cycles >= 0 and c > cycles then break end
      end
    end)
  end
  function tw:Cancel() self.cancelled = true; if self.run then self.run.stop = true end end
  tw.Pause = tw.Cancel
  tw.Destroy = tw.Cancel
  return tw
end

-- ================= Layanan =================
local genv = {}
local pendingHttp, nextHttp = {}, 1
local closers = {}
local CoreGui = Instance.new("CoreGui")
local LocalPlayer = {
  Name = host("opt", "userName"), DisplayName = host("opt", "displayName"), UserId = tonumber(host("opt", "userId")),
  GetNetworkPing = function() return 0.02 + math.random() * 0.01 end,
}
local Players = { LocalPlayer = LocalPlayer, PlayerRemoving = Signal.new() }
local RunService = { RenderStepped = Signal.new(), Heartbeat = Signal.new(), Stepped = Signal.new() }
local UserInputService = { InputBegan = Signal.new(), InputChanged = Signal.new(), InputEnded = Signal.new() }
local HttpService = {
  JSONEncode = function(_, v) return jsonEncode(v) end,
  JSONDecode = function(_, s) return jsonDecode(s) end,
  GenerateGUID = function() return host("guid") end,
  UrlEncode = function(_, v) return (tostring(v):gsub("[^%w%-_%.~]", function(c) return string.format("%%%02X", c:byte()) end)) end,
}
local Stats = {
  Network = { ServerStatsItem = { ["Data Ping"] = { GetValue = function() return 35 + math.random() * 20 end } } },
  GetTotalMemoryUsageMb = function() return 480 + math.random() * 40 end,
}
local MarketplaceService = { GetProductInfo = function(_, id) return { Name = host("opt", "gameName") } end }
local services = {
  Players = Players, RunService = RunService, UserInputService = UserInputService, HttpService = HttpService,
  TweenService = TweenService, Stats = Stats, MarketplaceService = MarketplaceService, CoreGui = CoreGui,
}
local game = {
  PlaceId = tonumber(host("opt", "placeId")), JobId = host("opt", "jobId"), GameId = 1, Name = host("opt", "gameName"),
  Loaded = Signal.new(),
  IsLoaded = function() return true end,
  GetService = function(_, name)
    local s = services[name]
    if not s then error("Layanan tidak ada di Test Lab: " .. tostring(name)) end
    return s
  end,
  BindToClose = function(_, f) closers[#closers + 1] = f end,
}

local function request(opts)
  local t = byCo[coroutine.running()]
  if not t then error("request harus dipanggil dari thread") end
  local id = nextHttp
  nextHttp = nextHttp + 1
  pendingHttp[id] = t
  local headers = {}
  for k, v in pairs(opts.Headers or {}) do headers[tostring(k)] = tostring(v) end
  host("http", id, tostring(opts.Method or "GET"), tostring(opts.Url or ""), jsonEncode(headers), opts.Body and tostring(opts.Body) or "")
  t.wake = huge
  -- Hasil dikirim lewat nilai kembali yield (step() sudah mengosongkan t.resume sebelum melanjutkan thread).
  return (coroutine.yield())
end

-- ================= Sandbox =================
local function copy(src, skip)
  local out = {}
  for k, v in pairs(src) do if not (skip and skip[k]) then out[k] = v end end
  return out
end
local ENV = {
  assert = assert, error = error, ipairs = ipairs, next = next, pairs = pairs, pcall = pcall, xpcall = xpcall, select = select,
  setmetatable = setmetatable, getmetatable = getmetatable, tonumber = tonumber, tostring = tostring, type = type,
  rawget = rawget, rawset = rawset, rawequal = rawequal, rawlen = rawlen, unpack = table.unpack,
  string = copy(string, { dump = true }), table = copy(table), math = copy(math), utf8 = copy(utf8),
  Instance = Instance, UDim = UDim, UDim2 = UDim2, Vector2 = Vector2, Color3 = Color3, Enum = Enum, TweenInfo = TweenInfo,
  game = game, task = task, request = request, getgenv = function() return genv end, gethui = function() return CoreGui end,
  collectgarbage = function() return 0 end, identifyexecutor = function() return "dbdataentry-testlab", "1" end,
  typeof = function(v) local mt = type(v) == "table" and getmetatable(v); return (mt and mt.__tag) or type(v) end,
  warn = function(...) local p = table.pack(...); for i = 1, p.n do p[i] = tostring(p[i]) end; host("log", "warn", table.concat(p, " ")) end,
  print = function(...) local p = table.pack(...); for i = 1, p.n do p[i] = tostring(p[i]) end; host("log", "info", table.concat(p, " ")) end,
  wait = wait, spawn = function(f, ...) return spawn(f, ...) end,
  os = {
    clock = function() return now() end,
    time = function() return floor(host("epoch") / 1000) end,
    date = function(fmt, t) return realos.date(fmt or "%c", t or floor(host("epoch") / 1000)) end,
  },
}
-- Ekstensi Luau yang dipakai skrip executor.
ENV.math.clamp = function(v, lo, hi) return math.min(math.max(v, lo), hi) end
ENV.math.round = function(v) return v >= 0 and floor(v + 0.5) or -floor(-v + 0.5) end
ENV.math.sign = function(v) return v > 0 and 1 or (v < 0 and -1 or 0) end
ENV.bit32 = {
  band = function(a, b) return (a & b) & 0xFFFFFFFF end, bor = function(a, b) return (a | b) & 0xFFFFFFFF end,
  bxor = function(a, b) return (a ~ b) & 0xFFFFFFFF end, bnot = function(a) return (~a) & 0xFFFFFFFF end,
  lshift = function(a, n) return (a << n) & 0xFFFFFFFF end, rshift = function(a, n) return (a & 0xFFFFFFFF) >> n end,
}
ENV._G = ENV
local function sandboxLoad(src, name)
  if type(src) ~= "string" then return nil, "loadstring butuh string" end
  return realload(src, name or "=chunk", "t", ENV)
end
ENV.loadstring = sandboxLoad
ENV.load = sandboxLoad

-- ================= API untuk JavaScript =================
function __tl_start(src)
  local fn, err = realload(src, "=script", "t", ENV)
  if not fn then host("log", "error", tostring(err)); return false end
  spawn(fn)
  return true
end
function __tl_step(dt)
  local t = now()
  local snap = {}
  for _, th in ipairs(threads) do snap[#snap + 1] = th end
  for _, th in ipairs(snap) do
    if not th.dead and not th.cancelled and th.wake <= t then
      th.wake = huge
      local r = th.resume
      th.resume = nil
      if r then runThread(th, table.unpack(r, 1, r.n)) else runThread(th) end
    end
  end
  local alive = {}
  for _, th in ipairs(threads) do if not th.dead and not th.cancelled then alive[#alive + 1] = th end end
  threads = alive
  RunService.RenderStepped:Fire(dt or 0.016)
  RunService.Heartbeat:Fire(dt or 0.016)
end
function __tl_http(id, status, body)
  local t = pendingHttp[id]
  pendingHttp[id] = nil
  if not t then return end
  t.resume = table.pack({ Success = status >= 200 and status < 300, StatusCode = status, StatusMessage = tostring(status), Body = body, Headers = {} })
  t.wake = 0
end
local activeInput
function __tl_fire(id, event, kind, x, y)
  local inst = byId[id]
  if event == "Key" then
    local input = { KeyCode = Enum.KeyCode[kind], UserInputType = Enum.UserInputType.Keyboard, UserInputState = Enum.UserInputState.Begin }
    UserInputService.InputBegan:Fire(input, false)
    return
  end
  if event == "Move" then
    UserInputService.InputChanged:Fire({ UserInputType = Enum.UserInputType.MouseMovement, Position = Vector2.new(x, y), Changed = Signal.new(), UserInputState = Enum.UserInputState.Change }, false)
    return
  end
  if event == "InputBegan" and inst then
    activeInput = { UserInputType = Enum.UserInputType[kind], Position = Vector2.new(x, y), Changed = Signal.new(), UserInputState = Enum.UserInputState.Begin }
    inst.InputBegan:Fire(activeInput)
    return
  end
  if event == "InputEnded" then
    if activeInput then
      activeInput.UserInputState = Enum.UserInputState.End
      activeInput.Changed:Fire()
      activeInput = nil
    end
    return
  end
  if inst and EVENTS[event] then inst[event]:Fire() end
end
function __tl_close()
  Players.PlayerRemoving:Fire(LocalPlayer)
  for _, f in ipairs(closers) do spawn(f) end
end
function __tl_count()
  local n = 0
  for _ in pairs(byId) do n = n + 1 end
  return n
end
`;
