// Merakit skrip akhir: modul Lua mentah (lua/guard.lua, lua/control.lua) + skrip utama, lalu menyisipkan variabel
// watermark. Tiap modul dibungkus fungsi anonim agar variabel lokalnya tidak menambah batas 200 local skrip utama.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface LuaModules { guard: string; control: string }

let cache: LuaModules | null = null;

/** Berkas tidak berubah selama deployment, jadi dibaca sekali per instance. */
export async function readLuaModules(dir = path.join(process.cwd(), 'lua')): Promise<LuaModules> {
  if (cache && dir === path.join(process.cwd(), 'lua')) return cache;
  const [guard, control] = await Promise.all([readFile(path.join(dir, 'guard.lua'), 'utf8'), readFile(path.join(dir, 'control.lua'), 'utf8')]);
  const mods = { guard, control };
  if (dir === path.join(process.cwd(), 'lua')) cache = mods;
  return mods;
}

/** guard_public.lua: antarmuka request/wipe untuk skrip publik (tanpa HWID). Dibaca sekali per instance. */
let publicGuardCache: string | null = null;
export async function readPublicGuard(dir = path.join(process.cwd(), 'lua')): Promise<string> {
  const isDefault = dir === path.join(process.cwd(), 'lua');
  if (publicGuardCache && isDefault) return publicGuardCache;
  const guard = await readFile(path.join(dir, 'guard_public.lua'), 'utf8');
  if (isDefault) publicGuardCache = guard;
  return guard;
}

export interface WatermarkVars { token: string; salt: string; fp: string; jti: string; base: string }

// Nilai disisipkan ke literal string Lua: hanya karakter aman (token base64url + titik, hex, URL origin).
const SAFE = /^[A-Za-z0-9._:/-]+$/;
const PLACEHOLDERS: [keyof WatermarkVars, string][] = [
  ['token', '__WM_TOKEN__'], ['salt', '__WM_SALT__'], ['fp', '__WM_FP__'], ['jti', '__WM_JTI__'], ['base', '__WM_BASE__'],
];

export function injectWatermark(guardLua: string, vars: WatermarkVars): string {
  let out = guardLua;
  for (const [field, placeholder] of PLACEHOLDERS) {
    const value = vars[field];
    if (!SAFE.test(value)) throw new Error(`nilai watermark "${field}" mengandung karakter tak aman`);
    if (!out.includes(placeholder)) throw new Error(`placeholder ${placeholder} tidak ada di guard.lua`);
    out = out.split(placeholder).join(value);
  }
  return out;
}

export function composeGuardedLua(mods: LuaModules, vars: WatermarkVars, mainLua: string): string {
  return [
    `-- dbdataentry guarded build ${vars.jti}`,
    'local __dbde_guard = (function()',
    injectWatermark(mods.guard, vars),
    'end)()',
    'local __dbde_control = (function(G)',
    mods.control,
    'end)(__dbde_guard)',
    'if not __dbde_guard.enforce() then return end',
    '__dbde_control.start()',
    mainLua,
  ].join('\n');
}

export interface PublicVars { token: string; base: string }

/** Skrip publik + kanal kontrol (Pause/Resume/Kill dari dashboard). Tanpa pemeriksaan HWID: itu hanya untuk loader ber-API Key. */
export function composePublicLua(mods: { guardPublic: string; control: string }, vars: PublicVars, mainLua: string): string {
  let guard = mods.guardPublic;
  for (const [field, placeholder] of [['token', '__WM_TOKEN__'], ['base', '__WM_BASE__']] as const) {
    const value = vars[field];
    if (!SAFE.test(value)) throw new Error(`nilai \"${field}\" mengandung karakter tak aman`);
    if (!guard.includes(placeholder)) throw new Error(`placeholder ${placeholder} tidak ada di guard_public.lua`);
    guard = guard.split(placeholder).join(value);
  }
  return [
    '-- dbdataentry public build',
    'local __dbde_guard = (function()',
    guard,
    'end)()',
    'local __dbde_control = (function(G)',
    mods.control,
    'end)(__dbde_guard)',
    '__dbde_control.start()',
    mainLua,
  ].join('\n');
}
