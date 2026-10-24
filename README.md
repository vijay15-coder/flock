# Flock Energy — Urja Meter Ops API

A local, read-only JSON API over the human-facing Urja Meter Ops portal. It exposes the full meter inventory, individual meter details and network paths, distribution transformers, and recent cumulative readings. The default adapter uses a browser to follow the portal's ordinary login, export, and page navigation flows. [PROTOCOL.md](PROTOCOL.md) records what was observed; [openapi.json](openapi.json) specifies this service's API; [REFLECTION.md](REFLECTION.md) answers the five reflection questions.

## Install and run

Requires Node.js 20+ and network access to `https://urja-ops.flockenergy.tech`. From this directory:

```powershell
npm.cmd install
npx.cmd playwright install chromium
$env:URJA_EMAIL = 'operator@urja.local'
$env:URJA_PASSWORD = '<password from assignment>'
npm.cmd start
```

On macOS/Linux, use `npm`/`npx` and shell-appropriate environment assignments. The service binds to `127.0.0.1:8000` by default. It reads environment variables directly; copying `.env.example` alone does not load it. Keep credentials out of committed files. Chromium is downloaded separately by Playwright's install command.

Check it with:

```powershell
curl.exe 'http://localhost:8000/api/v1/meters?page=1&limit=2'
curl.exe 'http://localhost:8000/api/v1/meters/J100000'
curl.exe 'http://localhost:8000/api/v1/meters/J100000/readings'
curl.exe 'http://localhost:8000/api/v1/transformers'
```

An example readings response is:

```json
{
  "meter_id": "J100000",
  "timezone": null,
  "readings": [
    { "timestamp_local": "2026-06-23T23:30:00", "kwh_cumulative": 123.4, "kvah_cumulative": 124.1, "voltage_r": 230.2 }
  ],
  "latest_timestamp_local": "2026-06-23T23:30:00"
}
```

The numbers above only illustrate the response shape. The portal displays timestamps without a timezone, so the API preserves local clock time and reports `timezone: null`. kWh and kVAh are register values; the API does not present differences between rows as interval consumption.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `URJA_BASE_URL` | `https://urja-ops.flockenergy.tech` | HTTPS portal origin. |
| `URJA_EMAIL`, `URJA_PASSWORD` | required | Portal login. |
| `PORT` | `8000` | Local listen port. |
| `URJA_MODE` | `browser` | `browser` for full UI-driven access; `http` for a lightweight HTML fallback. |
| `URJA_HEADLESS` | `true` | Set `false` to see the browser while debugging. |
| `URJA_EXPORT_TTL_SECONDS` | `300` | How long an automatic full-inventory export is reused. Minimum 30. |
| `URJA_EXPORT_FILE` | unset | Optional path to a previously downloaded portal JSON export; skips automatic export for meter list/detail. |

The browser adapter signs in on demand, downloads **Export all meters** from `/transformers`, validates it, and uses that snapshot for meter paging/filtering and detail. It refreshes the export after the TTL; a failed refresh keeps the prior data in memory but returns an error for that request. The `snapshot_at` field is the local download/file modification time, not a portal update timestamp. Transformer pages and each readings request navigate the portal live. The single browser page is serialized, so simultaneous API requests queue. This is suitable for a small local service, not high throughput.

With `URJA_EXPORT_FILE`, meter list/detail can be served from that local file. The file is reread when its modification time changes. Keep it private because it contains operational meter and location data. In `http` mode, no browser package is used at runtime: direct HTML requests provide a meter lookup and the first page of meters/transformers. Without an export file, list paging/filtering is limited and `partial: true` marks incomplete lists. Readings return 501 in `http` mode.

## API and design

All routes are `GET`: `/health`, `/api/v1/meters` (`page`, `limit`, `status`, `transformer_code`), `/api/v1/meters/{meter_id}`, `/api/v1/meters/{meter_id}/readings`, and `/api/v1/transformers`. Unknown meter IDs return 404. Invalid paging returns 400. An upstream failure or changed layout returns 502. The server is read-only and never exposes cookies or the portal password. See [openapi.json](openapi.json) for field-level details.

- `app/browser-client.js`: Playwright login, UI navigation, automatic export, transformer paging, and readings extraction.
- `app/snapshot.js`: validation and local querying of the JSON export; preserves missing hierarchy names/codes as null.
- `app/readings.js`: validates and normalizes the visible readings table.
- `app/client.js`, `app/html.js`: direct HTTP fallback, session cookie reuse, and isolated HTML parsing.
- `app/main.js`, `app/config.js`: route handling and configuration.
- `test/api.test.js`, `scripts/smoke.js`: local tests and a live portal smoke check.

I chose the bulk export for inventory because the portal's 403 records span 21 client-side pages, while the export supplies a complete machine-readable snapshot. Browser automation also follows the visible consumption and transformer pages without relying on guessed internal endpoints. It costs more memory and startup time than direct requests and depends on the portal's labels and table structure. The fallback keeps the small direct-request path available where only core details are needed.

Assumptions: credentials have read-only operator access; meter IDs use letters, digits, and hyphens; the export represents the full inventory at download time; coordinates are decimal latitude/longitude; transformer capacity is kVA; and visible readings are cumulative. The hierarchy has blanks and conflicting names for repeated codes, so no canonical tree is invented. See [PROTOCOL.md](PROTOCOL.md) for examples.

## Verification and limits

Run `npm.cmd test` for local parser, route, snapshot, and readings checks. With portal access, run `npm.cmd run smoke` to verify login, full export, meter detail, transformers, and readings. The agent's terminal sandbox could not reach the portal or package registry, so installation and the live browser adapter have **not** been verified in this environment. The portal was inspected through an authenticated browser, and local tests pass. Run the smoke command on a machine with ordinary network access before treating the integration as production-ready.

Intentionally skipped: a public deployment, a web client, a reconciled hierarchy index, and calculation of interval energy from cumulative readings. They add scope without improving the core portal bridge until timezone, data freshness, and hierarchy conflicts are resolved. With another day, I would capture sanitized Network request contracts, add an integration fixture for the automated browser flow, define a stable freshness policy, and load-test concurrent queries. This repository is local; it has not been pushed to GitHub.
