#!/usr/bin/env node
/**
 * Deep-probe the ERC-8004 Reputation Registry proxy contract.
 * Reads the EIP-1967 implementation slot to find the real contract,
 * then searches its bytecode for function selectors.
 */
const { ethers } = require('ethers');
require('dotenv').config();

const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

// EIP-1967 implementation slot: bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// EIP-1967 admin slot
const EIP1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
// OpenZeppelin TransparentUpgradeableProxy - fallback implementation
const OZ_IMPL_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

async function deepProbe() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);

  console.log(`Deep-probing proxy at ${REPUTATION_REGISTRY}\n`);

  // Read implementation slot
  const implSlotData = await provider.getStorage(REPUTATION_REGISTRY, EIP1967_IMPL_SLOT);
  console.log('EIP-1967 implementation slot:', implSlotData);
  
  const adminSlotData = await provider.getStorage(REPUTATION_REGISTRY, EIP1967_ADMIN_SLOT);
  console.log('EIP-1967 admin slot:', adminSlotData);

  const ozSlotData = await provider.getStorage(REPUTATION_REGISTRY, OZ_IMPL_SLOT);
  console.log('OZ impl slot:', ozSlotData);

  // Try to extract implementation address
  let implAddress = null;
  for (const [name, data] of [['EIP-1967', implSlotData], ['Admin', adminSlotData], ['OZ', ozSlotData]]) {
    if (data && data !== '0x' + '0'.repeat(64)) {
      const addr = '0x' + data.slice(26); // last 20 bytes
      if (addr !== '0x' + '0'.repeat(40)) {
        console.log(`\n✓ ${name} address: ${addr}`);
        if (name === 'EIP-1967') implAddress = addr;
      }
    }
  }

  // Also check slots 0-5 for simple proxy patterns
  console.log('\n--- Storage slots 0-5 ---');
  for (let i = 0; i < 6; i++) {
    const data = await provider.getStorage(REPUTATION_REGISTRY, i);
    if (data !== '0x' + '0'.repeat(64)) {
      console.log(`  slot[${i}]: ${data}`);
      // Check if it looks like an address (20 bytes)
      const possibleAddr = '0x' + data.slice(26);
      if (possibleAddr !== '0x' + '0'.repeat(40)) {
        console.log(`    → possible address: ${possibleAddr}`);
      }
    }
  }

  // If we found implementation, probe it
  if (implAddress) {
    console.log(`\n=== Probing implementation at ${implAddress} ===\n`);
    const implCode = await provider.getCode(implAddress);
    console.log(`Implementation bytecode: ${implCode.length} chars`);

    // Build comprehensive selector list
    const allSigs = [
      // Read functions
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function owner() view returns (address)',
      'function totalSupply() view returns (uint256)',
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
      'function lastUpdated(uint256) view returns (uint256)',
      'function getLastUpdated(uint256) view returns (uint256)',
      // Write functions
      'function submitFeedback(uint256, uint8, string)',
      'function submitFeedback(uint256, uint8)',
      'function addFeedback(uint256, uint8, string)',
      'function addFeedback(uint256, uint8)',
      'function rate(uint256, uint8)',
      'function rate(uint256, uint8, string)',
      'function attest(uint256, uint8)',
      'function attest(uint256, uint8, string)',
      'function submitReputation(uint256, uint8)',
      'function submitReputation(uint256, uint8, string)',
      'function addReputation(uint256, uint8)',
      // @chaoschain/sdk style
      'function submitReview(uint256, uint8, string)',
      'function review(uint256, uint8, string)',
      'function assess(uint256, uint8)',
      'function assess(uint256, uint8, string)',
      'function evaluate(uint256, uint8)',
      'function evaluate(uint256, uint8, string)',
      // ERC-8004 specific
      'function submitAgentFeedback(uint256, uint8, string)',
      'function agentFeedback(uint256, uint8, string)',
      'function rateAgent(uint256, uint8)',
      'function rateAgent(uint256, uint8, string)',
      // Common admin
      'function initialize()',
      'function initialize(address)',
      'function paused() view returns (bool)',
      // Mappings
      'function feedbacks(uint256, uint256) view returns (uint8, string, address, uint256)',
      'function reviews(uint256, uint256) view returns (uint8, string, address)',
    ];

    console.log('\nSearching for function selectors in implementation bytecode...\n');
    const found = [];
    for (const sig of allSigs) {
      try {
        const iface = new ethers.Interface([sig]);
        const fnName = sig.match(/function (\w+)/)[1];
        const selector = iface.getFunction(fnName).selector.slice(2);
        if (implCode.toLowerCase().includes(selector.toLowerCase())) {
          found.push({ selector: '0x' + selector, sig });
          console.log(`✓ 0x${selector} → ${sig.replace('function ', '')}`);
        }
      } catch (e) {}
    }

    if (found.length === 0) {
      console.log('No known selectors found. Dumping first 200 chars of bytecode for manual analysis:');
      console.log(implCode.slice(0, 200));
    }

    // Try calling found read functions against the PROXY (which delegates to impl)
    if (found.length > 0) {
      console.log('\n=== Calling found read functions via proxy ===\n');
      for (const { sig } of found) {
        if (!sig.includes('view')) continue;
        try {
          const fnName = sig.match(/function (\w+)/)[1];
          const c = new ethers.Contract(REPUTATION_REGISTRY, [sig], provider);
          
          if (sig.includes('uint256')) {
            // Try agent #17 first (known to have data)
            const result17 = await c[fnName](17);
            console.log(`✓ ${fnName}(17): ${typeof result17 === 'bigint' ? result17.toString() : JSON.stringify(result17)}`);
            // Then try our agent #7
            const result7 = await c[fnName](7);
            console.log(`  ${fnName}(7): ${typeof result7 === 'bigint' ? result7.toString() : JSON.stringify(result7)}`);
          } else {
            const result = await c[fnName]();
            console.log(`✓ ${fnName}(): ${result}`);
          }
        } catch (e) {
          const msg = e.message || '';
          if (msg.includes('reverted')) {
            console.log(`✗ ${sig.match(/function (\w+)/)[1]}: reverted`);
          }
        }
      }
    }
  } else {
    console.log('\nNo EIP-1967 implementation found. This might be a minimal proxy (EIP-1167).');
    
    // Check for EIP-1167 minimal proxy pattern
    const proxyCode = await provider.getCode(REPUTATION_REGISTRY);
    console.log('Proxy bytecode:', proxyCode);
    
    // EIP-1167: 363d3d373d3d3d363d73{address}5af43d82803e903d91602b57fd5bf3
    const match1167 = proxyCode.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d/i);
    if (match1167) {
      const cloneTarget = '0x' + match1167[1];
      console.log(`\n✓ EIP-1167 clone detected! Implementation: ${cloneTarget}`);
      implAddress = cloneTarget;
      
      // Probe the clone target
      const targetCode = await provider.getCode(cloneTarget);
      console.log(`Clone implementation bytecode: ${targetCode.length} chars`);
    }
    
    // Also try UUPS pattern
    if (!implAddress) {
      console.log('\nNot EIP-1167. Checking for custom proxy patterns...');
      // Some proxies just delegatecall to an address stored in a specific slot
      // Try reading bytecode for DELEGATECALL opcode (f4) patterns
      if (proxyCode.includes('f4')) {
        console.log('Contains DELEGATECALL opcode — likely a proxy');
      }
    }
  }
}

deepProbe().catch(console.error);
