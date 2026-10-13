'use client';

import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { DASHBOARD_LOG_LIMIT } from '@/lib/constants';
import { getAccountState } from '@/lib/accountStatus';

// ---------- Helper murni ----------

const str = (value) => (typeof value === 'string' ? value : '');

// Semua request dashboard lewat sini: jika sesi berakhir (401) langsung diarahkan ke login.
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesi berakhir');
  }
  return res;
}

// Warna embed (integer RGB) menjadi hex 6 digit. Nilai kosong / tidak valid -> kuning default.
function embedColor(color) {
  return Number.isInteger(color) && color > 0 && color <= 0xffffff
    ? `#${color.toString(16).padStart(6, '0')}`
    : '#eab308';
}

// Gambar dari payload hanya dimuat jika https.
function safeImageUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const isAnimeDiceLog = (log) =>
  str(log.eventType).includes('Anime Dice') ||
  (Array.isArray(log.payload?.embeds) && log.payload.embeds.length > 0);

const RARITY_MULTIPLIERS = {
  '': 1, 'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12,
  'qd': 1e15, 'qi': 1e18, 'sx': 1e21, 'sp': 1e24, 'oc': 1e27,
  'no': 1e30, 'dc': 1e33, 'udc': 1e36, 'ddc': 1e39, 'tdc': 1e42,
  'qdc': 1e45, 'qidc': 1e48, 'sxdc': 1e51, 'spdc': 1e54, 'ocdc': 1e57,
  'nodc': 1e60, 'vg': 1e63, 'googol': 1e100
};

const parseRarityChance = (chanceStr) => {
  if (!chanceStr) return 0;
  const match = chanceStr.match(/1\/([\d.]+)([a-zA-Z]*)/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const suffix = match[2].toLowerCase().replace('!', '');
  const multiplier = RARITY_MULTIPLIERS[suffix] !== undefined ? RARITY_MULTIPLIERS[suffix] : 1;
  return num * multiplier;
};

// Statistik dari daftar log. Satu log yang formatnya aneh dilewati, tidak merusak yang lain.
function computeLogStats(logs) {
  let maxFloor = 0;
  let totalUnits = 0;
  let highestRarityText = '-';
  let maxRarityScore = 0;
  const lootSummary = Object.create(null);
  const userCounts = Object.create(null);

  logs.forEach((log) => {
    try {
      const p = log.payload || {};
      const desc = str(p.embeds?.[0]?.description);
      const title = str(p.embeds?.[0]?.title);
      const user =
        str(p.content).replace(/\|\|/g, '').replace('Username: ', '').trim() ||
        str(p.username) ||
        'Unknown';

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

      cleanDesc.split('\n').forEach((line) => {
        const match = line.match(/^\s*([A-Za-z0-9\s]+):\s*x?(\d+)/);
        if (match) {
          const itemName = match[1].trim();
          const quantity = parseInt(match[2], 10);
          if (itemName !== 'Floor Reached' && itemName !== 'Name' && itemName !== 'Drops') {
            lootSummary[itemName] = (lootSummary[itemName] || 0) + quantity;
          }
        }
      });

      if (title.includes('New Unit!')) {
        totalUnits += 1;
        const chanceMatch = title.match(/New Unit!\s*(1\/[^\s!]+)/i);
        if (chanceMatch) {
          const rawChance = chanceMatch[1];
          const score = parseRarityChance(rawChance);
          if (score > maxRarityScore) {
            maxRarityScore = score;
            highestRarityText = rawChance;
          }
        }
      }
    } catch (err) {
      console.error('Log dilewati saat menghitung statistik:', err);
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

  const uniqueUsers = Array.from(
    new Set(logs.map((l) => l.payload?.username).filter((u) => typeof u === 'string' && u))
  );

  return {
    maxFloor,
    totalUnits,
    highestRarityText,
    lootSummary,
    topUser,
    maxCount,
    uniqueUsers,
    animeDiceCount: logs.filter(isAnimeDiceLog).length
  };
}

function filterLogs(logs, search, userFilter, filterType) {
  const q = search.toLowerCase();
  return logs.filter((log) => {
    const p = log.payload || {};
    const matchesSearch =
      !q ||
      str(log.eventType).toLowerCase().includes(q) ||
      JSON.stringify(p).toLowerCase().includes(q);
    const matchesUser = userFilter === 'ALL_USERS' || p.username === userFilter;
    if (!matchesSearch || !matchesUser) return false;
    if (filterType === 'ANIME_DICE') return isAnimeDiceLog(log);
    return true;
  });
}

const ACCOUNT_STATE_STYLES = {
  OFFLINE: { color: '#fca5a5', bg: '#7f1d1d' },
  STALLED: { color: '#fde047', bg: '#713f12' },
  ONLINE: { color: '#34d399', bg: '#065f46' }
};

// Kartu log yang gagal dirender (format payload tidak terduga) tidak merusak seluruh halaman.
class LogBoundary extends Component {
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
      return (
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #7f1d1d',
          borderRadius: '12px',
          padding: '16px',
          color: '#fca5a5',
          fontSize: '13px'
        }}>
          ⚠️ Log ini tidak dapat ditampilkan (format payload tidak valid).
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Halaman ----------

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('RADAR');
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedUserFilter, setSelectedUserFilter] = useState('ALL_USERS');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [nowTime, setNowTime] = useState(Date.now());

  const toastTimer = useRef(null);
  // Selisih jam server - jam browser (ms), agar status akun tidak salah akibat jam perangkat yang meleset.
  const clockOffset = useRef(0);

  const showToast = (msg) => {
    setToastMessage(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/user');
      const data = await res.json();
      if (data.username) setUsername(data.username);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWebhookStatus = async () => {
    try {
      const res = await apiFetch('/api/webhook/toggle');
      const data = await res.json();
      if (typeof data.enabled === 'boolean') setWebhookEnabled(data.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleWebhook = async () => {
    const newStatus = !webhookEnabled;
    setWebhookEnabled(newStatus);
    try {
      const res = await apiFetch('/api/webhook/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newStatus })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(newStatus ? 'Receiver Webhook Dinyalakan' : 'Receiver Webhook Dimatikan');
    } catch (e) {
      console.error(e);
      setWebhookEnabled(!newStatus);
      showToast('Gagal mengubah status receiver');
    }
  };

  const fetchMetrics = async () => {
    const start = Date.now();
    try {
      const res = await apiFetch('/api/ping');
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
      const res = await apiFetch(`/api/webhook?limit=${DASHBOARD_LOG_LIMIT}`);
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
      const res = await apiFetch('/api/accounts/status');
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePullRequest = async () => {
    setIsPulling(true);
    await Promise.all([fetchMetrics(), fetchLogs(), fetchAccounts()]);
    showToast('Data berhasil diperbarui!');
    setTimeout(() => setIsPulling(false), 500);
  };

  const handleClearLogs = async () => {
    if (!confirm('Yakin ingin menghapus seluruh log tersimpan?')) return;
    try {
      const res = await apiFetch('/api/webhook/clear', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLogs([]);
      setAccounts([]);
      fetchMetrics();
      showToast('Seluruh log berhasil dihapus');
    } catch (e) {
      console.error(e);
      if (e.message !== 'Sesi berakhir') alert('Gagal menghapus log');
    }
  };

  const handleCopyJson = async (id, payload) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error(e);
      showToast('Gagal menyalin ke clipboard');
      return;
    }
    setCopiedId(id);
    showToast('JSON disalin ke clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  };

  // Data awal dan tanggal
  useEffect(() => {
    fetchUser();
    fetchWebhookStatus();
    fetchMetrics();
    fetchLogs();
    fetchAccounts();

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    setCurrentDate(new Date().toLocaleDateString('id-ID', options));

    return () => clearTimeout(toastTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jam detik-an hanya dibutuhkan tab Account Status (uptime & status), jadi hanya berjalan di sana.
  useEffect(() => {
    if (activeTab !== 'ACCOUNTS') return undefined;
    setNowTime(Date.now());
    const tickInterval = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(tickInterval);
  }, [activeTab]);

  // Stream realtime (SSE). Ditutup saat tab browser tersembunyi supaya tidak menghabiskan
  // command Redis, dan disambung lagi ketika tab terlihat.
  useEffect(() => {
    let source = null;
    let retryTimer = null;
    let disposed = false;

    const disconnect = () => {
      clearTimeout(retryTimer);
      retryTimer = null;
      if (source) {
        source.close();
        source = null;
      }
    };

    const scheduleRetry = () => {
      if (!disposed && !document.hidden) retryTimer = setTimeout(connect, 5000);
    };

    const connect = () => {
      if (disposed || source) return;
      const es = new EventSource('/api/stream');
      source = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (typeof parsed.timestamp === 'number') {
            clockOffset.current = parsed.timestamp - Date.now();
          }
          if (Array.isArray(parsed.logs)) setLogs(parsed.logs);
          if (Array.isArray(parsed.accounts)) setAccounts(parsed.accounts);
          setLoading(false);
        } catch (err) {
          console.error('SSE Error', err);
        }
      };

      es.onerror = () => {
        // Selama masih CONNECTING, browser menyambung ulang sendiri.
        // CLOSED berarti server menolak koneksi (mis. sesi habis).
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        if (source === es) source = null;
        fetch('/api/user')
          .then((res) => {
            if (res.status === 401) {
              window.location.href = '/login';
              return;
            }
            scheduleRetry();
          })
          .catch(scheduleRetry);
      };
    };

    const onVisibilityChange = () => {
      if (document.hidden) disconnect();
      else connect();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disconnect();
    };
  }, []);

  // Hitungan berat hanya diulang saat datanya berubah, bukan tiap render.
  const stats = useMemo(() => computeLogStats(logs), [logs]);
  const {
    maxFloor,
    totalUnits,
    highestRarityText,
    lootSummary,
    topUser,
    maxCount,
    uniqueUsers,
    animeDiceCount
  } = stats;

  const filteredLogs = useMemo(
    () => filterLogs(logs, search, selectedUserFilter, filterType),
    [logs, search, selectedUserFilter, filterType]
  );

  const serverNow = nowTime + clockOffset.current;

  const calculateUptime = (timestamp, lastUpdate, isOnline) => {
    if (!timestamp) return '-';
    const start = new Date(timestamp).getTime();
    const end = isOnline ? serverNow : new Date(lastUpdate || serverNow).getTime();
    const diffSec = Math.floor((end - start) / 1000);
    if (!Number.isFinite(diffSec) || diffSec <= 0) return '0s';
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;
    if (h > 0) return `${h}j ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getAccountPreciseStatus = (acc) => {
    const state = getAccountState(acc, serverNow);
    return { state, ...ACCOUNT_STATE_STYLES[state] };
  };

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '24px', boxSizing: 'border-box', position: 'relative' }}>
      
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#0284c7',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
          fontSize: '13px',
          fontWeight: 'bold',
          zIndex: 9999,
          border: '1px solid #38bdf8'
        }}>
          {toastMessage}
        </div>
      )}

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
          📡 Webhook Radar (Realtime Stream)
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
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
            width: '100%'
          }}>
            <div style={cardStyle}>
              <span style={cardTitle}>System Latency Diagnostic</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80', marginTop: '6px' }}>
                DB RTT: {metrics?.dbPing || '...'}
              </div>
              <small style={{ color: '#38bdf8', display: 'block', marginTop: '2px', fontSize: '12px' }}>
                API Latency: {apiPing !== null ? `${apiPing}ms` : '...'}
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
                    Rare Unit: {highestRarityText}
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
              <span style={cardTitle}>DB Stats & Storage</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#eab308', marginTop: '6px' }}>
                {metrics?.commandsCount || 0} Ops
              </div>
              <small style={{ color: '#f43f5e', display: 'block', marginTop: '2px', fontSize: '11px' }}>
                Storage: {metrics?.usage?.usedFormatted || '0 MB'} ({metrics?.usage?.percentage || 0}%)
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', width: '100%' }}>
            <input 
              type="text" 
              placeholder="Cari unit, floor, atau username..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
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

            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                color: '#38bdf8',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 'bold',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL_USERS">👤 Semua Akun</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>@{u}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setFilterType('ALL')} style={filterBtnStyle(filterType === 'ALL')}>Semua</button>
              <button onClick={() => setFilterType('ANIME_DICE')} style={filterBtnStyle(filterType === 'ANIME_DICE')}>🎲 Anime Dice</button>
            </div>
          </div>

          {filterType === 'ANIME_DICE' && Object.keys(lootSummary).length > 0 && (
            <div style={{
              backgroundColor: '#0f172a',
              border: '1px solid #3b82f6',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎁 Total Looting Accumulation
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: '12px'
              }}>
                {Object.entries(lootSummary).map(([item, count]) => (
                  <div key={item} style={{
                    backgroundColor: '#020617',
                    border: '1px solid #1e293b',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: '500' }}>{item}</span>
                    <span style={{ fontSize: '14px', color: '#4ade80', fontWeight: 'bold' }}>x{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#64748b' }}>Memuat data dbdataentry SSE...</p>
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
                  <LogBoundary key={log.id}>
                  <div style={{
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
                        {str(p.content) && (
                          <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 'bold' }}>
                            {str(p.content).replace(/\|\|/g, '')}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#38bdf8', fontSize: '11px', fontFamily: 'monospace' }}>
                          ⚡ {log.processingTimeMs || 0}ms
                        </span>
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
                      <div style={{
                        backgroundColor: '#020617',
                        borderLeft: `4px solid ${embedColor(embed.color)}`,
                        padding: '16px',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>{str(embed.title)}</h3>
                            {embed.author?.name && (
                              <small style={{ color: '#64748b', display: 'block', marginTop: '2px' }}>{embed.author.name}</small>
                            )}
                          </div>
                          {safeImageUrl(embed.thumbnail?.url) && (
                            <img src={safeImageUrl(embed.thumbnail?.url)} alt="thumb" referrerPolicy="no-referrer" loading="lazy" style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' }} />
                          )}
                        </div>

                        {str(embed.description) && (
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
                            {str(embed.description).replace(/\*\*/g, '')}
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
                  </LogBoundary>
                );
              })
            )}
          </div>
        </div>
      )}

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
              <p style={{ color: '#64748b', margin: 0 }}>Belum ada akun terdaftar.</p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', 
              gap: '20px', 
              width: '100%' 
            }}>
              {accounts.map((acc, index) => {
                const preciseStatus = getAccountPreciseStatus(acc);
                const isOnline = preciseStatus.state === 'ONLINE' || preciseStatus.state === 'STALLED';

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
                        backgroundColor: preciseStatus.bg,
                        color: preciseStatus.color,
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        ● {preciseStatus.state}
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
                      <div style={{ color: '#cbd5e1', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong style={{ color: '#38bdf8' }}>Game:</strong> {acc.gameName || '-'}</span>
                        <span style={{ color: isOnline ? '#34d399' : '#f43f5e', fontWeight: 'bold' }}>
                          Active: {calculateUptime(acc.timestamp, acc.lastUpdate, isOnline)}
                        </span>
                      </div>
                      <div style={{ color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#38bdf8' }}>Job ID:</strong> {acc.jobId || 'Local/Private'}
                      </div>
                      <div style={{ color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>User ID:</strong> {acc.userId || '-'}</span>
                        <span><strong>Latency:</strong> {acc.latencyMs ? `${acc.latencyMs}ms` : '-'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>Start: {acc.timestamp ? new Date(acc.timestamp).toLocaleTimeString('id-ID') : '-'}</span>
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
