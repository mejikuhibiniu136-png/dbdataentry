'use client';

import { Component, memo } from 'react';
import { embedColor, safeImageUrl } from '@/lib/client';
import { isAnimeDiceLog, isHeartbeat, str } from '@/lib/domain/logStats';

// Kartu log yang gagal dirender (format payload tidak terduga) tidak merusak seluruh halaman.
export class LogBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Gagal merender log:', error);
  }

  render() {
    if (this.state.failed) {
      return <div className="banner banner-bad">⚠️ Log ini tidak dapat ditampilkan (format payload tidak valid).</div>;
    }
    return this.props.children;
  }
}

const formatTime = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
};

function LogCardInner({ log, isNew, copied, onOpen, onCopy }) {
  const p = log.payload || {};
  const rawEmbed = Array.isArray(p.embeds) ? p.embeds[0] : null;
  const embed =
    rawEmbed && (str(rawEmbed.title) || str(rawEmbed.description) || str(rawEmbed.author?.name)) ? rawEmbed : null;
  const hasIdentity = Boolean(p.username || p.displayName);
  const heartbeat = isHeartbeat(log);
  const anime = isAnimeDiceLog(log);
  const who = p.displayName || p.username;
  const pillClass = heartbeat ? 'pill pill-ok' : anime ? 'pill pill-accent' : 'pill';

  return (
    <article className={`log${isNew ? ' is-new' : ''}`} style={anime ? { borderColor: 'color-mix(in srgb, var(--accent-2) 55%, var(--border))' } : undefined}>
      <div className="log-head" style={heartbeat ? { marginBottom: 0 } : undefined}>
        <div className="log-head-left">
          <span className={pillClass}>
            {heartbeat && <span className="dot dot-live" />}
            {p.event || (anime ? 'Anime Dice' : str(log.eventType) || 'Event')}
          </span>
          {p.gameName && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{str(p.gameName)}</span>}
          {heartbeat && who && <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{who}</span>}
          {!heartbeat && str(p.content) && (
            <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{str(p.content).replace(/\|\|/g, '')}</span>
          )}
        </div>
        <div className="log-head-right">
          <span className="mono hide-mobile" style={{ color: 'var(--accent)', fontSize: 11 }}>⚡ {Number(log.processingTimeMs) || 0}ms</span>
          <span className="log-time">{formatTime(log.receivedAt)}</span>
          <button className="btn btn-sm" onClick={() => onCopy(log)}>{copied ? '✓ Disalin' : 'Salin JSON'}</button>
          <button className="btn btn-sm" onClick={() => onOpen(log)}>Detail</button>
        </div>
      </div>

      {!heartbeat && hasIdentity && (
        <div className="log-body identity">
          <div className="avatar" aria-hidden="true">{(who || 'U').charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="identity-name">
              {who} {p.username && <small>({p.username})</small>}
            </div>
            {p.jobId && <div className="meta-line mono truncate">Job ID: {str(p.jobId)}</div>}
            <div className="meta-line">User ID: {p.userId || '-'} • Place ID: {p.placeId || '-'}</div>
          </div>
        </div>
      )}

      {!heartbeat && embed && (
        <div className="log-body embed" style={{ borderLeftColor: embedColor(embed.color), marginTop: hasIdentity ? 10 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <h3>{str(embed.title)}</h3>
              {str(embed.author?.name) && <div className="meta-line">{str(embed.author.name)}</div>}
            </div>
            {safeImageUrl(embed.thumbnail?.url) && (
              <img
                src={safeImageUrl(embed.thumbnail.url)}
                alt="Thumbnail"
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flex: 'none' }}
              />
            )}
          </div>
          {str(embed.description) && <div className="embed-desc">{str(embed.description).replace(/\*\*/g, '')}</div>}
        </div>
      )}

      {!heartbeat && !hasIdentity && !embed && (
        <div className="log-body">
          <pre className="json-pre" style={{ maxHeight: 200 }}>{JSON.stringify(log.payload, null, 2)}</pre>
        </div>
      )}
    </article>
  );
}

export const LogCard = memo(LogCardInner);
