#!/usr/bin/env node
/**
 * Reads back the agentURI from the on-chain registry to verify what the scanner sees.
 */
const { ethers } = require('ethers');
require('dotenv').config();

async function readAgentURI() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);

  const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
  const ABI = [
    'function agentURI(uint256 agentId) view returns (string)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function getAgentURI(uint256 agentId) view returns (string)',
  ];

  const contract = new ethers.Contract(REGISTRY, ABI, provider);

  // Try both function names (different ERC-8004 implementations use different names)
  for (const fn of ['agentURI', 'getAgentURI']) {
    try {
      const uri = await contract[fn](7);
      console.log(`\n=== ${fn}(7) ===`);
      console.log(`URI length: ${uri.length}`);
      console.log(`Starts with: ${uri.substring(0, 80)}...`);

      if (uri.startsWith('data:application/json;base64,')) {
        const b64 = uri.replace('data:application/json;base64,', '');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        console.log(`\nDecoded JSON length: ${decoded.length}`);
        try {
          const parsed = JSON.parse(decoded);
          console.log(`JSON valid: YES`);
          console.log(`name: ${parsed.name}`);
          console.log(`endpoints type: ${typeof parsed.endpoints} / isArray: ${Array.isArray(parsed.endpoints)}`);
          if (parsed.endpoints) {
            console.log(`endpoints: ${JSON.stringify(parsed.endpoints).substring(0, 200)}`);
          }
          console.log(`services type: ${typeof parsed.services}`);
          if (parsed.services) {
            if (Array.isArray(parsed.services)) {
              console.log(`services (array): ${parsed.services.map(s => s.type || s.name).join(', ')}`);
            } else {
              console.log(`services (object keys): ${Object.keys(parsed.services).join(', ')}`);
            }
          }
        } catch (e) {
          console.log(`JSON valid: NO — ${e.message}`);
          console.log(`First 500 chars: ${decoded.substring(0, 500)}`);
        }
      } else if (uri.startsWith('http')) {
        console.log(`Full URL: ${uri}`);
      } else {
        console.log(`Raw (first 300): ${uri.substring(0, 300)}`);
      }
    } catch (e) {
      console.log(`${fn}(7): ${e.message.substring(0, 100)}`);
    }
  }

  // Also check owner
  try {
    const owner = await contract.ownerOf(7);
    console.log(`\nOwner of agent #7: ${owner}`);
  } catch (e) {
    console.log(`ownerOf(7): ${e.message.substring(0, 100)}`);
  }
}

readAgentURI();
