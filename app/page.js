'use client';

import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('RADAR');
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isPulling, setIsPulling] = useState(false);

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

  const handlePullRequest = async () => {
    setIsPulling(true);
    await Promise.all([fetchMetrics(), fetchLogs(), fetchAccounts()]);
    setTimeout(() => setIsPulling(false), 500);
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
  }, []);

  const isAnimeDiceLog = (log) => {
    return (
      log.eventType?.includes('Anime Dice') ||
      (log.payload?.embeds && log.payload.embeds.length > 0)
    );
  };

  // Analisis Statistik Real-time Game
  let maxFloor = 0;
  let totalUnits = 0;
  let highestRarity = '-';
  const rarityPriority = ['Secret', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
  const userCounts = {};

  logs.forEach(log => {
    const p = log.payload || {};
    const desc = p.embeds?.[0]?.description || '';
    const title = p.embeds?.[0]?.title || '';
    const user = p.content?.replace(/\|\|/g, '').replace('Username: ', '').trim() || p.username || 'Unknown';

    const isStatusUpdate = p.event === 'Heartbeat' || p.event === 'Aktif';

    if (user && user !== 'Unknown' && !isStatusUpdate) {
      userCounts[user] = (userCounts[user] || 0) + 1;
    }

    const cleanDesc = desc.replace(/\*\*/g, '');
    const floorMatch = cleanDesc.match(/Floor Reached:\s*(\d+)/i);
    if (floorMatch) {
      const floorNum = parseInt(floorMatch[1], 10);
      if (floorNum > maxFloor) maxFloor = floorNum;
    }

    if (title.includes('New Unit') || cleanDesc.includes('Rarity:')) {
      totalUnits += 1;
      const rarityMatch = cleanDesc.match(/Rarity:\s*([^\n]+)/i);
      if (rarityMatch) {
        const foundRarity = rarityMatch[1].trim();
        if (highestRarity === '-') {
          highestRarity = foundRarity;
        } else {
          const currentIdx = rarityPriority.indexOf(highestRarity);
          const foundIdx = rarityPriority.indexOf(foundRarity);
          if (foundIdx !== -1 && (currentIdx === -1 || foundIdx < currentIdx)) {
            highestRarity = foundRarity;
          }
        }
      }
    }
  });

  let topUser = '-';
  let maxCount = 0;
  Object.entries(userCounts).forEach(([u, count]) => {
    if (count > maxCount) {
      maxCount = count;
      topUser = u;
    }
  });

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
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '24px', boxSizing: 'border-box' }}>
      
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px',
        width: '100%'
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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

          <button 
            onClick={handlePullRequest} 
            disabled={isPulling}
            style={{ 
              ...btnStyle, 
              backgroundColor: '#0369a1', 
              color: '#38bdf8', 
              borderColor: '#0284c7',
              opacity: isPulling ? 0.6 : 1
            }}
          >
            {isPulling ? 'Pulling...' : '📥 Pull Request'}
          </button>

          <button onClick={handleClearLogs} style={{ ...btnStyle, backgroundColor: '#451a03', color: '#fde047', borderColor: '#78350f' }}>
            Clear Logs
          </button>
          <button onClick={handlePullRequest} style={btnStyle}>
            Refresh
          </button>
          <button onClick={handleLogout} style={{ ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5', borderColor: '#991b1b' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #1e293b', paddingBottom: '12px', width: '100%' }}>
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

      {/* TAB 1: RADAR */}
      {activeTab === 'RADAR' && (
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
            width: '100%'
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

            {filterType === 'ANIME_DICE' && (
              <>
                <div style={cardStyle}>
                  <span style={cardTitle}>Tower & Rare Unit</span>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c084fc', marginTop: '6px' }}>
                    {maxFloor ? `Floor ${maxFloor}` : 'Floor: -'}
                  </div>
                  <small style={{ color: '#f43f5e', display: 'block', marginTop: '2px', fontSize: '12px', fontWeight: 'bold' }}>
                    Rare Unit: {highestRarity}
                  </small>
                </div>

                <div style={cardStyle}>
                  <span style={cardTitle}>New Units Gained</span>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#34d399', marginTop: '8px' }}>
                    {totalUnits}
                  </div>
                  <small style={{ color: '#64748b' }}>Units Dropped</small>
                </div>
              </>
            )}

            <div style={cardStyle}>
              <span style={cardTitle}>Top Active User</span>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {topUser}
              </div>
              <small style={{ color: '#64748b' }}>{maxCount ? `${maxCount} Events` : '-'}</small>
            </div>

            <div style={cardStyle}>
              <span style={cardTitle}>Anime Dice Logs</span>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '8px' }}>
                {animeDiceCount}
              </div>
              <small style={{ color: '#64748b' }}>Game Events</small>
            </div>

            <div style={cardStyle}>
              <span style={cardTitle}>DB Stats & Health</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#eab308', marginTop: '6px' }}>
                {metrics?.commandsCount || 0} Ops
              </div>
              <small style={{ color: '#f43f5e', display: 'block', marginTop: '2px', fontSize: '11px' }}>
                Storage: {metrics?.usage?.usedFormatted || '0 MB'} ({metrics?.usage?.percentage || 0}%)
              </small>
              <small style={{ color: '#06b6d4', display: 'block', marginTop: '1px', fontSize: '11px' }}>
                Bandwidth: {metrics?.bandwidthFormatted || '0 KB'}
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', width: '100%' }}>
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
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setFilterType('ALL')} style={filterBtnStyle(filterType === 'ALL')}>Semua</button>
              <button onClick={() => setFilterType('ANIME_DICE')} style={filterBtnStyle(filterType === 'ANIME_DICE')}>🎲 Anime Dice</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#64748b' }}>Memuat data dbdataentry...</p>
            ) : filteredLogs.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
                <p style={{ color: '#64748b', margin: 0 }}>Belum ada webhook yang sesuai.</p>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const p = log.payload || {};
                const embed = p.embeds?.[0];
                const isAnimeDice = isAnimeDiceLog(log);

                return (
                  <div key={log.id} style={{
                    backgroundColor: '#0f172a',
                    border: isAnimeDice ? '1px solid #3b82f6' : '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          backgroundColor: p.event === 'Aktif' || p.event === 'Heartbeat' ? '#065f46' : isAnimeDice ? '#1e1b4b' : '#0f172a',
                          color: p.event === 'Aktif' || p.event === 'Heartbeat' ? '#34d399' : isAnimeDice ? '#818cf8' : '#64748b',
                          border: '1px solid rgba(255,255,255,0.1)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          {p.event || (isAnimeDice ? 'Anime Dice' : log.eventType)}
                        </span>
                        {p.gameName && (
                          <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold' }}>
                            {p.gameName}
                          </span>
                        )}
                        {log.payload?.content && (
                          <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>
                            {log.payload.content.replace(/\|\|/g, '')}
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

                    {/* FORMAT ROBLOX */}
                    {p.username || p.displayName ? (
                      <div style={{
                        backgroundColor: '#020617',
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          backgroundColor: '#1e293b',
                          border: '2px solid #38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          fontWeight: 'bold',
                          fontSize: '20px'
                        }}>
                          {(p.displayName || p.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                            {p.displayName || p.username} <span style={{ color: '#fbbf24', fontSize: '13px' }}>({p.username})</span>
                          </div>
                          {p.jobId && (
                            <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                              Job ID: {p.jobId}
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            User ID: {p.userId || '-'} • Place ID: {p.placeId || '-'}
                          </div>
                        </div>
                      </div>
                    ) : embed ? (
                      /* FORMAT EMBED DISCORD */
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

                        {embed.description && (
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
                            {embed.description.replace(/\*\*/g, '')}
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
      )}

      {/* TAB 2: ACCOUNTS STATUS */}
      {activeTab === 'ACCOUNTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Active Script Accounts</h2>
            <button onClick={handlePullRequest} style={{ ...btnStyle, fontSize: '12px', padding: '6px 12px' }}>
              📥 Pull Latest Data
            </button>
          </div>

          {accounts.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', width: '100%' }}>
              <p style={{ color: '#64748b', margin: 0 }}>Belum ada akun terdaftar. Klik "Pull Request" setelah skrip dijalankan.</p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', 
              gap: '20px', 
              width: '100%' 
            }}>
              {accounts.map((acc, index) => {
                const isOnline = acc.event === 'Aktif' || acc.event === 'Heartbeat' || acc.status?.toLowerCase() === 'online';
                return (
                  <div key={acc.username || index} style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxSizing: 'border-box',
                    width: '100%'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          backgroundColor: '#1e293b',
                          border: '2px solid #38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          fontWeight: 'bold',
                          fontSize: '16px'
                        }}>
                          {(acc.displayName || acc.username || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>
                            {acc.displayName || acc.username}
                          </div>
                          <div style={{ fontSize: '12px', color: '#fbbf24' }}>
                            @{acc.username}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        backgroundColor: isOnline ? '#065f46' : '#7f1d1d',
                        color: isOnline ? '#34d399' : '#fca5a5',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        ● {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    <div style={{
                      backgroundColor: '#020617',
                      padding: '12px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '12px'
                    }}>
                      <div style={{ color: '#cbd5e1' }}>
                        <strong style={{ color: '#38bdf8' }}>Game:</strong> {acc.gameName || '-'}
                      </div>
                      <div style={{ color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#38bdf8' }}>Job ID:</strong> {acc.jobId || 'Local/Private'}
                      </div>
                      <div style={{ color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>User ID:</strong> {acc.userId || '-'}</span>
                        <span><strong>Place ID:</strong> {acc.placeId || '-'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>Timestamp: {acc.timestamp ? new Date(acc.timestamp).toLocaleTimeString('id-ID') : '-'}</span>
                      <span>Sync: {acc.lastUpdate ? new Date(acc.lastUpdate).toLocaleTimeString('id-ID') : '-'}</span>
                    </div>
                  </div>
                );
              })}
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
  padding: '16px',
  boxSizing: 'border-box'
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
