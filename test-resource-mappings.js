// test-resource-mappings.js
require('dotenv').config();
const {
  getResourcesForSsid,
  getFieldMappingsForResource,
  getFieldMappingByKey,
} = require('./mappingDao');

async function run() {
  const ssid = 5632;             // example SSID
  const resource = 'property';   // you can try 'member', 'office', etc.

  try {
    const resources = await getResourcesForSsid(ssid);
    console.log('Resources for SSID', ssid, ':', resources);

    const fields = await getFieldMappingsForResource(ssid, resource);
    console.log(`Number of field mappings for ${resource}:`, fields.length);

    // Print first few to inspect
    console.log('First 3 field mappings:', fields.slice(0, 3));

    if (fields.length > 0) {
      const firstKey = fields[0].key;
      const one = await getFieldMappingByKey(ssid, resource, firstKey);
      console.log(`Single mapping for key ${firstKey}:`, one);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();