import { GoogleGenerativeAI } from '@google/generative-ai';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

async function analyzeWithGemini(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      isValid: true,
      missingFields: [],
      anomalyDetected: false,
      summary: 'API Key Gemini belum dipasang di Vercel.'
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `
    Kamu adalah validator webhook. Periksa data JSON berikut:
    ${JSON.stringify(payload)}

    Kembalikan format JSON persis seperti ini:
    {
      "isValid": boolean,
      "missingFields": ["field_yang_hilang_jika_ada"],
      "anomalyDetected": boolean,
      "summary": "penjelasan singkat"
    }
    `;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (err) {
    return {
      isValid: true,
      missingFields: [],
      anomalyDetected: false,
      summary: 'Gagal analisis AI, data diproses manual.'
    };
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();

    // 1. Analisis otomatis pakai Gemini AI
    const aiAnalysis = await analyzeWithGemini(payload);

    // 2. Simpan log beserta hasil analisis ke Redis
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
