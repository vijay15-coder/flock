import { readFile } from 'node:fs/promises';
import { MeterSnapshot } from './snapshot.js';
import { parseTransformers } from './html.js';
import { normalizeReadings } from './readings.js';
import { PortalError } from './client.js';

// One browser page is reused and operations are serialized. A portal session and
// its cookies stay inside the isolated context; the API never exposes them.
export class BrowserPortalClient {
  constructor({ baseUrl, email, password, exportFile = null, headless = true, cacheSeconds = 300,
    launchBrowser = null }) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.exportFile = exportFile;
    this.headless = headless;
    this.cacheMs = cacheSeconds * 1000;
    this.launchBrowser = launchBrowser;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.snapshot = exportFile ? new MeterSnapshot(exportFile) : null;
    this.exportedAt = 0;
    this.queue = Promise.resolve();
  }

  serialize(action) {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }

  async start() {
    if (this.page) return;
    let launch = this.launchBrowser;
    if (!launch) {
      let chromium;
      try {
        ({ chromium } = await import('playwright'));
      } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          throw new PortalError('Playwright is not installed; run npm install', 503);
        }
        throw error;
      }
      launch = (options) => chromium.launch(options);
    }
    try {
      this.browser = await launch({ headless: this.headless });
    } catch (error) {
      if (/Executable doesn't exist/i.test(error.message)) {
        throw new PortalError('Chromium is not installed; run npx playwright install chromium', 503);
      }
      throw error;
    }
    this.context = await this.browser.newContext({ acceptDownloads: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15000);
    await this.login();
  }

  async login() {
    await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    if (new URL(this.page.url()).pathname !== '/login') return;
    await this.page.locator('input[name="email"]').fill(this.email);
    await this.page.locator('input[name="password"]').fill(this.password);
    await Promise.all([
      this.page.waitForURL('**/meters', { timeout: 15000 }),
      this.page.getByRole('button', { name: 'Sign in' }).click()
    ]).catch(() => { throw new PortalError('Portal login failed'); });
  }

  async open(path) {
    let response = await this.page.goto(`${this.baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    if (new URL(this.page.url()).pathname === '/login') {
      await this.login();
      response = await this.page.goto(`${this.baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    }
    if (response?.status() === 404) throw new PortalError('Resource not found', 404);
    if (new URL(this.page.url()).pathname === '/login' || !response?.ok()) {
      throw new PortalError('Portal page unavailable');
    }
  }

  async ensureSnapshot() {
    if (this.exportFile) return this.snapshot;
    if (this.snapshot && Date.now() - this.exportedAt < this.cacheMs) return this.snapshot;
    await this.open('/transformers');
    await this.page.getByRole('heading', { name: 'Distribution Transformers' }).waitFor();
    const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
    await this.page.getByRole('button', { name: 'Export all meters' }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    // Fail early on a non-JSON export, before replacing the previous good snapshot.
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    if (!Array.isArray(data) || !data.length) throw new PortalError('Portal export was empty or changed format');
    const snapshot = new MeterSnapshot(filePath);
    await snapshot.load();
    this.snapshot = snapshot;
    this.exportedAt = Date.now();
    return snapshot;
  }

  async listMeters(options) {
    return this.serialize(async () => {
      if (!this.exportFile) await this.start();
      return (await this.ensureSnapshot()).list(options);
    });
  }

  async getMeter(id) {
    return this.serialize(async () => {
      if (!this.exportFile) await this.start();
      const meter = await (await this.ensureSnapshot()).get(id);
      if (!meter) throw new PortalError('Resource not found', 404);
      return meter;
    });
  }

  async listTransformers() {
    return this.serialize(async () => {
      await this.start();
      await this.open('/transformers');
      await this.page.getByRole('heading', { name: 'Distribution Transformers' }).waitFor();
      if (this.page.waitForSelector) await this.page.waitForSelector('table tbody tr');
      const all = [];
      let pages = 0;
      while (true) {
        const current = parseTransformers(await this.page.content());
        if (!current.items.length || pages >= 100) throw new PortalError('Portal transformer pages changed');
        all.push(...current.items);
        pages++;
        const next = this.page.getByRole('button', { name: 'Next' });
        if (!(await next.isEnabled())) break;
        const firstCode = current.items[0]?.code;
        await next.click();
        await this.page.waitForFunction((code) =>
          document.querySelector('table tbody tr td')?.textContent?.trim() !== code, firstCode);
      }
      return { items: all, page: 1, pages, partial: false };
    });
  }

  async getReadings(id) {
    return this.serialize(async () => {
      await this.start();
      if (!await (await this.ensureSnapshot()).get(id)) {
        throw new PortalError('Resource not found', 404);
      }
      await this.open(`/meters/${encodeURIComponent(id)}`);
      await this.page.getByRole('heading', { name: `Meter ${id}` }).waitFor();
      const section = this.page.locator('section').filter({ has: this.page.getByRole('heading', { name: 'Consumption' }) });
      const table = section.locator('table');
      try {
        await table.waitFor({ state: 'visible', timeout: 15000 });
      } catch {
        const status = await section.innerText();
        if (/no consumption|no readings|no data/i.test(status)) {
          return normalizeReadings(id, ['Timestamp', 'kWh', 'kVAh', 'V(R)'], []);
        }
        throw new PortalError('Portal consumption did not load');
      }
      const headers = await table.locator('thead th').allTextContents();
      const rows = await table.locator('tbody tr').evaluateAll((elements) =>
        elements.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim())));
      try {
        return normalizeReadings(id, headers, rows);
      } catch {
        throw new PortalError('Portal consumption format changed');
      }
    });
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
