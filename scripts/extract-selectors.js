#!/usr/bin/env node
/**
 * Extract ALL function selectors from the Reputation Registry implementation bytecode.
 * Uses the Solidity compiler's jump table pattern to find all 4-byte selectors.
 */
const { ethers } = require('ethers');
require('dotenv').config();

const IMPL_ADDRESS = '0x16e0fa7f7c56b9a767e34b192b51f921be31da34';

async function extractSelectors() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);

  const code = await provider.getCode(IMPL_ADDRESS);
  console.log(`Implementation bytecode: ${code.length} chars\n`);

  // Solidity compilers create a jump table at the start of the bytecode.
  // Pattern: PUSH4 <selector> EQ PUSH2 <jump_dest> JUMPI
  // In hex: 63 <4bytes> 14 61 <2bytes> 57
  // Or: 63 <4bytes> 81 14 61 <2bytes> 57

  const selectors = new Set();
  const hexCode = code.slice(2).toLowerCase(); // remove 0x prefix

  // Pattern 1: 63{selector}14 (PUSH4 + EQ)
  const pattern1 = /63([0-9a-f]{8})(?:81)?14/g;
  let match;
  while ((match = pattern1.exec(hexCode)) !== null) {
    selectors.add('0x' + match[1]);
  }

  // Pattern 2: Look for PUSH4 opcodes (0x63) followed by 4 bytes
  // This catches more selectors but may have false positives
  const push4Pattern = /63([0-9a-f]{8})/g;
  while ((match = push4Pattern.exec(hexCode)) !== null) {
    // Only include if followed by comparison opcodes (14=EQ, 81=DUP2)
    const afterBytes = hexCode.slice(match.index + 10, match.index + 14);
    if (afterBytes.startsWith('14') || afterBytes.startsWith('8114')) {
      selectors.add('0x' + match[1]);
    }
  }

  console.log(`Found ${selectors.size} unique selectors:\n`);

  // Known selector database (common Solidity functions)
  const knownSelectors = {
    '0x8da5cb5b': 'owner()',
    '0xc4d66de8': 'initialize(address)',
    '0x715018a6': 'renounceOwnership()',
    '0xf2fde38b': 'transferOwnership(address)',
    '0x5c975abb': 'paused()',
    '0x8456cb59': 'pause()',
    '0x3f4ba83a': 'unpause()',
    '0x01ffc9a7': 'supportsInterface(bytes4)',
    '0x49237620': 'submitFeedback(uint256,uint8,string)',
    '0xe7fe5470': 'submitFeedback(uint256,uint8,string) [alt]',
    '0x2a84f72f': 'submitFeedback(uint256,uint8) [no comment]',
    '0x82e501a0': 'addFeedback(uint256,uint8,string)',
    '0x06fdde03': 'name()',
    '0x95d89b41': 'symbol()',
    '0x18160ddd': 'totalSupply()',
    '0x70a08231': 'balanceOf(address)',
    '0x6352211e': 'ownerOf(uint256)',
    '0xc87b56dd': 'tokenURI(uint256)',
    '0x42842e0e': 'safeTransferFrom(address,address,uint256)',
    '0x23b872dd': 'transferFrom(address,address,uint256)',
    '0x095ea7b3': 'approve(address,uint256)',
    '0xe985e9c5': 'isApprovedForAll(address,address)',
    '0xa22cb465': 'setApprovalForAll(address,bool)',
    '0x081812fc': 'getApproved(uint256)',
    '0xb88d4fde': 'safeTransferFrom(address,address,uint256,bytes)',
    '0x4f6ccce7': 'tokenByIndex(uint256)',
    '0x2f745c59': 'tokenOfOwnerByIndex(address,uint256)',
    '0x150b7a02': 'onERC721Received(address,address,uint256,bytes)',
    // Reputation-specific guesses with different parameter orders/types
    '0x3c216972': 'submitRep(uint256,uint256)',
    '0xd5abeb01': 'maxSupply()',
  };

  // Try to look up each selector
  const sorted = [...selectors].sort();
  for (const sel of sorted) {
    const name = knownSelectors[sel] || '??? (unknown)';
    console.log(`  ${sel} → ${name}`);
  }

  // Now let's try brute-force calling each unknown selector with agent #17
  console.log('\n=== Trying to call unknown selectors as view functions ===\n');
  for (const sel of sorted) {
    if (knownSelectors[sel] && !knownSelectors[sel].includes('???')) continue;

    // Try as (uint256) -> uint256
    try {
      const data = sel + ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [17]).slice(2);
      const result = await provider.call({ to: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63', data });
      if (result && result !== '0x') {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result);
        console.log(`  ${sel}(uint256=17) → ${decoded[0].toString()}`);
      }
    } catch (e) {
      // Try as () -> uint256
      try {
        const result = await provider.call({ to: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63', data: sel });
        if (result && result !== '0x') {
          try {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result);
            console.log(`  ${sel}() → ${decoded[0].toString()}`);
          } catch {
            console.log(`  ${sel}() → ${result.slice(0, 66)}...`);
          }
        }
      } catch (e2) {}
    }
  }

  // Try the specific functions that SelfClaw might use
  console.log('\n=== Trying SelfClaw-style function names ===\n');
  const selfClawSigs = [
    // Variations with different param types
    'function submitFeedback(uint256,uint256,string)',
    'function submitFeedback(uint256,uint256)',
    'function submitReview(uint256,uint256,string)',
    'function addScore(uint256,uint256)',
    'function addScore(uint256,uint256,string)', 
    'function setScore(uint256,uint256)',
    'function updateScore(uint256,uint256)',
    'function recordFeedback(uint256,uint256,string)',
    'function recordFeedback(uint256,uint256)',
    'function feedback(uint256,address)',
    'function getReviews(uint256)',
    'function reviewCount(uint256)',
    'function getReviewCount(uint256)',
    'function totalFeedback(uint256)',
    'function agentScores(uint256)',
    'function getAgentInfo(uint256)',
    'function identityRegistry() view returns (address)',
    'function registry() view returns (address)',
  ];

  for (const sig of selfClawSigs) {
    try {
      const iface = new ethers.Interface([sig]);
      const fnName = sig.match(/function (\w+)/)[1];
      const selector = iface.getFunction(fnName).selector;
      
      if (selectors.has(selector)) {
        console.log(`✓ MATCH: ${selector} → ${sig.replace('function ', '')}`);
        
        // Try calling if it's a view function
        if (sig.includes('view') || sig.includes('uint256)')) {
          try {
            const c = new ethers.Contract('0x8004BAa17C55a88189AE136b182e5fdA19dE9b63', [sig + (sig.includes('view') ? '' : ' view returns (uint256)')], provider);
            if (sig.includes('uint256')) {
              const r = await c[fnName](17);
              console.log(`  → ${fnName}(17) = ${r}`);
            } else {
              const r = await c[fnName]();
              console.log(`  → ${fnName}() = ${r}`);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
}

extractSelectors().catch(console.error);
