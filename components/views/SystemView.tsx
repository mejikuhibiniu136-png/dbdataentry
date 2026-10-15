'use client';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { UsersTable } from '@/components/tables/UsersTable';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiJson } from '@/lib/client';
import type { EnvReport } from '@/lib/env';

interface SystemInfo { env: EnvReport; receiverEnabled: boolean; redis: { ok: boolean; pingMs: number | null; usedMemory: string; limit: string; percentage: string; commands: number; bandwidth: string } }

export function SystemView({ toast }: { toast: (m: string, t?: 'success' | 'error' | 'info') => void }) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const load = useCallback(async () => {
    try { setInfo(await apiJson<SystemInfo>('/api/system', 'GET')); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal memuat sistem', 'error'); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async () => {
    if (!info) return;
    try { await apiJson('/api/system/receiver', 'POST', { enabled: !info.receiverEnabled }); toast(`Penerima webhook ${info.receiverEnabled ? 'dimatikan' : 'dinyalakan'}`, 'success'); void load(); } catch (e) { toast(e instanceof Error ? e.message : 'Gagal', 'error'); }
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
              <Button onClick={toggle} variant={info.receiverEnabled ? 'danger' : 'primary'}>{info.receiverEnabled ? 'Matikan' : 'Nyalakan'}</Button>
            </div>
          )}
        </section>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">Pengguna &amp; riwayat perangkat</h3>
        <UsersTable />
      </section>
    </div>
  );
}
