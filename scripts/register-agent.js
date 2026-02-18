#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// ABI for Celo Identity Registry with register(string uri) function
const REGISTRY_ABI = [
  'function register(string uri) external returns (uint256)',
  'function getAgent(address agentAddress) external view returns (tuple(string name, string description, string image, string[] skills, bool active))',
];

async function registerAgent() {
  try {
    // Validate environment variables
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY environment variable is not set');
    }

    if (!process.env.RPC_URL) {
      throw new Error('RPC_URL environment variable is not set');
    }

    // Initialize provider and signer (with chainId to skip network auto-detection)
    const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 42220;
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL, chainId);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log('Registering MyDay Agent with Data URI...');
    console.log('Signer address:', signer.address);
    console.log('Registry address:', REGISTRY_ADDRESS);

    // Read manifest data
    const manifestPath = path.join(__dirname, '../manifests/myday-agent.json');
    const manifestData = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestData);

    console.log('\nAgent details:');
    console.log('- Name:', manifest.name);
    console.log('- Description:', manifest.description);
    console.log('- Image:', manifest.image);
    console.log('- Skills:', (manifest.skills || []).join(', ') || '(none)');

    // Create Base64 Data URI (data:application/json;base64,...)
    const manifestBuffer = Buffer.from(manifestData, 'utf-8');
    const base64Manifest = manifestBuffer.toString('base64');
    const dataUri = `data:application/json;base64,${base64Manifest}`;

    console.log('\nData URI created (first 100 chars):');
    console.log(dataUri.substring(0, 100) + '...');

    // Create contract instance
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);

    // Register the agent with the Data URI
    console.log('\nSending registration transaction...');
    const tx = await registry.register(dataUri);

    console.log('✓ Transaction sent:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    console.log('✓ Transaction confirmed!');
    console.log('Block number:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());

    // Extract the Agent ID from transaction receipt logs or return value
    let agentId = null;
    if (receipt.logs && receipt.logs.length > 0) {
      // The agent ID would typically be in the event logs
      console.log('Transaction logs:', receipt.logs.length);
      // Parse logs if needed - depends on contract events
    }

    console.log('\n✓ Agent registered successfully with Data URI!');
    console.log('Transaction Hash:', tx.hash);
    console.log('Agent Address:', signer.address);

  } catch (error) {
    console.error('Error registering agent:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  }
}

// Run registration
if (require.main === module) {
  registerAgent();
}

module.exports = { registerAgent };
