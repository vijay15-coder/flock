import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMeter, parseMeters, parseTransformers } from '../app/html.js';
import { UrjaPortalClient } from '../app/client.js';
import { createServer } from '../app/main.js';
import { MeterSnapshot } from '../app/snapshot.js';
import { normalizeReadings } from '../app/readings.js';
import { BrowserPortalClient } from '../app/browser-client.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listHtml = `<h1>Meters</h1><span>403 total</span><table><tbody>
<tr><td><a href="/meters/J100000">J100000</a></td><td>SE33962</td><td>HPL</td><td>single</td><td>Decommissioned</td><td>DT-001</td></tr>
</tbody></table><div>Page 1 of 21</div>`;

const detailHtml = `<h1>Meter J100000</h1><nav><span>Jaipur Zone 1 (Z-01)</span><span>›</span><span>Circle 1 (C-01)</span><span>›</span><span>Malviya Nagar DT 1 (DT-001)</span></nav>
<dl><div><dt>Meter ID</dt> <dd>J100000</dd></div><div><dt>Serial No</dt> <dd>SE33962</dd></div><div><dt>Make</dt> <dd>HPL</dd></div><div><dt>Phase Type</dt> <dd>single</dd></div><div><dt>Installation Status</dt> <dd>Decommissioned</dd></div><div><dt>Installation Type</dt> <dd>Whole Current</dd></div></dl><p>26.938961002479868, 75.83095696146852 Latitude / Longitude</p>`;

test('normalizes the observed portal table and detail shapes', () => {
  const meters = parseMeters(listHtml);
  assert.equal(meters.total, 403);
  assert.equal(meters.partial, true);
  assert.deepEqual(meters.items[0], {
    meter_id: 'J100000', serial_number: 'SE33962', make: 'HPL', phase_type: 'single',
    status: 'Decommissioned', transformer_code: 'DT-001'
  });
  const meter = parseMeter(detailHtml, 'J100000');
  assert.equal(meter.location.latitude, 26.938961002479868);
  assert.deepEqual(meter.network_path, [
    'Jaipur Zone 1 (Z-01)', 'Circle 1 (C-01)', 'Malviya Nagar DT 1 (DT-001)'
  ]);
  const v2 = detailHtml.replaceAll('Meter ID', 'MeterId').replaceAll('Serial No', 'SerialNo')
    .replaceAll('Phase Type', 'PhaseType').replaceAll('Installation Status', 'InstallationStatus')
    .replaceAll('Installation Type', 'InstallationType');
  assert.equal(parseMeter(v2, 'J100000').serial_number, 'SE33962');
  assert.throws(() => parseMeters('<h1>Meters</h1><table><tbody><tr><td>x</td></tr></tbody></table>'));
});

test('parses transformer capacity as a number', () => {
  const result = parseTransformers('<h1>Distribution Transformers</h1><table><tbody><tr><td>DT-001</td><td>Malviya Nagar DT 1</td><td>F-001</td><td>100</td></tr></tbody></table><div>Page 1 of 2</div>');
  assert.equal(result.items[0].capacity_kva, 100);
  assert.equal(result.partial, true);
});

test('reuses a cookie and reauthenticates once after expiry', async () => {
  const calls = [];
  let loginCount = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method || 'GET', cookie: options.headers.cookie });
    if (options.method === 'POST') {
      loginCount++;
      return new Response('', { status: 303, headers: { 'set-cookie': `session=s${loginCount}; HttpOnly`, location: '/meters' } });
    }
    if (options.headers.cookie === 'session=s1') {
      return new Response('', { status: 303, headers: { location: '/login' } });
    }
    return new Response(listHtml, { status: 200 });
  };
  const client = new UrjaPortalClient({ baseUrl: 'https://urja.example', email: 'a@example.com', password: 'secret', fetchImpl });
  const result = await client.listMeters();
  assert.equal(result.items.length, 1);
  assert.equal(loginCount, 2);
  assert.equal(calls.at(-1).cookie, 'session=s2');
});

test('serves JSON routes and rejects unsupported methods', async () => {
  let listOptions;
  const server = createServer({ listMeters: async (options) => { listOptions = options; return { items: [] }; },
    getMeter: async (id) => ({ meter_id: id }), getReadings: async (id) => normalizeReadings(id,
      ['Timestamp', 'kWh', 'kVAh', 'V(R)'], [['23/06/2026 23:30', '1', '2', '230']]),
    listTransformers: async () => ({ items: [] }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const meter = await fetch(`${base}/api/v1/meters/J100000`);
    assert.equal((await meter.json()).meter_id, 'J100000');
    const readings = await fetch(`${base}/api/v1/meters/J100000/readings`);
    assert.equal((await readings.json()).readings[0].voltage_r, 230);
    const consumption = await fetch(`${base}/api/v1/meters/J100000/consumption`);
    assert.equal((await consumption.json()).readings[0].voltage_r, 230);
    const openapi = await fetch(`${base}/openapi.json`);
    assert.equal(openapi.status, 200);
    assert.equal((await openapi.json()).openapi, '3.0.3');
    const docs = await fetch(`${base}/docs`);
    assert.equal(docs.status, 200);
    assert.ok((await docs.text()).includes('api-reference'));
    await fetch(`${base}/api/v1/meters?page=2&limit=5&status=Faulty&transformer_code=DT-001`);
    assert.deepEqual(listOptions, { page: 2, limit: 5, status: 'Faulty', transformerCode: 'DT-001' });
    assert.equal((await fetch(`${base}/api/v1/meters?limit=101`)).status, 400);
    assert.equal((await fetch(`${base}/api/v1/meters/J100000`, { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('filters and pages a local export without dropping the total', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'urja-test-'));
  const file = join(dir, 'meters.json');
  try {
    await writeFile(file, JSON.stringify([
      { meterId: 'J1', serialNo: 'S1', make: 'HPL', phaseType: 'single', installStatus: 'Installed', dtCode: 'DT-001', hierarchy: {} },
      { meterId: 'J2', serialNo: 'S2', make: 'HPL', phaseType: 'three', installStatus: 'Faulty', dtCode: 'DT-002', hierarchy: {} },
      { meterId: 'J3', serialNo: 'S3', make: 'Genus', phaseType: 'single', installStatus: 'Installed', dtCode: 'DT-001', hierarchy: { circle: { name: 'Circle 1', code: '' }, dt: { name: 'Xfmr A', code: 'DT-001' } } }
    ]));
    const snapshot = new MeterSnapshot(file);
    const result = await snapshot.list({ page: 2, limit: 1, status: 'installed', transformerCode: 'DT-001' });
    assert.equal(result.total, 2);
    assert.equal(result.items[0].meter_id, 'J3');
    assert.equal(result.partial, false);
    assert.ok(result.snapshot_at);
    const meter = await snapshot.get('J3');
    assert.equal(meter.transformer_code, 'DT-001');
    assert.equal(meter.status, 'Installed');
    assert.deepEqual(meter.hierarchy[1], { level: 'circle', name: 'Circle 1', code: null });
    assert.deepEqual(meter.network_path, ['Circle 1', 'Xfmr A (DT-001)']);
    assert.equal(await snapshot.get('missing'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizes displayed cumulative readings without inventing a timezone', () => {
  const result = normalizeReadings('J100000', ['Timestamp', 'kWh', 'kVAh', 'V(R)'], [
    ['23/06/2026 23:30', '48438.74', '52313.84', '226'],
    ['24/06/2026 00:00', '48439.16', '52314.29', '229']
  ]);
  assert.equal(result.timezone, null);
  assert.equal(result.latest_timestamp_local, '2026-06-24T00:00:00');
  assert.equal(result.readings[0].kwh_cumulative, 48438.74);
  assert.throws(() => normalizeReadings('J100000', ['Time', 'kWh', 'kVAh', 'V(R)'], []));
  assert.throws(() => normalizeReadings('J100000', ['Timestamp', 'kWh', 'kVAh', 'V(R)'], [['31/02/2026 00:00', '1', '2', '3']]));
});

test('browser mode can serve a local export without launching Chromium', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'urja-browser-test-'));
  const file = join(dir, 'meters.json');
  try {
    await writeFile(file, JSON.stringify([{ meterId: 'J1', serialNo: 'S1', installStatus: 'Installed',
      dtCode: 'DT-001', hierarchy: { dt: { name: 'Transformer 1', code: 'DT-001' } } }]));
    const client = new BrowserPortalClient({ baseUrl: 'https://urja.example', email: 'a@example.com',
      password: 'secret', exportFile: file, launchBrowser: () => { throw new Error('browser launched'); } });
    const list = await client.listMeters({ page: 1, limit: 20, status: null, transformerCode: null });
    assert.equal(list.total, 1);
    assert.equal((await client.getMeter('J1')).network_path[0], 'Transformer 1 (DT-001)');
    await assert.rejects(client.getMeter('missing'), { status: 404 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('browser adapter signs in and caches the portal export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'urja-download-test-'));
  const file = join(dir, 'meter-export.json');
  let currentUrl = 'https://urja.example/login';
  let logins = 0;
  let downloads = 0;
  let closed = false;
  try {
    await writeFile(file, JSON.stringify([{ meterId: 'J1', serialNo: 'S1', installStatus: 'Installed',
      dtCode: 'DT-001', hierarchy: { dt: { name: 'Transformer 1', code: 'DT-001' } } }]));
    const page = {
      setDefaultTimeout() {},
      url: () => currentUrl,
      goto: async (url) => { currentUrl = url; return { status: () => 200, ok: () => true }; },
      locator: () => ({ fill: async () => {} }),
      waitForURL: async () => {},
      waitForEvent: async () => ({ path: async () => file }),
      getByRole: (role, { name }) => ({
        waitFor: async () => {},
        click: async () => {
          if (name === 'Sign in') { logins++; currentUrl = 'https://urja.example/meters'; }
          if (name === 'Export all meters') downloads++;
        }
      })
    };
    const browser = {
      newContext: async () => ({ newPage: async () => page }),
      close: async () => { closed = true; }
    };
    const client = new BrowserPortalClient({ baseUrl: 'https://urja.example', email: 'a@example.com',
      password: 'secret', cacheSeconds: 300, launchBrowser: async () => browser });
    const options = { page: 1, limit: 20, status: null, transformerCode: null };
    assert.equal((await client.listMeters(options)).total, 1);
    assert.equal((await client.listMeters(options)).total, 1);
    assert.equal(logins, 1);
    assert.equal(downloads, 1);
    await client.close();
    assert.equal(closed, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
