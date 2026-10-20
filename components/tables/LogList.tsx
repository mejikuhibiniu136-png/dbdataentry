'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, X, Zap } from 'lucide-react';
import { Component, Fragment, memo, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { useEscape } from '@/components/ui/Modal';
import { embedColor, safeImageUrl } from '@/lib/client';
import { eventLabel, hasEmbeds, isHeartbeat, str } from '@/lib/logStats';
import type { LogEntry } from '@/types';

const TOKEN = /("(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const MAX_CHARS = 120_000;

// JSON berwarna, dirender sebagai elemen React (bukan innerHTML).
export function JsonView({ value }: { value: unknown }) {
  const { tr } = useI18n();
  let text: string;
  try { text = JSON.stringify(value, null, 2) ?? 'undefined'; } catch { text = String(value); }
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  const parts: (string | { cls: string; token: string })[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    const cls = m[2] ? 'json-key' : t.startsWith('"') ? 'json-str' : t === 'true' || t === 'false' ? 'json-bool' : t === 'null' ? 'json-null' : 'json-num';
    parts.push({ cls, token: t });
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <pre className="max-h-96 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-xs leading-relaxed text-slate-300">
      {parts.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <span key={i} className={p.cls}>{p.token}</span>))}
      {truncated ? `\n${tr('… (dipotong, gunakan Unduh untuk data lengkap)')}` : ''}
    </pre>
  );
}

function LogFailed() {
  const { tr } = useI18n();
  return <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{tr('Log ini tidak dapat ditampilkan (format payload tidak valid).')}</div>;
}

// Log dengan format tak terduga tidak boleh merusak seluruh halaman.
export class LogBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('Gagal merender log:', e); }
  render() {
    return this.state.failed ? <LogFailed /> : this.props.children;
  }
}

const fmtDate = (v: string, locale: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(locale); };

interface CardProps { log: LogEntry; isNew: boolean; copied: boolean; showGame: boolean; onOpen: (l: LogEntry) => void; onCopy: (l: LogEntry) => void }

function LogCardInner({ log, isNew, copied, showGame, onOpen, onCopy }: CardProps) {
  const { tr, locale } = useI18n();
  const p = log.payload ?? {};
  const rawEmbed = Array.isArray(p.embeds) ? p.embeds[0] : null;
  const embed = rawEmbed && (str(rawEmbed.title) || str(rawEmbed.description) || str(rawEmbed.author?.name)) ? rawEmbed : null;
  const who = str(p.displayName) || str(p.username);
  const heartbeat = isHeartbeat(log);
  const text = str(p.content) || str(p.text) || str(p.message);

  return (
    <article className={`glass glass-hover p-4 ${isNew ? 'border-cyan-300/60 shadow-[0_0_24px_-8px_rgb(34_211_238/0.6)]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone={heartbeat ? 'ok' : hasEmbeds(log) ? 'violet' : 'accent'} dot={heartbeat ? 'live' : undefined}>{eventLabel(log)}</Pill>
          {showGame && <span className="text-xs font-semibold text-cyan-200">{log.gameName}</span>}
          {who && <span className="truncate text-sm font-medium text-white">{who}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 font-mono text-[11px] text-cyan-200 sm:inline-flex"><Zap className="size-3" aria-hidden />{Number(log.processingTimeMs) || 0}ms</span>
          <time className="text-xs text-slate-400" dateTime={log.receivedAt}>{fmtDate(log.receivedAt, locale)}</time>
          <Button size="sm" onClick={() => onCopy(log)}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? tr('Disalin') : 'JSON'}</Button>
          <Button size="sm" onClick={() => onOpen(log)}>{tr('Detail')}</Button>
        </div>
      </div>

      {!heartbeat && embed && (
        <div className="mt-3 rounded-xl border-l-4 bg-black/25 p-3" style={{ borderLeftColor: embedColor(embed.color) }}>
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">{str(embed.title)}</h3>
              {str(embed.author?.name) && <div className="text-xs text-slate-300">{str(embed.author.name)}</div>}
            </div>
            {safeImageUrl(embed.thumbnail?.url) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={safeImageUrl(embed.thumbnail.url)!} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-12 flex-none rounded-lg object-cover" />}
          </div>
          {str(embed.description) && <div className="mt-2 text-sm whitespace-pre-wrap text-slate-300">{str(embed.description).replace(/\*\*/g, '')}</div>}
        </div>
      )}

      {!heartbeat && !embed && text && <p className="mt-3 text-sm whitespace-pre-wrap text-amber-100">{text.replace(/\|\|/g, '').slice(0, 400)}</p>}
      {!heartbeat && !embed && !text && <div className="mt-3"><JsonView value={log.payload} /></div>}
    </article>
  );
}
export const LogCard = memo(LogCardInner);

export function LogDrawer({ log, onClose, onCopy, onDownload }: { log: LogEntry | null; onClose: () => void; onCopy: (l: LogEntry) => void; onDownload: (l: LogEntry) => void }) {
  const { tr, locale } = useI18n();
  const panel = useRef<HTMLElement>(null);
  useEscape(Boolean(log), onClose);
  useEffect(() => {
    if (!log) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panel.current?.focus());
    return () => { cancelAnimationFrame(raf); document.body.style.overflow = overflow; prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(log)]);
  return (
    <AnimatePresence>
      {log && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-stretch sm:justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          {/* Ponsel: lembar bawah setinggi 92% layar. >= sm: panel samping. */}
          <motion.aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr('Detail log')} className="glass h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-b-none p-5 sm:h-full sm:max-w-xl sm:rounded-r-none sm:rounded-b-2xl sm:border-r-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 truncate text-lg font-semibold text-white">{eventLabel(log)}</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onCopy(log)}><Copy className="size-3.5" />{tr('Salin')}</Button>
                <Button size="sm" onClick={() => onDownload(log)}><Download className="size-3.5" />{tr('Unduh')}</Button>
                <Button size="sm" onClick={onClose} aria-label={tr('Tutup')}><X className="size-3.5" /></Button>
              </div>
            </div>
            <dl className="mb-4 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-black/25 p-3 text-sm">
              {([[tr('ID log'), log.id], [tr('Tabel'), log.gameName], [tr('Diterima'), fmtDate(log.receivedAt, locale)], [tr('Diproses'), `${log.processingTimeMs} ms`], [tr('Format'), `${log.format} · ${tr('{n} byte', { n: log.bytes })}`], [tr('Jenis'), log.eventType]] as const).map(([k, v]) => (
                <Fragment key={k}><dt className="text-slate-400">{k}</dt><dd className="break-all text-slate-200">{v}</dd></Fragment>
              ))}
            </dl>
            <JsonView value={log.payload} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
