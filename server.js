/**
 * server.js
 * --------------------------------------------------------------------------
 * Application entrypoint for the DevDocAssistant backend.
 *
 * Responsibilities:
 *   - Load environment variables (dotenv)
 *   - Connect to MongoDB Atlas
 *   - Configure Express middleware (JSON body parsing, CORS)
 *   - Serve static frontend files
 *   - Mount API routes
 *   - Start the HTTP listener
 * --------------------------------------------------------------------------
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');

// Fail fast if critical environment variables are missing
const REQUIRED_ENV_VARS = ['MONGO_URI', 'GEMINI_API_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error(`[Startup] Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('[Startup] Copy .env.example to .env and fill in the required values.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware -------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Serve static frontend files -------------------------------------
app.use(express.static(path.join(__dirname, 'frontend')));

// --- Health check -------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'DevDocAssistant API' });
});

// --- API routes -------------------------------------------------------
app.use('/api', apiRoutes);

// --- 404 fallback -------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// --- Global error handler -------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// --- Boot sequence -------------------------------------------------------
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[Server] DevDocAssistant API listening on port ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  });
};

// Only listen if the file is run directly (node server.js), not when imported
if (require.main === module) {
  startServer();
}

module.exports = app;
//old code for referene!
// require('dotenv').config();

// const express = require('express');
// const cors = require('cors');
// const connectDB = require('./config/db');
// const apiRoutes = require('./routes/api');

// // Fail fast if critical environment variables are missing — better to crash
// // on boot than to serve broken requests later.
// const REQUIRED_ENV_VARS = ['MONGO_URI', 'GEMINI_API_KEY'];
// const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

// if (missingVars.length > 0) {
//   console.error(`[Startup] Missing required environment variables: ${missingVars.join(', ')}`);
//   console.error('[Startup] Copy .env.example to .env and fill in the required values.');
//   process.exit(1);
// }

// const app = express();
// const PORT = process.env.PORT || 5000;


// // --- Middleware -------------------------------------------------------
// app.use(cors()); // In production, restrict this to specific allowed origins.
// app.use(express.json({ limit: '5mb' })); // Higher limit to accommodate large doc ingestion payloads.
// app.use(express.urlencoded({ extended: true }));

// // --- Health check -------------------------------------------------------
// app.get('/health', (req, res) => {
//   res.status(200).json({ status: 'ok', service: 'DevDocAssistant API' });
// });

// // --- API routes -------------------------------------------------------
// app.use('/api', apiRoutes);

// // --- 404 fallback -------------------------------------------------------
// app.use((req, res) => {
//   res.status(404).json({ success: false, message: 'Route not found.' });
// });

// // --- Global error handler -------------------------------------------------------
// // Catches any errors passed via next(err) or thrown synchronously in
// // non-async middleware. Async controller errors are already caught via
// // try/catch inside ragController.js.
// app.use((err, req, res, next) => {
//   console.error('[Unhandled Error]', err);
//   res.status(500).json({ success: false, message: 'Internal server error.' });
// });

// // --- Boot sequence -------------------------------------------------------
// const startServer = async () => {
//   await connectDB();

//   app.listen(PORT, () => {
//     console.log(`[Server] DevDocAssistant API listening on port ${PORT}`);
//     console.log(`[Server] Health check: http://localhost:${PORT}/health`);
//   });
// };

// startServer();

// module.exports = app;
