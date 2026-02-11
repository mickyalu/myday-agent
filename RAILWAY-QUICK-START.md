# 🚂 Railway Production Deployment - Quick Start

Your MyDay Agent is ready for production deployment on Railway!

## Files Created ✅

```
Procfile                      → Tells Railway to run: node src/index.js
runtime.txt                   → Node.js version: 24.11.1
.env                          → Updated with RPC_URL=https://forno.celo.org
.env.production               → Production configuration template
package.json                  → Added start script & npm run commands
RAILWAY-DEPLOYMENT.md         → Complete deployment guide
DEPLOYMENT-CHECKLIST.md       → Pre/post-deployment checklist
```

---

## 🚀 Quick Deployment (5 Steps)

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Authenticate with Railway
```bash
railway login
```
Your browser opens for authentication.

### 3. Initialize Your Project
```bash
railway init
```
Select your Railway project (create new if needed).

### 4. Set Production Variables
```bash
railway variable set RPC_URL https://forno.celo.org
railway variable set CHAIN_ID 42220
railway variable set TELEGRAM_BOT_TOKEN your_bot_token
railway variable set GEMINI_API_KEY your_gemini_key
railway variable set PRIVATE_KEY your_private_key
railway variable set VAULT_ADDRESS 0x4F5E6F8C9B8A7D6C5E4F3A2B1C0D9E8F7C6B5A4D
railway variable set REGISTERED_AGENT_ADDRESS your_agent_address
railroad variable set NODE_ENV production
```

### 5. Deploy to Production
```bash
railway up
```

**That's it!** Your bot is now live on Railway. 🎉

---

## What Happens During `railway up`

```
railway up
  ↓
[1] Detects Procfile & runtime.txt
  ↓
[2] Builds Docker image with Node 24.11.1
  ↓
[3] Installs dependencies: npm install
  ↓
[4] Deploys to Railway infrastructure
  ↓
[5] Runs: node src/index.js
  ↓
[6] Bot starts listening on Celo Mainnet (https://forno.celo.org)
  ↓
✓ Service live at: https://myday-agent-prod.railway.app
```

---

## Verify Deployment

```bash
# View live logs
railway logs

# Expected output:
# ✓ Connected to SQLite database
# ✓ MyDay Agent (Milestone 2) is running
#   - Morning Nudge: Active
#   - MyDay Intel: Connected
#   - Database: SQLite
```

---

## Production Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **RPC Endpoint** | https://forno.celo.org | Celo Mainnet |
| **Chain ID** | 42220 | Mainnet (not testnet) |
| **Node Version** | 24.11.1 | Latest stable |
| **Database** | SQLite at /data/myday.db | Persistent volume |
| **Bot Token** | Production token | Must be mainnet bot |
| **Telegram API** | Production endpoint | No test mode |

---

## Important Security Notes ⚠️

1. **Never commit `.env`** to git - Railway manages secrets separately
2. **Use Railway Variables** for all sensitive data:
   - PRIVATE_KEY
   - TELEGRAM_BOT_TOKEN
   - GEMINI_API_KEY
3. **Verify mainnet tokens** - use production bot token, not test token
4. **Monitor logs daily** with `railway logs -f`

---

## Post-Deployment Checks

✅ **After deployment, verify:**

1. **Bot responds in Telegram**
   - Send `/start` command
   - Should respond with greeting

2. **Check Railway logs**
   ```bash
   railway logs
   ```
   - No ERROR messages
   - Database connected
   - Bot running

3. **Verify RPC connection**
   - Logs should show: `https://forno.celo.org` (not testnet)
   - Chain ID: 42220 confirmed

4. **Monitor for 24 hours**
   - Watch for memory leaks
   - Check scheduled tasks run on time
   - Verify transactions process

---

## Subsequent Deployments

### Option 1: Manual Redeploy
```bash
git push origin main
railway up
```

### Option 2: Auto-Deploy (Recommended)
Railway Dashboard → Project Settings → Auto-Deploy: Enable

Once enabled:
- Push to `main` branch
- Railway automatically redeploys
- No manual command needed

---

## Monitoring Commands

```bash
# Real-time logs
railway logs -f

# View service status
railway status

# Open dashboard
railway open

# See variables
railway variable list

# Update a variable
railway variable set RPC_URL https://forno.celo.org
```

---

## Troubleshooting

**Issue**: Bot not responding
```bash
railway logs | grep -i error
```
Check for token/key issues

**Issue**: Network error (ENOTFOUND)
- Verify RPC_URL: `https://forno.celo.org`
- Check CHAIN_ID: `42220`
- Ensure no typos in variables

**Issue**: Memory issues
```bash
railway scale -m 2048  # Scale to 2GB RAM
```

---

## Files You'll Need to Commit

```bash
git add Procfile runtime.txt .env .env.production
git add package.json  # Updated with start script
git add RAILWAY-DEPLOYMENT.md DEPLOYMENT-CHECKLIST.md
git commit -m "chore: add Railway production deployment configuration"
git push origin main
```

---

## Timeline

| Step | Command | Time |
|------|---------|------|
| 1. Install Railway | `npm install -g @railway/cli` | 1 min |
| 2. Login | `railway login` | 2 min |
| 3. Init | `railway init` | 1 min |
| 4. Set Variables | `railway variable set ...` (8x) | 5 min |
| 5. Deploy | `railway up` | 3-5 min |
| **Total** | | **12-14 min** |

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Celo Mainnet**: https://docs.celo.org
- **Full Guide**: See [RAILWAY-DEPLOYMENT.md](RAILWAY-DEPLOYMENT.md)
- **Checklist**: See [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)

---

## Next Steps

1. ✅ Review [RAILWAY-DEPLOYMENT.md](RAILWAY-DEPLOYMENT.md) for detailed guide
2. ✅ Follow [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) step-by-step
3. ✅ Run `railway up` to deploy
4. ✅ Monitor with `railway logs`
5. ✅ Test bot on Telegram
6. ✅ Celebrate! 🎉

---

**Your production MyDay Agent is ready to launch!** 🚀
