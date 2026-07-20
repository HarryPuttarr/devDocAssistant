/**
 * config/db.js
 * --------------------------------------------------------------------------
 * Establishes and manages the connection to MongoDB Atlas via Mongoose.
 *
 * IMPORTANT (Vector Search prerequisite):
 * MongoDB Atlas Vector Search requires a dedicated "Atlas Search Index" of
 * type "vectorSearch" to be created on the target collection. This is NOT
 * something Mongoose or this driver can create programmatically via a normal
 * index call — it must be defined either through the Atlas UI, the Atlas
 * Admin API, or the `mongosh`/Atlas CLI. See models/Documentation.js for the
 * exact index definition this project expects.
 * --------------------------------------------------------------------------
 */

const mongoose = require('mongoose');

/**
 * Connects to MongoDB Atlas using the URI supplied via environment variables.
 * Fails fast (process.exit) if the connection cannot be established, since
 * the API is non-functional without a database connection.
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in environment variables.');
    }

    // Mongoose 8.x no longer requires useNewUrlParser / useUnifiedTopology —
    // those flags are deprecated no-ops and have been intentionally omitted.
    const conn = await mongoose.connect(mongoUri, {
      // serverSelectionTimeoutMS avoids the driver hanging indefinitely if
      // the cluster is unreachable (e.g., IP not whitelisted).
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`[MongoDB] Connected to Atlas host: ${conn.connection.host}`);

    // Optional but useful in production: surface runtime connection issues
    // instead of failing silently.
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error after initial connect:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Connection lost. Mongoose will attempt to reconnect automatically.');
    });

    return conn;
  } catch (error) {
    console.error('[MongoDB] Failed to connect to Atlas:', error.message);
    // Exit the process — there is no meaningful way to serve requests
    // without a database connection in this architecture.
    process.exit(1);
  }
};

module.exports = connectDB;
