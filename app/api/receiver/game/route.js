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
      summary: 'API Key Gemini tidak ditemukan.'
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
    Kamu adalah validator webhook otomatis. Analisis data JSON berikut:
    ${JSON.stringify(payload)}

    Tugasmu:
    1. Pastikan field penting ada (username, userId, event, timestamp).
    2. Periksa apakah ada anomali data.
    3. Berikan respons HANYA dalam format JSON valid tanpa tanda backtick markdown seperti contoh berikut:
    {"isValid": true, "missingFields": [], "anomalyDetected": false, "summary": "Data valid dan lengkap."}
    `;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().trim();
    
    // Membersihkan format markdown jika AI menyertakan ```json ... ```
    const cleanJson = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanJson);
  } catch (err) {
    return {
      isValid: true,
      missingFields: [],
      anomalyDetected: false,
      summary: `Error AI: ${err.message}`
    };
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();

    // 1. Jalankan analisis Gemini AI
    const aiAnalysis = await analyzeWithGemini(payload);

    // 2. Simpan ke Redis
    const logData = {
      id: crypto.randomUUID(),
      payload,
      aiAnalysis,
      receivedAt: new Date().toISOString()
    };

    await redis.lpush('webhook_logs', JSON.stringify(logData));
    await redis.ltrim('webhook_logs', 0, 199);

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
