import { readFile, stat } from 'node:fs/promises';

export class MeterSnapshot {
  constructor(filePath) {
    this.filePath = filePath;
    this.mtimeMs = -1;
    this.rows = [];
  }

  async load() {
    const file = await stat(this.filePath);
    if (file.mtimeMs === this.mtimeMs) return;
    const data = JSON.parse(await readFile(this.filePath, 'utf8'));
    if (!Array.isArray(data) || data.some((row) => !row.meterId || !row.serialNo || !row.hierarchy)) {
      throw new Error('Export file must be a meter array with IDs, serials and hierarchy');
    }
    if (new Set(data.map((row) => row.meterId)).size !== data.length) {
      throw new Error('Export contains duplicate meter IDs');
    }
    this.rows = data;
    this.mtimeMs = file.mtimeMs;
  }

  async list({ page, limit, status, transformerCode }) {
    await this.load();
    const filtered = this.rows.filter((row) =>
      (!status || row.installStatus.toLowerCase() === status.toLowerCase()) &&
      (!transformerCode || row.dtCode.toLowerCase() === transformerCode.toLowerCase()));
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit).map((row) => ({
        meter_id: row.meterId,
        serial_number: row.serialNo,
        make: row.make,
        phase_type: row.phaseType,
        status: row.installStatus,
        transformer_code: row.dtCode
      })),
      total: filtered.length,
      page,
      pages: Math.ceil(filtered.length / limit),
      partial: false,
      snapshot_at: new Date(this.mtimeMs).toISOString()
    };
  }

  async get(id) {
    await this.load();
    const row = this.rows.find((item) => item.meterId === id);
    if (!row) return null;
    const levels = ['zone', 'circle', 'division', 'subdivision', 'substation', 'feeder', 'dt'];
    return {
      meter_id: row.meterId,
      serial_number: row.serialNo,
      make: row.make ?? null,
      phase_type: row.phaseType ?? null,
      status: row.installStatus ?? null,
      installation_type: row.installType ?? null,
      transformer_code: row.dtCode ?? null,
      build: row.build ?? null,
      location: row.geo && Number.isFinite(row.geo.lat) && Number.isFinite(row.geo.lng)
        ? { latitude: row.geo.lat, longitude: row.geo.lng } : null,
      network_path: levels.filter((level) => row.hierarchy[level]?.code)
        .map((level) => `${row.hierarchy[level].name} (${row.hierarchy[level].code})`),
      snapshot_at: new Date(this.mtimeMs).toISOString()
    };
  }
}
