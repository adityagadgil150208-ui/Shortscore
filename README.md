# ShortScope

ShortScope helps everyday investors understand short seller reports in plain English. The responsive web interface explains the main claims, what they could mean, and what readers may want to check for themselves. The project includes both the browser frontend and a Node.js backend, ready to open in Visual Studio Code.

Four clearly labeled illustrative examples work without an API key. Three simplify historical reports; the Celsius example is a hypothetical teaching scenario. None is verified research or current market data. You can also paste a report to request a new AI summary using your existing OpenAI API key.

## Run in VS Code

1. Install Node.js **22.16 or newer**; Node.js 24 LTS is recommended.
2. Open this project folder in VS Code, then open **Terminal → New Terminal**.
3. Install the locked dependencies:

   ```sh
   npm ci
   ```

4. Create your local configuration file.

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS or Linux:

   ```sh
   cp .env.example .env
   ```

5. To summarize your own reports, open `.env` and paste your **existing key** after `OPENAI_API_KEY=`. You do not need a new key. Leave the value empty if you only want to explore the examples. Keep `.env` private; it is excluded from Git.
6. Start the app:

   ```sh
   npm start
   ```

7. Open `http://localhost:3005` in your browser. Stop the server with **Ctrl+C**.

For development with automatic server restarts, use `npm run dev` instead of `npm start`. Refresh your browser after editing frontend files. If port 3005 is in use, change `PORT` in `.env` and use that port in your browser.

The backend serves the frontend, so no second server or frontend build is required. Open the app through the running server instead of opening the HTML file directly.

## API key and live summaries

The browser sends report text to the local backend. Only the backend calls OpenAI, using `OPENAI_API_KEY`; the key is never needed in browser code. Live summaries need a working OpenAI key, available API usage, and internet access to `api.openai.com`. Submitted report text is sent to OpenAI for analysis, so only submit material you are allowed to share.

In the Codex cloud environment, the backend also accepts the secure `SHORTSCOPE_API_KEY` binding. This can hold the same existing key. Cloud startup uses Node.js 24 with `NODE_USE_ENV_PROXY=1` so API requests use the platform proxy; this setting is not needed for an ordinary local VS Code setup.

If the key is missing or an API request fails, the app reports the problem. It does not replace a failed live result with a fabricated summary. The examples remain available without a key.

## Project files

| File or folder | Purpose |
| --- | --- |
| `server.js` | Express backend, API validation, and OpenAI requests |
| `public/` | Browser interface, styles, and client-side behavior |
| `data/examples.json` | Four illustrative examples |
| `test/` | Automated tests with mocked API responses |
| `.env.example` | Configuration template with no secret values |
| `package-lock.json` | Locked dependency versions for `npm ci` |

The backend exposes `GET /api/health`, `GET /api/campaigns`, and `POST /api/analyze`. The frontend uses the same server and origin.

## Check your changes

```sh
npm run check
npm test
```

`check` validates JavaScript syntax. The automated tests use mocked API responses; passing them does not verify your key or a live OpenAI connection. To check the live workflow, start the app with your existing key and summarize a report you are allowed to share.

## What to expect

Reports and generated summaries are held in server memory and reset when the server restarts. This app does not provide live prices, market monitoring, or alerts. AI summaries explain submitted claims; they do not independently verify them or provide trading recommendations.

Generated summaries are visible to everyone using the same server instance; original report text is not retained by the app. Saved bookmarks stay in the current browser and do not save a separate copy of a report.

This is a local development app. A shared public deployment would need authentication, durable storage, and controls for API usage and access.
