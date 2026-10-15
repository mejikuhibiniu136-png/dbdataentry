// Skema validasi payload (Zod). Murni, tanpa Redis / Next.
//
// Dua jalur dengan sikap berbeda:
//  - Status akun (script Lua milik sendiri): STRICT. Field wajib dan tipe harus benar,
//    payload yang salah bentuk ditolak dengan 400.
//  - Webhook game (pihak ketiga): LENIENT. Struktur bisa berubah sewaktu-waktu di luar
//    kendali kita, jadi field yang tidak cocok dibuang per-field (.catch) dan payload yang
//    tidak bisa diparse masuk karantina, bukan menjadi error 500.

import { z } from 'zod';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// Angka diubah menjadi string, teks di-trim dan karakter kontrol dibuang.
const text = (max) =>
  z.preprocess(
    (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : v),
    z
      .string()
      .transform((s) => s.replace(CONTROL_CHARS, '').trim())
      .pipe(z.string().min(1).max(max))
  );

const httpsUrl = z
  .string()
  .max(512)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  });

const isoLike = z.union([z.string().max(64), z.number()]);

// ---------- Status akun (STRICT) ----------

export const accountPayloadSchema = z.object({
  username: text(64).refine((v) => !FORBIDDEN_KEYS.has(v), 'username tidak valid'),
  displayName: text(64).optional(),
  state: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
      z.enum(['ONLINE', 'OFFLINE'])
    )
    .optional(),
  gameName: text(128).optional(),
  userId: text(32).optional(),
  placeId: text(32).optional(),
  jobId: text(128).optional(),
  event: text(64).optional(),
  latencyMs: z.number().finite().min(0).max(60_000).optional(),
  sessionStart: isoLike.optional(),
  timestamp: isoLike.optional(),
  avatarUrl: httpsUrl.optional(),
});

// ---------- Webhook game / Anime Dice (LENIENT) ----------

// Setiap field memakai .catch(undefined): tipe yang berubah membuat field itu hilang,
// bukan membuat seluruh payload gagal.
const optText = (max) => z.string().max(max).optional().catch(undefined);

const embedField = z
  .object({
    name: optText(256),
    value: optText(1024),
    inline: z.boolean().optional().catch(undefined),
  })
  .catch({});

const embed = z
  .object({
    title: optText(256),
    description: optText(4096),
    url: optText(512),
    timestamp: optText(64),
    color: z.number().int().min(0).max(0xffffff).optional().catch(undefined),
    fields: z.array(embedField).max(25).optional().catch(undefined),
    footer: z.object({ text: optText(2048) }).optional().catch(undefined),
    author: z.object({ name: optText(256) }).optional().catch(undefined),
  })
  .catch({});

export const gameWebhookSchema = z.looseObject({
  content: optText(4096),
  username: optText(128),
  event: optText(128),
  eventType: optText(128),
  embeds: z.array(embed).max(10).optional().catch(undefined),
});
