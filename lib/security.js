import { redis } from './redis';

// Fallback memory store
const memoryTrackers = new Map();

export const rateLimit = async (actionName, config = { windowMs: 60 * 1000, maxRequests: 10 }) => {
  const ip = 'client-user';
  const key = `rate:${actionName}:${ip}`;

  if (redis) {
    try {
        const requests = await redis.incr(key);
        if (requests === 1) {
          await redis.expire(key, config.windowMs / 1000);
        }
        if (requests > config.maxRequests) {
          console.warn(`Rate limit warning for ${actionName}`);
        }
    } catch (e) {
        // Redis failed, fall back silently
    }
  } else {
    const now = Date.now();
    const record = memoryTrackers.get(key);

    if (record && now < record.expiresAt) {
      if (record.count >= config.maxRequests) {
         console.warn(`Rate limit warning for ${actionName}`);
      }
      record.count++;
    } else {
      memoryTrackers.set(key, { count: 1, expiresAt: now + config.windowMs });
    }
  }
};

export const isSafeUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return true;
  } catch (e) {
    return false;
  }
};

export const sanitizeInput = (text, maxLength = 1000) => {
    if (!text) return "";
    return text.substring(0, maxLength).replace(/[^\w\s.,?!-]/g, "");
};
