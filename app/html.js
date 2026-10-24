// Narrow parser for the server-rendered portal pages observed on 24 October 2026.
// Keeping it isolated makes a future switch to the portal's data responses local.
const decode = (value) => value
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&nbsp;/g, ' ');

export function plain(html) {
  return decode(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

function match(html, expression) {
  return expression.exec(html)?.[1] || '';
}

function tableRows(html) {
  const table = match(html, /<table\b[^>]*>([\s\S]*?)<\/table>/i);
  const body = match(table, /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => plain(cell[1])));
}

function pageInfo(html) {
  const label = match(html, /Page\s+(\d+)\s+of\s+\d+/i);
  const all = /Page\s+(\d+)\s+of\s+(\d+)/i.exec(plain(html));
  return { page: Number(label || all?.[1] || 1), pages: Number(all?.[2] || 1) };
}

export function parseMeters(html) {
  if (!/<h1\b[^>]*>\s*Meters\s*<\/h1>/i.test(html)) throw new Error('Meter list layout changed');
  const rows = tableRows(html);
  if (rows.some((row) => row.length !== 6)) throw new Error('Meter table layout changed');
  const total = Number(match(plain(html), /(\d+)\s+total\b/i)) || rows.length;
  return {
    items: rows.map(([meter_id, serial_number, make, phase_type, status, transformer_code]) =>
      ({ meter_id, serial_number, make, phase_type, status, transformer_code })),
    total,
    ...pageInfo(html),
    partial: total > rows.length
  };
}

export function parseTransformers(html) {
  if (!/<h1\b[^>]*>\s*Distribution Transformers\s*<\/h1>/i.test(html)) {
    throw new Error('Transformer list layout changed');
  }
  const rows = tableRows(html);
  if (rows.some((row) => row.length !== 4)) throw new Error('Transformer table layout changed');
  return {
    items: rows.map(([code, name, feeder_code, capacity_kva]) =>
      ({ code, name, feeder_code, capacity_kva: Number(capacity_kva) })),
    ...pageInfo(html),
    partial: pageInfo(html).pages > 1
  };
}

export function parseMeter(html, meterId) {
  if (!new RegExp(`<h1\\b[^>]*>\\s*Meter\\s+${meterId}\\s*<\\/h1>`, 'i').test(html)) {
    throw new Error('Meter detail layout changed');
  }
  const list = match(html, /<dl\b[^>]*>([\s\S]*?)<\/dl>/i);
  const labels = [...list.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)];
  const fields = Object.fromEntries(labels.map((x) => [plain(x[1]), plain(x[2])]));
  if (!fields['Meter ID'] || !fields['Serial No']) throw new Error('Meter nameplate layout changed');
  const text = plain(html);
  const coordinates = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s+Latitude\s*\/\s*Longitude/i.exec(text);
  const nav = match(html, /<h1\b[^>]*>[\s\S]*?<\/h1>[\s\S]{0,500}?<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
  const networkPath = [...nav.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((x) => plain(x[1])).filter((x) => x && x !== '›');
  return {
    meter_id: fields['Meter ID'],
    serial_number: fields['Serial No'],
    make: fields.Make || null,
    phase_type: fields['Phase Type'] || null,
    status: fields['Installation Status'] || null,
    installation_type: fields['Installation Type'] || null,
    transformer_code: /\(([^()]+)\)$/.exec(networkPath.at(-1) || '')?.[1] || null,
    build: null,
    location: coordinates ? { latitude: Number(coordinates[1]), longitude: Number(coordinates[2]) } : null,
    // The breadcrumb is displayed separately from the nameplate on the page.
    network_path: networkPath
  };
}
