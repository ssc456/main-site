import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

console.log('[Redis API] Environment variables check:', {
  url: url ? 'Found' : 'Not found',
  token: token ? 'Found' : 'Not found'
});

let redis;

try {
  if (!url || !token) {
    throw new Error('Missing Redis environment variables');
  }

  redis = new Redis({
    url,
    token,
  });
} catch (error) {
  console.error('[Redis API] Initialization error:', error);

  redis = {
    get: async (key) => {
      console.error(`[Redis Mock] GET operation for key "${key}" - Redis unavailable`);
      return null;
    },
    set: async (key, value) => {
      console.error(`[Redis Mock] SET operation for key "${key}" - Redis unavailable`);
      return null;
    },
    ping: async () => {
      console.error('[Redis Mock] PING operation - Redis unavailable');
      throw new Error('Redis connection unavailable');
    }
  };
}

export default redis;