// Fengari (Lua 5.3 VM di JavaScript) tidak membawa tipe; hanya permukaan kecil yang dipakai lib/lualab/runtime.ts.
declare module 'fengari' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const lua: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const lauxlib: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const lualib: any;
  export function to_luastring(s: string): Uint8Array;
  export function to_jsstring(b: Uint8Array): string;
}
