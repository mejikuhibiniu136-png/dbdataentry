'use client';

import { memo } from 'react';
import { Sparkline } from '@/components/Charts';
import { safeImageUrl } from '@/lib/client';

const STATE_UI = {
  ONLINE: { cls: 'pill pill-ok', color: 'var(--ok)', label: 'ONLINE' },
  STALLED: { cls: 'pill pill-warn', color: 'var(--warn)', label: 'STALLED' },
  OFFLINE: { cls: 'pill pill-bad', color: 'var(--bad)', label: 'OFFLINE' },
};

function AccountCardInner({ acc, state, uptime, syncText, latency, onDelete, onCopyJob }) {
  const ui = STATE_UI[state] || STATE_UI.OFFLINE;
  const active = state !== 'OFFLINE';
  const name = acc.displayName || acc.username;
  const avatar = safeImageUrl(acc.avatarUrl);

  return (
    <article className="card acc">
      <div className="acc-head">
        <div className="acc-id">
          <div className="avatar avatar-sm" aria-hidden="true">
            {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" loading="lazy" /> : String(name || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="identity-name truncate">{name}</div>
            <div className="meta-line" style={{ color: 'var(--warn)' }}>@{acc.username}</div>
          </div>
        </div>
        <span className={ui.cls}><span className={`dot${state === 'ONLINE' ? ' dot-live' : ''}`} />{ui.label}</span>
      </div>

      <div className="acc-info">
        <div className="row">
          <span><span className="label">Game:</span> {acc.gameName || '-'}</span>
          <b style={{ color: active ? 'var(--ok)' : 'var(--bad)' }}>Aktif: {uptime}</b>
        </div>
        <div className="mono truncate" style={{ color: 'var(--muted)' }}>
          <span className="label">Job ID:</span> {acc.jobId || 'Local/Private'}
        </div>
        <div className="row" style={{ color: 'var(--muted)' }}>
          <span><b>User ID:</b> {acc.userId || '-'}</span>
          <span><b>Latensi:</b> {acc.latencyMs ? `${acc.latencyMs}ms` : '-'}</span>
        </div>
      </div>

      <div>
        <div className="hint" style={{ marginBottom: 2 }}>Tren latensi pemrosesan</div>
        <Sparkline values={latency} color={ui.color} label={`Latensi ${acc.username}`} />
      </div>

      <div className="acc-foot">
        <span>Sync: {syncText}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {acc.jobId && <button className="btn btn-sm" onClick={() => onCopyJob(acc)}>Salin Job ID</button>}
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(acc)} aria-label={`Hapus akun ${acc.username}`}>🗑</button>
        </span>
      </div>
    </article>
  );
}

export const AccountCard = memo(AccountCardInner);
