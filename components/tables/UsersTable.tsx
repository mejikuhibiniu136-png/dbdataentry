'use client';
import { Bot, Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pill } from '@/components/ui/Pill';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { apiJson } from '@/lib/client';
import type { DeviceEntry, UserSummary } from '@/types';

const DEVICE_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet, bot: Bot, unknown: HelpCircle } as const;
const place = (d: DeviceEntry) => [d.city, d.region, d.country].filter(Boolean).join(', ') || 'Lokasi tidak tersedia';

export function UsersTable() {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<UserSummary | null>(null);
  const [devices, setDevices] = useState<DeviceEntry[] | null>(null);

  const load = useCallback(async () => {
    try { setUsers((await apiJson<{ data: UserSummary[] }>('/api/admin/users', 'GET')).data); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = async (u: UserSummary) => {
    setSelected(u); setDevices(null);
    try { setDevices((await apiJson<{ data: DeviceEntry[] }>(`/api/admin/users/${encodeURIComponent(u.username)}/devices`, 'GET')).data); } catch { setDevices([]); }
  };

  if (error) return <div role="alert" className="glass p-5 text-sm text-rose-200">{error}</div>;
  if (!users) return <SkeletonRows count={3} />;

  return (
    <>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Daftar pengguna</caption>
          <thead className="border-b border-white/10 text-xs text-slate-400"><tr><th scope="col" className="px-4 py-3 font-medium">Pengguna</th><th scope="col" className="px-4 py-3 font-medium">Role</th><th scope="col" className="px-4 py-3 font-medium">Login terakhir</th><th scope="col" className="px-4 py-3"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-medium text-white">{u.username}</td>
                <td className="px-4 py-3"><Pill tone={u.role === 'admin' ? 'violet' : 'neutral'}>{u.role}</Pill></td>
                <td className="px-4 py-3 text-xs text-slate-400">{u.lastLogin ? `${u.lastLogin.browser} · ${u.lastLogin.device} · ${u.lastLogin.ip} · ${new Date(u.lastLogin.at).toLocaleString('id-ID')}` : 'Belum pernah'}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" onClick={() => open(u)}>Perangkat</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={`Riwayat login · ${selected?.username ?? ''}`} wide>
        {!devices ? <SkeletonRows count={3} /> : devices.length === 0 ? <p className="text-sm text-slate-400">Belum ada riwayat login.</p> : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {devices.map((d) => {
              const Icon = DEVICE_ICON[d.deviceType] ?? HelpCircle;
              return (
                <li key={d.sid || d.at} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <Icon className="mt-0.5 size-5 flex-none text-cyan-300" aria-hidden />
                  <div className="min-w-0 text-sm">
                    <div className="font-medium text-white">{d.device} · {d.browser}</div>
                    <div className="text-xs text-slate-400">{d.ip} · {place(d)}{d.isp ? ` · ${d.isp}` : ''}</div>
                    <div className="text-xs text-slate-500">{new Date(d.at).toLocaleString('id-ID')}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
