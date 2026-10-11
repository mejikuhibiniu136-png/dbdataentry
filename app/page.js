'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      if (data.username) setUsername(data.username);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWebhookStatus = async () => {
    try {
      const res = await fetch('/api/webhook/toggle');
      const data = await res.json();
      setWebhookEnabled(data.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleWebhook = async () => {
    const newStatus = !webhookEnabled;
    setWebhookEnabled(newStatus);
    try {
      await fetch('/api/webhook/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newStatus })
      });
    } catch (e) {
      console.error(e);
      setWebhookEnabled(!newStatus);
    }
  };

  const fetchMetrics = async () => {
    const start = Date.now();
    try {
      const res = await fetch('/api/ping');
      const pingMs = Date.now() - start;
      setApiPing(pingMs);
      const data = await res.json();
      setMetrics(data);
    } catch (e) {
      setApiPing('Fail');
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/webhook');
      const json = await res.json();
      if (json.success) setLogs(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  useEffect(() => {
    fetchUser();
    fetchWebhookStatus();
    fetchMetrics();
    fetchLogs();

    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(now.toLocaleDateString('id-ID', options));

    let interval = null;
    if (webhookEnabled) {
      interval = setInterval(() => {
        fetchMetrics();
        fetchLogs();
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [webhookEnabled]);

  // Deteksi log Anime Dice (berdasarkan eventType atau struktur embeds)
  const isAnimeDiceLog = (log) => {
    return (
      log.eventType?.includes('Anime Dice') ||
      (log.payload?.embeds && log.payload.embeds.length > 0)
    );
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.eventType.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.payload).toLowerCase().includes(search.toLowerCase());

    if (filterType === 'ALL') return matchesSearch;
    if (filterType === 'ANIME_DICE') return matchesSearch && isAnimeDiceLog(log);
    return matchesSearch;
  });

  const animeDiceCount = logs.filter(isAnimeDiceLog).length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '26px', 
            background: 'linear-gradient(90deg, #38bdf8, #818cf8)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}>
            dbdataentry Radar
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            {currentDate ? `${currentDate} • ` : ''}User: <strong style={{ color: '#38bdf8' }}>{username || 'Loading...'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', padding: '6px 12px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <span style={{ fontSize: '12px', color: webhookEnabled ? '#4ade80' : '#f43f5e', fontWeight: 'bold' }}>
              WEBHOOK: {webhookEnabled ? 'ON' : 'OFF'}
            </span>
            <button 
              onClick={handleToggleWebhook} 
              style={{
                width: '40px',
                height: '20px',
                backgroundColor: webhookEnabled ? '#22c55e' : '#64748b',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background-color 0.2s'
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                backgroundColor: '#fff',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: webhookEnabled ? '22px' : '2px',
                transition: 'left 0.2s'
              }} />
            </button>
          </div>

          <button onClick={() => { fetchMetrics(); fetchLogs(); }} style={btnStyle}>
            Refresh Data
          </button>
          <button onClick={handleLogout} style={{ ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5', borderColor: '#991b1b' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Grid Metrik Utama */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={cardStyle}>
          <span style={cardTitle}>Database Ping</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#4ade80', marginTop: '8px' }}>
            {metrics?.dbPing || 'Measuring...'}
          </div>
          <small style={{ color: '#64748b' }}>Upstash Redis</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>API Latency</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#38bdf8', marginTop: '8px' }}>
            {apiPing !== null ? `${apiPing}ms` : 'Measuring...'}
          </div>
          <small style={{ color: '#64748b' }}>Vercel Route</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>DB Storage</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f43f5e', marginTop: '8px' }}>
            {metrics?.usage?.usedFormatted || '0 MB'}
          </div>
          <small style={{ color: '#64748b' }}>{metrics?.usage?.percentage}% of 256 MB</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>Anime Dice Logs</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '8px' }}>
            {animeDiceCount}
          </div>
          <small style={{ color: '#64748b' }}>Tower & Unit Events</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>Total Webhooks</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#a855f7', marginTop: '8px' }}>
            {metrics?.totalLogs || 0}
          </div>
          <small style={{ color: '#64748b' }}>Logs in Storage</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>DB Commands</span>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#eab308', marginTop: '8px' }}>
            {metrics?.commandsCount || 0}
          </div>
          <small style={{ color: '#64748b' }}>Executed Ops</small>
        </div>
      </div>

      {/* Filter & Search Bar - Sederhana: Semua & Anime Dice */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Cari unit, floor, atau username (misal: sideofio)..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: '240px',
            padding: '12px 16px',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            outline: 'none'
          }}
        />

        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setFilterType('ALL')} style={filterBtnStyle(filterType === 'ALL')}>Semua</button>
          <button onClick={() => setFilterType('ANIME_DICE')} style={filterBtnStyle(filterType === 'ANIME_DICE')}>🎲 Anime Dice</button>
        </div>
      </div>

      {/* Log Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Memuat data dbdataentry...</p>
        ) : filteredLogs.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#64748b', margin: 0 }}>Belum ada webhook yang sesuai.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const embed = log.payload?.embeds?.[0];
            const isAnimeDice = isAnimeDiceLog(log);

            // Bersihkan tanda ** dari teks deskripsi
            const cleanDescription = embed?.description ? embed.description.replace(/\*\*/g, '') : '';

            return (
              <div key={log.id} style={{
                backgroundColor: '#0f172a',
                border: isAnimeDice ? '1px solid #3b82f6' : '1px solid #1e293b',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: isAnimeDice ? '#1e1b4b' : '#0f172a',
                      color: isAnimeDice ? '#818cf8' : '#64748b',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {isAnimeDice ? 'Anime Dice' : log.eventType}
                    </span>
                    {log.payload?.content && (
                      <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>
                        {log.payload.content.replace(/\|\|/g, '')}
                      </span>
                    )}
                  </div>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>
                    {new Date(log.receivedAt).toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Tampilan Embed tanpa tanda ** */}
                {embed ? (
                  <div style={{
                    backgroundColor: '#020617',
                    borderLeft: `4px solid ${embed.color ? '#' + embed.color.toString(16) : '#38bdf8'}`,
                    padding: '16px',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>{embed.title}</h3>
                        {embed.author?.name && (
                          <small style={{ color: '#64748b' }}>{embed.author.name}</small>
                        )}
                      </div>
                      {embed.thumbnail?.url && (
                        <img src={embed.thumbnail.url} alt="thumb" style={{ width: '48px', height: '48px', borderRadius: '6px' }} />
                      )}
                    </div>

                    {cleanDescription && (
                      <div style={{
                        whiteSpace: 'pre-wrap',
                        color: '#cbd5e1',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        fontFamily: 'monospace',
                        backgroundColor: '#0f172a',
                        padding: '12px',
                        borderRadius: '6px'
                      }}>
                        {cleanDescription}
                      </div>
                    )}
                  </div>
                ) : (
                  <pre style={{
                    backgroundColor: '#020617',
                    border: '1px solid #0f172a',
                    padding: '14px',
                    borderRadius: '8px',
                    overflowX: 'auto',
                    fontSize: '13px',
                    color: '#38bdf8',
                    margin: 0,
                    fontFamily: 'monospace'
                  }}>
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

const cardStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '16px'
};

const cardTitle = {
  fontSize: '11px',
  textTransform: 'uppercase',
  color: '#64748b',
  fontWeight: '600',
  letterSpacing: '0.5px'
};

const btnStyle = {
  backgroundColor: '#1e293b',
  color: '#38bdf8',
  border: '1px solid #334155',
  padding: '8px 16px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: '600'
};

const filterBtnStyle = (active) => ({
  backgroundColor: active ? '#0284c7' : '#0f172a',
  color: active ? '#fff' : '#94a3b8',
  border: '1px solid #1e293b',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold'
});
