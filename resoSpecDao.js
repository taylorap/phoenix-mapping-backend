// resoSpecDao.js
const db = require('./db');

/**
 * Get the latest RESO spec row (by fullversionstring).
 * The JSON is in the `resospec` column.
 */
async function getLatestResoSpecRow() {
  const rows = await db.query(
    `
    SELECT *
    FROM resospec
    ORDER BY fullversionstring DESC
    LIMIT 1;
    `,
    []
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

/**
 * Normalize the synonyms field into an array of strings.
 * In your data, synonyms may be:
 *  - missing
 *  - a single string with commas
 *  - an array
 */
function normalizeSynonyms(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map((s) => String(s).trim());

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Get all fields for a given resource (e.g. "property", "member", "office")
 * from the latest RESO spec.
 *
 * Returns an array of:
 * [
 *   {
 *     recordID: "100017",
 *     standardName: "PurchaseContractDate",
 *     synonyms: [...],
 *     type: "Date"
 *   },
 *   ...
 * ]
 */
async function getResoFieldsForResource(resourceName) {
  const row = await getLatestResoSpecRow();
  if (!row) return [];

  const spec = row.resospec; // this is the JSON column
  if (!spec || typeof spec !== 'object') return [];

  const resources = spec.resources;
  if (!resources || typeof resources !== 'object') return [];

  const key = resourceName.toLowerCase(); // "property", "member", etc.
  const resourceArray = resources[key];
  if (!Array.isArray(resourceArray)) return [];

  return resourceArray.map((f) => ({
    recordID: f.recordID,
    standardName: f.standardName,
    synonyms: normalizeSynonyms(f.synonyms),
    type: f.dataType || f.type || null,
  }));
}

/**
 * Given a resource + a standardName (or one of its synonyms),
 * return the matching recordID from the latest RESO spec.
 */
async function getRecordIdForStandardName(resourceName, standardName) {
  const fields = await getResoFieldsForResource(resourceName);
  if (!fields.length) return null;

  const normalized = standardName.trim().toLowerCase();

  const match = fields.find((f) => {
    if (!f.standardName) return false;
    if (f.standardName.trim().toLowerCase() === normalized) return true;

    if (Array.isArray(f.synonyms)) {
      return f.synonyms.some(
        (syn) => syn && syn.trim().toLowerCase() === normalized
      );
    }
    return false;
  });

  return match ? match.recordID : null;
}

module.exports = {
  getLatestResoSpecRow,
  getResoFieldsForResource,
  getRecordIdForStandardName,
};