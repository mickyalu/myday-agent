#!/usr/bin/env node
/**
 * Probe the ERC-8004 Reputation Registry contract to find function selectors.
 * Contract: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 on Celo (42220)
 * 
 * We know from competitor data:
 *   - feedbackCount: 33
 *   - avgScore: 88
 *   - lastUpdated: timestamp
 *   - Token ID matches agent ID (e.g., 17 for loopuman)
 */
const { ethers } = require('ethers');
require('dotenv').config();

const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

async function probeReputation() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);

  console.log(`Probing Reputation Registry at ${REPUTATION_REGISTRY}...\n`);

  // Check if contract exists
  const code = await provider.getCode(REPUTATION_REGISTRY);
  console.log(`Contract bytecode: ${code.length} chars`);
  if (code === '0x') {
    console.log('ERROR: No code at this address!');
    return;
  }

  // ── Try ERC-721 / basic info functions ─────────────────────────────────
  const basicSigs = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function owner() view returns (address)',
  ];

  console.log('\n--- Basic contract info ---');
  for (const sig of basicSigs) {
    try {
      const fnName = sig.match(/function (\w+)/)[1];
      const c = new ethers.Contract(REPUTATION_REGISTRY, [sig], provider);
      const result = await c[fnName]();
      console.log(`✓ ${fnName}: ${result}`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('execution reverted')) {
        console.log(`✗ ${sig.match(/function (\w+)/)[1]}: reverted`);
      }
      // else: function doesn't exist, skip silently
    }
  }

  // ── Try reputation read functions on agent #17 (has known data) ────────
  const readSigs = [
    // Feedback/reputation getters
    'function getFeedbackCount(uint256) view returns (uint256)',
    'function feedbackCount(uint256) view returns (uint256)',
    'function getAverageScore(uint256) view returns (uint256)',
    'function averageScore(uint256) view returns (uint256)',
    'function getReputation(uint256) view returns (uint256, uint256, uint256)',
    'function reputation(uint256) view returns (uint256, uint256, uint256)',
    'function getScore(uint256) view returns (uint256)',
    'function score(uint256) view returns (uint256)',
    'function scores(uint256) view returns (uint256)',
    'function feedback(uint256) view returns (uint256)',
    'function getAgentReputation(uint256) view returns (uint256, uint256)',
    'function agentReputation(uint256) view returns (uint256, uint256)',
    'function getAgentScore(uint256) view returns (uint256)',
    'function agentScore(uint256) view returns (uint256)',
    'function getRating(uint256) view returns (uint256)',
    'function rating(uint256) view returns (uint256)',
    // Maybe attestation-based
    'function attestations(uint256) view returns (uint256)',
    'function getAttestationCount(uint256) view returns (uint256)',
    // Struct returns
    'function getReputation(uint256) view returns (tuple(uint256 score, uint256 count, uint256 lastUpdated))',
    'function reputation(uint256) view returns (tuple(uint256 score, uint256 count, uint256 lastUpdated))',
    // Last updated
    'function lastUpdated(uint256) view returns (uint256)',
    'function getLastUpdated(uint256) view returns (uint256)',
  ];

  console.log('\n--- Reputation read functions (querying agent #17) ---');
  for (const sig of readSigs) {
    try {
      const fnName = sig.match(/function (\w+)/)[1];
      const c = new ethers.Contract(REPUTATION_REGISTRY, [sig], provider);
      const result = await c[fnName](17);
      console.log(`✓ ${fnName}(17): ${typeof result === 'bigint' ? result.toString() : JSON.stringify(result)}`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('execution reverted')) {
        console.log(`✗ ${sig.match(/function (\w+)/)[1]}: reverted`);
      }
    }
  }

  // ── Also try our agent #7 ──────────────────────────────────────────────
  console.log('\n--- Check our agent #7 ---');
  const checkSigs = [
    'function getFeedbackCount(uint256) view returns (uint256)',
    'function feedbackCount(uint256) view returns (uint256)',
    'function getAverageScore(uint256) view returns (uint256)',
    'function averageScore(uint256) view returns (uint256)',
    'function getScore(uint256) view returns (uint256)',
  ];
  for (const sig of checkSigs) {
    try {
      const fnName = sig.match(/function (\w+)/)[1];
      const c = new ethers.Contract(REPUTATION_REGISTRY, [sig], provider);
      const result = await c[fnName](7);
      console.log(`✓ ${fnName}(7): ${result.toString()}`);
    } catch (e) {}
  }

  // ── Try write function signatures (just display selectors, don't call) ──
  console.log('\n--- Write function selectors ---');
  const writeSigs = [
    'function submitFeedback(uint256 tokenId, uint8 score, string comment)',
    'function submitFeedback(uint256 tokenId, uint8 score)',
    'function addFeedback(uint256 tokenId, uint8 score, string comment)',
    'function addFeedback(uint256 tokenId, uint8 score)',
    'function rate(uint256 tokenId, uint8 score)',
    'function rate(uint256 tokenId, uint8 score, string comment)',
    'function attest(uint256 tokenId, uint8 score)',
    'function attest(uint256 tokenId, uint8 score, string comment)',
    'function submitReputation(uint256 tokenId, uint8 score)',
    'function submitReputation(uint256 tokenId, uint8 score, string comment)',
    'function addReputation(uint256 tokenId, uint8 score)',
  ];

  for (const sig of writeSigs) {
    try {
      const iface = new ethers.Interface([sig]);
      const fnName = sig.match(/function (\w+)/)[1];
      const selector = iface.getFunction(fnName).selector;
      console.log(`  ${selector} → ${fnName}(${sig.split('(')[1]}`);
    } catch (e) {}
  }

  // ── Search for known selectors in bytecode ─────────────────────────────
  console.log('\n--- Searching bytecode for known selectors ---');
  const selectors = {};
  for (const sig of [...readSigs, ...writeSigs, ...basicSigs]) {
    try {
      const iface = new ethers.Interface([sig]);
      const fnName = sig.match(/function (\w+)/)[1];
      const selector = iface.getFunction(fnName).selector.slice(2); // remove 0x
      if (code.includes(selector)) {
        selectors[selector] = fnName + '(' + sig.split('(').slice(1).join('(');
      }
    } catch (e) {}
  }

  if (Object.keys(selectors).length > 0) {
    console.log('Found selectors in bytecode:');
    for (const [sel, fn] of Object.entries(selectors)) {
      console.log(`  0x${sel} → ${fn}`);
    }
  } else {
    console.log('No known selectors found in bytecode');
  }
}

probeReputation().catch(console.error);
