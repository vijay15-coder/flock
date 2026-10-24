import { parseMeter, parseMeters, parseTransformers } from './html.js';
import { MeterSnapshot } from './snapshot.js';

export class PortalError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export class UrjaPortalClient {
  constructor({ baseUrl, email, password, exportFile = null, fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.fetch = fetchImpl;
    this.cookie = '';
    this.loginPending = null;
    this.snapshot = exportFile ? new MeterSnapshot(exportFile) : null;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      return await this.fetch(new URL(path, this.baseUrl), {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
        headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...options.headers }
      });
    } catch (error) {
      throw new PortalError(error.name === 'AbortError' ? 'Portal request timed out' : 'Portal unavailable', 503);
    } finally {
      clearTimeout(timer);
    }
  }

  async login() {
    if (this.loginPending) return this.loginPending;
    this.loginPending = this.doLogin().finally(() => { this.loginPending = null; });
    return this.loginPending;
  }

  async doLogin() {
    const body = new URLSearchParams({ email: this.email, password: this.password });
    const response = await this.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const setCookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean);
    const cookie = setCookies.map((item) => item.split(';', 1)[0]).filter((item) => item.includes('=')).join('; ');
    if (!cookie || (response.status !== 200 && response.status !== 303 && response.status !== 302)) {
      throw new PortalError('Portal login failed', 502);
    }
    this.cookie = cookie;
  }

  async html(path) {
    if (!this.cookie) await this.login();
    let response = await this.request(path);
    if (response.status === 401 || response.status === 403 ||
        (response.status >= 300 && response.status < 400 &&
          new URL(response.headers.get('location') || '/', this.baseUrl).pathname === '/login')) {
      this.cookie = '';
      await this.login();
      response = await this.request(path);
    }
    if (response.status === 404) throw new PortalError('Resource not found', 404);
    if (!response.ok) throw new PortalError('Portal request failed');
    const html = await response.text();
    if (/<h1\b[^>]*>\s*Urja Meter Ops\s*<\/h1>/i.test(html) && /Sign in/i.test(html)) {
      throw new PortalError('Portal session was not accepted');
    }
    return html;
  }

  async listMeters(options = { page: 1, limit: 20, status: null, transformerCode: null }) {
    if (this.snapshot) return this.snapshot.list(options);
    if (options.page !== 1 || options.limit !== 20 || options.status || options.transformerCode) {
      throw new PortalError('Paging and filters require URJA_EXPORT_FILE', 400);
    }
    return parseMeters(await this.html('/meters'));
  }
  async getMeter(id) {
    if (this.snapshot) {
      const meter = await this.snapshot.get(id);
      if (!meter) throw new PortalError('Resource not found', 404);
      return meter;
    }
    return parseMeter(await this.html(`/meters/${encodeURIComponent(id)}`), id);
  }
  async listTransformers() { return parseTransformers(await this.html('/transformers')); }
}
