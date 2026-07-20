/**
 * controllers/ragController.js
 * --------------------------------------------------------------------------
 * Core Retrieval-Augmented Generation (RAG) logic for DevDocAssistant.
 *
 * Two responsibilities:
 *   1. ingestDocs  - chunk raw text, embed each chunk via Gemini
 *                    ("text-embedding-004"), and bulk-insert into
 *                    MongoDB Atlas.
 *   2. queryDocs   - embed the user's question, run a native
 *                    MongoDB Atlas $vectorSearch pipeline to retrieve the
 *                    top-K most semantically similar chunks, then feed those
 *                    chunks + the question into Gemini for a grounded
 *                    natural-language answer.
 * --------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Documentation = require('../models/Documentation');
const genAI = require('../config/geminiClient');
const chunkText = require('../utils/chunkText');

// Model constants — centralized so they're easy to bump/upgrade later.
//
// NOTE: "text-embedding-004" was deprecated and shut down by Google on
// Jan 14, 2026. Its replacement, "gemini-embedding-001", natively outputs
// 3072-dimension vectors — NOT 768. Since our Atlas Vector Search index
// and Mongoose schema are fixed at 768 dimensions, we explicitly request
// a 768-dim output via `outputDimensionality` below (this model supports
// Matryoshka Representation Learning, so truncating to 768 dims like this
// is a supported, intentional feature — not a hack).
const EMBEDDING_MODEL = 'models/gemini-embedding-001';
const EMBEDDING_OUTPUT_DIMENSIONS = 768;
// NOTE: "gemini-1.5-flash" and "gemini-2.5-flash-lite" have both been
// retired/restricted as of mid-2026. "gemini-3.5-flash" is the current
// stable, generally-available Flash-tier model (released May 2026).
const GENERATION_MODEL = 'gemini-3.5-flash';
const VECTOR_INDEX_NAME = 'vector_index';     // must match the Atlas Search index name
const TOP_K = 3;                               // number of chunks to retrieve as context

/**
 * Generates a single embedding vector for a given piece of text using
 * Gemini's gemini-embedding-001 model, truncated to 768 dimensions to
 * match our Atlas Vector Search index configuration.
 *
 * @param {string} text
 * @returns {Promise<number[]>} 768-dimension embedding vector
 */
async function generateEmbedding(text) {
  const response = await genAI.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONS,
    },
  });

  // The SDK returns { embeddings: [ { values: [...] } ] } for embedContent.
  const embedding = response?.embeddings?.[0]?.values;

  if (!embedding || embedding.length !== 768) {
    throw new Error(
      `Embedding generation failed or returned unexpected dimensions (got ${embedding?.length ?? 0}, expected 768).`
    );
  }

  return embedding;
}

/**
 * POST /api/knowledge/ingest
 * --------------------------------------------------------------------------
 * Request body:
 * {
 *   "text": "<full markdown/plain text document>",
 *   "sourceName": "optional-label-for-this-document"
 * }
 *
 * Flow:
 *   1. Validate input.
 *   2. Split the document into overlapping chunks (utils/chunkText.js).
 *   3. Generate an embedding for each chunk via Gemini.
 *   4. Bulk-insert all { content, embedding, sourceName, chunkIndex }
 *      documents into MongoDB in a single insertMany call for efficiency.
 * --------------------------------------------------------------------------
 */
const ingestDocs = async (req, res) => {
  try {
    const { text, sourceName } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must include a non-empty "text" field (string).',
      });
    }

    // Step 1: Chunk the document.
    const chunks = chunkText(text, 1000, 150);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid text chunks could be extracted from the provided text.',
      });
    }

    // Step 2: Generate embeddings for every chunk.
    // We run these concurrently (Promise.all) to minimize total latency,
    // but be mindful of API rate limits for very large documents — in a
    // real production system you'd batch this in groups (e.g., 10 at a
    // time) rather than firing all requests simultaneously.
    const embeddedChunks = await Promise.all(
      chunks.map(async (chunk, index) => {
        const embedding = await generateEmbedding(chunk);
        return {
          content: chunk,
          embedding,
          sourceName: sourceName || 'untitled-source',
          chunkIndex: index,
        };
      })
    );

    // Step 3: Bulk insert into MongoDB Atlas in a single round trip.
    const inserted = await Documentation.insertMany(embeddedChunks, {
      ordered: false, // continue inserting remaining docs even if one fails validation
    });

    return res.status(201).json({
      success: true,
      message: `Successfully ingested ${inserted.length} chunk(s) from source "${sourceName || 'untitled-source'}".`,
      chunksIngested: inserted.length,
    });
  } catch (error) {
    console.error('[ingestDocs] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to ingest documentation.',
      error: error.message,
    });
  }
};

/**
 * POST /api/chat/query
 * --------------------------------------------------------------------------
 * Request body:
 * {
 *   "query": "How do I authenticate against the API?"
 * }
 *
 * Flow:
 *   1. Validate input.
 *   2. Embed the user's query using the SAME model used at ingest time
 *      (text-embedding-004) — this is critical, since vectors from
 *      different embedding models/spaces are not comparable.
 *   3. Run a $vectorSearch aggregation against the "vector_index" Atlas
 *      Search index to retrieve the top-K most similar chunks by cosine
 *      similarity.
 *   4. Concatenate the retrieved chunks into a context block and construct
 *      a grounded prompt instructing Gemini to answer ONLY using that
 *      context (reduces hallucination).
 *   5. Return the generated answer plus the source chunks used, so the
 *      frontend can display citations if desired.
 * --------------------------------------------------------------------------
 */
const queryDocs = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must include a non-empty "query" field (string).',
      });
    }

    // Step 1: Embed the incoming user query.
    const queryEmbedding = await generateEmbedding(query);

    // Step 2: Native MongoDB Atlas Vector Search aggregation.
    //
    // $vectorSearch is a special aggregation pipeline stage (must be the
    // FIRST stage in the pipeline) that performs an Approximate Nearest
    // Neighbor (ANN) search against the vector index defined in Atlas.
    //
    // Field-by-field explanation:
    //   - index: the name of the Atlas Search vector index (see
    //     models/Documentation.js for the index definition this expects).
    //   - path: the schema field holding the embedding vectors ("embedding").
    //   - queryVector: the embedding of the user's incoming query — Atlas
    //     compares this against every indexed vector using the similarity
    //     function defined in the index ("cosine" in our case).
    //   - numCandidates: how many candidate vectors the ANN algorithm
    //     examines before narrowing down to `limit` — higher values improve
    //     recall/accuracy at the cost of latency. A common rule of thumb is
    //     10-20x the `limit`.
    //   - limit: the final number of top matches to return (TOP_K = 3).
    const results = await Documentation.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: TOP_K * 20,
          limit: TOP_K,
        },
      },
      {
        // $project shapes the output: we surface the similarity score via
        // the special "$meta: vectorSearchScore" metadata field, and
        // exclude the raw embedding array from the response (it's large
        // and not useful to the client).
        $project: {
          _id: 1,
          content: 1,
          sourceName: 1,
          chunkIndex: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);

    if (!results || results.length === 0) {
      return res.status(200).json({
        success: true,
        answer:
          "I couldn't find any relevant documentation to answer that question. Try ingesting more docs or rephrasing your query.",
        sources: [],
      });
    }

    // Step 3: Build the grounded context block from retrieved chunks.
    const contextBlock = results
      .map((doc, i) => `[Source ${i + 1} - ${doc.sourceName}]\n${doc.content}`)
      .join('\n\n---\n\n');

    // Step 4: Construct a grounded prompt. Explicit instructions here are
    // what keep the model "honest" — i.e., answering from the retrieved
    // context rather than freely hallucinating.
    const prompt = `You are DevDocAssistant, a technical documentation assistant.
Answer the user's question using ONLY the context provided below. If the
context does not contain enough information to answer confidently, say so
explicitly rather than guessing.

Context:
${contextBlock}

User question: ${query}

Provide a clear, concise, and technically accurate answer grounded strictly in the context above.`;

    // Step 5: Generate the final answer using Gemini's chat/generation model.
    const generationResponse = await genAI.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
    });

    const answerText = generationResponse?.text ?? 'No response generated.';

    return res.status(200).json({
      success: true,
      answer: answerText,
      sources: results.map((doc) => ({
        id: doc._id,
        sourceName: doc.sourceName,
        chunkIndex: doc.chunkIndex,
        similarityScore: doc.score,
        excerpt: doc.content.slice(0, 200) + (doc.content.length > 200 ? '...' : ''),
      })),
    });
  } catch (error) {
    console.error('[queryDocs] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process query.',
      error: error.message,
    });
  }
};

module.exports = {
  ingestDocs,
  queryDocs,
};
