
# Phoenix Mapping Backend – Local Setup Guide

This guide walks you from zero (no tools installed) to running the Phoenix Field Mapping (DB-backed) Explainer backend locally on your Mac.

The goal is to be able to hit:

```
http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=UnparsedAddress
```

and get a human-readable explanation of how that RESO field is mapped.

---

## 0. Prerequisites and assumptions

You:
- Are using macOS.
- Can connect to Zillow's VPN / internal network.
- Can obtain:
  - A read-only Postgres connection string for the `field_mapping_tool` database.
  - An OpenAI API key or approved internal proxy key.

If you do not have the DB connection or OpenAI key yet, you can still complete sections 1–4 and return later.

---

## 1. Install required tools (Git and Node.js)

### 1.1 Install or verify Git

Open Terminal (Spotlight -> type "Terminal"):

```
git --version
```

If you see something like `git version 2.x.x`, Git is installed.  
If you get a prompt to install Command Line Tools:
- Accept and let macOS install them.
- After installation, run `git --version` again to confirm.

### 1.2 Install or verify Node.js

Check Node:

```
node -v
```

If you see `v18.x.x` or later, you are good.  
If you see `command not found` or a very old version, install Node:

1. Go to https://nodejs.org in your browser.
2. Download the LTS macOS installer.
3. Run the installer.

Back in Terminal:

```
node -v
npm -v
```

You should see something like `v18.x.x` (Node) and `8.x.x+` (npm).

---

## 2. Clone the Phoenix Mapping Backend repo

Pick a directory for your projects, e.g. `~/code`:

```
mkdir -p ~/code
cd ~/code
```

Clone the repo:

```
git clone https://github.com/taylorap/phoenix-mapping-backend.git
cd phoenix-mapping-backend
pwd
```

You should now be in something like:

```
/Users/<your-username>/code/phoenix-mapping-backend
```

List files:

```
ls
```

You should see:

```
server.js
db.js
mappingDao.js
resoSpecDao.js
functionExplainer.js
explainMapping.js
package.json
package-lock.json
docs/phoenix-field-mapping-explainer.md
test-*.js files
```

---

## 3. Install project dependencies

From the repo root:

```
cd ~/code/phoenix-mapping-backend
npm install
```

This installs all Node dependencies (pg, express, openai, etc.) into `node_modules/` (which remains local and is not committed).

---

## 4. Get your database connection string

You need a read-only connection string to the `field_mapping_tool` Postgres database.

Ask the Phoenix / MLS Ops / IDI engineering owner:

```
Please provide a read-only Postgres connection string for the field_mapping_tool database, to be used by the Phoenix Mapping Explainer backend.
```

They should give you something like:

```
postgresql://mlsteam_ro:YOUR_PASSWORD_HERE@prod-phoenix-field-mapping-tool-s.c4fna3dvqcgk.us-west-2.rds.amazonaws.com:5432/field_mapping_tool
```

Keep this handy for the `.env` file.

---

## 5. Get an OpenAI (or proxy) key

For local development, you need an OpenAI API key (or internal proxy key) that allows this backend to call an LLM to explain JavaScript mapping functions.

Ask your manager or the responsible engineer:

```
I need an OpenAI API key (or internal proxy key) to run the Phoenix Mapping Explainer backend locally. It will only be used to generate plain-language descriptions of mapping functions.
```

You'll receive a key like:

```
sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Keep this secret; it will go into `.env`.

---

## 6. Create and populate the .env file

The backend uses a `.env` file for configuration. This file must not be committed to Git.

From the repo root:

```
cd ~/code/phoenix-mapping-backend
touch .env
```

Open `.env` in your editor (Cursor, VS Code, TextEdit, etc.) and add:

```
# Read-only Postgres URI for field_mapping_tool
MAPPING_DB_URL=postgresql://mlsteam_ro:YOUR_PASSWORD_HERE@prod-phoenix-field-mapping-tool-s.c4fna3dvqcgk.us-west-2.rds.amazonaws.com:5432/field_mapping_tool

# OpenAI or internal proxy key for function explanations
OPENAI_API_KEY=sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Optional: port for local dev (defaults to 3000 if omitted)
PORT=3000
```

Replace:
- `YOUR_PASSWORD_HERE` with the actual DB password.
- `sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` with your real OpenAI/proxy key.

Save the file.

Ensure `.env` is ignored by Git:

```
cat .gitignore
```

You should see entries like:

```
node_modules
.env
.DS_Store
```

If `.env` is missing, add it to `.gitignore`.

---

## 7. Verify database connectivity

Before running the server, confirm you can talk to Postgres using the configured `MAPPING_DB_URL`.

From the repo root:

```
cd ~/code/phoenix-mapping-backend
node test-db.js
```

Expected output:

```
[dotenv@...] injecting env (1) from .env ...
DB time: 2026-01-23T06:35:45.887Z
```

If you hit errors:

- `ENOTFOUND` (host not found):
  - Check hostname in `MAPPING_DB_URL` for typos.
  - Ensure you're connected to VPN.
- `no pg_hba.conf entry ... no encryption`:
  - The DB requires SSL. `db.js` already sets `ssl: { rejectUnauthorized: false }`, so if you changed that, revert.
- `password authentication failed`:
  - Username or password is wrong. Fix `MAPPING_DB_URL` and retry.

Once you see the `DB time:` line, your DB connectivity is good.

---

## 8. Optional sanity checks (DAO test scripts)

You can run the included test scripts to verify mapping and RESO behavior.

From the repo root:

```
cd ~/code/phoenix-mapping-backend
```

### 8.1 Latest published mapping row for an SSID

```
node test-latest-mapping.js
```

Expected result (example):

```
Row: { id: 130, metadatassid: 5632 }
```

### 8.2 Resources and field mappings

```
node test-resource-mappings.js
```

This will print:
- Available resources for an SSID (e.g. ["property","member","office",...]).
- Number of field mappings for a resource.
- A few sample entries.

### 8.3 RESO spec structure

```
node test-resospec.js
```

This prints:
- Column names of the `resospec` table.
- A preview of the resospec JSON structure (groups, resources, lookups, etc.).

### 8.4 Mapping by standardName

```
node test-field-by-name.js
```

This verifies:
- RESO standardName -> recordID resolution.
- Mapping lookup by RESO standardName for a given SSID + resource.

Errors here usually mean:
- Wrong SSID or resource in the test script.
- The RESO spec or mapping doesn't have that standardName.
- Unexpected JSON shape in the DB.

---

## 9. Run the backend server

Once DB connectivity is confirmed, start the server:

```
cd ~/code/phoenix-mapping-backend
node server.js
```

You should see:

```
[dotenv@...] injecting env (1) from .env ...
Backend listening on port 3000
```

Leave this process running. Your API is now available at:

```
http://localhost:3000
```

If the process exits immediately with an error:
- Read the stack trace.
- Fix any syntax or import issues (these should not occur if you cloned a clean repo).

---

## 10. Test the HTTP endpoints

Open a new Terminal tab (so the server keeps running in the original one), or use a browser.

### 10.1 Health check

```
curl http://localhost:3000/api/health
```

Expected:

```
{"ok":true}
```

Or visit `http://localhost:3000/api/health` in a browser.

### 10.2 List resources for an SSID

```
curl "http://localhost:3000/api/resources?ssid=5632"
```

Example response:

```
{
  "ssid": 5632,
  "resources": ["property","member","office","media","rooms", ...]
}
```

### 10.3 List fields for a resource

```
curl "http://localhost:3000/api/fields?ssid=5632&resource=property"
```

You'll see:

```
{
  "ssid": 5632,
  "resource": "property",
  "fields": [
    {
      "key": "100017",
      "mappingType": "Classes",
      "mlsFields": [],
      "mapping": { ... }
    },
    ...
  ]
}
```

### 10.4 Get a field mapping by RESO standardName

```
curl "http://localhost:3000/api/field-by-name?ssid=5632&resource=property&standardName=PurchaseContractDate"
```

You should see:

```
{
  "ssid": 5632,
  "resource": "property",
  "standardName": "PurchaseContractDate",
  "fieldMapping": {
    "recordID": "100017",
    "key": "100017",
    "mappingType": "Classes",
    "mlsFields": [],
    "mapping": {
      "BUSO": { "mlsFields": ["PurchaseContractDate"], "mappingType": "One To One" },
      "RESI": { ... },
      ...
    }
  }
}
```

### 10.5 Get a human-readable explanation (`/api/explain`)

This is the main endpoint the UI will use.

Example A: Map field (PropertyType)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=PropertyType"
```

You should see:
- `mappingType: "Map"`
- `mlsFields` (e.g. `["PropertyType"]`)
- `rawMapping` (the lookup table)
- `explanation` (multi-line explanation with example raw -> normalized mappings)

Example B: Classes + One To One (PurchaseContractDate)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=PurchaseContractDate"
```

You should see:
- `mappingType: "Classes"`
- `classNames` (e.g. `{ "BUSO": "Business Opportunity", "RESI": "Residential", ... }`)
- `rawMapping` (per-class mapping)
- `explanation` (summary of shared or per-class behavior)

Example C: Classes + shared Function (UnparsedAddress)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=UnparsedAddress"
```

You should see:
- `mappingType: "Classes"`
- `rawMapping` (per-class Function mappings with the same JS body)
- `explanation`:
  - A summary that the same function is used across multiple property classes.
  - A note about the MLS fields used to build the address.
  - A "Function details:" section generated by OpenAI describing how the function builds UnparsedAddress.

If you see:
- `400` - check you passed `ssid`, `resource`, `standardName` correctly.
- `404` - the mapping may not exist for that combination.
- `500` - check the Terminal output where `node server.js` is running for details.

---

## 11. Optional: add the frontend UI locally

If you want the small UI that calls this backend:

Clone the frontend repo:

```
cd ~/code
git clone https://github.com/taylorap/phoenix-function-mapping-explainer.git
cd phoenix-function-mapping-explainer
```

Open the DB-backed HTML page directly in your browser:

```
file:///Users/<your-username>/code/phoenix-function-mapping-explainer/db-field-mapping.html
```

Ensure the backend (`node server.js`) is still running at `http://localhost:3000`.

In the browser UI:
- Enter SSID (e.g. `5632`).
- Choose Resource (e.g. `Property`).
- Enter RESO Standard Name (e.g. `PurchaseContractDate` or `UnparsedAddress`).
- Click Explain Mapping.

The UI will call `http://localhost:3000/api/explain` and render:
- The explanation text (with line breaks)
- Mapping type
- MLS fields
- Raw mapping JSON

---

Following these steps, someone with no prior setup but with VPN and DB access can:
- Install tools
- Clone the repo
- Configure `.env`
- Verify DB connection
- Run the server
- Use the explainer locally
