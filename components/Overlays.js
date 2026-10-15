'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { JsonView } from '@/components/JsonView';
import { embedColor, safeImageUrl } from '@/lib/client';
import { eventLabel, str } from '@/lib/domain/logStats';

// Menutup overlay dengan tombol Esc.
function useEscape(active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}

export function Toasts({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast-${t.type}`}
            initial={{ opacity: 0, x: 48, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 48, scale: 0.96, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            <span aria-hidden="true">{t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span>{t.message}</span>
            {/* Bilah sisa waktu; 4 detik sesuai timer di useToasts. */}
            <motion.span
              className="toast-bar"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 4, ease: 'linear' }}
              aria-hidden="true"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConfirmDialog({ dialog, onClose }) {
  const cancelRef = useRef(null);
  useEscape(Boolean(dialog), onClose);

  useEffect(() => {
    if (dialog) cancelRef.current?.focus();
  }, [dialog]);

  if (!dialog) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <h3 id="confirm-title">{dialog.title}</h3>
        <p id="confirm-msg">{dialog.message}</p>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn" onClick={onClose}>Batal</button>
          <button
            className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onClose();
              dialog.onConfirm();
            }}
          >
            {dialog.confirmLabel || 'Ya, lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Palet perintah (Ctrl/Cmd + K).
export function CommandPalette({ open, commands, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  useEscape(open, onClose);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(results.length - 1, 0)));
  }, [results.length]);

  if (!open) return null;

  const run = (cmd) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[index]);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Palet perintah">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ketik perintah… (↑ ↓ untuk memilih, Enter untuk menjalankan)"
          aria-label="Cari perintah"
        />
        <ul role="listbox">
          {results.length === 0 && <li className="hint" style={{ padding: 14 }}>Tidak ada perintah yang cocok.</li>}
          {results.map((cmd, i) => (
            <li key={cmd.id} role="option" aria-selected={i === index}>
              <button aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => run(cmd)}>
                <span>{cmd.label}</span>
                {cmd.hint && <kbd>{cmd.hint}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Panel detail satu log.
export function LogDrawer({ log, onClose, onCopy, onDownload }) {
  useEscape(Boolean(log), onClose);
  if (!log) return null;

  const p = log.payload || {};
  const embed = Array.isArray(p.embeds) ? p.embeds[0] : null;
  const received = new Date(log.receivedAt);
  const receivedText = Number.isNaN(received.getTime()) ? '-' : received.toLocaleString('id-ID');

  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Detail log">
        <div className="drawer-head">
          <h3>{eventLabel(log)}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => onCopy(log)}>📋 Salin</button>
            <button className="btn btn-sm" onClick={() => onDownload(log)}>⬇ Unduh</button>
            <button className="btn btn-sm btn-icon" onClick={onClose} aria-label="Tutup">✕</button>
          </div>
        </div>
        <div className="drawer-body">
          <dl className="kv card" style={{ margin: 0 }}>
            <dt>ID log</dt><dd className="mono">{str(log.id) || '-'}</dd>
            <dt>Diterima</dt><dd>{receivedText}</dd>
            <dt>Diproses</dt><dd>{Number.isFinite(Number(log.processingTimeMs)) ? `${log.processingTimeMs} ms` : '-'}</dd>
            <dt>Jenis</dt><dd>{str(log.eventType) || '-'}</dd>
            {p.username && (<><dt>Username</dt><dd>{p.displayName ? `${p.displayName} (@${p.username})` : `@${p.username}`}</dd></>)}
            {p.gameName && (<><dt>Game</dt><dd>{str(p.gameName)}</dd></>)}
            {p.jobId && (<><dt>Job ID</dt><dd className="mono">{str(p.jobId)}</dd></>)}
          </dl>

          {embed && (
            <div className="log-body embed" style={{ borderLeftColor: embedColor(embed.color) }}>
              <h3>{str(embed.title)}</h3>
              {str(embed.description) && <div className="embed-desc">{str(embed.description).replace(/\*\*/g, '')}</div>}
              {safeImageUrl(embed.thumbnail?.url) && (
                <img
                  src={safeImageUrl(embed.thumbnail.url)}
                  alt="Thumbnail"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', marginTop: 10 }}
                />
              )}
            </div>
          )}

          <div className="card">
            <span className="card-title" style={{ marginBottom: 8 }}>Payload JSON</span>
            <JsonView value={log.payload} />
          </div>
        </div>
      </aside>
    </div>
  );
}
