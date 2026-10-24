# Urja Meter Ops protocol notes

Observed through normal authenticated portal pages on 24 October 2026. The service follows those visible flows; internal Fetch/XHR request URLs and the session cookie name were not captured. These are observed facts and explicit assumptions, not a claim that every internal route is known.

## Access and authentication

`GET /login` renders a form with `method="POST"` and `email`/`password` fields. Submitting the supplied operator credentials navigated to `/meters`; signing out returned to `/login`. The browser adapter retains an isolated browser context, so the portal handles its own session cookies. If navigation returns to `/login`, it signs in again and retries the requested page once. The direct HTTP fallback similarly keeps the cookie set by login and attempts one reauthentication after a 401/403 or login redirect. Cookie name, lifetime, and the exact login response remain unverified.

## Pages and data

| Path or action | Observed data and behavior |
| --- | --- |
| `/meters` | Meter ID, serial number, make, phase type, installation status, and DT code. Displayed **403 total**, 20 rows per page, 21 pages. Clicking Next changed rows without changing the URL. |
| `/meters/J100000` | Legacy nameplate labels (`Meter ID`, `Serial No`, etc.), zone-to-DT breadcrumb, decimal coordinates, and a Consumption section. Consumption first displayed a loading state, then a table of 337 half-hourly rows with Timestamp, kWh, kVAh, and V(R). |
| `/meters/J100004` | The `v2` detail used compact labels (`MeterId`, `SerialNo`, `PhaseType`, `InstallationStatus`, `InstallationType`). It had the same consumption columns and 337 rows in the observed session. The parser normalizes label whitespace. |
| `/transformers` | DT code, name, feeder, capacity in kVA. 20 rows on page 1 of 2. Next changes the table in place. |
| **Export all meters** on `/transformers` | Browser download of `meter-export.json`, a JSON array of 403 meters in the observed capture. The UI reported “Exported 403 meters.” |

The export objects have `meterId`, `serialNo`, `make`, `phaseType`, `installStatus`, `installType`, `build`, `dtCode`, `hierarchy`, and `geo`. `hierarchy` has name/code pairs for zone, circle, division, subdivision, substation, feeder, and DT; `geo` has `lat`/`lng`. All captured records had hierarchy objects and coordinates, and `dtCode` matched the DT hierarchy code. There were 238 `legacy` and 165 `v2` records. These counts describe one capture, not a permanent invariant.

The hierarchy needs care. In the captured export, 6 circle codes and 5 circle names were blank; 3 substation codes were blank; 5 feeder codes and 3 feeder names were blank. Some repeated codes have different names, including `DT-007` (“Old Malviya Nagar Xfmr” and “Sanganer DT 7”). The API preserves each name/code pair, converts blanks to null, and does not force a single canonical name per code.

`J100000` showed serial `SE33962`, make `HPL`, phase `single`, status `Decommissioned`, installation type `Whole Current`, and coordinates around `26.938961, 75.830957`. Its displayed readings ran from 23 June 2026 at 23:30 through 30 June 2026 at 23:30. The portal formats times as `DD/MM/YYYY HH:mm` without a timezone. The API converts those to ISO-shaped local clock strings, leaves timezone null, and labels energy values as cumulative registers. This avoids assigning an unsupported UTC offset or presenting register differences as measured interval usage.

## Integration behavior and gaps

The default adapter uses Playwright to sign in through the form, activate the export control, traverse transformer pages, and read the hydrated consumption table. The downloaded export supports complete meter pagination and filtering until its configurable TTL expires. This integration uses only ordinary logged-in UI actions. The fallback HTTP adapter fetches server-rendered HTML directly; that HTML exposes only the first list pages and no hydrated consumption rows. It marks incomplete lists `partial: true`.

The exact internal endpoints for list pagination, consumption, and export have not been verified. A guessed consumption path returned 404, so the implementation does not depend on it. The browser flow also has a layout dependency: changed headings, labels, or table columns will cause an upstream error rather than silently returning invented data. Login expiry is handled by retrying once, but its real lifetime has not been measured.

For a future direct protocol adapter, inspect DevTools Network in a signed-in session and record each actual URL, method, request parameters, response shape, status behavior, and cookie semantics. Remove passwords, cookies, and session tokens from any saved trace. That would permit replacing browser interaction where the portal's real data contracts are stable enough.
