export function config(env = process.env) {
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
  return { baseUrl: baseUrl.origin, email: env.URJA_EMAIL, password: env.URJA_PASSWORD, port,
    exportFile: env.URJA_EXPORT_FILE || null };
}
