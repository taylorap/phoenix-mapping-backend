// test-db.js
require('dotenv').config();   // Load .env into process.env

const db = require('./db');

async function run() {
  try {
    // Simple test query: ask the DB what time it is
    const rows = await db.query('SELECT NOW() AS current_time', []);
    console.log('DB time:', rows[0].current_time);
  } catch (err) {
    console.error('Error talking to Postgres:', err);
  } finally {
    // Close the pool so the script can exit
    await db.pool.end();
  }
}

run();