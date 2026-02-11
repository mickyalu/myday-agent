# Railway Deployment Guide - MyDay Agent

## Prerequisites

1. **Railway CLI Installed**
   ```bash
   npm install -g @railway/cli
   ```

2. **Railway Account**
   - Sign up at https://railway.app
   - Create a new project

3. **GitHub Repository**
   - Your code must be in a git repository
   - Remote should be set to your GitHub repo

---

## Step 1: Configure Environment Variables

Railway uses environment variables for secrets. You'll set these in the Railway dashboard.

### Production Variables Required:
```
RPC_URL=https://forno.celo.org                    # Celo Mainnet
CHAIN_ID=42220                                     # Mainnet Chain ID
TELEGRAM_BOT_TOKEN=your_production_token           # Must be production token
GEMINI_API_KEY=your_production_gemini_key          # Must be production key
PRIVATE_KEY=your_agent_private_key                 # KEEP SECURE!
VAULT_ADDRESS=0x4F5E6F8C9B8A7D6C5E4F3A2B1C0D9E8F7C6B5A4D
REGISTERED_AGENT_ADDRESS=your_registered_agent    # From Celo registry
DB_TYPE=sqlite
DB_PATH=/data/myday.db
NODE_ENV=production
```

### How to Set Variables in Railway:
1. Go to your Railway project dashboard
2. Navigate to **Variables** tab
3. Click **Add Variable** and enter each key-value pair
4. Click **Deploy** to apply changes

---

## Step 2: Login to Railway

```bash
railway login
```

This opens your browser to authenticate with Railway and links your CLI to your account.

---

## Step 3: Initialize Railway for Your Project

```bash
railway init
```

**What this does:**
- Scans your project structure
- Creates a `railway.json` config file
- Links your local repository to a Railway project
- Prompts you to select or create a project

**Example interaction:**
```
? Enter project name: myday-agent-prod
? Select a project: (create a new project)
✓ Project created
✓ Linked to project: myday-agent-prod
```

---

## Step 4: Deploy with `railway up`

### Command Overview:
```bash
railway up
```

**What `railway up` does:**
1. **Detects your environment**
   - Reads `Procfile` (tells Railway what command to run)
   - Reads `runtime.txt` (specifies Node.js version)
   - Parses `package.json` (installs dependencies)

2. **Stages your code**
   - Uploads your repository to Railway's build system
   - Creates a Docker container with your environment

3. **Builds the application**
   - Installs Node.js (version from `runtime.txt`)
   - Runs `npm install` (from `package.json`)
   - Creates a production bundle

4. **Deploys the container**
   - Pushes container to Railway's registry
   - Starts the service with your Procfile command: `node src/index.js`
   - Assigns a public URL

5. **Monitors the deployment**
   - Shows real-time logs
   - Displays deployment status
   - Reports success or failure

### Full Workflow:
```bash
# 1. Ensure you're logged in
railway login

# 2. Initialize Railway (one time only)
railway init

# 3. Set environment variables (via dashboard or CLI):
railway variable set RPC_URL https://forno.celo.org
railway variable set TELEGRAM_BOT_TOKEN your_token
railway variable set GEMINI_API_KEY your_key
railway variable set PRIVATE_KEY your_private_key
# ... set all other variables

# 4. Deploy to production
railway up
```

### Expected Output:
```
🚂 railway up
✓ Detected Procfile
✓ Detected runtime.txt
✓ Building Docker image...
Step 1/5 : FROM node:24.11.1
 ---> hash
Step 2/5 : COPY package.json ...
 ---> hash
Step 3/5 : RUN npm install
 ---> Running in container...
   npm WARN ...
   added 250 packages
Step 4/5 : COPY . .
 ---> hash
Step 5/5 : CMD ["node", "src/index.js"]
 ---> hash
✓ Image built successfully
✓ Pushing to registry...
✓ Service deployed: https://myday-agent-prod.railway.app
✓ Logs:
  ✓ Connected to SQLite database
  ✓ MyDay Agent (Milestone 2) is running
    - Morning Nudge: Active
    - MyDay Intel: Connected
    - Database: SQLite
```

---

## Step 5: Verify Deployment

### Check Live Logs:
```bash
railway logs
```

### Test the Service:
```bash
# Your bot should be running at:
# https://myday-agent-prod.railway.app

# Telegram should report:
# "[BOT] MyDay Agent (Milestone 2) is running"
```

### View Dashboard:
```bash
railway open
```
Opens the Railway web dashboard for your project.

---

## Important Notes for Production

### Security Best Practices:
1. **Never commit `.env`** - Railway uses its own secret management
2. **Use Railway variables** for all secrets (PRIVATE_KEY, API keys)
3. **Enable Auto-Deploy* (optional) - Railway can auto-deploy on git push
4. **Monitor logs** regularly - check for errors: `railway logs -f`

### Database Persistence:
- SQLite uses `/data/myday.db` (Railway provides persistent volumes)
- Data **survives** redeployments
- Railway allocates 10GB free storage

### Celo Mainnet Details:
| Parameter | Value |
|-----------|-------|
| RPC URL | `https://forno.celo.org` |
| Chain ID | `42220` |
| Network | Celo Mainnet |
| Confirmation Time | ~5 seconds |

### Common Issues & Fixes:

**Issue: "ENOTFOUND forno.celo.org"**
- Fix: Use `https://forno.celo.org` (https required)

**Issue: "Missing required variables"**
- Fix: Set all variables in Railway dashboard before deploy

**Issue: Bot not responding**
- Fix: Check logs with `railway logs` for TELEGRAM_BOT_TOKEN issues

**Issue: Database permission denied**
- Fix: Railway auto-creates `/data` directory; no action needed

---

## Subsequent Deployments

After initial setup, redeployments are simple:

```bash
# Make code changes locally
git add .
git commit -m "Feature: Add mission tracking"

# Push to GitHub
git push origin main

# Option 1: Manual redeploy
railway up

# Option 2: Auto-deploy (Railway Cloud → Project Settings → Auto-Deploy GitHub)
# Railway auto-redeploys when you push to main
```

---

## Rollback (If Something Breaks)

```bash
# View previous deployments
railway deployments

# Rollback to previous version
railway rollback <deployment-id>
```

---

## Monitoring & Maintenance

### Daily Checks:
```bash
# Check service health
railway status

# View recent logs
railway logs --limit 100

# Check uptime
railway logs --filter="error|failed|crashed"
```

### Scaling (If Needed):
- Memory: Railway default 512MB
- To increase: `railway scale -m 2048` (2GB)

---

## Summary

```
Local Development          Railway Production
────────────────         ──────────────────
.env (local)       →      Railway Variables
package.json       →      npm install
Procfile (new)     →      "web: node src/index.js"
runtime.txt (new)  →      Node 24.11.1
src/index.js       →      Runs bot on Railway
```

**Your production bot is now live on Railway!** 🚂✨
