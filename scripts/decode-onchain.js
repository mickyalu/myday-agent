#!/usr/bin/env node
/**
 * Decode and display the full on-chain tokenURI(7) content.
 */
const { ethers } = require('ethers');
require('dotenv').config();

async function decode() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);
  const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
  const contract = new ethers.Contract(REGISTRY, ['function tokenURI(uint256) view returns (string)'], provider);

  const uri = await contract.tokenURI(7);
  console.log('=== Raw URI (first 100 chars) ===');
  console.log(uri.substring(0, 100));
  console.log(`Total URI length: ${uri.length}\n`);

  if (uri.startsWith('data:application/json;base64,')) {
    const b64 = uri.replace('data:application/json;base64,', '');
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    
    console.log('=== Decoded On-Chain Manifest ===');
    console.log(JSON.stringify(parsed, null, 2));
    
    console.log('\n=== Key Fields Check ===');
    console.log('name:', parsed.name);
    console.log('endpoints:', JSON.stringify(parsed.endpoints));
    console.log('endpoints isArray:', Array.isArray(parsed.endpoints));
    console.log('services type:', typeof parsed.services);
    console.log('services keys:', parsed.services ? Object.keys(parsed.services) : 'MISSING');
    console.log('supportedTrust:', JSON.stringify(parsed.supportedTrust));
  }
}

decode();
