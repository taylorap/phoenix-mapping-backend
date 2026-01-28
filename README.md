# Phoenix Field Mapping (DB‑backed) Explainer – Technical Overview

## 1. Purpose

The Phoenix Field Mapping (DB‑backed) Explainer is a small service + UI that helps MLS Operations and Support understand how individual RESO fields are populated for a given MLS feed (SSID) and resource.

Given:

- **SSID** (e.g., 5632 = Bright MLS IDX)
- **Resource** (e.g., `property`, `member`, `office`)
- **RESO Standard Field Name** (e.g., `PurchaseContractDate`, `UnparsedAddress`)

the system:

1. Looks up the latest **published** Phoenix mapping configuration for that SSID.
2. Resolves the RESO field to its internal mapping definition (mapping type, MLS fields, and function body).
3. Returns a **plain‑language explanation** of how the field is populated, suitable for non‑technical Support.

This replaces manual inspection of keyfiles and JavaScript mappings with a quick, standardized explanation.

### 1.1 Getting Started

- Local setup guide: `docs/LOCAL_SETUP_README.md`
- How to use (UI + API): `docs/HOW_TO_USE_README.md`

---

## 2. High‑Level Architecture

The system has two main parts:

1. **Backend (Node/Express, internal)** – repo: `phoenix-mapping-backend`
   - Connects to the Phoenix field mapping Postgres database (`field_mapping_tool`).
   - Reads:
     - The `mapping` table (published keyfiles).
     - The `resospec` table (latest RESO spec).
   - Exposes HTTP APIs:
     - `/api/health`
     - `/api/resources`
     - `/api/fields`
     - `/api/field`
     - `/api/field-by-name`
     - `/api/explain`
   - Uses OpenAI to explain JavaScript mapping functions.

2. **Frontend (static HTML/JS)** – repo: `phoenix-function-mapping-explainer`
   - Page: `db-field-mapping.html`
   - Inputs:
     - SSID
     - Resource
     - RESO standardName
   - Calls the backend’s `/api/explain` endpoint.
   - Renders:
     - Explanation text (with line breaks),
     - Mapping type,
     - MLS fields,
     - Raw mapping JSON.

---

## 3. Backend Repo Structure (`phoenix-mapping-backend`)

Path on Taylor’s machine: /Users/taylorap/phoenix-mapping-backend/phoenix-mapping-backend

Key files:

- `db.js` – Postgres connection and query helper.
- `mappingDao.js` – Access to the `mapping` table and mapping JSON.
- `resoSpecDao.js` – Access to the `resospec` table / RESO spec JSON.
- `functionExplainer.js` – OpenAI client; explains JS mapping functions with a detailed system prompt.
- `explainMapping.js` – Deterministic “explanation generator” for all mapping types (One To One, Map, Classes, Function).
- `server.js` – Express app, routes, and CORS.
- `test-*.js` – Local test scripts for DB connectivity and DAO behavior.
- `README.md` – this document.

### 3.1 Database Connectivity (`db.js`)

- Uses `pg`’s `Pool` with `MAPPING_DB_URL` from `.env`.
- Connects to Aurora/RDS `field_mapping_tool` with a read‑only user.
- SSL enabled (`rejectUnauthorized: false` for local dev; can be made stricter in prod).

### 3.2 Mapping Data Access (`mappingDao.js`)

Responsibility: Load and interpret the **published mapping** for an SSID.

- `getLatestPublishedMappingRow(ssid)`  
  - Query against `mapping` table:
    - `WHERE metadatassid = $1`
    - `AND mapping->>'datePublished' IS NOT NULL AND <> ''`
    - `ORDER BY id DESC LIMIT 1`
  - Returns the latest **published** mapping row for the SSID.

- `getResourcesForSsid(ssid)`  
  - Loads the row, then reads `row.mapping.mapping` keys to get resource names (property, member, office, etc.).

- `getFieldMappingsForResource(ssid, resource)`  
  - Returns an array of simplified mapping entries:
    - `key` – internal mapping key / RESO recordID.
    - `mappingType` – One To One, Map, Classes, Function, etc.
    - `mlsFields` – array of MLS field names.
    - `mapping` – type‑specific payload (string for Function, object for Map/Classes).

- `getFieldMappingByKey(ssid, resource, key)`  
  - Filters `getFieldMappingsForResource` by internal key.

- `getFieldMappingByStandardName(ssid, resource, standardName)`  
  - Uses `resoSpecDao.getRecordIdForStandardName(resource, standardName)` to resolve RESO recordID.
  - Uses that recordID as the key into the mapping JSON and returns the corresponding entry.

### 3.3 RESO Spec Access (`resoSpecDao.js`)

Responsibility: Map **RESO standardName** → **recordID** (and synonyms).

`resospec` table:

- `fullversionstring` – version identifier (e.g., `2.0.9`).
- `resospec` – JSON object with:

        json
        {
        "resources": {
        "property": [
        { "recordID": "100017", "standardName": "PurchaseContractDate", "synonyms": [...], "dataType": "Date" },
        ...
        ],
        "media": [...],
        "member": [...],
        ...
        }
        }

Helpers:

- `getLatestResoSpecRow()` – highest `fullversionstring`.
- `getResoFieldsForResource(resource)` – returns normalized list of fields `{ recordID, standardName, synonyms, type }` for a resource.
- `getRecordIdForStandardName(resource, standardName)` – case‑insensitive match against `standardName` and `synonyms`.

### 3.4 Function Explainer (`functionExplainer.js`)

Encapsulates the OpenAI integration for explaining JS mapping functions.

- Uses `OPENAI_API_KEY` from `.env`.
- `SYSTEM_PROMPT` is the same prompt used in the original Phoenix Function Mapping Explainer agent (Cursor/Glean), which:
  - Requires responses to start with “The function for the field [[RESO Field Name]]...”.
  - Explains how the function uses specific MLS fields.
  - Avoids low‑level JS details, targeting non‑technical support staff.

Exposed helper:

- `explainFunctionWithLLM(fieldName, functionBody)` → plain‑text explanation.

### 3.5 Explanation Generator (`explainMapping.js`)

Responsible for turning raw mapping info into readable English without calling LLMs.

Signature:

js
buildExplanation({
standardName,
mappingType,
mlsFields,
mapping,
classNameLookup,    // map of class code -
    friendly name (e.g. RESI -
        Residential)
        functionExplanation // optional LLM explanation for functions
        }) -> string

Handles:

- **One To One**  
  - “The value for X is copied directly from MLS field Y (or fields Y, Z).”

- **Map**  
  - Handles both:
    - Flat maps: `{ "A": "Active", "P": "Pending" }`
    - Nested maps: `{ "PropertyType": { "Farm": "Farm", "Multi-Family": "Residential Income", ... } }`
  - Produces:
    - A description that values are normalized via a lookup table.
    - A list of example mappings (one per line).

- **Function**  
  - If `functionExplanation` is present (from OpenAI), returns that verbatim.
  - Otherwise, falls back to a high‑level description.

- **Classes**  
  - If `functionExplanation` is present (indicates a shared function across classes, e.g. UnparsedAddress):
    - Summarizes that the same function is used for all listed classes.
    - Shows the union of MLS fields used by the function.
    - Appends “Function details:” followed by the LLM explanation.
  - Else, if all classes share the same mappingType + mlsFields:
    - Collapses to a single description: “all classes are handled the same way.”
  - Else:
    - Lists each class on its own line, with friendly names:
      - “Residential (RESI): One To One using the MLS field PurchaseContractDate;”
      - etc.

### 3.6 API Server (`server.js`)

`server.js` wires everything together using Express:

- Loads env vars (`dotenv`).
- Creates an Express app with:
  - JSON body parsing.
  - CORS enabled (open by default; can be restricted in production).

Endpoints:

- `GET /api/health`
- `GET /api/resources?ssid=...`
- `GET /api/fields?ssid=...&resource=...`
- `GET /api/field?ssid=...&resource=...&key=...`
- `GET /api/field-by-name?ssid=...&resource=...&standardName=...`
- `GET /api/explain?ssid=...&resource=...&standardName=...`  
  (the main endpoint used by the frontend)

`/api/explain` workflow:

1. Resolve StandardName → recordID via `resoSpecDao`.
2. Get mapping entry via `mappingDao.getFieldMappingByStandardName`.
3. If `mappingType === "Function"`:
   - Call `explainFunctionWithLLM` with the function body.
4. If `mappingType === "Classes"` and all inner entries are `"Function"` with identical bodies:
   - Call `explainFunctionWithLLM` once with the shared function body.
5. Build `classNameLookup` from `row.mapping.mapping.metadata.resources[resource].mappedMlsClasses`.
6. Call `buildExplanation` with all the above.
7. Return a JSON object with:
   - `mappingType`
   - `mlsFields`
   - `rawMapping` (type‑specific JSON)
   - `classNames` (for Classes)
   - `explanation` (fully formatted string with line breaks).

---

## 4. Frontend Repo Overview (`phoenix-function-mapping-explainer`)

The backend can be used by any front‑end. There are two simple options:

1. **Local HTML UI (in this repo)** – `db-field-mapping.html`
   - Open directly: `file:///Users/<your-username>/phoenix-mapping-backend/phoenix-mapping-backend/db-field-mapping.html`
   - Uses `http://localhost:3000` by default.

2. **Separate frontend repo** – `phoenix-function-mapping-explainer`

- Repo: `phoenix-function-mapping-explainer`
- File: `db-field-mapping.html`
- Path locally: `/Users/<your-username>/code/phoenix-function-mapping-explainer/db-field-mapping.html`

This page:

- Shows a small form with:
  - SSID
  - Resource
  - RESO Standard Name
- On submit, calls:
  - `GET {API_BASE}/api/explain?ssid=...&resource=...&standardName=...`
- Renders:
  - Explanation text, converting `\n` to `<br>` so multiline explanations render properly.
  - Mapping type.
  - MLS fields.
  - Raw mapping JSON.

For local development:

- Backend: `node server.js` at `http://localhost:3000`
- Frontend: open  
  `file:///Users/<your-username>/code/phoenix-function-mapping-explainer/db-field-mapping.html`
- `API_BASE` is set to `http://localhost:3000`.

For production:

- Backend should be deployed on internal Zillow infra with an HTTPS URL.
- `API_BASE` in `db-field-mapping.html` should be updated to that internal URL.
- The HTML page can be hosted on Vercel or internal static hosting.

---

## 5. Known Limitations and Data Freshness

- **DB and VPN required**: The backend depends on the `field_mapping_tool` database and internal network access.
- **Function explanations need OpenAI**: Without `OPENAI_API_KEY`, Function mappings fall back to a generic explanation.
- **Latest published only**: The backend always selects the most recent **published** mapping row for an SSID.
- **Latest RESO spec only**: The backend uses the highest `fullversionstring` from `resospec`.

---

## 6. Troubleshooting Quick Hits

- `500` from API endpoints usually indicates DB connectivity or missing env vars.
- `404` from `/api/explain` means no mapping exists for that SSID/resource/standardName.
- If function explanations are missing, check `OPENAI_API_KEY`.

---

## 7. Deployment Notes

- DB connections:
  - Use a **read‑only** role, ideally dedicated for this service.
  - Keep SSL enabled.
- OpenAI:
  - Use a **Zillow‑approved** OpenAI API key or proxied endpoint.
- CORS:
  - In production, restrict `origin` to known front‑end hosts.
- Health and monitoring:
  - Use `/api/health` for health checks.
  - Wire request logging / metrics according to team standards.

---

## 8. Cursor Usage

For future development with Cursor:

- Open this repo in Cursor:
  - `cd /Users/taylorap/phoenix-mapping-backend/phoenix-mapping-backend`
  - `cursor .`
- Refer to this document as `README.md` when asking Cursor questions or requesting changes.

---

Docs -
- `docs/LOCAL_SETUP_README.md` - local setup (quick + from scratch)
- `docs/HOW_TO_USE_README.md` - how to use the backend and UI
- `docs/archive/` - previous setup drafts
