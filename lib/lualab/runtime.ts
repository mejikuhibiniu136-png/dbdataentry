// Runtime Lua di browser/Node: Fengari (VM Lua 5.3 murni JS) + shim Roblox (prelude.ts).
// Skrip dijalankan di sandbox ENV (daftar putih). Dunia luar hanya lewat HostIO di bawah ini:
//   render  -> operasi pohon GUI (dirender DOM oleh stage.ts, atau dikumpulkan tes)
//   http    -> permintaan jaringan (dry-run / live ditentukan pemanggil; path dipagari di sini)
//   now/epoch -> jam virtual (bisa dipercepat)
import { lauxlib, lua, lualib, to_jsstring, to_luastring } from 'fengari';
import { PRELUDE_LUA } from '@/lib/lualab/prelude';

export type RenderOp =
  | { t: 'create'; id: number; cls: string }
  | { t: 'set'; id: number; prop: string; v: string }
  | { t: 'parent'; id: number; parent: number }
  | { t: 'destroy'; id: number };

export interface HttpReq { id: number; method: string; url: string; headers: Record<string, string>; body: string }
export interface HttpRes { status: number; body: string }
export interface HostIO {
  render(op: RenderOp): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
  http(req: HttpReq): Promise<HttpRes>;
  now(): number; // ms (jam virtual)
  epoch(): number; // ms sejak 1970 (jam virtual)
}
export interface RuntimeOptions { userName: string; displayName: string; userId: string; placeId: string; jobId: string; gameName: string }

const MAX_SLICE_MS = 250; // satu langkah Lua tidak boleh menahan thread browser lebih lama dari ini
const START_SLICE_MS = 8000; // pemuatan awal (mendekripsi skrip ter-obfuscate ~200 KB di VM JS) boleh lebih lama
const MAX_BODY = 256 * 1024;

// Hanya path ini yang boleh dipanggil skrip (same-origin). Selain itu dijawab 0 (jaringan gagal) dan dicatat.
export const LIVE_ALLOWED_PATHS = ['/api/receiver/universal', '/api/maintenance', '/api/receiver/control'] as const;
const ALLOWED_HEADERS = new Set(['x-wm', 'x-hwid', 'content-type', 'x-api-key']);

export function checkRequest(req: HttpReq, origin: string): { ok: true; url: URL; headers: Record<string, string> } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(req.url); } catch { return { ok: false, reason: 'URL tidak valid' }; }
  if (url.origin !== origin) return { ok: false, reason: `host di luar daftar putih (${url.host})` };
  if (!(LIVE_ALLOWED_PATHS as readonly string[]).includes(url.pathname)) return { ok: false, reason: `path di luar daftar putih (${url.pathname})` };
  if (!['GET', 'POST', 'PUT'].includes(req.method.toUpperCase())) return { ok: false, reason: `metode ${req.method} tidak diizinkan` };
  if (req.body.length > MAX_BODY) return { ok: false, reason: 'body terlalu besar' };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (ALLOWED_HEADERS.has(k.toLowerCase())) headers[k] = v;
  return { ok: true, url, headers };
}

export class LuaRuntime {
  private L: unknown;
  private deadline = Infinity;
  private disposed = false;
  private pending = 0;

  constructor(private io: HostIO, private opts: RuntimeOptions, private startSliceMs = START_SLICE_MS) {
    const L = lauxlib.luaL_newstate();
    this.L = L;
    // Hanya pustaka murni yang dibuka (tanpa io, package, debug): skrip tidak pernah melihat state ini, hanya ENV dari
    // prelude, tapi ini menjaga agar kode berkas/proses Fengari tidak ikut aktif sama sekali.
    const libs: [string, unknown][] = [['_G', lualib.luaopen_base], ['coroutine', lualib.luaopen_coroutine], ['table', lualib.luaopen_table],
      ['string', lualib.luaopen_string], ['utf8', lualib.luaopen_utf8], ['math', lualib.luaopen_math], ['os', lualib.luaopen_os]];
    for (const [name, open] of libs) { lauxlib.luaL_requiref(L, to_luastring(name), open, 1); lua.lua_pop(L, 1); }
    lua.lua_sethook(L, (S: unknown) => {
      if (performance.now() > this.deadline) lauxlib.luaL_error(S, to_luastring('script timeout (loop tak berujung?)'));
    }, lua.LUA_MASKCOUNT, 20_000);

    const host = (S: unknown): number => this.hostCall(S);
    const chunk = to_luastring(PRELUDE_LUA);
    if (lauxlib.luaL_loadbuffer(L, chunk, chunk.length, to_luastring('=prelude')) !== 0) throw new Error(`prelude: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    lua.lua_pushjsfunction(L, host);
    this.guard(() => { if (lua.lua_pcall(L, 1, 0, 0) !== 0) throw new Error(`prelude: ${to_jsstring(lua.lua_tostring(L, -1))}`); });
  }

  private guard<T>(fn: () => T, sliceMs = MAX_SLICE_MS): T {
    this.deadline = performance.now() + sliceMs;
    try { return fn(); } finally { this.deadline = Infinity; }
  }

  private str(S: unknown, i: number): string {
    return lua.lua_type(S, i) <= 0 ? '' : to_jsstring(lua.lua_tostring(S, i));
  }

  // Jembatan Lua -> JS. Semua argumen string/angka; balasan string atau angka.
  private hostCall(S: unknown): number {
    const op = this.str(S, 1);
    const a = (i: number) => this.str(S, i + 1);
    const pushS = (v: string) => { lua.lua_pushstring(S, to_luastring(v)); return 1; };
    switch (op) {
      case 'now': lua.lua_pushnumber(S, this.io.now()); return 1;
      case 'epoch': lua.lua_pushnumber(S, this.io.epoch()); return 1;
      case 'guid': return pushS(crypto.randomUUID());
      case 'opt': return pushS(String((this.opts as unknown as Record<string, string>)[a(1)] ?? ''));
      case 'log': this.io.log(a(1) as 'info' | 'warn' | 'error', a(2).slice(0, 2000)); return 0;
      case 'create': this.io.render({ t: 'create', id: Number(a(1)), cls: a(2) }); return 0;
      case 'set': this.io.render({ t: 'set', id: Number(a(1)), prop: a(2), v: a(3) }); return 0;
      case 'parent': this.io.render({ t: 'parent', id: Number(a(1)), parent: Number(a(2)) }); return 0;
      case 'destroy': this.io.render({ t: 'destroy', id: Number(a(1)) }); return 0;
      case 'http': {
        const id = Number(a(1));
        let headers: Record<string, string> = {};
        try { headers = JSON.parse(a(4) || '{}'); } catch { headers = {}; }
        this.pending += 1;
        void this.io.http({ id, method: a(2).toUpperCase(), url: a(3), headers, body: a(5) })
          .catch(() => ({ status: 0, body: '' }))
          .then((r) => { this.pending -= 1; if (!this.disposed) this.call('__tl_http', id, r.status, r.body); });
        return 0;
      }
      default: return 0;
    }
  }

  private call(name: string, ...args: (string | number | boolean)[]): boolean {
    if (this.disposed) return false;
    const L = this.L;
    return this.guard(() => {
      lua.lua_getglobal(L, to_luastring(name));
      for (const v of args) {
        if (typeof v === 'number') lua.lua_pushnumber(L, v);
        else if (typeof v === 'boolean') lua.lua_pushboolean(L, v);
        else lua.lua_pushstring(L, to_luastring(v));
      }
      if (lua.lua_pcall(L, args.length, 1, 0) !== 0) {
        this.io.log('error', to_jsstring(lua.lua_tostring(L, -1)));
        lua.lua_pop(L, 1);
        return false;
      }
      const ok = lua.lua_toboolean(L, -1) !== false || lua.lua_isnil(L, -1);
      lua.lua_pop(L, 1);
      return ok;
    });
  }

  /** Muat dan jalankan skrip (di thread Lua sendiri). */
  start(source: string): boolean {
    const L = this.L;
    return this.guard(() => {
      lua.lua_getglobal(L, to_luastring('__tl_start'));
      lua.lua_pushstring(L, to_luastring(source));
      if (lua.lua_pcall(L, 1, 1, 0) !== 0) { this.io.log('error', to_jsstring(lua.lua_tostring(L, -1))); return false; }
      const ok = lua.lua_toboolean(L, -1);
      lua.lua_pop(L, 1);
      return ok;
    }, this.startSliceMs);
  }

  /** Dipanggil tiap frame: membangunkan thread yang waktunya tiba + RenderStepped/Heartbeat. */
  tick(dtSeconds = 0.033): void { this.call('__tl_step', dtSeconds); }
  fire(id: number, event: string, kind = '', x = 0, y = 0): void { this.call('__tl_fire', id, event, kind, x, y); }
  /** game:BindToClose + PlayerRemoving (mengirim Offline). Pemanggil terus men-tick beberapa detik, lalu dispose(). */
  close(): void { this.call('__tl_close'); }
  get pendingRequests(): number { return this.pending; }
  nodeCount(): number {
    const L = this.L;
    lua.lua_getglobal(L, to_luastring('__tl_count'));
    lua.lua_pcall(L, 0, 1, 0);
    const n = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return n;
  }
  dispose(): void { this.disposed = true; }
}
