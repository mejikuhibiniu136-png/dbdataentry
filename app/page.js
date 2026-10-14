'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityChart, BarList } from '@/components/Charts';
import { AccountCard } from '@/components/AccountCard';
import { LogBoundary, LogCard } from '@/components/LogCard';
import { CommandPalette, ConfirmDialog, LogDrawer, Toasts } from '@/components/Overlays';
import { getAccountState } from '@/lib/accountStatus';
import { DASHBOARD_LOG_LIMIT } from '@/lib/constants';
import {
  apiFetch,
  copyText,
  downloadText,
  jsonPost,
  useLiveStream,
  useTheme,
  useToasts,
} from '@/lib/client';
import {
  RANGE_OPTIONS,
  accountsToCsv,
  buildActivity,
  computeLogStats,
  filterLogs,
  formatDuration,
  formatNumber,
  isHeartbeat,
  latencySeries,
  logsToCsv,
  timeAgo,
} from '@/lib/logStats';

const TABS = [
  { id: 'OVERVIEW', label: 'Ringkasan', icon: '🧭' },
  { id: 'RADAR', label: 'Webhook Radar', icon: '📡' },
  { id: 'ACCOUNTS', label: 'Akun', icon: '👤' },
  { id: 'ANALYTICS', label: 'Analitik', icon: '📊' },
];

const STATE_ORDER = { ONLINE: 0, STALLED: 1, OFFLINE: 2 };
const LIMIT_OPTIONS = [50, 100, 200];
const PAGE_SIZE = 60;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const CONNECTION_UI = {
  live: { cls: 'pill pill-ok', text: 'LIVE', pulse: true },
  connecting: { cls: 'pill', text: 'Menyambung…', pulse: false },
  reconnecting: { cls: 'pill pill-warn', text: 'Menyambung ulang…', pulse: false },
  paused: { cls: 'pill pill-warn', text: 'Dijeda', pulse: false },
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [logs, setLogs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [apiPing, setApiPing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [logLimit, setLogLimit] = useState(DASHBOARD_LOG_LIMIT);
  const [isPulling, setIsPulling] = useState(false);
  const [nowTime, setNowTime] = useState(() => Date.now());

  // Filter log
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('ALL_USERS');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [hideHeartbeat, setHideHeartbeat] = useState(false);
  const [rangeId, setRangeId] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Filter akun
  const [accSearch, setAccSearch] = useState('');
  const [accStatus, setAccStatus] = useState('ALL');
  const [accSort, setAccSort] = useState('STATUS');

  // Overlay
  const [selectedLog, setSelectedLog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());

  const { toasts, push: toast } = useToasts();
  const { theme, toggle: toggleTheme } = useTheme();

  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const copiedTimer = useRef(null);
  const newTimer = useRef(null);
  const seenIds = useRef(null); // null = data pertama belum diterima
  const prevStates = useRef(null);
  // Selisih jam server - jam browser (ms), agar status akun tidak salah akibat jam perangkat yang meleset.
  const clockOffset = useRef(0);

  // ---------- Pengambilan data ----------

  const applyLogs = useCallback((incoming) => {
    if (!Array.isArray(incoming)) return;
    setLogs(incoming);
    if (seenIds.current === null) {
      seenIds.current = new Set(incoming.map((l) => l.id));
      return;
    }
    const fresh = incoming.filter((l) => !seenIds.current.has(l.id)).map((l) => l.id);
    seenIds.current = new Set(incoming.map((l) => l.id));
    if (fresh.length > 0) {
      setNewIds(new Set(fresh));
      clearTimeout(newTimer.current);
      newTimer.current = setTimeout(() => setNewIds(new Set()), 2000);
    }
  }, []);

  const handleStreamData = useCallback(
    (parsed) => {
      if (typeof parsed.timestamp === 'number') clockOffset.current = parsed.timestamp - Date.now();
      if (Array.isArray(parsed.logs)) applyLogs(parsed.logs);
      if (Array.isArray(parsed.accounts)) setAccounts(parsed.accounts);
      setLoading(false);
    },
    [applyLogs]
  );

  const connection = useLiveStream({ paused, limit: logLimit, onData: handleStreamData });

  const fetchUser = useCallback(async () => {
    try {
      const res = await apiFetch('/api/user');
      const data = await res.json();
      if (data.username) setUsername(data.username);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchWebhookStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/webhook/toggle');
      const data = await res.json();
      if (typeof data.enabled === 'boolean') setWebhookEnabled(data.enabled);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    const start = Date.now();
    try {
      const res = await apiFetch('/api/ping');
      setApiPing(Date.now() - start);
      setMetrics(await res.json());
    } catch (e) {
      setApiPing('Fail');
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/webhook?limit=${logLimit}`);
      const json = await res.json();
      if (json.success) applyLogs(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [applyLogs, logLimit]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts/status');
      const json = await res.json();
      if (json.success) setAccounts(json.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsPulling(true);
    await Promise.all([fetchMetrics(), fetchLogs(), fetchAccounts(), fetchWebhookStatus()]);
    toast('Data berhasil diperbarui', 'success');
    setTimeout(() => setIsPulling(false), 400);
  }, [fetchAccounts, fetchLogs, fetchMetrics, fetchWebhookStatus, toast]);

  // Data awal dan tanggal
  useEffect(() => {
    fetchUser();
    fetchWebhookStatus();
    fetchMetrics();
    fetchLogs();
    fetchAccounts();
    setCurrentDate(
      new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    );
    return () => {
      clearTimeout(copiedTimer.current);
      clearTimeout(newTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jam: tiap detik di tab Akun (uptime), tiap 5 detik di tab lain (hitungan status).
  useEffect(() => {
    setNowTime(Date.now());
    const interval = setInterval(() => setNowTime(Date.now()), activeTab === 'ACCOUNTS' ? 1000 : 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Menu "Lainnya" menutup saat klik di luar.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // ---------- Aksi ----------

  const handleToggleWebhook = async () => {
    const next = !webhookEnabled;
    setWebhookEnabled(next);
    try {
      const res = await jsonPost('/api/webhook/toggle', { enabled: next });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast(next ? 'Receiver webhook dinyalakan' : 'Receiver webhook dimatikan', 'success');
    } catch (e) {
      console.error(e);
      setWebhookEnabled(!next);
      if (e.message !== 'Sesi berakhir') toast('Gagal mengubah status receiver', 'error');
    }
  };

  const doClear = async (scope) => {
    try {
      const res = await jsonPost('/api/webhook/clear', { scope });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (scope === 'all' || scope === 'logs') {
        setLogs([]);
        seenIds.current = new Set();
      }
      if (scope === 'all' || scope === 'accounts') setAccounts([]);
      fetchMetrics();
      toast('Data berhasil dihapus', 'success');
    } catch (e) {
      console.error(e);
      if (e.message !== 'Sesi berakhir') toast('Gagal menghapus data', 'error');
    }
  };

  const askClear = useCallback((scope) => {
    const text = {
      logs: ['Hapus semua log?', 'Seluruh riwayat webhook tersimpan akan dihapus. Data status akun tidak berubah.'],
      accounts: ['Hapus semua akun?', 'Seluruh data status akun akan dihapus dan terisi lagi saat script mengirim heartbeat berikutnya.'],
      all: ['Hapus semua data?', 'Seluruh log dan data status akun akan dihapus permanen.'],
    }[scope];
    setConfirmDialog({
      title: text[0],
      message: text[1],
      danger: true,
      confirmLabel: 'Ya, hapus',
      onConfirm: () => doClear(scope),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doDeleteAccount = async (acc) => {
    try {
      const res = await apiFetch('/api/accounts/status', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: acc.username }),
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setAccounts((list) => list.filter((a) => a.username !== acc.username));
      toast(`Akun @${acc.username} dihapus`, 'success');
    } catch (e) {
      console.error(e);
      if (e.message !== 'Sesi berakhir') toast('Gagal menghapus akun', 'error');
    }
  };

  const askDeleteAccount = (acc) =>
    setConfirmDialog({
      title: `Hapus akun @${acc.username}?`,
      message: 'Akun akan muncul lagi otomatis jika script-nya masih mengirim heartbeat.',
      danger: true,
      confirmLabel: 'Ya, hapus',
      onConfirm: () => doDeleteAccount(acc),
    });

  const flashCopied = (id) => {
    setCopiedId(id);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyLog = async (log) => {
    const ok = await copyText(JSON.stringify(log.payload, null, 2));
    if (ok) {
      flashCopied(log.id);
      toast('JSON disalin ke clipboard', 'success');
    } else {
      toast('Gagal menyalin ke clipboard', 'error');
    }
  };

  const handleCopyJob = async (acc) => {
    const ok = await copyText(String(acc.jobId || ''));
    toast(ok ? 'Job ID disalin' : 'Gagal menyalin ke clipboard', ok ? 'success' : 'error');
  };

  const handleDownloadLog = (log) => {
    downloadText(`log-${String(log.id).slice(0, 24)}.json`, JSON.stringify(log, null, 2));
  };

  const handleExportLogs = useCallback(
    async (format) => {
      try {
        const res = await apiFetch('/api/webhook?limit=200');
        const json = await res.json();
        if (!json.success || !Array.isArray(json.data)) throw new Error('Respons tidak valid');
        if (json.data.length === 0) {
          toast('Belum ada log untuk diekspor', 'info');
          return;
        }
        if (format === 'csv') downloadText(`dbdataentry-logs-${stamp()}.csv`, logsToCsv(json.data), 'text/csv');
        else downloadText(`dbdataentry-logs-${stamp()}.json`, JSON.stringify(json.data, null, 2));
        toast(`${json.data.length} log diekspor`, 'success');
      } catch (e) {
        console.error(e);
        if (e.message !== 'Sesi berakhir') toast('Gagal mengekspor log', 'error');
      }
    },
    [toast]
  );

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  }, []);

  // ---------- Turunan data ----------

  const serverNow = nowTime + clockOffset.current;

  const stats = useMemo(() => computeLogStats(logs), [logs]);

  const accountRows = useMemo(
    () =>
      accounts.map((acc) => {
        const state = getAccountState(acc, serverNow);
        const active = state !== 'OFFLINE';
        const start = new Date(acc.timestamp).getTime();
        const end = active ? serverNow : new Date(acc.lastUpdate || serverNow).getTime();
        const uptimeSec = acc.timestamp && Number.isFinite(start) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
        return { acc, state, uptimeSec };
      }),
    [accounts, serverNow]
  );

  const stateCounts = useMemo(() => {
    const counts = { ONLINE: 0, STALLED: 0, OFFLINE: 0 };
    accountRows.forEach((r) => {
      counts[r.state] += 1;
    });
    return counts;
  }, [accountRows]);

  const deferredSearch = useDeferredValue(search);
  const filteredLogs = useMemo(
    () =>
      filterLogs(logs, {
        search: deferredSearch,
        user: userFilter,
        type: typeFilter,
        hideHeartbeat,
        rangeId,
        nowMs: serverNow,
      }),
    // serverNow hanya relevan jika filter rentang waktu aktif
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, deferredSearch, userFilter, typeFilter, hideHeartbeat, rangeId, rangeId === 'ALL' ? 0 : nowTime]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearch, userFilter, typeFilter, hideHeartbeat, rangeId]);

  const visibleLogs = useMemo(() => filteredLogs.slice(0, visibleCount), [filteredLogs, visibleCount]);

  const activity = useMemo(() => buildActivity(logs, serverNow), [logs, Math.floor(serverNow / 15000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleAccounts = useMemo(() => {
    const q = accSearch.trim().toLowerCase();
    const rows = accountRows.filter((r) => {
      if (accStatus !== 'ALL' && r.state !== accStatus) return false;
      if (!q) return true;
      const a = r.acc;
      return [a.username, a.displayName, a.gameName, a.jobId, a.userId]
        .map((v) => String(v ?? '').toLowerCase())
        .some((v) => v.includes(q));
    });
    const byName = (x, y) => String(x.acc.username).localeCompare(String(y.acc.username));
    const sorters = {
      STATUS: (x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || byName(x, y),
      NAME: byName,
      UPTIME: (x, y) => y.uptimeSec - x.uptimeSec || byName(x, y),
      LATENCY: (x, y) => (Number(x.acc.latencyMs) || Infinity) - (Number(y.acc.latencyMs) || Infinity) || byName(x, y),
    };
    return [...rows].sort(sorters[accSort] || sorters.STATUS);
  }, [accountRows, accSearch, accStatus, accSort]);

  // Toast saat akun berpindah status (setelah data pertama diterima).
  useEffect(() => {
    if (loading) return;
    const current = new Map(accountRows.map((r) => [r.acc.username, r.state]));
    const previous = prevStates.current;
    if (previous) {
      current.forEach((state, name) => {
        const before = previous.get(name);
        if (before && before !== 'OFFLINE' && state === 'OFFLINE') toast(`@${name} offline`, 'error');
        else if (before === 'OFFLINE' && state === 'ONLINE') toast(`@${name} kembali online`, 'success');
      });
    }
    prevStates.current = current;
  }, [accountRows, loading, toast]);

  // Judul tab menampilkan jumlah akun online.
  useEffect(() => {
    document.title = stateCounts.ONLINE > 0 ? `(${stateCounts.ONLINE} online) dbdataentry` : 'dbdataentry';
  }, [stateCounts.ONLINE]);

  // ---------- Perintah & pintasan ----------

  const focusSearch = useCallback(() => {
    setActiveTab('RADAR');
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const commands = useMemo(
    () => [
      ...TABS.map((t, i) => ({ id: `tab-${t.id}`, label: `Buka ${t.label}`, hint: String(i + 1), run: () => setActiveTab(t.id) })),
      { id: 'search', label: 'Cari log', hint: '/', run: focusSearch },
      { id: 'refresh', label: 'Muat ulang data', run: handleRefresh },
      { id: 'pause', label: paused ? 'Lanjutkan stream realtime' : 'Jeda stream realtime', run: () => setPaused((v) => !v) },
      { id: 'theme', label: theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap', run: toggleTheme },
      { id: 'webhook', label: webhookEnabled ? 'Matikan receiver webhook' : 'Nyalakan receiver webhook', run: handleToggleWebhook },
      { id: 'export-json', label: 'Ekspor log (JSON)', run: () => handleExportLogs('json') },
      { id: 'export-csv', label: 'Ekspor log (CSV)', run: () => handleExportLogs('csv') },
      {
        id: 'export-acc',
        label: 'Ekspor akun (CSV)',
        run: () => downloadText(`dbdataentry-akun-${stamp()}.csv`, accountsToCsv(accounts, (a) => getAccountState(a, Date.now() + clockOffset.current)), 'text/csv'),
      },
      { id: 'clear-logs', label: 'Hapus semua log…', run: () => askClear('logs') },
      { id: 'clear-acc', label: 'Hapus semua akun…', run: () => askClear('accounts') },
      { id: 'logout', label: 'Keluar (logout)', run: handleLogout },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paused, theme, webhookEnabled, accounts, focusSearch, handleRefresh, handleExportLogs, handleLogout, askClear, toggleTheme]
  );

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey || paletteOpen || confirmDialog || selectedLog) return;
      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
      } else if (e.key >= '1' && e.key <= String(TABS.length)) {
        setActiveTab(TABS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, confirmDialog, selectedLog, focusSearch]);

  // ---------- Tampilan ----------

  const conn = CONNECTION_UI[connection] || CONNECTION_UI.connecting;
  const storagePct = Math.min(100, Math.max(0, Number(metrics?.usage?.percentage) || 0));
  const recentEvents = useMemo(() => logs.filter((l) => !isHeartbeat(l)).slice(0, 5), [logs]);
  const problemAccounts = accountRows.filter((r) => r.state !== 'ONLINE').slice(0, 5);

  const resetAccountFilters = () => {
    setAccSearch('');
    setAccStatus('ALL');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">📡</div>
          <div style={{ minWidth: 0 }}>
            <h1>dbdataentry Radar</h1>
            <p>
              {currentDate ? `${currentDate} • ` : ''}User: <strong>{username || '...'}</strong>
            </p>
          </div>
        </div>

        <div className="top-actions">
          <span className={conn.cls} title="Status koneksi realtime">
            <span className={`dot${conn.pulse ? ' dot-live' : ''}`} />
            {conn.text}
          </span>

          <div className="switch-wrap">
            <span className="switch-label" style={{ color: webhookEnabled ? 'var(--ok)' : 'var(--bad)' }}>
              WEBHOOK {webhookEnabled ? 'ON' : 'OFF'}
            </span>
            <button
              className="switch"
              role="switch"
              aria-checked={webhookEnabled}
              aria-label="Receiver webhook"
              onClick={handleToggleWebhook}
            />
          </div>

          <button className="btn" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
            {paused ? '▶ Lanjut' : '⏸ Jeda'}
          </button>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={isPulling}>
            {isPulling ? 'Memuat…' : '↻ Muat ulang'}
          </button>
          <button className="btn btn-icon" onClick={() => setPaletteOpen(true)} aria-label="Buka palet perintah (Ctrl+K)" title="Palet perintah (Ctrl+K)">
            ⌘K
          </button>
          <button className="btn btn-icon" onClick={toggleTheme} aria-label="Ganti tema" title="Ganti tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <div className="menu" ref={menuRef}>
            <button className="btn" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
              Lainnya ▾
            </button>
            {menuOpen && (
              <div className="menu-list" role="menu" onClick={() => setMenuOpen(false)}>
                <button role="menuitem" onClick={() => handleExportLogs('json')}>⬇ Ekspor log (JSON)</button>
                <button role="menuitem" onClick={() => handleExportLogs('csv')}>⬇ Ekspor log (CSV)</button>
                <button
                  role="menuitem"
                  onClick={() => downloadText(`dbdataentry-akun-${stamp()}.csv`, accountsToCsv(accounts, (a) => getAccountState(a, serverNow)), 'text/csv')}
                >
                  ⬇ Ekspor akun (CSV)
                </button>
                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button role="menuitem" style={{ color: 'var(--bad)' }} onClick={() => askClear('logs')}>🗑 Hapus semua log</button>
                <button role="menuitem" style={{ color: 'var(--bad)' }} onClick={() => askClear('accounts')}>🗑 Hapus semua akun</button>
                <button role="menuitem" style={{ color: 'var(--bad)' }} onClick={() => askClear('all')}>🗑 Hapus semuanya</button>
              </div>
            )}
          </div>

          <button className="btn btn-danger" onClick={handleLogout}>Keluar</button>
        </div>
      </header>

      {connection === 'reconnecting' && (
        <div className="banner banner-warn" role="status">⚠️ Koneksi realtime terputus. Mencoba menyambung ulang…</div>
      )}
      {paused && (
        <div className="banner banner-warn" role="status">⏸ Stream dijeda — data tidak diperbarui otomatis. Tekan “Lanjut” untuk melanjutkan.</div>
      )}
      {!webhookEnabled && (
        <div className="banner banner-bad" role="status">⛔ Receiver webhook nonaktif — data baru dari script tidak akan diterima.</div>
      )}

      <nav className="tabs" role="tablist" aria-label="Bagian dashboard">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            onClick={() => setActiveTab(t.id)}
            title={`Pintasan: ${i + 1}`}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {t.id === 'ACCOUNTS' && <span className="badge-count">{accounts.length}</span>}
            {t.id === 'RADAR' && <span className="badge-count">{logs.length}</span>}
          </button>
        ))}
      </nav>

      {/* ===================== RINGKASAN ===================== */}
      {activeTab === 'OVERVIEW' && (
        <section role="tabpanel" id="panel-OVERVIEW" aria-labelledby="tab-OVERVIEW">
          <div className="stat-grid">
            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">🟢</span>
              <span className="card-title">Akun online</span>
              <div className="stat-value">{stateCounts.ONLINE}<span className="muted" style={{ fontSize: 15 }}> / {accounts.length}</span></div>
              <span className="stat-sub">{stateCounts.STALLED} stalled • {stateCounts.OFFLINE} offline</span>
            </div>

            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">⚡</span>
              <span className="card-title">Latensi sistem</span>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>{metrics?.dbPing || '...'}</div>
              <span className="stat-sub">DB RTT • API {apiPing !== null ? (apiPing === 'Fail' ? 'gagal' : `${apiPing}ms`) : '...'} • rata-rata proses {stats.avgProcessingMs}ms</span>
            </div>

            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">🔥</span>
              <span className="card-title">Pengguna teraktif</span>
              <div className="stat-value truncate" style={{ fontSize: 20, color: 'var(--warn)' }}>{stats.topUser}</div>
              <span className="stat-sub">{stats.maxCount ? `${stats.maxCount} event` : 'Belum ada data'}</span>
            </div>

            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">🗄️</span>
              <span className="card-title">Database & penyimpanan</span>
              <div className="stat-value" style={{ fontSize: 20 }}>{formatNumber(metrics?.commandsCount || 0)} Ops</div>
              <span className="stat-sub">{metrics?.usage?.usedFormatted || '0 MB'} terpakai ({storagePct}%)</span>
              <div className="progress" role="progressbar" aria-valuenow={storagePct} aria-valuemin={0} aria-valuemax={100} aria-label="Penggunaan penyimpanan">
                <span style={{ width: `${storagePct}%` }} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 className="section-title">📈 Aktivitas webhook</h2>
            {loading ? <div className="skeleton" /> : <ActivityChart data={activity} />}
          </div>

          <div className="two-col">
            <div className="card">
              <h2 className="section-title">⚠️ Akun perlu perhatian</h2>
              {problemAccounts.length === 0 ? (
                <div className="hint">{accounts.length === 0 ? 'Belum ada akun terdaftar.' : 'Semua akun online. 🎉'}</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {problemAccounts.map(({ acc, state }) => (
                    <div key={acc.username} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span className="truncate"><b>@{acc.username}</b> <span className="muted">• {timeAgo(new Date(acc.lastUpdate).getTime(), serverNow)}</span></span>
                      <span className={state === 'STALLED' ? 'pill pill-warn' : 'pill pill-bad'}>{state}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="section-title">🕑 Event terbaru</h2>
              {recentEvents.length === 0 ? (
                <div className="hint">Belum ada event selain heartbeat.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {recentEvents.map((log) => (
                    <button
                      key={log.id}
                      className="btn"
                      style={{ justifyContent: 'space-between', fontWeight: 500 }}
                      onClick={() => setSelectedLog(log)}
                    >
                      <span className="truncate">{log.payload?.event || log.eventType || 'Event'}{log.payload?.username ? ` • @${log.payload.username}` : ''}</span>
                      <span className="muted" style={{ fontSize: 12, flex: 'none' }}>{timeAgo(new Date(log.receivedAt).getTime(), serverNow)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===================== RADAR ===================== */}
      {activeTab === 'RADAR' && (
        <section role="tabpanel" id="panel-RADAR" aria-labelledby="tab-RADAR">
          <div className="toolbar">
            <div className="grow">
              <span className="search-icon" aria-hidden="true">🔎</span>
              <input
                ref={searchRef}
                className="field"
                type="search"
                placeholder="Cari unit, floor, atau username…   ( / )"
                aria-label="Cari log"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="field" aria-label="Filter akun" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="ALL_USERS">👤 Semua akun</option>
              {stats.uniqueUsers.map((u) => (
                <option key={u} value={u}>@{u}</option>
              ))}
            </select>
            <select className="field" aria-label="Rentang waktu" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
              {RANGE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>🕒 {r.label}</option>
              ))}
            </select>
            <select
              className="field"
              aria-label="Jumlah log dimuat"
              value={logLimit}
              onChange={(e) => setLogLimit(Number(e.target.value))}
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>Muat {n} log</option>
              ))}
            </select>
          </div>

          <div className="toolbar">
            <div className="chips" role="group" aria-label="Filter jenis log">
              <button className="chip" aria-pressed={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')}>Semua</button>
              <button className="chip" aria-pressed={typeFilter === 'ANIME_DICE'} onClick={() => setTypeFilter('ANIME_DICE')}>🎲 Anime Dice ({stats.animeDiceCount})</button>
              <button className="chip" aria-pressed={hideHeartbeat} onClick={() => setHideHeartbeat((v) => !v)}>
                🙈 Sembunyikan heartbeat ({stats.heartbeatCount})
              </button>
            </div>
            <span className="hint" style={{ marginLeft: 'auto' }}>
              Menampilkan {Math.min(visibleLogs.length, filteredLogs.length)} dari {filteredLogs.length} log
            </span>
          </div>

          <div className="log-list">
            {loading ? (
              <>
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton" />
              </>
            ) : filteredLogs.length === 0 ? (
              <div className="card empty">
                <div className="big">📭</div>
                Belum ada webhook yang sesuai.
                {(search || userFilter !== 'ALL_USERS' || typeFilter !== 'ALL' || hideHeartbeat || rangeId !== 'ALL') && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setSearch('');
                        setUserFilter('ALL_USERS');
                        setTypeFilter('ALL');
                        setHideHeartbeat(false);
                        setRangeId('ALL');
                      }}
                    >
                      Reset filter
                    </button>
                  </div>
                )}
              </div>
            ) : (
              visibleLogs.map((log) => (
                <LogBoundary key={log.id}>
                  <LogCard
                    log={log}
                    isNew={newIds.has(log.id)}
                    copied={copiedId === log.id}
                    onOpen={setSelectedLog}
                    onCopy={handleCopyLog}
                  />
                </LogBoundary>
              ))
            )}
            {filteredLogs.length > visibleLogs.length && (
              <button className="btn" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Tampilkan {Math.min(PAGE_SIZE, filteredLogs.length - visibleLogs.length)} log lagi
              </button>
            )}
          </div>
        </section>
      )}

      {/* ===================== AKUN ===================== */}
      {activeTab === 'ACCOUNTS' && (
        <section role="tabpanel" id="panel-ACCOUNTS" aria-labelledby="tab-ACCOUNTS">
          <div className="summary-row">
            <div className="summary-chip"><span className="pill pill-ok"><span className="dot" />Online</span><b>{stateCounts.ONLINE}</b></div>
            <div className="summary-chip"><span className="pill pill-warn"><span className="dot" />Stalled</span><b>{stateCounts.STALLED}</b></div>
            <div className="summary-chip"><span className="pill pill-bad"><span className="dot" />Offline</span><b>{stateCounts.OFFLINE}</b></div>
          </div>

          <div className="toolbar">
            <div className="grow">
              <span className="search-icon" aria-hidden="true">🔎</span>
              <input
                className="field"
                type="search"
                placeholder="Cari username, game, atau Job ID…"
                aria-label="Cari akun"
                value={accSearch}
                onChange={(e) => setAccSearch(e.target.value)}
              />
            </div>
            <div className="chips" role="group" aria-label="Filter status akun">
              {['ALL', 'ONLINE', 'STALLED', 'OFFLINE'].map((s) => (
                <button key={s} className="chip" aria-pressed={accStatus === s} onClick={() => setAccStatus(s)}>
                  {s === 'ALL' ? 'Semua' : s}
                </button>
              ))}
            </div>
            <select className="field" aria-label="Urutkan akun" value={accSort} onChange={(e) => setAccSort(e.target.value)}>
              <option value="STATUS">Urutkan: Status</option>
              <option value="NAME">Urutkan: Nama</option>
              <option value="UPTIME">Urutkan: Uptime</option>
              <option value="LATENCY">Urutkan: Latensi</option>
            </select>
          </div>

          {accounts.length === 0 ? (
            <div className="card empty">
              <div className="big">👤</div>
              Belum ada akun terdaftar.
            </div>
          ) : visibleAccounts.length === 0 ? (
            <div className="card empty">
              <div className="big">🔍</div>
              Tidak ada akun yang cocok dengan filter.
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-sm" onClick={resetAccountFilters}>Reset filter</button>
              </div>
            </div>
          ) : (
            <div className="acc-grid">
              {visibleAccounts.map(({ acc, state, uptimeSec }) => (
                <AccountCard
                  key={acc.username}
                  acc={acc}
                  state={state}
                  uptime={acc.timestamp ? formatDuration(uptimeSec) : '-'}
                  syncText={acc.lastUpdate ? new Date(acc.lastUpdate).toLocaleTimeString('id-ID') : '-'}
                  latency={latencySeries(logs, acc.username)}
                  onDelete={askDeleteAccount}
                  onCopyJob={handleCopyJob}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===================== ANALITIK ===================== */}
      {activeTab === 'ANALYTICS' && (
        <section role="tabpanel" id="panel-ANALYTICS" aria-labelledby="tab-ANALYTICS">
          <p className="hint" style={{ marginTop: 0 }}>
            Dihitung dari {logs.length} log yang sedang dimuat. Ubah jumlahnya lewat pilihan “Muat … log” di tab Webhook Radar.
          </p>
          <div className="stat-grid">
            <div className="card stat">
              <span className="card-title">Tower & unit langka</span>
              <div className="stat-value" style={{ color: 'var(--accent-2)' }}>{stats.maxFloor ? `Floor ${stats.maxFloor}` : '-'}</div>
              <span className="stat-sub" style={{ color: 'var(--bad)', fontWeight: 700 }}>Rare unit: {stats.highestRarityText}</span>
            </div>
            <div className="card stat">
              <span className="card-title">Unit baru didapat</span>
              <div className="stat-value" style={{ color: 'var(--ok)' }}>{stats.totalUnits}</div>
              <span className="stat-sub">Units dropped</span>
            </div>
            <div className="card stat">
              <span className="card-title">Event Anime Dice</span>
              <div className="stat-value" style={{ color: 'var(--warn)' }}>{stats.animeDiceCount}</div>
              <span className="stat-sub">{stats.heartbeatCount} heartbeat</span>
            </div>
            <div className="card stat">
              <span className="card-title">Waktu proses webhook</span>
              <div className="stat-value">{stats.avgProcessingMs}<span className="muted" style={{ fontSize: 15 }}> ms</span></div>
              <span className="stat-sub">rata-rata • maks {stats.maxProcessingMs}ms</span>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <h2 className="section-title">🏆 Pengguna teraktif</h2>
              <BarList items={stats.topUsers} emptyText="Belum ada aktivitas pengguna." />
            </div>
            <div className="card">
              <h2 className="section-title">🧩 Jenis event</h2>
              <BarList items={stats.topEvents} emptyText="Belum ada event." />
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">🎁 Total looting terkumpul</h2>
            <BarList items={stats.topLoot.slice(0, 15)} emptyText="Belum ada data looting dari log Anime Dice." format={formatNumber} />
          </div>
        </section>
      )}

      <LogDrawer log={selectedLog} onClose={() => setSelectedLog(null)} onCopy={handleCopyLog} onDownload={handleDownloadLog} />
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <Toasts toasts={toasts} />
    </div>
  );
}
