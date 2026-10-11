import { GoogleGenAI, Type } from '@google/genai';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function analyzeWithGemini(payload) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analisis data webhook berikut: ${JSON.stringify(payload)}`,
      config: {
        systemInstruction: `Kamu adalah validator webhook. Periksa apakah payload memiliki field wajib: username, userId, event, dan timestamp. Pastikan nilai event adalah ONLINE, OFFLINE, atau Heartbeat.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValid: { type: Type.BOOLEAN },
            missingFields: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING } 
            },
            anomalyDetected: { type: Type.BOOLEAN },
            summary: { type: Type.STRING }
          },
          required: ['isValid', 'missingFields', 'anomalyDetected', 'summary']
        }
      }
    });

    return JSON.parse(response.text);
  } catch (err) {
    return {
      isValid: true,
      missingFields: [],
      anomalyDetected: false,
      summary: 'Gagal analisis AI, data diproses secara manual.'
    };
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();

    // 1. Analisis payload menggunakan Gemini AI
    const aiAnalysis = await analyzeWithGemini(payload);

    // 2. Simpan log beserta hasil analisis Gemini ke Redis
    const logData = {
      id: crypto.randomUUID(),
      payload,
      aiAnalysis,
      receivedAt: new Date().toISOString()
    };

    await redis.lpush('webhook_logs', JSON.stringify(logData));
    await redis.ltrim('webhook_logs', 0, 199);

    // 3. Update status akun di Redis jika ada username
    if (payload.username) {
      await redis.hset('account_status', { 
        [payload.username]: JSON.stringify(payload) 
      });
    }

    return Response.json({
      success: true,
      message: 'Data berhasil diterima',
      aiAnalysis
    }, { status: 200 });

  } catch (err) {
    return Response.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}
