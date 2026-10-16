'use client';
import { CheckCircle2, ShieldOff, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiKeysPanel } from '@/components/views/system/ApiKeysPanel';
import { AuditPanel } from '@/components/views/system/AuditPanel';
import { EncryptionPanel } from '@/components/views/system/EncryptionPanel';
import { RetentionPanel } from '@/components/views/system/RetentionPanel';
import { SecurityPanel } from '@/components/views/system/SecurityPanel';
import { apiJson } from '@/lib/client';
import type { EnvReport } from '@/lib/env';
import type { EncryptionStatus, SecurityStats, SystemSettings } from '@/types';

interface SystemInfo { env: EnvReport; receiverEnabled: boolean; security?: SecurityStats; redis: { ok: boolean; pingMs: number | null; usedMemory: string; limit: string; percentage: string; commands: number; bandwidth: string } }
interface SettingsInfo { success: boolean; data: SystemSettings; encryptionReady: boolean; encryption: EncryptionStatus }

// Superadmin-only (lihat Sidebar & Dashboard): Environment Variables, Redis, Penerima webhook,
// Pengaturan Dinamis (maintenance, rate limit, proteksi skrip Lua), dan API Key.
export function SystemView({ toast }: { toast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInfo(await apiJson<SystemInfo>('/api/system', 'GET')); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal memuat sistem', 'error'); }
    try { setSettings(await apiJson<SettingsInfo>('/api/admin/settings', 'GET')); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal memuat pengaturan', 'error'); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const toggleReceiver = async () => {
    if (!info) return;
    try { await apiJson('/api/system/receiver', 'POST', { enabled: !info.receiverEnabled }); toast(`Penerima webhook ${info.receiverEnabled ? 'dimatikan' : 'dinyalakan'}`, 'success'); void load(); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal', 'error'); }
  };

  const patchSettings = async (patch: Partial<{ maintenanceMode: boolean; rateLimitPerMin: number; luaObfuscationEnabled: boolean; apiKeyRequired: boolean; logRetentionDays: number; webhookSecret: string }>) => {
    setBusy(true);
    try { setSettings(await apiJson<SettingsInfo>('/api/admin/settings', 'PUT', patch)); toast('Pengaturan disimpan', 'success'); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass p-5 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-white">Environment Variables</h3>
          {!info ? <Skeleton className="h-40" /> : (
            <ul className="space-y-2.5 text-sm">
              {info.env.required.map((r) => (
                <li key={r.name} className="flex items-start gap-2">
                  {r.set ? <CheckCircle2 className="mt-0.5 size-4 flex-none text-emerald-400" aria-label="Terisi" /> : <XCircle className="mt-0.5 size-4 flex-none text-rose-400" aria-label="Belum diisi" />}
                  <div><div className="font-mono text-xs text-slate-200">{r.name}</div>{!r.set && <div className="text-xs text-rose-300">{r.note ?? 'Belum diatur di Vercel'}</div>}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Upstash Redis</h3>
          {!info ? <Skeleton className="h-40" /> : !info.redis.ok ? <p className="text-sm text-rose-300">Tidak terhubung. Periksa variabel Redis di samping.</p> : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Ping</dt><dd className="text-slate-200">{info.redis.pingMs} ms</dd>
              <dt className="text-slate-500">Memori</dt><dd className="text-slate-200">{info.redis.usedMemory} / {info.redis.limit} ({info.redis.percentage}%)</dd>
              <dt className="text-slate-500">Command</dt><dd className="text-slate-200">{info.redis.commands.toLocaleString('id-ID')}</dd>
              <dt className="text-slate-500">Bandwidth</dt><dd className="text-slate-200">{info.redis.bandwidth}</dd>
            </dl>
          )}
        </section>

        <section className="glass p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Penerima webhook</h3>
          {!info ? <Skeleton className="h-24" /> : (
            <div className="space-y-3">
              <Pill tone={info.receiverEnabled ? 'ok' : 'warn'} dot={info.receiverEnabled ? 'live' : 'static'}>{info.receiverEnabled ? 'Aktif' : 'Dimatikan'}</Pill>
              <p className="text-xs leading-relaxed text-slate-400">Saat dimatikan, payload dijawab 202 dan diabaikan. Pengirim tidak menerima error sehingga tidak mematikan webhook-nya sendiri.</p>
              <Button onClick={toggleReceiver} variant={info.receiverEnabled ? 'danger' : 'primary'}>{info.receiverEnabled ? 'Matikan' : 'Nyalakan'}</Button>
            </div>
          )}
        </section>
      </div>

      {info?.security && <SecurityPanel stats={info.security} />}

      <section className="glass p-5">
        <h3 className="mb-1 text-sm font-semibold text-white">Pengaturan Dinamis</h3>
        <p className="mb-4 text-xs text-slate-500">Tersimpan di Redis (nilai sensitif dienkripsi AES-256-GCM). Hanya Superadmin.</p>
        {!settings ? <Skeleton className="h-40" /> : (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-sm text-slate-200">Mode Maintenance</span>
              <input type="checkbox" disabled={busy} checked={settings.data.maintenanceMode} onChange={(e) => void patchSettings({ maintenanceMode: e.target.checked })} className="size-4 accent-cyan-400" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="flex items-center gap-1.5 text-sm text-slate-200"><ShieldOff className="size-3.5" />Proteksi Skrip Lua (Obfuscation)</span>
              <input type="checkbox" disabled={busy} checked={settings.data.luaObfuscationEnabled} onChange={(e) => void patchSettings({ luaObfuscationEnabled: e.target.checked })} className="size-4 accent-cyan-400" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:col-span-2">
              <span className="text-sm text-slate-200">Rate Limit (request/menit)</span>
              <input type="number" min={10} max={100000} disabled={busy} defaultValue={settings.data.rateLimitPerMin}
                onBlur={(e) => { const n = Number(e.target.value); if (n && n !== settings.data.rateLimitPerMin) void patchSettings({ rateLimitPerMin: n }); }}
                className="field w-28 py-1.5 text-right text-sm" />
            </label>
            <div className="sm:col-span-2">
              <div className="mb-1.5 flex items-center justify-between text-sm text-slate-200">
                <span>Secret Token HMAC (Webhook Secret)</span>
                <Pill tone={settings.data.webhookSecretSet ? 'ok' : 'neutral'}>{settings.data.webhookSecretSet ? 'Terpasang' : 'Belum diatur'}</Pill>
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const v = String(f.get('secret') ?? '').trim(); if (v) void patchSettings({ webhookSecret: v }); e.currentTarget.reset(); }}>
                <input name="secret" type="password" placeholder="Secret baru…" className="field flex-1 text-sm" disabled={busy || !settings.encryptionReady} />
                <Button type="submit" disabled={busy || !settings.encryptionReady}>Simpan</Button>
                {settings.data.webhookSecretSet && <Button type="button" variant="danger" disabled={busy} onClick={() => void patchSettings({ webhookSecret: '' })}>Hapus</Button>}
              </form>
              {!settings.encryptionReady && <p className="mt-1.5 text-xs text-rose-300">ENCRYPTION_KEY belum diatur di Vercel — nilai sensitif tidak bisa dienkripsi.</p>}
            </div>
          </div>
        )}
      </section>

      {settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RetentionPanel days={settings.data.logRetentionDays} busy={busy} onSave={(n) => void patchSettings({ logRetentionDays: n })} toast={toast} />
          <EncryptionPanel ready={settings.encryptionReady} status={settings.encryption} toast={toast} onChanged={() => void load()} />
        </div>
      )}

      {settings && <ApiKeysPanel toast={toast} required={settings.data.apiKeyRequired} busy={busy} onToggleRequired={(v) => void patchSettings({ apiKeyRequired: v })} />}

      <AuditPanel toast={toast} />
    </div>
  );
}
