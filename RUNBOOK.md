# Run and verify the Urja API on Windows

These steps run the project locally. They do not publish it to GitHub. Use a normal PowerShell session with access to the npm registry and `https://urja-ops.flockenergy.tech`.

1. Open PowerShell and enter the project directory:

   ```powershell
   cd 'C:\Users\ASUS\OneDrive\Desktop\New folder\flock-energy-api'
   ```

2. Check Node.js and npm. Node.js must be version 20 or newer:

   ```powershell
   node --version
   npm.cmd --version
   ```

   If either command is missing, install the current Node.js LTS release from the official Node.js site, open a new PowerShell window, and repeat this step.

3. Install the project dependency and Chromium. Both commands must finish successfully:

   ```powershell
   npm.cmd install
   npx.cmd playwright install chromium
   ```

   If npm reports a network or permission error, check that this PowerShell session can reach the npm registry. The agent sandbox reported `EACCES` on that connection, so these commands could not be completed there.

4. Supply the portal credentials in this PowerShell session. Replace the placeholder with the password from the assignment. Do not save the password in `.env`, a source file, or a commit:

   ```powershell
   $env:URJA_EMAIL = 'operator@urja.local'
   $env:URJA_PASSWORD = '<password from assignment>'
   ```

5. Run the local tests:

   ```powershell
   npm.cmd test
   ```

   All tests should pass. These tests use controlled data and do not contact the portal.

6. Run the live smoke check:

   ```powershell
   npm.cmd run smoke
   ```

   A successful run prints JSON with `"result": "ok"`, a nonzero meter count, a transformer count, and a nonzero reading count. This check signs in, downloads the meter export, traverses transformer pages, and reads a meter's consumption table. If it fails, keep the error text; it identifies the next integration issue to fix.

7. Start the API and leave this PowerShell window open:

   ```powershell
   npm.cmd start
   ```

   It should print `Urja API listening on http://localhost:8000`.

8. Open a second PowerShell window and check each endpoint:

   ```powershell
   curl.exe 'http://localhost:8000/health'
   curl.exe 'http://localhost:8000/api/v1/meters?page=1&limit=2'
   curl.exe 'http://localhost:8000/api/v1/meters/J100000'
   curl.exe 'http://localhost:8000/api/v1/meters/J100000/readings'
   curl.exe 'http://localhost:8000/api/v1/transformers'
   ```

   Confirm the health response says `ok`; the meter list has `partial: false`; the detail contains the requested ID and hierarchy; readings contain timestamp, kWh, kVAh, and voltage values; and transformers contain the full visible list. [openapi.json](openapi.json) gives the field definitions.

9. In the first window, press **Ctrl+C** to stop the service. Clear the password from that PowerShell session:

   ```powershell
   Remove-Item Env:\URJA_PASSWORD
   ```

Optional: to query only a previously downloaded export without opening a browser for meter list/detail, set `URJA_EXPORT_FILE` to its absolute path before starting the service. The transformer and readings routes still require the browser adapter. `URJA_MODE=http` uses the limited direct-HTML adapter and returns 501 for readings.
