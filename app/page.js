'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
    fetchMetrics();
    fetchLogs();
    const interval = setInterval(() => {
      fetchMetrics();
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) => 
    log.eventType.toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(log.payload).toLowerCase().includes(search.toLowerCase())
  );

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
            Real-time Webhook Ping & Database Metrics
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { fetchMetrics(); fetchLogs(); }} style={btnStyle}>
            Refresh Data
          </button>
          <button onClick={handleLogout} style={{ ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5', borderColor: '#991b1b' }}>
            Logout
          </button>
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>

        <div style={cardStyle}>
          <span style={cardTitle}>Database Ping</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4ade80', marginTop: '8px' }}>
            {metrics?.dbPing || 'Measuring...'}
          </div>
          <small style={{ color: '#64748b' }}>Upstash Redis Latency</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>API Webhook Ping</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#38bdf8', marginTop: '8px' }}>
            {apiPing !== null ? `${apiPing}ms` : 'Measuring...'}
          </div>
          <small style={{ color: '#64748b' }}>Vercel Route Latency</small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>DB Memory Usage</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f43f5e', marginTop: '8px' }}>
            {metrics?.usage?.usedFormatted || '0 MB'}
          </div>
          <div style={{ backgroundColor: '#334155', height: '6px', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f43f5e', height: '100%', width: `${metrics?.usage?.percentage || 0}%` }} />
          </div>
          <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
            {metrics?.usage?.percentage}% of {metrics?.usage?.limitFormatted}
          </small>
        </div>

        <div style={cardStyle}>
          <span style={cardTitle}>Total Webhooks</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7', marginTop: '8px' }}>
            {metrics?.totalLogs || 0}
          </div>
          <small style={{ color: '#64748b' }}>Logs in Storage</small>
        </div>

      </div>

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Cari event / payload JSON..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Memuat data dbdataentry...</p>
        ) : filteredLogs.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#64748b', margin: 0 }}>Belum ada webhook yang masuk.</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    backgroundColor: '#1e1b4b',
                    color: '#818cf8',
                    border: '1px solid #3730a3',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {log.eventType}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Process: {log.processingTimeMs || 0}ms
                  </span>
                </div>
                <span style={{ color: '#64748b', fontSize: '12px' }}>
                  {new Date(log.receivedAt).toLocaleString('id-ID')}
                </span>
              </div>

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
            </div>
          ))
        )}
      </div>

    </div>
  );
}

const cardStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '20px'
};

const cardTitle = {
  fontSize: '12px',
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
