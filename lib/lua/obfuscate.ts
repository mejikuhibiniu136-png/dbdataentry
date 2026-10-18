// Proteksi skrip Lua sisi server (fitur 1 — tidak bergantung pada layanan eksternal
// berbayar/berkunci seperti WeAreDevs API atau Lua Obfuscator SaaS, karena kredensial
// mereka tidak tersedia di deployment ini). Skema yang dipakai di sini berjalan sepenuhnya
// di server kita sendiri sehingga aktif tanpa konfigurasi tambahan:
//   1) Enkripsi string (XOR byte-stream berkunci acak per-permintaan) untuk variabel sensitif
//      (alamat endpoint webhook) -> tidak lagi berupa string polos saat skrip diekstrak dari
//      executor / hasil dekompilasi.
//   2) Kontrol aliran (control-flow obfuscation): seluruh skrip dibungkus percabangan
//      if/else yang nilainya dibuktikan benar saat kompilasi (selalu mengeksekusi jalur
//      yang sama) tetapi tidak trivial dilihat analisis statis, plus cabang "mati" berisi
//      kode semu agar hasil dekompilasi lebih sulit dibaca langsung.
// Bila suatu saat tersedia API key WeAreDevs / Lua Obfuscator, titik integrasinya ada di
// `externalObfuscate()` paling bawah file ini.

function randomByteKey(length = 8): number[] {
  const arr: number[] = [];
  for (let i = 0; i < length; i += 1) arr.push(1 + Math.floor(Math.random() * 254));
  return arr;
}

function xorEncodeToLuaBytes(input: string, key: number[]): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    bytes.push(input.charCodeAt(i) ^ key[i % key.length]);
  }
  return `{${bytes.join(',')}}`;
}

// Decoder Lua murni (tanpa dependensi library luar), disisipkan sekali di awal skrip.
function decoderStub(fnName: string, key: number[]): string {
  return [
    `local ${fnName}_KEY = {${key.join(',')}}`,
    `local function ${fnName}(bytes)`,
    '\tlocal out = {}',
    '\tfor i = 1, #bytes do',
    `\t\tlocal k = ${fnName}_KEY[((i - 1) % #${fnName}_KEY) + 1]`,
    '\t\tout[i] = string.char(bit32.bxor(bytes[i], k))',
    '\tend',
    '\treturn table.concat(out)',
    'end',
  ].join('\n');
}

// Membungkus seluruh skrip dalam percabangan yang terbukti selalu benar (seed % 2 == seed % 2),
// sehingga perilaku runtime tidak berubah, tetapi mengganggu analisis statis/dekompilasi naif
// yang mengharapkan kode berjalan linear dari baris pertama.
function withJunkControlFlow(body: string, seed = Math.floor(Math.random() * 1_000_000)): string {
  const guard = `__dbde_g${seed}`;
  const dead = `__dbde_d${seed}`;
  return [
    `local ${guard} = (${seed} % 2 == ${seed % 2}) and (${seed} + 1 > ${seed})`,
    `if ${guard} then`,
    body,
    'else',
    `\tlocal ${dead} = ${seed} * 2 -- unreachable: anti-analisis statis`,
    `\tif ${dead} < 0 then error('unreachable') end`,
    'end',
  ].join('\n');
}

export interface ObfuscateResult {
  source: string;
  method: 'string-encryption+control-flow';
}

// `source`  : skrip Lua yang endpoint-nya SUDAH disubstitusi (alamat asli, bukan placeholder).
// `secrets` : daftar string sensitif yang perlu dienkripsi jika ditemukan sebagai literal
//             `KEY = "<nilai>"` di dalam skrip (mis. CONFIG.URL). Nilai yang tidak ditemukan dilewati.
export function obfuscateLuaSource(source: string, secrets: { configField: string; value: string }[]): ObfuscateResult {
  let out = source;
  const decoders: string[] = [];

  secrets.forEach(({ configField, value }, idx) => {
    const literal = `${configField} = "${value}"`;
    if (!out.includes(literal)) return;
    const key = randomByteKey();
    const fnName = `__dbde_dec${idx}`;
    decoders.push(decoderStub(fnName, key));
    out = out.replace(literal, `${configField} = ${fnName}(${xorEncodeToLuaBytes(value, key)})`);
  });

  const header = decoders.length
    ? `--[[ dbdataentry: skrip dilindungi (enkripsi string + control-flow obfuscation) ]]\n${decoders.join('\n')}\n`
    : '--[[ dbdataentry: skrip dilindungi (control-flow obfuscation) ]]\n';

  return { source: withJunkControlFlow(`${header}${out}`), method: 'string-encryption+control-flow' };
}

// Titik integrasi untuk layanan eksternal (WeAreDevs API / Lua Obfuscator) bila API key
// tersedia di masa depan. Saat ini tidak dipanggil di mana pun — menunggu WEAREDEVS_API_KEY.
export async function externalObfuscate(source: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.luaobfuscator.com/v1/obfuscate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ script: source }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Obfuscation eksternal gagal (${res.status})`);
  const data = (await res.json()) as { script?: string };
  if (!data.script) throw new Error('Respons obfuscation eksternal tidak valid');
  return data.script;
}
