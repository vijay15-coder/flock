export function config(env = process.env) {
  if (typeof process.loadEnvFile === 'function' && (!env.URJA_EMAIL || !env.URJA_PASSWORD)) {
    try { process.loadEnvFile(); } catch {}
  }
  const baseUrl = new URL(env.URJA_BASE_URL || 'https://urja-ops.flockenergy.tech');
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password) {
    throw new Error('URJA_BASE_URL must be an HTTPS URL without credentials');
  }
  if (!env.URJA_EMAIL || !env.URJA_PASSWORD) {
    throw new Error('Set URJA_EMAIL and URJA_PASSWORD in the environment');
  }
  const port = Number(env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const mode = env.URJA_MODE || 'browser';
  if (!['browser', 'http'].includes(mode)) throw new Error('URJA_MODE must be browser or http');
  const cacheSeconds = Number(env.URJA_EXPORT_TTL_SECONDS || 300);
  if (!Number.isInteger(cacheSeconds) || cacheSeconds < 30) {
    throw new Error('URJA_EXPORT_TTL_SECONDS must be at least 30');
  }
  return { baseUrl: baseUrl.origin, email: env.URJA_EMAIL, password: env.URJA_PASSWORD, port,
    exportFile: env.URJA_EXPORT_FILE || null, mode, cacheSeconds,
    headless: env.URJA_HEADLESS !== 'false' };
}
