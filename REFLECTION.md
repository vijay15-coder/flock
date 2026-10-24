# Reflection

These answers describe the work in this repository. Review the personal wording against your own investigation before submitting it under your name.

## What assumptions did you make?

I treated the portal as a read-only source and assumed a login POST establishes a reusable session cookie. I limited meter IDs to letters, digits, and hyphens based on visible examples. I interpreted the list's total count as the size of the inventory and marked first-page responses as partial. A downloaded JSON export supplied a local full-inventory snapshot, but I did not assume its file time was the source's update time. I did not infer a timezone or call differences in cumulative meter registers “consumption” without a verified source contract.

## Which part was the most difficult, and how did you get unstuck?

The difficult part was distinguishing what the initial HTML contains from what the browser loads later. The meter and transformer list controls changed rows without changing the URL, and the consumption table appeared after a loading state. I isolated HTML parsing for direct lookups, then used the portal's downloadable JSON export as an optional local snapshot for full-inventory queries. Inspecting that export also exposed missing hierarchy fields and conflicting names for the same code, so the API preserves raw name/code pairs. I wrote down the Network requests still needed for automatic refresh and readings.

## If you had another day, what would you improve?

I would capture sanitized request and response samples for pagination, consumption, and bulk export; replace brittle HTML parsing with the portal's data responses where appropriate; automate snapshot refresh; and define timestamp timezone semantics. I would also run the service against the live portal after letting a session expire to verify renewal behavior and add data-quality checks for hierarchy conflicts.

## What mistake did you make while solving this?

An early parser test failed because I looked for a word boundary before the portal's “403 total” label after stripping HTML tags. The stripped text joined adjacent elements, so the count fell back to the one visible row. I fixed the count extraction and retained the test. This also showed why parsing human-facing markup needs representative fixtures and explicit failure behavior.

## If you were reviewing your own submission, what would you criticise?

I would flag that the full meter inventory requires a manually refreshed export file and that transformer pagination and consumption are absent. I would also challenge the unverified cookie and login-response assumptions, and the parser's dependence on the current page layout. The `partial` and `snapshot_at` fields make these limits visible, but the submission needs a live smoke test and the missing Network investigation before it can be called complete.
