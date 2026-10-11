import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export const revalidate = 0;

export default async function HomePage() {
  let logs = [];

  try {
    const rawLogs = await redis.lrange('webhook_logs', 0, 49);
    if (Array.isArray(rawLogs)) {
      logs = rawLogs.map((item) => {
        if (typeof item === 'string') {
          try {
            return JSON.parse(item);
          } catch (e) {
            return { payload: { raw: item } };
          }
        }
        return item || {};
      });
    }
  } catch (err) {
    logs = [];
  }

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Dashboard Webhook Data Entry</h1>
      <p>Status System: Online</p>

      <h2>Log Webhook Terbaru</h2>
      {logs.length === 0 ? (
        <p>Belum ada data webhook yang masuk.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {logs.map((log, index) => {
            const payloadData = log?.payload || log || {};
            const aiData = log?.aiAnalysis || {};

            return (
              <div 
                key={log?.id || index} 
                style={{ 
                  border: '1px solid #ccc', 
                  borderRadius: '8px', 
                  padding: '12px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                <p style={{ margin: '0 0 6px 0' }}>
                  <strong>Waktu:</strong> {log?.receivedAt ? String(log.receivedAt) : '-'}
                </p>
                <p style={{ margin: '0 0 8px 0' }}>
                  <strong>Analisis AI:</strong> {aiData?.summary ? String(aiData.summary) : 'Tanpa Analisis'}
                </p>
                <pre style={{ 
                  background: '#1e1e1e', 
                  color: '#fff', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  overflowX: 'auto',
                  fontSize: '12px',
                  margin: 0
                }}>
                  {JSON.stringify(payloadData, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
              }
