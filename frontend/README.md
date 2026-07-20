# DevDocAssistant — Frontend

A minimal, dependency-free frontend for the DevDocAssistant RAG backend.
Plain HTML/CSS/JS — no build step, no framework, no npm install required.

## Setup

1. Make sure your backend is running (see the backend's own README) —
   by default at `http://localhost:5000`.
2. If your backend runs on a different port or host, edit `config.js`:
   ```js
   const API_BASE_URL = 'http://localhost:5000';
   ```
3. Open `index.html` directly in a browser, **or** serve the folder with
   any static file server, e.g.:
   ```bash
   npx serve .
   # or
   python -m http.server 8080
   ```
   Serving it (rather than opening the file directly) is recommended —
   some browsers restrict `fetch()` from `file://` origins.

## What it does

- **Left rail** — drag & drop `.md`/`.txt` files, or paste raw text, to
  ingest into the backend's knowledge base. Each ingestion shows live
  status (pending → success/error) and a running chunk/source count.
- **Main pane** — ask questions in natural language. Answers are grounded
  in ingested content, with a "Sources" panel underneath each answer
  showing which chunks were retrieved and their similarity score.
- **Top-right status dot** — pings `GET /health` every 15s so you always
  know if the backend connection is alive.

## Notes

- This frontend has no build tooling on purpose — it's meant to be easy
  to read, modify, and drop into any static host.
- CORS: the backend's `server.js` already has `cors()` enabled with no
  origin restrictions, so this frontend works out of the box regardless
  of what port/host it's served from. Tighten this in `server.js` before
  deploying either side publicly.
