/**
 * utils/chunkText.js
 * --------------------------------------------------------------------------
 * Simple, dependency-free text chunking utility.
 *
 * Splits a long markdown/text document into overlapping chunks suitable for
 * embedding. Overlap helps preserve context across chunk boundaries so that
 * semantically relevant sentences aren't awkwardly split apart.
 *
 * This is intentionally simple (character-based, not token-based). For
 * production workloads with strict token budgets, consider swapping this
 * for a tokenizer-aware splitter (e.g., based on tiktoken or a Gemini
 * token-counting call), but this implementation is dependency-free and
 * predictable, which is preferable for a template.
 * --------------------------------------------------------------------------
 */

/**
 * Splits `text` into chunks of roughly `chunkSize` characters, with
 * `overlap` characters repeated between consecutive chunks.
 *
 * @param {string} text - The full input text (markdown or plain text).
 * @param {number} chunkSize - Target max length of each chunk (characters).
 * @param {number} overlap - Number of characters to overlap between chunks.
 * @returns {string[]} Array of non-empty, trimmed text chunks.
 */
function chunkText(text, chunkSize = 1000, overlap = 150) {
  if (!text || typeof text !== 'string') {
    throw new Error('chunkText: `text` must be a non-empty string.');
  }
  if (overlap >= chunkSize) {
    throw new Error('chunkText: `overlap` must be smaller than `chunkSize`.');
  }

  // Normalize whitespace-heavy markdown a little so chunk boundaries are
  // cleaner (collapse 3+ newlines down to 2).
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // If we've reached the end of the text, stop.
    if (end === normalized.length) break;

    // Advance the window, stepping back by `overlap` to preserve context.
    start = end - overlap;
  }

  return chunks;
}

module.exports = chunkText;
