import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMeter, parseMeters, parseTransformers } from '../app/html.js';
import { UrjaPortalClient } from '../app/client.js';
import { createServer } from '../app/main.js';
import { MeterSnapshot } from '../app/snapshot.js';
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
  const server = createServer({ listMeters: async (options) => { listOptions = options; return { items: [] }; }, getMeter: async (id) => ({ meter_id: id }), listTransformers: async () => ({ items: [] }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const meter = await fetch(`${base}/api/v1/meters/J100000`);
    assert.equal((await meter.json()).meter_id, 'J100000');
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
