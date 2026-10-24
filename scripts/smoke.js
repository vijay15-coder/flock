import { config } from '../app/config.js';
import { UrjaPortalClient } from '../app/client.js';

const options = config();
const client = options.mode === 'browser'
  ? new (await import('../app/browser-client.js')).BrowserPortalClient(options)
  : new UrjaPortalClient(options);
try {
  const meters = await client.listMeters({ page: 1, limit: 20, status: null, transformerCode: null });
  if (!meters.items.length || meters.total < meters.items.length) {
    throw new Error('Meter list returned an invalid count');
  }

  const id = meters.items[0].meter_id;
  const meter = await client.getMeter(id);
  if (meter.meter_id !== id || !meter.serial_number) {
    throw new Error('Meter detail did not match the list');
  }

  const transformers = await client.listTransformers();
  if (!transformers.items.length) throw new Error('Transformer list was empty');

  const readings = options.mode === 'browser' ? await client.getReadings(id) : null;
  if (readings && !readings.readings.length) throw new Error('Meter readings were empty');

  console.log(JSON.stringify({
    portal: options.baseUrl,
    meter_count: meters.total,
    meter_sample: id,
    transformer_count: transformers.items.length,
    reading_count: readings?.readings.length ?? null,
    inventory_source: options.exportFile ? 'local export' : options.mode === 'browser' ? 'portal export' : 'portal HTML',
    result: 'ok'
  }, null, 2));
} finally {
  await client.close?.();
}
