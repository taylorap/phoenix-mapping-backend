# Phoenix Field Mapping Explainer
# Local Setup Guide (From Scratch)

This guide is for someone starting with a clean machine who has:
- Access to Zillow's internal network (VPN)
- Read access to the `field_mapping_tool` Postgres database

It covers installation, configuration, running the backend, and quick validation.

---

## 1) Connect to Zillow VPN

You must be on the internal network to reach the Phoenix mapping database.

1. Install the Zillow-approved VPN client.
2. Connect to the VPN.
3. Confirm internal access (if you have a known host, try a ping or TCP check).

---

## 2) Install Required Tools

These steps assume macOS. If you are on Linux or Windows, see Section 8.

### 2.1 Install Homebrew (Mac)

Homebrew makes it easy to install Git and Node.

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, follow the prompt to update your PATH (usually):

```
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2.2 Install Git

```
brew install git
git --version
```

### 2.3 Install Node.js (LTS)

```
brew install node
node --version
npm --version
```

---

## 3) Clone the Repo

Choose a working directory (example uses `~/code`).

```
mkdir -p ~/code
cd ~/code
git clone <REPO_URL> phoenix-mapping-backend
cd phoenix-mapping-backend/phoenix-mapping-backend
```

If you do not have the repo URL, ask your team for the internal Git URL.

---

## 4) Install Dependencies

From the repo root:

```
npm install
```

This installs Express, pg, OpenAI client, and other dependencies.

---

## 5) Configure Environment Variables

Create a `.env` file in the repo root:

```
touch .env
```

Add these variables:

```
# Required: Postgres connection to field_mapping_tool
MAPPING_DB_URL=postgres://USER:PASSWORD@HOST:PORT/field_mapping_tool

# Optional: only needed for Function explanations
OPENAI_API_KEY=sk-...
```

### MAPPING_DB_URL details

You need:
- Hostname
- Port (usually 5432)
- Read-only username
- Password
- Database name: `field_mapping_tool`

Example:

```
postgres://readonly_user:myPassword@phoenix-db.internal.zillow.com:5432/field_mapping_tool
```

---

## 6) Run the Backend

From the repo root:

```
node server.js
```

You should see:

```
Backend listening on port 3000
```

---

## 7) Validate Locally

### 7.1 Health check

```
curl http://localhost:3000/api/health
```

Expected:

```
{"ok":true}
```

### 7.2 Test DB-backed endpoint

```
curl "http://localhost:3000/api/resources?ssid=5632"
```

If you see a 500 error, check VPN access and `MAPPING_DB_URL`.

---

## 8) (Optional) Use the Local HTML UI

This repo includes a simple HTML page:

```
db-field-mapping.html
```

Open it directly in a browser:

```
file:///Users/<your-user>/code/phoenix-mapping-backend/phoenix-mapping-backend/db-field-mapping.html
```

Enter:
- SSID (example: `5632`)
- Resource (example: `property`)
- RESO standard name (example: `PurchaseContractDate`)

The page calls the local backend at `http://localhost:3000`.

---

## 9) Optional Local Tests

Run any of these scripts from the repo root:

```
node test-db.js
node test-resospec.js
node test-latest-mapping.js
node test-resource-mappings.js
node test-field-by-name.js
```

---

## 10) Troubleshooting

### DB connection errors
- Ensure VPN is connected
- Confirm `MAPPING_DB_URL` is correct
- Confirm DB user has read access
- Try connecting directly:

```
psql "postgres://USER:PASSWORD@HOST:PORT/field_mapping_tool"
```

### OpenAI errors
- Only required for Function mapping explanations
- Ensure `OPENAI_API_KEY` is set if you need that output

### CORS issues
- `server.js` enables CORS for all origins in dev by default

---

## 11) Non-macOS Notes (Quick)

### Linux
- Install Git and Node via your package manager
- Example (Ubuntu):
  - `sudo apt update && sudo apt install git nodejs npm`

### Windows
- Install Git: https://git-scm.com/downloads
- Install Node: https://nodejs.org/en/download
- Use PowerShell or Git Bash for commands

