// Enkripsi sisi server untuk nilai sensitif yang disimpan di Upstash Redis (WEBHOOK_SECRET,
// API_KEY di config:settings). AES-256-GCM via Node crypto; kunci HANYA dari ENCRYPTION_KEY
// (.env Vercel), tidak pernah disimpan di Redis. Format ciphertext: "iv:authTag:encryptedData"
// (ketiganya hex), sesuai spesifikasi agar mudah diverifikasi/diaudit.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEncryptionKeyHex } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // ukuran IV standar GCM
const CIPHERTEXT_FORMAT = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i;

function keyBuffer(): Buffer {
  return Buffer.from(getEncryptionKeyHex(), 'hex');
}

export function encrypt(plainText: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  if (!CIPHERTEXT_FORMAT.test(ciphertext)) throw new Error('Format ciphertext tidak valid');
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGO, keyBuffer(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function isCiphertext(value: unknown): value is string {
  return typeof value === 'string' && CIPHERTEXT_FORMAT.test(value);
}

// Dekripsi yang tidak pernah melempar: dipakai jalur yang harus tetap berjalan (webhook
// receiver) walau ENCRYPTION_KEY belum diisi atau nilainya rusak.
export function tryDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}
