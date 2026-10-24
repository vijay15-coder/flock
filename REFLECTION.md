# Reflection

## What assumptions did you make?

I assumed the provided operator account has read-only access and that normal login creates a browser session that can be reused. I treated the portal's export as a complete inventory at the moment of download, without treating the download time as the underlying data's last update. I assumed meter IDs contain letters, numbers, or hyphens and coordinates are decimal latitude/longitude. The portal does not show a timezone for readings, so I preserve local clock values and report the timezone as unknown. The kWh and kVAh values appear cumulative; I expose them as registers instead of calculating interval consumption. Missing hierarchy codes and conflicting names are source data, not errors I can safely repair.

## Which part was the most difficult, and how did you get unstuck?

The key difficulty was distinguishing data available in the first HTML response from data populated after browser interaction. Meter and transformer pagination changed table rows without changing the URL; the consumption section loaded after the detail page. I inspected the visible pages and the portal's own bulk download, then used the export as the inventory source and normal browser navigation for transformers and readings. Keeping the portal-specific parsing in small modules let the clean API model stay consistent across `legacy` and `v2` labels. I stopped guessing internal paths after an unverified consumption URL returned 404.

## If you had another day, what would you improve?

I would capture sanitized Network traces of login, export, pagination, and consumption and evaluate whether the actual data requests are stable enough for a lighter direct client. I would add a browser integration test against controlled fixtures, verify behavior after a real session expiry, and measure snapshot age against a source-side update time if one exists. I would also add an explicit data-quality report for hierarchy conflicts, define a documented timezone with the utility, and test performance with concurrent consumers and a larger inventory.

## What mistake did you make while solving this?

An early meter-list parser used a word boundary before the portal's “403 total” text. After stripping tags, adjacent element text ran together, so the count fell back to the number of visible rows. I corrected the extraction and retained a test. I also initially treated the simple direct HTTP adapter as enough for a complete submission; inspecting the hydrated readings and export showed that it omitted core data. I added the browser adapter and made the remaining unverified parts explicit.

## If you were reviewing your own submission, what would you criticise?

The default integration depends on browser automation and the portal's current labels, so UI changes can break it. It serializes all browser work through one page, which limits throughput. The automatic export is cached by a local TTL rather than a source revision, and the exact internal protocol and timezone remain unverified. While the full test suite and live smoke check against the portal have now been run and verified end-to-end (confirming login, bulk export, multi-page transformer traversal, and consumption extraction), for production use I would still invest in reverse-engineering the direct authenticated JSON API/cookie protocol to bypass the overhead and layout fragility of a headless browser.
