# Urja portal protocol notes

Observed in a normal browser session on 24 October 2026. These are observations, not a claim that every internal request has been mapped. The account and portal URL came from the exercise brief.

## Authentication

- `GET /login` shows a form with `method="POST"` and fields named `email` and `password`.
- Successful sign-in navigated to `/meters` and exposed the authenticated navigation. A sign-out control returned to `/login`.
- The service assumes the POST sets a session cookie and retries login once when a request redirects back to `/login` or returns 401/403. The cookie name, lifetime, and exact login response are not yet verified in Network.

## Visible data and navigation

| Page | Observed data | Notes |
| --- | --- | --- |
| `/meters` | Meter ID, serial, make, phase, installation status, DT code | The page said **403 total** and displayed 20 rows at a time, 21 pages. Clicking Next changed rows without changing the URL. |
| `/meters/J100000` | Nameplate, hierarchy breadcrumb, latitude/longitude, consumption table | The breadcrumb ran from zone through transformer. The consumption section initially said “Loading consumption…” and later displayed half-hourly timestamps with cumulative kWh, kVAh, and V(R). |
| `/transformers` | DT code, name, feeder, capacity in kVA | The first page showed 20 rows and “Page 1 of 2.” It also had “Export all meters”; clicking it reported “Exported 403 meters.” |

The export downloaded a JSON array with 403 distinct meter IDs. Its fields are `meterId`, `serialNo`, `make`, `phaseType`, `installStatus`, `installType`, `build`, `dtCode`, `hierarchy`, and `geo`. `hierarchy` contains named/code pairs for zone, circle, division, subdivision, substation, feeder, and DT; `geo` contains `lat` and `lng`. In this capture, all rows had hierarchy objects and coordinates, and `dtCode` matched `hierarchy.dt.code`. The `build` field split into 238 `legacy` and 165 `v2` rows. This is a snapshot, not proof that the same counts will hold later.

The hierarchy is messy: 6 circle codes and 5 circle names are blank; 3 substation codes are blank; 5 feeder codes and 3 feeder names are blank. Some repeated codes have different names, including `DT-007` (`Old Malviya Nagar Xfmr` and `Sanganer DT 7`). The clean API preserves the source's name/code pairs with `null` for blanks. Clients should key by a known code only where it is present and should not assume a code has one stable name.

The example meter `J100000` had serial `SE33962`, make `HPL`, phase `single`, status `Decommissioned`, installation type `Whole Current`, and coordinates around `26.938961, 75.830957`. Its first displayed reading was 23 June 2026 at 23:30 and the latest label was 30 June 2026 at 23:30. These readings appear to be cumulative register values; that interpretation should be confirmed before calculating interval usage.

## Unknowns to resolve in DevTools Network

1. The exact request URLs, methods, content types, and response shapes used for meter pagination and search.
2. The request used to load consumption after the detail page renders, including whether it accepts date bounds and how missing values are represented.
3. The bulk export request path. The downloaded file format is JSON, but its request URL and response headers still need a Network capture.
4. Cookie name, expiration, and behavior after expiration.

Capture these from a normal signed-in session with Network → Fetch/XHR (and Doc for the login POST). Remove the password, `Cookie`, `Set-Cookie`, and any session token before saving or sharing a HAR. This protocol document should be updated from that firsthand capture before submission.

## Quirks and implications

- The list's client-side page controls leave the address at `/meters`, so a plain HTML fetch exposes only the first rendered page. The current API marks such results `partial: true`.
- The consumption table appears after initial render, so fetching the detail HTML alone cannot reliably provide readings. The current API omits readings until its request is mapped.
- The portal's human-facing timestamps use `DD/MM/YYYY HH:mm`. A future readings endpoint should publish ISO 8601 times with an explicit timezone once the source timezone is established.
- The portal's HTML structure is an unstable integration boundary. Parsers fail with a 502 response when required fields or table shapes change.
