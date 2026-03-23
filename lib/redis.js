import { Redis } from '@upstash/redis';

const hasRedis = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

export const redis = hasRedis
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;
