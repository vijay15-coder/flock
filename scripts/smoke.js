import { config } from '../app/config.js';
import { UrjaPortalClient } from '../app/client.js';

const options = config();
const client = new UrjaPortalClient(options);
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
if (!transformers.items.length) {
  throw new Error('Transformer list was empty');
}

console.log(JSON.stringify({
  portal: options.baseUrl,
  meter_count: meters.total,
  meter_sample: id,
  transformer_page_count: transformers.items.length,
  inventory_source: options.exportFile ? 'local export' : 'portal HTML',
  result: 'ok'
}, null, 2));
