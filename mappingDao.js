// mappingDao.js
const db = require('./db');
const { getRecordIdForStandardName } = require('./resoSpecDao');

/**
 * Get the latest *published* mapping row for a given SSID.
 */
async function getLatestPublishedMappingRow(ssid) {
  const rows = await db.query(
    `
    SELECT *
    FROM mapping
    WHERE metadatassid = $1
      AND mapping->>'datePublished' IS NOT NULL
      AND mapping->>'datePublished' <> ''
    ORDER BY id DESC
    LIMIT 1;
    `,
    [ssid]
  );

  if (rows.length === 0) {
    return null; // no published mapping yet
  }

  return rows[0];
}

/**
 * Get the list of resource names (property, member, office, etc.)
 * for the latest published mapping of an SSID.
 */
async function getResourcesForSsid(ssid) {
    const row = await getLatestPublishedMappingRow(ssid);
    if (!row) return [];
  
    const mappingJson = row.mapping;      // full JSON blob
    const resources = mappingJson.mapping; // inner "mapping" object
  
    if (!resources || typeof resources !== 'object') {
      return [];
    }
  
    // resource names are keys like "property", "member", "office", etc.
    return Object.keys(resources);
  }
  
  /**
   * Get all field mappings for a specific resource (e.g. "property")
   * in the latest published mapping for an SSID.
   *
   * Returns an array of objects:
   * [
   *   {
   *     key: '100017',        // internal mapping key
   *     mappingType: 'Function',
   *     mlsFields: [...],
   *     mapping: "function body or value..."
   *   },
   *   ...
   * ]
   */
  async function getFieldMappingsForResource(ssid, resourceName) {
    const row = await getLatestPublishedMappingRow(ssid);
    if (!row) return [];
  
    const mappingJson = row.mapping;
    const resources = mappingJson.mapping || {};
    const resourceMapping = resources[resourceName];
  
    if (!resourceMapping || typeof resourceMapping !== 'object') {
      return [];
    }
  
    return Object.entries(resourceMapping).map(([key, value]) => ({
      key,
      mappingType: value.mappingType || null,
      mlsFields: value.mlsFields || [],
      mapping: value.mapping || null,
    }));
  }
  
  /**
   * Get a single field mapping entry for a given SSID + resource + field key.
   *
   * For now, `fieldKey` is the internal key (e.g. "100017" or a GUID).
   * Later, we can add a join to resospec to resolve RESO field names.
   */
  async function getFieldMappingByKey(ssid, resourceName, fieldKey) {
    const all = await getFieldMappingsForResource(ssid, resourceName);
    return all.find((f) => f.key === fieldKey) || null;
  }
  /**
 * Get a field mapping by RESO standardName instead of internal key.
 *
 * Steps:
 *  1) Use the latest RESO spec to resolve (resource + standardName) -> recordID.
 *  2) Use recordID as the key into the mapping JSON for this SSID + resource.
 */
    async function getFieldMappingByStandardName(ssid, resourceName, standardName) {
        const recordID = await getRecordIdForStandardName(resourceName, standardName);
        if (!recordID) {
        return null;
        }
    
        // recordID might be a string like "100017" - our mapping keys are strings
        const fieldMapping = await getFieldMappingByKey(ssid, resourceName, String(recordID));
        if (!fieldMapping) {
        return null;
        }
    
        return {
        recordID: String(recordID),
        ...fieldMapping,
        };
    }
  
  module.exports = {
    getLatestPublishedMappingRow,
    getResourcesForSsid,
    getFieldMappingsForResource,
    getFieldMappingByKey,
    getFieldMappingByStandardName,
  };