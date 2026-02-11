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
    
    if (!privateKey) {
      console.error('✗ PRIVATE_KEY not found in .env');
      process.exit(1);
    }
    if (!rpcUrl) {
      console.error('✗ RPC_URL not found in .env');
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
    
    // Base64 encode the manifest
    const base64Manifest = Buffer.from(manifestData).toString('base64');
    console.log('✓ Manifest encoded to Base64');
    console.log(`  Encoded length: ${base64Manifest.length} characters`);
    
    // Create Data URI with correct prefix
    const encodedUri = `data:application/json;base64,${base64Manifest}`;
    console.log('✓ Data URI created with prefix');
    
    // Connect to Celo network and call setAgentURI (with chainId to skip network auto-detection)
    const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 44787;
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    const signer = new ethers.Wallet(privateKey, provider);
    
    // Celo Identity Registry contract (simplified ABI with just setAgentURI)
    const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
    const CONTRACT_ABI = [
      'function setAgentURI(uint256 agentId, string memory uri) public'
    ];
    
    const contract = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, CONTRACT_ABI, signer);
    
    console.log('\nCalling setAgentURI(7, encodedUri)...');
    const tx = await contract.setAgentURI(7, encodedUri);
    console.log('✓ setAgentURI called');
    console.log(`  Transaction Hash: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log('✓ Transaction confirmed');
    console.log(`  Block: ${receipt.blockNumber}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateAgentURI();
