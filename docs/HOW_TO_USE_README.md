# Phoenix Mapping Explainer – How to Use

This guide explains how to use the Phoenix Field Mapping (DB-backed) Explainer backend once it is running locally or in a shared environment.

It provides:
- A quick reference for experienced users.
- A detailed walkthrough for first-time users.

---

## Quick use (experienced users)

1) Make sure the backend is running from the repo root:

```
cd /Users/<your-username>/phoenix-mapping-backend/phoenix-mapping-backend
node server.js
```

Expected:

```
Backend listening on port 3000
```

2) Open the HTML UI (recommended):

```
file:///Users/<your-username>/phoenix-mapping-backend/phoenix-mapping-backend/db-field-mapping.html
```

Note: replace `<your-username>` with your local macOS username (for example, `taylorap`).

3) Use the form to enter SSID, resource, and RESO standardName, then click **Explain Mapping**.

Expected:
- Explanation text rendered with line breaks.
- Mapping type, MLS fields, and raw mapping JSON displayed.

4) (Alternate) Call the main endpoint directly:

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=UnparsedAddress"
```

Expected (shape):

```
{
  "mappingType": "...",
  "mlsFields": [...],
  "rawMapping": { ... },
  "classNames": { ... },
  "explanation": "..."
}
```

5) Use `explanation` for the human-readable output.

---

## Full guide (first-time users)

### 1) Start the backend

From the repo root:

```
node server.js
```

Expected:

```
Backend listening on port 3000
```

If the server exits, check terminal output for errors (DB access, missing `.env`, or invalid keys).

---

### 2) Use the HTML UI (recommended)

Open the local HTML page in your browser:

```
file:///Users/<your-username>/phoenix-mapping-backend/phoenix-mapping-backend/db-field-mapping.html
```

Note: replace `<your-username>` with your local macOS username.

In the form:
1) Enter SSID (e.g., `5632`).
2) Choose a resource (e.g., `property`).
3) Enter a RESO standardName (e.g., `UnparsedAddress`).
4) Click **Explain Mapping**.

Expected:
- Explanation text rendered with line breaks.
- Mapping type, MLS fields, and raw mapping JSON displayed.

---

### 3) Use the main explain endpoint (alternate)

The main endpoint is:

```
GET /api/explain?ssid=...&resource=...&standardName=...
```

Example:

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=PurchaseContractDate"
```

Expected response fields:

```
{
  "mappingType": "One To One | Map | Classes | Function | ...",
  "mlsFields": ["MLSFieldA", "MLSFieldB"],
  "rawMapping": { ... },
  "classNames": { ... },
  "explanation": "Plain-language explanation text..."
}
```

What these fields mean:
- `mappingType`: The mapping style used for the RESO field.
- `mlsFields`: MLS fields referenced by the mapping.
- `rawMapping`: The underlying JSON mapping payload from Phoenix.
- `classNames`: Class code -> friendly name map (only for Classes mappings).
- `explanation`: The plain-language explanation for support use.

---

### 4) Common workflow

1) Identify the **SSID** for the MLS feed you want to inspect.
2) Choose a **resource** (property, member, office, etc.).
3) Choose a **RESO standardName** (e.g., `UnparsedAddress`, `PurchaseContractDate`).
4) Call `/api/explain` and read the `explanation` field.

If you are not sure which resource or fields are available, use the helper endpoints below.

---

### 5) Helper endpoints (for discovery)

#### 5.1 Health check

```
curl http://localhost:3000/api/health
```

Expected:

```
{"ok":true}
```

#### 5.2 List resources for an SSID

```
curl "http://localhost:3000/api/resources?ssid=5632"
```

Expected (example):

```
{
  "ssid": 5632,
  "resources": ["property","member","office","media","rooms", ...]
}
```

#### 5.3 List fields for a resource

```
curl "http://localhost:3000/api/fields?ssid=5632&resource=property"
```

Expected (shape):

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
    }
  ]
}
```

#### 5.4 Get mapping by RESO standardName

```
curl "http://localhost:3000/api/field-by-name?ssid=5632&resource=property&standardName=PurchaseContractDate"
```

Expected (shape):

```
{
  "ssid": 5632,
  "resource": "property",
  "standardName": "PurchaseContractDate",
  "fieldMapping": { ... }
}
```

---

### 6) Example uses

#### 6.1 Map field (PropertyType)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=PropertyType"
```

Expected:
- `mappingType: "Map"`
- `explanation` includes example raw -> normalized mappings.

#### 6.2 Classes + One To One (PurchaseContractDate)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=PurchaseContractDate"
```

Expected:
- `mappingType: "Classes"`
- `explanation` summarizes shared or per-class behavior.

#### 6.3 Classes + shared Function (UnparsedAddress)

```
curl "http://localhost:3000/api/explain?ssid=5632&resource=property&standardName=UnparsedAddress"
```

Expected:
- `mappingType: "Classes"`
- `explanation` includes a "Function details:" section generated by OpenAI.

---

### 7) HTML UI recap

If you want the UI again, open:

```
file:///Users/<your-username>/phoenix-mapping-backend/phoenix-mapping-backend/db-field-mapping.html
```

Then use the form to call `/api/explain` and view the explanation output.

