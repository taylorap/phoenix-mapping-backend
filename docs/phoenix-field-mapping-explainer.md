Phoenix Field Mapping (DB‑backed) Explainer – Technical Overview

1. Purpose
The Phoenix Field Mapping (DB‑backed) Explainer is a small service + UI that:
Lets users specify:
SSID (Phoenix Metadata SSID, e.g. 5632 for “Bright MLS IDX”),
Resource (e.g. property, member, office),
RESO Standard Field Name (e.g. PurchaseContractDate, UnparsedAddress),
Looks up the latest published mapping configuration for that SSID from the Phoenix field mapping database,
Resolves the RESO field to its internal mapping entry (including mapping type, MLS fields, and function body),
Returns a plain‑language explanation of how that field is populated:
For all mapping types (One To One, Map, Classes, Function, etc.),
With special handling for Classes and Function mappings.
The audience is non‑technical MLS Support / Front‑end Support. They should be able to answer questions like:
“For SSID 5632, Property → PurchaseContractDate, where does that value come from?”
“Is UnparsedAddress built with a function or simply copied from one MLS field?”
“How does PropertyType map the MLS’ ‘Multi‑Family’ into RESO?”
without reading keyfiles or JavaScript.

2. High‑level Architecture
The system is deliberately two‑layered:
Backend service (Node/Express; internal)
Connects to the Phoenix Field Mapping Tool Postgres database (field_mapping_tool).
Reads:
The mapping table (published keyfiles),
The resospec table (latest RESO spec).
Exposes JSON APIs:
/api/resources
/api/fields
/api/field
/api/field-by-name
/api/explain
Uses OpenAI to generate function‑level explanations for complex mappings.
Frontend page (static HTML+JS; currently local, Vercel‑ready)
db-field-mapping.html
Presents a simple form:
SSID (number)
Resource (dropdown)
RESO Standard Name (text)
Calls /api/explain on the backend and renders:
Explanation text (with line breaks),
Mapping type,
MLS fields,
Raw mapping JSON.
Data flow
User input: SSID + Resource + StandardName.
Backend:
Finds the latest published mapping row in mapping for that SSID.
Uses resospec to map StandardName → recordID.
Uses recordID to find the mapping entry for that field (mappingType, mlsFields, mapping).
For Classes, also resolves class codes (e.g. RESI) to friendly names (e.g. “Residential”).
For Function mappings, calls OpenAI with the JS function body.
Builds a structured explanation string.
Frontend:
Receives JSON, converts \n to <br> for multi‑line display.
Shows explanation + details to the user.

3. Backend: Project Structure
Repo: phoenix-mapping-backend
Location on Taylor’s machine:
/Users/taylorap/phoenix-mapping-backend/phoenix-mapping-backend
Key files:
db.js – Postgres connection pool + simple query helper.
mappingDao.js – Data access for the mapping table and mapping JSON.
resoSpecDao.js – Data access for the resospec table and RESO spec JSON.
functionExplainer.js – OpenAI client + function explanation helper.
explainMapping.js – Deterministic explanation builder for all mapping types.
server.js – Express app; exposes the HTTP API.
.env – Local config (DB URL, OpenAI API key). Not committed.
3.1 DB connection (db.js)
Uses pg’s Pool to manage connections:
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.MAPPING_DB_URL,
  ssl: { rejectUnauthorized: false }, // required by RDS + local dev
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

module.exports = { query, pool };
js
MAPPING_DB_URL is a standard Postgres URI, e.g.:
MAPPING_DB_URL=postgresql://mlsteam_ro:***@prod-phoenix-field-mapping-tool-s.c4fna3dvqcgk.us-west-2.rds.amazonaws.com:5432/field_mapping_tool
env
3.2 Mapping DAO (mappingDao.js)
Responsible for:
Finding the latest published mapping row for a given SSID.
Extracting resources + field mappings from the mapping JSON.
Latest published mapping for SSID
SELECT *
FROM mapping
WHERE metadatassid = $1
  AND mapping->>'datePublished' IS NOT NULL
  AND mapping->>'datePublished' <> ''
ORDER BY id DESC
LIMIT 1;
sql
Code:
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
  return rows[0] || null;
}
js
Within that row, the JSON structure is (simplified):
{
  "datePublished": "...",
  "mapping": {
    "metadata": { ... },
    "property": { ... },
    "member": { ... },
    ...
  },
  "metadataSsid": 5632,
  ...
}
json
DAO helpers:
getResourcesForSsid(ssid)
Returns the list of resource keys under mapping.mapping, e.g.:

["customFields","mappingSettings","media","member","metadata","office","openHouse","property","rooms","unitTypes"]

js
getFieldMappingsForResource(ssid, resourceName)
Returns an array of simplified field mapping objects:

[
  {
    key: "100017",           // recordID / internal mapping key
    mappingType: "Classes",  // One To One | Map | Classes | Function | ...
    mlsFields: ["PurchaseContractDate"],
    mapping: {...}           // inner structure; varies by mappingType
  },
  ...
]

js
getFieldMappingByKey(ssid, resourceName, fieldKey)
Looks up a single mapping entry by its internal key.
getFieldMappingByStandardName(ssid, resourceName, standardName)
Uses resoSpecDao.getRecordIdForStandardName to map StandardName → recordID → mapping entry, then returns:

{
  recordID: "100017",
  key: "100017",
  mappingType: "Classes",
  mlsFields: [],
  mapping: {...}
}

js
3.3 RESO Spec DAO (resoSpecDao.js)
Responsible for:
Resolving RESO standardName (or synonym) to recordID for a given resource, using the latest RESO spec.
resospec table:
fullversionstring – e.g. 2.0.9 (latest spec is highest version).
resospec – JSON spec document.
The spec JSON has:
{
  "resources": {
    "property": [
      {
        "recordID": "100017",
        "standardName": "PurchaseContractDate",
        "synonyms": ["PendingDate", "DatePending", ...],
        "dataType": "Date",
        ...
      },
      ...
    ],
    "media": [ ... ],
    "member": [ ... ],
    ...
  }
}
json
DAO helpers:
getLatestResoSpecRow()
Returns the row with highest fullversionstring.
getResoFieldsForResource(resourceName)
Reads row.resospec.resources[resource] and normalizes:

[
  {
    recordID: "100017",
    standardName: "PurchaseContractDate",
    synonyms: ["PendingDate", "DatePending", ...],
    type: "Date"
  },
  ...
]

js
getRecordIdForStandardName(resourceName, standardName)
Case‑insensitive match against standardName and synonyms (string or array).
3.4 Function explainer (functionExplainer.js)
Encapsulates the OpenAI call that uses your Cursor agent system prompt to explain a JS function.
Uses OPENAI_API_KEY from .env.
SYSTEM_PROMPT is your full “Cursor Agent Prompt for MLS Mapping Function Explainer” text.
Helper:
async function explainFunctionWithLLM(fieldName, functionBody) {
  const userMessage = `Field Name: ${fieldName}

Function:
${functionBody}
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
  });

  return completion.choices?.[0]?.message?.content?.trim() || null;
}
js
3.5 Explanation builder (explainMapping.js)
This is the core “translation engine” that turns raw mapping info into plain English. It is deterministic (no LLM calls inside) and handles:
One To One
Map
Classes
Function
Other mapping types (fallback)
Signature:
buildExplanation({
  standardName,
  mappingType,
  mlsFields,
  mapping,
  classNameLookup,    // code -> friendly class name
  functionExplanation // optional LLM output for functions
}) -> string
js
Key logic:
One To One
Explains that the value is copied directly from one or more MLS fields.
Map
Handles nested shapes like:

{
  "PropertyType": {
    "Farm": "Farm",
    "Multi-Family": "Residential Income",
    ...
  }
}

json
Unwraps the inner table, and returns multi‑line text like:
The value for PropertyType comes from the MLS field PropertyType, but specific raw MLS values are converted using a lookup table.
Some example value mappings are:
"Farm" → "Farm"
"Multi-Family" → "Residential Income"
...
Function
If functionExplanation is present (from OpenAI), returns it directly. Otherwise, falls back to a generic description.
Classes
If functionExplanation is present (meaning every class uses the same function body):
Treats it as: “same function used across multiple classes”.
Builds a union of all MLS fields used across classes.
Returns:
 The mapping for UnparsedAddress uses the same function across multiple property classes: Business Opportunity, Commercial Lease, Commercial Sale, Farm, Land, Residential, Residential Income, Residential Lease.
That function reads from these MLS fields: StreetDirPrefix, StreetDirSuffix, StreetName, StreetNumber, StreetSuffix, UnitNumber, StreetSuffixModifier to build the result.
Function details:
The function for the field UnparsedAddress…
Else, if all classes share the same mappingType + mlsFields (non‑Function), collapses into “all classes handled the same way” summary.
Else, lists per‑class behavior with one line per class, using classNameLookup to show “Residential (RESI)” rather than just RESI.
3.6 Express server (server.js)
Wires everything together and exposes the HTTP API.
Uses dotenv, express, body-parser, cors.
Key endpoints:
GET /api/health
Returns { ok: true }.
GET /api/resources?ssid=5632
Returns:

{
  "ssid": 5632,
  "resources": ["property","member","office",...]
}

json
GET /api/fields?ssid=5632&resource=property
Returns all raw field mappings for the resource.
GET /api/field?ssid=5632&resource=property&key=100017
Returns mapping details for the internal key (mostly for debugging).
GET /api/field-by-name?ssid=5632&resource=property&standardName=PurchaseContractDate
Resolves RESO standardName → recordID → mapping entry.
GET /api/explain?ssid=5632&resource=property&standardName=UnparsedAddress
The main endpoint your UI uses. It:
Calls getFieldMappingByStandardName.
For Function, calls explainFunctionWithLLM.
For Classes, if all inner mappings are Function with the same body, also calls explainFunctionWithLLM.
Builds `classNameLookup` from:

row.mapping.mapping.metadata.resources[resource].mappedMlsClasses
// { "Business Opportunity": "BUSO", ... } -> invert to { BUSO: "Business Opportunity", ... }

js
Calls buildExplanation.
Returns:

{
  "ssid": 5632,
  "resource": "property",
  "standardName": "UnparsedAddress",
  "mappingType": "Classes",
  "mlsFields": [],
  "rawMapping": { ... },      // per-class mappingType + mlsFields + mapping
  "classNames": { "RESI": "Residential", ... },
  "explanation": "The mapping for UnparsedAddress ..."
}

json
Server startup:
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});


4. Frontend: db-field-mapping.html
Repo: phoenix-function-mapping-explainer
File: /Users/taylorap/code/phoenix-function-mapping-explainer/db-field-mapping.html
Purpose: a thin UI over /api/explain.
4.1 Form
Fields:
SSID – numeric input (e.g. 5632).
Resource – dropdown (property, member, office, media, rooms, …).
RESO Standard Name – text input (e.g. PurchaseContractDate, UnparsedAddress).
4.2 API base
For local dev:
const API_BASE = 'http://localhost:3000';
js
(For deployment, this should be changed to the HTTPS URL of the backend when it’s hosted inside Zillow infra.)
4.3 Submit handler
On submit:
Validates inputs.
Sends GET request:

const url = `${API_BASE}/api/explain?ssid=${encodeURIComponent(
  ssid
)}&resource=${encodeURIComponent(
  resource
)}&standardName=${encodeURIComponent(standardName)}`;

js
Parses JSON and renders:
explanation
Converts \n to <br> and uses innerHTML so line breaks show properly:

const rawExplanation = data.explanation || '(No explanation generated)';
const explanationHtml = rawExplanation
  .split('\n')
  .map(line => line === '' ? '<br>' : line)
  .join('<br>');

explanationEl.innerHTML = explanationHtml;

js
mappingType – data.mappingType.
mlsFields – data.mlsFields.join(', ').
rawMapping – JSON.stringify with indentation.
Because #explanation-text uses innerHTML and the container uses white-space: pre-wrap;, all the multi‑line behavior set up in buildExplanation shows nicely for Support.

5. Hosting Plan (short‑term and long‑term)
Short‑term (your current workflow)
Backend: Run locally:

cd ~/phoenix-mapping-backend/phoenix-mapping-backend
node server.js  # http://localhost:3000

bash
Frontend: Open the HTML file directly:

file:///Users/taylorap/code/phoenix-function-mapping-explainer/db-field-mapping.html

text
or host locally with a static server (e.g. npx serve .) as long as API_BASE points to http://localhost:3000.
This is perfect for your own use and demos.
Long‑term (for others at Zillow)
Backend: Deploy phoenix-mapping-backend as an internal Node/Express service on approved infra (ZGCP or k8s), with:
Same db.js config,
Same .env (MAPPING_DB_URL, OPENAI_API_KEY),
HTTPS endpoint such as:

https://phoenix-mapping-backend.<internal-domain>.com

text
CORS configured to allow the front‑end origin(s).
Frontend: Leave your Vercel app as the hosting front‑end (or move it to internal static hosting if required), but change:

const API_BASE = 'https://phoenix-mapping-backend.<internal-domain>.com';

js
and redeploy. Then share:

https://phoenix-function-mapping-explainer.vercel.app/db-field-mapping.html

text
(or an internal equivalent) with Support/Ops.