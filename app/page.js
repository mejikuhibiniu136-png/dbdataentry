'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('RADAR');
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

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

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts/status');
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearLogs = async () => {
    if (confirm('Yakin ingin menghapus seluruh log tersimpan?')) {
      try {
        await fetch('/api/webhook/clear', { method: 'POST' });
        setLogs([]);
        fetchMetrics();
      } catch (e) {
        alert('Gagal menghapus log');
      }
    }
  };

  const handleCopyJson = (id, payload) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
    fetchAccounts();

    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(now.toLocaleDateString('id-ID', options));

    let interval = null;
    if (webhookEnabled) {
      interval = setInterval(() => {
        fetchMetrics();
        fetchLogs();
        fetchAccounts();
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [webhookEnabled]);

  const filteredLogs = logs.filter((log) => {
    return (
      log.eventType?.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.payload).toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
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

          <button onClick={handleClearLogs} style={{ ...btnStyle, backgroundColor: '#451a03', color: '#fde047', borderColor: '#78350f' }}>
            Clear Logs
          </button>
          <button onClick={() => { fetchMetrics(); fetchLogs(); fetchAccounts(); }} style={btnStyle}>
            Refresh
          </button>
          <button onClick={handleLogout} style={{ ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5', borderColor: '#991b1b' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Menu Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
        <button 
          onClick={() => setActiveTab('RADAR')}
          style={{
            backgroundColor: activeTab === 'RADAR' ? '#0284c7' : '#0f172a',
            color: activeTab === 'RADAR' ? '#fff' : '#94a3b8',
            border: '1px solid #1e293b',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          📡 Webhook Radar
        </button>
        <button 
          onClick={() => setActiveTab('ACCOUNTS')}
          style={{
            backgroundColor: activeTab === 'ACCOUNTS' ? '#0284c7' : '#0f172a',
            color: activeTab === 'ACCOUNTS' ? '#fff' : '#94a3b8',
            border: '1px solid #1e293b',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px'
          }}
        >
          👤 Account Status ({accounts.length})
        </button>
      </div>

      {activeTab === 'RADAR' && (
        <>
          {/* Metrik System */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={cardStyle}>
              <span style={cardTitle}>System Latency</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80', marginTop: '6px' }}>
                DB: {metrics?.dbPing || '...'}
              </div>
              <small style={{ color: '#38bdf8', display: 'block', marginTop: '2px', fontSize: '12px' }}>
                API: {apiPing !== null ? `${apiPing}ms` : '...'}
              </small>
            </div>

            <div style={cardStyle}>
              <span style={cardTitle}>Total Logs</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '8px' }}>
                {logs.length}
              </div>
              <small style={{ color: '#64748b' }}>Webhook Events</small>
            </div>

            <div style={cardStyle}>
              <span style={cardTitle}>DB Stats & Health</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#eab308', marginTop: '6px' }}>
                {metrics?.commandsCount || 0} Ops
              </div>
              <small style={{ color: '#f43f5e', display: 'block', marginTop: '2px', fontSize: '11px' }}>
                Storage: {metrics?.usage?.usedFormatted || '0 MB'}
              </small>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="Cari username, game, atau job ID..." 
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
                outline: 'none'
              }}
            />
          </div>

          {/* Log Feed Custom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#64748b' }}>Memuat data...</p>
            ) : filteredLogs.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
                <p style={{ color: '#64748b', margin: 0 }}>Belum ada webhook yang masuk.</p>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const p = log.payload || {};
                const avatar = p.avatarUrl;
                const isEmbed = p.embeds;

                return (
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
                          backgroundColor: p.event === 'Aktif' ? '#065f46' : '#1e1b4b',
                          color: p.event === 'Aktif' ? '#34d399' : '#818cf8',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {p.event || log.eventType}
                        </span>
                        {p.gameName && (
                          <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold' }}>
                            {p.gameName}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button 
                          onClick={() => handleCopyJson(log.id, log.payload)}
                          style={{
                            backgroundColor: '#1e293b',
                            color: copiedId === log.id ? '#4ade80' : '#94a3b8',
                            border: '1px solid #334155',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          {copiedId === log.id ? 'Copied!' : 'Copy JSON'}
                        </button>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>
                          {new Date(log.receivedAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Tampilan Khusus Roblox Payload */}
                    {avatar ? (
                      <div style={{
                        backgroundColor: '#020617',
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <img src={avatar} alt="avatar" style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #38bdf8' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                            {p.displayName} <span style={{ color: '#fbbf24', fontSize: '13px' }}>({p.username})</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            Job ID: {p.jobId || '-'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            User ID: {p.userId} • Place ID: {p.placeId}
                          </div>
                        </div>
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
        </>
      )}

      {/* Account Status Tab */}
      {activeTab === 'ACCOUNTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Active Script Accounts</h2>
          {accounts.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
              <p style={{ color: '#64748b', margin: 0 }}>Belum ada data akun yang dikirim oleh script.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {accounts.map((acc, index) => (
                <div key={acc.username || index} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#38bdf8' }}>{acc.username}</span>
                    <span style={{ backgroundColor: '#065f46', color: '#34d399', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                      ● {acc.status || 'ONLINE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              
