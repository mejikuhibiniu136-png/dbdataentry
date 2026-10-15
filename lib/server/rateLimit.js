// Pembatas percobaan berbasis Redis (fixed window).
// `redis` diterima sebagai parameter supaya mudah diuji.

export async function hitRateLimit(redis, key, { limit, windowSeconds }) {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  let retryAfterSeconds = windowSeconds;
  if (count > limit) {
    const ttl = await redis.ttl(key);
    if (typeof ttl === 'number' && ttl > 0) {
      retryAfterSeconds = ttl;
    } else {
      // Key tanpa TTL (mis. proses terhenti setelah INCR): pasang TTL agar tidak terkunci selamanya.
      await redis.expire(key, windowSeconds);
    }
  }

  return { allowed: count <= limit, count, retryAfterSeconds };
}

export async function resetRateLimit(redis, key) {
  await redis.del(key);
}
