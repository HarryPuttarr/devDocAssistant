# DevDocAssistant Backend

RAG-powered Express + Mongoose backend using **MongoDB Atlas Vector Search**
(native `$vectorSearch`, no third-party vector DB) and the **official
`@google/genai` SDK** for embeddings (`text-embedding-004`) and generation
(`gemini-1.5-flash`).

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in `MONGO_URI` and `GEMINI_API_KEY`.
3. In MongoDB Atlas, create a **Vector Search Index** (Atlas Search → Create
   Index → JSON Editor) on the `documentations` collection:

   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 768,
         "similarity": "cosine"
       }
     ]
   }
   ```

   Name it `vector_index` (must match `VECTOR_INDEX_NAME` in
   `controllers/ragController.js`).

4. `npm start` (or `npm run dev` for auto-reload via `node --watch`).

## Endpoints

- `GET /health` — liveness check
- `POST /api/knowledge/ingest` — body: `{ "text": "...", "sourceName": "..." }`
- `POST /api/chat/query` — body: `{ "query": "..." }`

## Notes

- Embedding model (`text-embedding-004`) must stay consistent between
  ingest and query — mixing embedding models breaks vector comparability.
- `numCandidates` in the `$vectorSearch` stage is set to `TOP_K * 20` as a
  reasonable recall/latency tradeoff; tune for your dataset size.
- CORS is wide open (`cors()`) for template purposes — lock this down to
  specific origins before shipping to production.
