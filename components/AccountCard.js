'use client';

import { memo } from 'react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Sparkline } from '@/components/Charts';
import { STATE_UI, StatusPill } from '@/components/StatusPill';
import { safeImageUrl } from '@/lib/client';

// `ref` adalah prop biasa di React 19; AnimatePresence mode="popLayout" membutuhkannya.
function AccountCardInner({ ref, acc, state, uptime, syncText, latency, onDelete, onCopyJob }) {
  const ui = STATE_UI[state] || STATE_UI.OFFLINE;
  const active = state !== 'OFFLINE';
  const name = acc.displayName || acc.username;
  const avatar = safeImageUrl(acc.avatarUrl);

  return (
    <motion.article
      ref={ref}
      layout="position"
      className="card acc"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      {/* Garis tipis menyala setiap kali heartbeat baru masuk (key = lastUpdate). */}
      <motion.span
        key={acc.lastUpdate}
        className="hb-flash"
        style={{ background: ui.color }}
        initial={{ opacity: 0.9, scaleX: 1 }}
        animate={{ opacity: 0, scaleX: 0.2 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        aria-hidden="true"
      />
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
        <StatusPill state={state} />
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
          <span><b>Latensi:</b> <AnimatedNumber value={acc.latencyMs} suffix="ms" /></span>
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
    </motion.article>
  );
}

export const AccountCard = memo(AccountCardInner);
