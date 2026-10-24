# Flock Energy — Urja Meter Ops API

A small read-only JSON facade for a legacy metering portal. It exposes meter and transformer lists, plus individual meter nameplate, location, and network path. An optional local JSON export enables full-inventory pagination and filtering. Consumption and automatic bulk refresh still need a firsthand Network inspection. See [PROTOCOL.md](PROTOCOL.md) for observed portal behavior and remaining questions.

## Requirements and setup

Node.js 20 or newer. No third-party packages or paid services are required.

```powershell
cd flock-energy-api
$env:URJA_BASE_URL = 'https://urja-ops.flockenergy.tech'
$env:URJA_EMAIL = 'operator@urja.local'
$env:URJA_PASSWORD = '<password from assignment>'
node app/main.js
```

The service reads environment variables. `.env.example` lists the available names, but the service does not load `.env` automatically. `PORT` defaults to 8000, and the server binds to `127.0.0.1`. The assignment password is deliberately absent from source and documentation.

For the full inventory, use the portal's **Export all meters** control and point the service to the downloaded JSON file before starting it. Meter list and detail routes will then read from that snapshot:

```powershell
$env:URJA_EXPORT_FILE = 'C:\path\to\meter-export.json'
node app/main.js
curl.exe 'http://localhost:8000/api/v1/meters?page=2&limit=20&status=Installed'
```

The service rereads the file when its modification time changes. `snapshot_at` is the file modification time, not a guarantee of upstream data freshness. The export file is not committed; it may contain operational data and should stay local. Transformer records still come from the portal page.

Sample request:

```powershell
curl.exe http://localhost:8000/api/v1/meters/J100000
```

Expected shape (values depend on the portal):

```json
{
  "meter_id": "J100000",
  "serial_number": "SE33962",
  "make": "HPL",
  "phase_type": "single",
  "status": "Decommissioned",
  "installation_type": "Whole Current",
  "transformer_code": "DT-001",
  "build": "legacy",
  "location": { "latitude": 26.938961002479868, "longitude": 75.83095696146852 },
  "network_path": ["Jaipur Zone 1 (Z-01)", "Circle 1 (C-01)", "...", "Malviya Nagar DT 1 (DT-001)"],
  "snapshot_at": "2026-10-24T12:02:32.000Z"
}
```

Routes: `GET /health`, `GET /api/v1/meters`, `GET /api/v1/meters/{meter_id}`, and `GET /api/v1/transformers`. The exact contract is in [openapi.json](openapi.json). Meter list responses include `page`, `pages`, and `partial`; `partial: true` means the JSON contains fewer records than the portal reports. Without `URJA_EXPORT_FILE`, paging and filters return 400 because only the first page is available. Transformer results currently expose only the first page.

## Structure and decisions

- `app/client.js` owns portal HTTP access, cookie reuse, a 10-second timeout, and one re-login attempt after expiry.
- `app/snapshot.js` validates and queries an optional local JSON export, reloading on file changes.
- `app/html.js` isolates portal-specific HTML parsing and checks required layout fields.
- `app/main.js` maps normalized data to a small versioned API and avoids returning upstream HTML or credentials.
- `app/config.js` validates configuration. `test/api.test.js` uses Node's built-in test runner with representative HTML and a fake portal response.

The service uses built-in Node APIs to keep installation simple. Parsing the observed HTML is a provisional choice: it supports direct meter lookup, but it cannot page through a client-side list or retrieve asynchronously loaded consumption. The local export solves full-inventory queries for a manually refreshed snapshot. Portal-backed requests are uncached; snapshot responses reflect the latest version of the local file.

Assumptions: portal credentials identify a read-only operator; a successful login provides a cookie; IDs contain letters, numbers, or hyphens; latitude and longitude are decimal degrees; capacity is kVA; and a displayed total is more reliable than counting first-page rows. Any of these should be revisited when Network evidence or sample records disagree.

Intentionally skipped: automatic export refresh, consumption, transformer pagination, public deployment, and a web client. The first three need request and response evidence. Deployment and UI work would distract from a reliable data contract at this stage. For another day, map the data endpoints, add response fixtures from sanitized captures, expose live paginated inventory and readings with timezone handling, and test a long-running expired session.

## Verification and submission status

Run `node --test`. The local tests cover parsing, cookie renewal, and API routing. The current terminal environment cannot connect to the portal, so no live service smoke test has been completed; browser observations are documented in [PROTOCOL.md](PROTOCOL.md). Before submission, run the service from a network that reaches the portal and verify each sample request against the UI. Then update the protocol notes, API contract, and [REFLECTION.md](REFLECTION.md) from your own investigation.

This folder is not yet a public GitHub repository. Publish it only after the live checks and personal reflection are complete.
