// db.js
const { Pool } = require('pg');

// Create one shared connection pool for the whole service.
// Uses the URL from the MAPPING_DB_URL environment variable.
const pool = new Pool({
    connectionString: process.env.MAPPING_DB_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

/**
 * Run a SQL query and return the rows.
 *  - text: SQL string with $1, $2, ... placeholders
 *  - params: array of values for those placeholders
 */
async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

module.exports = {
  query,
  pool,
};