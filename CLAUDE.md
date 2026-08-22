# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A React collage editor that lays out images and text on A4-sized pages and exports them as a PDF. The generated PDF is also uploaded to Dropbox as a side effect.

## Repository layout

There are **two independent PDF backends** for the same feature. Changing PDF or Dropbox behavior usually means editing both.

| Path | Role |
|---|---|
| `frontend/` | Create React App SPA. Nearly all UI lives in `frontend/src/App.js` (~1050 lines, single `App` component). |
| `api/generate-pdf.js` | **Production** — Vercel serverless function. Renders the PDF with **pdfkit** (no browser). |
| `backend/server.js` | **Local dev only** — Express server on port 3001. Renders the PDF with **Puppeteer** (headless Chrome → `page.pdf()`). |
| `api/package.json` | Deps for the serverless function only (`pdfkit`, `dropbox`). Installed by `vercel.json`'s `installCommand`. |
| `backend/package.json` | Deps for the local Express server (`express`, `puppeteer`, `dropbox`, …). Not deployed. |

The two renderers are not equivalent: Puppeteer does full CSS layout, pdfkit places images/text by manual coordinate math. Visual output can differ, so verify a change in whichever path it affects.

## Running locally

```bash
cd frontend && npm install && npm start   # http://localhost:3000
cd backend  && npm install && npm start   # http://localhost:3001
```

The frontend picks its endpoint by hostname (`frontend/src/App.js:374`):
`localhost` → `http://localhost:3001/generate-pdf` (Express), anything else → `/api/generate-pdf` (Vercel).
There is no proxy or env var — editing the local port means editing that conditional.

## Coordinate system

The editor canvas is a fixed **794 × 1123 px** div (A4 at 96 DPI). Both backends assume those exact dimensions:

- `backend/server.js` reproduces them in the generated HTML's `.page` CSS and viewport.
- `api/generate-pdf.js` converts them to PDF points with hardcoded `595.28 / 794` and `841.89 / 1123` scale factors (repeated separately for images and for text).

Changing the canvas size requires updating all of those sites.

## Deployment

Vercel, driven by root `vercel.json`:
- `buildCommand`: `cd frontend && npm install && npm run build`
- `outputDirectory`: `frontend/build`
- `installCommand`: `npm install --prefix api`

`backend/` is not deployed. `DEPLOYMENT.md` is stale — it references `backend/api/generate-pdf.js` and claims no env vars are needed; both are wrong (see below).

## Dropbox upload

Both backends do the same thing: build the PDF, then upload it to `/collagepdf/collage-<timestamp>.pdf` via `dropboxClient.filesUpload()`. The client is built once at module load.

**Auth uses the refresh-token flow.** `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` + `DROPBOX_REFRESH_TOKEN` are set, and the SDK mints its own access tokens, so nothing expires. `backend/.env.example` documents how to obtain all three.

A bare `DROPBOX_ACCESS_TOKEN` is still honoured as a fallback when those three are not all set. Avoid it: Dropbox retired long-lived tokens in September 2021, so the app console's "Generate access token" button only issues `sl.` tokens, which start returning 401 `invalid_access_token` ~4 hours later. Both backends log a warning when they see an `sl.` token. This exact expiry is what broke uploads before the refresh-token switch.

**All four vars must be set in the Vercel project's environment variables for production uploads to work.** `backend/.env` is local-only and never deployed.

Upload failures no longer pass silently: `uploadToDropbox()` lets its error propagate, the caller logs it through `describeDropboxError()` (which digs out `.status` and `.error.error_summary` — the SDK's `.message` is only ever "Response failed with a NNN code"), and the response carries `X-Dropbox-Upload: ok | skipped | failed`. The PDF is still returned to the user either way, so a failed upload is visible in the header and the logs but does not break the download.

`api/generate-pdf.js` awaits the upload before responding because serverless functions freeze once the response is sent (commit `d844b65`). `backend/server.js` also awaits it, so the header stays accurate in dev.

## Secrets

`backend/.env` and `backend/.env.local` hold the real Dropbox token and are gitignored — keep it that way. `backend/.env.example` is the committed template. Never print token values into logs, commits, or chat output.

## Conventions

- Plain JavaScript, CommonJS on the backends, no TypeScript, no linter beyond CRA's default.
- No test suite exists (`frontend/src/App.test.js` is the untouched CRA placeholder). Verify changes by running the app.
- Backends log with emoji-prefixed `console.log` (`✅`, `⚠️`, `❌`); match that if adding logs there.
- Images are compressed client-side to JPEG at 0.7 quality before upload (`frontend/src/App.js`), and HEIC files are converted via `heic2any`. Express is configured for a 50 MB JSON body; Vercel's serverless request limit is smaller (~4.5 MB), so large collages can fail in production but not locally.
