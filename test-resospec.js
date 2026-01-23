// test-resospec.js
require('dotenv').config();
const db = require('./db');

async function run() {
  try {
    const rows = await db.query(
      `
      SELECT *
      FROM resospec
      ORDER BY fullversionstring DESC
      LIMIT 1;
      `,
      []
    );

    if (!rows.length) {
      console.log('No rows in resospec');
      return;
    }

    const row = rows[0];
    console.log('Columns on resospec row:');
    console.log(Object.keys(row));

    console.log('\nFull row (truncated spec if huge):');
    console.dir(
      {
        ...row,
        // if spec is huge, just show a small slice
        specPreview: row.spec ? JSON.stringify(row.spec).slice(0, 500) + '...' : undefined,
      },
      { depth: null }
    );
  } catch (err) {
    console.error('Error reading resospec:', err);
  } finally {
    process.exit(0);
  }
}

run();