// server.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const {
  getLatestPublishedMappingRow,
  getResourcesForSsid,
  getFieldMappingsForResource,
  getFieldMappingByKey,
  getFieldMappingByStandardName
} = require('./mappingDao');

const { buildExplanation } = require('./explainMapping');
const { explainFunctionWithLLM } = require('./functionExplainer');

const app = express();
// Allow requests from any origin for now (safe for your internal dev)
app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

/**
 * GET /api/resources?ssid=5632
 * Returns the list of resource names for this SSID.
 */
app.get('/api/resources', async (req, res) => {
  const ssid = parseInt(req.query.ssid, 10);

  if (!ssid || Number.isNaN(ssid)) {
    return res.status(400).json({ error: 'Missing or invalid ssid query param' });
  }

  try {
    const resources = await getResourcesForSsid(ssid);
    return res.json({ ssid, resources });
  } catch (err) {
    console.error('Error in /api/resources:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/fields?ssid=5632&resource=property
 * Returns all field mappings for that resource. For now, `key` is the internal ID.
 */
app.get('/api/fields', async (req, res) => {
  const ssid = parseInt(req.query.ssid, 10);
  const resource = req.query.resource;

  if (!ssid || Number.isNaN(ssid) || !resource) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid ssid or resource query params' });
  }

  try {
    const fields = await getFieldMappingsForResource(ssid, resource);
    return res.json({ ssid, resource, fields });
  } catch (err) {
    console.error('Error in /api/fields:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/field?ssid=5632&resource=property&key=100017
 * Returns details for a single field mapping entry.
 */
app.get('/api/field', async (req, res) => {
  const ssid = parseInt(req.query.ssid, 10);
  const resource = req.query.resource;
  const key = req.query.key;

  if (!ssid || Number.isNaN(ssid) || !resource || !key) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid ssid, resource, or key query params' });
  }

  try {
    const fieldMapping = await getFieldMappingByKey(ssid, resource, key);
    if (!fieldMapping) {
      return res.status(404).json({ error: 'Field mapping not found' });
    }
    return res.json({ ssid, resource, key, fieldMapping });
  } catch (err) {
    console.error('Error in /api/field:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/field-by-name?ssid=5632&resource=property&standardName=PurchaseContractDate
 * Returns mapping info for a field identified by RESO standardName.
 */
app.get('/api/field-by-name', async (req, res) => {
    const ssid = parseInt(req.query.ssid, 10);
    const resource = req.query.resource;
    const standardName = req.query.standardName;
  
    if (!ssid || Number.isNaN(ssid) || !resource || !standardName) {
      return res
        .status(400)
        .json({ error: 'Missing or invalid ssid, resource, or standardName query params' });
    }
  
    try {
      const fieldMapping = await getFieldMappingByStandardName(
        ssid,
        resource,
        standardName
      );
  
      if (!fieldMapping) {
        return res.status(404).json({
          error: 'No mapping found for that ssid/resource/standardName',
        });
      }
  
      return res.json({
        ssid,
        resource,
        standardName,
        fieldMapping,
      });
    } catch (err) {
      console.error('Error in /api/field-by-name:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

/**
 * GET /api/explain?ssid=5632&resource=property&standardName=PurchaseContractDate
 *
 * Returns:
 *  - mappingType
 *  - mlsFields
 *  - raw mapping (including per-class details)
 *  - a plain-English explanation string
 */
app.get('/api/explain', async (req, res) => {
  const ssid = parseInt(req.query.ssid, 10);
  const resource = req.query.resource;
  const standardName = req.query.standardName;

  if (!ssid || Number.isNaN(ssid) || !resource || !standardName) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid ssid, resource, or standardName query params' });
  }

  try {
    const fieldMapping = await getFieldMappingByStandardName(
      ssid,
      resource,
      standardName
    );

    if (!fieldMapping) {
      return res.status(404).json({
        error: 'No mapping found for that ssid/resource/standardName',
      });
    }

    const { mappingType, mlsFields, mapping } = fieldMapping;

    // Optional: deep function explanation (plain Function or Classes-of-Functions)
    let functionExplanation = null;

    if (mappingType === 'Function') {
      // Simple case: mapping is the JS function string
      functionExplanation = await explainFunctionWithLLM(standardName, mapping);
    } else if (mappingType === 'Classes') {
      // More complex case: check if all classes use the same Function
      const classEntries = mapping && typeof mapping === 'object'
        ? Object.entries(mapping)
        : [];

      const allFns = classEntries.length > 0 &&
        classEntries.every(([, cfg]) =>
          cfg &&
          cfg.mappingType === 'Function' &&
          typeof cfg.mapping === 'string' &&
          cfg.mapping.trim().length > 0
        );

      if (allFns) {
        const bodies = classEntries.map(([, cfg]) => cfg.mapping.trim());
        const allSameBody = bodies.every((b) => b === bodies[0]);
        if (allSameBody) {
          // Call the function explainer once with the shared body
          functionExplanation = await explainFunctionWithLLM(standardName, bodies[0]);
        }
      }
    }

    // Build a class code -> friendly name lookup if this is a Classes mapping
    let classNameLookup = {};
    if (mappingType === 'Classes') {
      const row = await getLatestPublishedMappingRow(ssid);
      if (row && row.mapping) {
        const root = row.mapping; // top-level JSON from DB
        const innerMapping = root.mapping; // the big "mapping" object inside
        const meta = innerMapping && innerMapping.metadata;
        const resourcesMeta = meta && meta.resources;

        if (resourcesMeta) {
          const resMeta = resourcesMeta[resource];
          const mapped = resMeta && resMeta.mappedMlsClasses;
          if (mapped && typeof mapped === 'object') {
            // mappedMlsClasses is friendlyName -> code; invert it
            for (const [friendly, code] of Object.entries(mapped)) {
              classNameLookup[code] = friendly;
            }
          }
        }
      }
    }

    const explanation = buildExplanation({
      standardName,
      mappingType,
      mlsFields,
      mapping,
      classNameLookup,
      functionExplanation, // pass function explainer output
    });

    return res.json({
      ssid,
      resource,
      standardName,
      mappingType,
      mlsFields,
      rawMapping: mapping,
      classNames: classNameLookup,
      explanation,
    });
  } catch (err) {
    console.error('Error in /api/explain:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});