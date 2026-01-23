// test-field-by-name.js
require('dotenv').config();
const { getFieldMappingByStandardName } = require('./mappingDao');

async function run() {
  const ssid = 5632;
  const resource = 'property';
  const standardName = 'PurchaseContractDate'; // example from your resospec snippet

  try {
    const result = await getFieldMappingByStandardName(ssid, resource, standardName);
    console.log('Result for', { ssid, resource, standardName }, ':');
    console.dir(result, { depth: null });
  } catch (err) {
    console.error('Error:', err);
  }
}

run();