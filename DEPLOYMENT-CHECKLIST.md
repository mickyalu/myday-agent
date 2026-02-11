# 🚀 MyDay Agent - Production Deployment Checklist

## Pre-Deployment (Complete Locally)

### Code & Repository
- [ ] All tests passing: `node scripts/smoke-verify.js`
- [ ] Code committed to git: `git status` (clean)
- [ ] Push latest to GitHub: `git push origin main`
- [ ] No sensitive data in git: `git log --grep="PRIVATE_KEY|secret"`

### Configuration Files
- [ ] ✅ `Procfile` created (web: node src/index.js)
- [ ] ✅ `runtime.txt` created (node-24.11.1)
- [ ] ✅ `.env.production` created (reference template)
- [ ] ✅ `package.json` updated with start script
- [ ] ✅ `.env` has RPC_URL=https://forno.celo.org

### Celo Mainnet Setup
- [ ] Register agent on Celo registry
- [ ] Get REGISTERED_AGENT_ADDRESS from registration
- [ ] Verify VAULT_ADDRESS is correct
- [ ] Test agent scripts: `npm run register` (optional, testnet first)

---

## Railway Setup

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```
- [ ] Installation successful: `railway --version`

### Step 2: Authenticate
```bash
railway login
```
- [ ] Browser opened for authentication
- [ ] CLI authenticated and linked

### Step 3: Create Project
```bash
railway init
```
- [ ] Project created/linked
- [ ] `railway.json` file created
- [ ] Project name: `myday-agent-prod` (or your preference)

### Step 4: Set Environment Variables
Set these in Railway dashboard or via CLI:

```bash
railway variable set RPC_URL https://forno.celo.org
railway variable set CHAIN_ID 42220
railway variable set TELEGRAM_BOT_TOKEN your_production_bot_token
railway variable set GEMINI_API_KEY your_production_api_key
railway variable set PRIVATE_KEY your_agent_private_key
railway variable set VAULT_ADDRESS 0x4F5E6F8C9B8A7D6C5E4F3A2B1C0D9E8F7C6B5A4D
railway variable set REGISTERED_AGENT_ADDRESS your_agent_address
railway variable set DB_TYPE sqlite
railway variable set DB_PATH /data/myday.db
railway variable set NODE_ENV production
```

Checklist:
- [ ] RPC_URL set to mainnet (https://forno.celo.org)
- [ ] CHAIN_ID set to 42220
- [ ] TELEGRAM_BOT_TOKEN is production token
- [ ] GEMINI_API_KEY is production key
- [ ] PRIVATE_KEY is set (agent's blockchain key)
- [ ] VAULT_ADDRESS is set
- [ ] REGISTERED_AGENT_ADDRESS is set
- [ ] All 10 variables configured

### Step 5: Deploy
```bash
railway up
```

- [ ] Build started
- [ ] Dependencies installed (npm install)
- [ ] Docker image created
- [ ] Service deployed
- [ ] Logs show: "✓ MyDay Agent (Milestone 2) is running"
- [ ] Service has public URL assigned

---

## Post-Deployment Verification

### Check Health
```bash
railway logs
```
- [ ] No ERROR level logs
- [ ] Bot initialization message present
- [ ] Database connected message

### Test Bot
- [ ] Send /start to bot on Telegram
- [ ] Bot responds with greeting
- [ ] No error messages in Railway logs

### Verify Blockchain Connection
- [ ] Check logs for connection to https://forno.celo.org
- [ ] No "ENOTFOUND" errors
- [ ] JsonRpcProvider connected with chainId 42220

### Monitor for 24 Hours
- [ ] Check logs periodically: `railway logs -f`
- [ ] Monitor for any memory/CPU issues
- [ ] Verify scheduled tasks run (morning nudge, etc.)
- [ ] Test webhook endpoints if applicable

---

## Production Monitoring

### Daily
- [ ] `railway logs` - check for errors
- [ ] Telegram bot responding to messages
- [ ] No database locks or corruption

### Weekly
- [ ] `railway status` - check service health
- [ ] Review error logs for patterns
- [ ] Verify transactions on Celo mainnet

### Monthly
- [ ] Performance review
- [ ] Database optimization (SQLite analyze)
- [ ] Update dependencies if needed

---

## Rollback Plan (If Issues)

```bash
# See recent deployments
railway deployments

# Rollback to previous version
railway rollback <deployment-id>
```

- [ ] Keep note of stable deployment IDs
- [ ] Test rollback procedure (not urgent)

---

## Network Details (Celo Mainnet)

| Component | Value |
|-----------|-------|
| Network | Celo Mainnet |
| RPC Endpoint | https://forno.celo.org |
| Chain ID | 42220 |
| Native Token | CELO |
| Stablecoin | cUSD |
| Block Time | ~5 seconds |
| Finality | ~30 seconds |

---

## Support Resources

- Railway Docs: https://docs.railway.app
- Celo Docs: https://docs.celo.org
- MyDay Agent Guide: See RAILWAY-DEPLOYMENT.md

---

## Critical Variables Reminder

⚠️ **NEVER commit these to git:**
- PRIVATE_KEY
- TELEGRAM_BOT_TOKEN
- GEMINI_API_KEY

✅ **Use Railway's secure environment variable system**

---

**Deployment Status:** [ ] Ready to Deploy

**Deployment Date:** _______________

**Production URL:** _______________

**Notes:**
_________________________________
_________________________________
