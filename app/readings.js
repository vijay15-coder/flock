function localTimestamp(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Unexpected reading timestamp: ${value}`);
  const [, day, month, year, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const parsed = new Date(`${iso}Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== iso) {
    throw new Error(`Invalid reading timestamp: ${value}`);
  }
  return iso;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (value === '' || !Number.isFinite(number)) throw new Error(`Invalid ${field} reading`);
  return number;
}

export function normalizeReadings(meterId, headers, rows) {
  const labels = headers.map((value) => value.replace(/\s+/g, '').toLowerCase());
  if (labels.join(',') !== 'timestamp,kwh,kvah,v(r)') {
    throw new Error('Consumption table columns changed');
  }
  const readings = rows.map((row) => {
    if (row.length !== 4) throw new Error('Consumption table row changed');
    return {
      timestamp_local: localTimestamp(row[0]),
      kwh_cumulative: finiteNumber(row[1], 'kWh'),
      kvah_cumulative: finiteNumber(row[2], 'kVAh'),
      voltage_r: finiteNumber(row[3], 'V(R)')
    };
  });
  return {
    meter_id: meterId,
    timezone: null,
    readings,
    latest_timestamp_local: readings.at(-1)?.timestamp_local || null
  };
}
