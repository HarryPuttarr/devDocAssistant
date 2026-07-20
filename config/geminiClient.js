/**
 * config/geminiClient.js
 * --------------------------------------------------------------------------
 * Central singleton for the official Google Gen AI SDK client (@google/genai).
 *
 * Centralizing this avoids re-instantiating the client on every request and
 * gives us one place to change API version / config if needed.
 * --------------------------------------------------------------------------
 */

const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  // We don't process.exit() here because this module may be loaded in
  // contexts (like tests) where you want to handle this more gracefully.
  // server.js is responsible for failing fast on missing critical env vars.
  console.warn('[Gemini] WARNING: GEMINI_API_KEY is not set in environment variables.');
}

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

module.exports = genAI;
