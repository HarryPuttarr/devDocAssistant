/**
 * routes/api.js
 * --------------------------------------------------------------------------
 * Defines and mounts all REST endpoints for the RAG pipeline.
 *
 * Routes:
 *   POST /api/knowledge/ingest  -> ragController.ingestDocs
 *   POST /api/chat/query        -> ragController.queryDocs
 * --------------------------------------------------------------------------
 */

const express = require('express');
const router = express.Router();
const { ingestDocs, queryDocs } = require('../controllers/ragController');

// Ingests a new document into the knowledge base (chunk -> embed -> store).
router.post('/knowledge/ingest', ingestDocs);

// Answers a user question using retrieval-augmented generation.
router.post('/chat/query', queryDocs);

module.exports = router;
