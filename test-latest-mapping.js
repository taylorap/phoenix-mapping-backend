// test-latest-mapping.js
require('dotenv').config();
const { getLatestPublishedMappingRow } = require('./mappingDao');

async function run() {
  try {
    const ssid = 5632; // example SSID - change if you want to test a different one
    const row = await getLatestPublishedMappingRow(ssid);
    console.log('Row:', row && { id: row.id, metadatassid: row.metadatassid });
  } catch (err) {
    console.error(err);
  }
}

run();