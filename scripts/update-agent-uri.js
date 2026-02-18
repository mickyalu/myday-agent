#!/usr/bin/env node

/**
 * Script to update the MyDay Agent URI on the Celo Identity Registry
 * 
 * This script:
 * 1. Reads the manifest file
 * 2. Base64 encodes it
 * 3. Calls setAgentURI(7, encodedUri) on the Celo Identity Registry
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config();

async function updateAgentURI() {
  try {
    // Validate environment variables
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL;
    const vaultAddress = process.env.VAULT_ADDRESS;
    
    if (!privateKey) {
      console.error('✗ PRIVATE_KEY not found in .env');
      process.exit(1);
    }
    if (!rpcUrl) {
      console.error('✗ RPC_URL not found in .env');
      process.exit(1);
    }
    if (!vaultAddress) {
      console.error('✗ VAULT_ADDRESS not found in .env');
      process.exit(1);
    }
    
    // Read the manifest file
    const manifestPath = path.join(__dirname, '../manifests/myday-agent.json');
    const manifestData = fs.readFileSync(manifestPath, 'utf-8');
    
    // Verify JSON syntax
    try {
      JSON.parse(manifestData);
      console.log('✓ Manifest JSON is valid');
    } catch (jsonError) {
      console.error('✗ JSON Syntax Error:', jsonError.message);
      process.exit(1);
    }
    
    // Use raw GitHub URL as the agentURI — this is what the 8004 scanner fetches.
    // Raw GitHub is more reliable than base64 data URIs (no gas limit issues,
    // always available even if Railway is down).
    const encodedUri = 'https://raw.githubusercontent.com/mickyalu/myday-agent/main/manifests/myday-agent.json';
    console.log('✓ Using raw GitHub URL as agentURI');
    console.log(`  URI: ${encodedUri}`);
    
    // Connect to Celo network and call setAgentURI (with chainId to skip network auto-detection)
    const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 42220;
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const signer = new ethers.Wallet(privateKey, provider);
    
    // Celo Identity Registry contract (simplified ABI with setAgentURI and setAgentWallet)
    const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const CONTRACT_ABI = [
      'function setAgentURI(uint256 agentId, string memory uri) public',
      'function setAgentWallet(uint256 agentId, address wallet) public'
    ];
    
    const contract = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, CONTRACT_ABI, signer);
    
    console.log('\nCalling setAgentURI(7, encodedUri)...');
    const tx = await contract.setAgentURI(7, encodedUri);
    console.log('✓ setAgentURI called');
    console.log(`  Transaction Hash: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log('✓ Transaction confirmed');
    console.log(`  Block: ${receipt.blockNumber}`);

    // Ray Move: Register vault address on-chain for maximum score
    // BYPASSED — setAgentWallet requires additional signature data.
    // Will handle wallet linking via SelfClaw handshake later.
    // console.log(`\nCalling setAgentWallet(7, ${vaultAddress})...`);
    // const tx2 = await contract.setAgentWallet(7, vaultAddress);
    // console.log('✓ setAgentWallet called');
    // console.log(`  Transaction Hash: ${tx2.hash}`);
    //
    // const receipt2 = await tx2.wait();
    // console.log('✓ setAgentWallet confirmed');
    // console.log(`  Block: ${receipt2.blockNumber}`);

    console.log('\n✅ setAgentURI is on-chain. setAgentWallet deferred to SelfClaw handshake.');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateAgentURI();
