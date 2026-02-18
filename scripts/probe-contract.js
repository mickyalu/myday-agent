#!/usr/bin/env node
/**
 * Probe the ERC-8004 registry contract to find the correct function selectors.
 * Tries multiple common function signatures to find what works.
 */
const { ethers } = require('ethers');
require('dotenv').config();

async function probeContract() {
  const rpcUrl = process.env.RPC_URL || 'https://forno.celo.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 42220);
  const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

  // Try many possible getter function signatures
  const getterSignatures = [
    'function agentURI(uint256) view returns (string)',
    'function getAgentURI(uint256) view returns (string)',
    'function tokenURI(uint256) view returns (string)',
    'function uri(uint256) view returns (string)',
    'function getURI(uint256) view returns (string)',
    'function metadata(uint256) view returns (string)',
    'function getMetadata(uint256) view returns (string)',
    'function agentMetadata(uint256) view returns (string)',
    'function getAgent(uint256) view returns (string)',
    'function agents(uint256) view returns (string)',
    // Struct returns
    'function agents(uint256) view returns (tuple(string uri, address wallet))',
    'function getAgent(uint256) view returns (tuple(string uri, address wallet))',
    // ERC-721 style
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
  ];

  console.log(`Probing contract ${REGISTRY} for agent #7...\n`);

  for (const sig of getterSignatures) {
    try {
      const fnName = sig.match(/function (\w+)/)[1];
      const contract = new ethers.Contract(REGISTRY, [sig], provider);
      
      let result;
      if (sig.includes('address')) {
        result = await contract[fnName]('0x2C7CE8dc27283beFD939adC894798A52c03A9AEB');
      } else if (sig.includes('uint256')) {
        result = await contract[fnName](7);
      } else {
        result = await contract[fnName]();
      }
      
      console.log(`✓ ${fnName}: ${typeof result === 'string' ? result.substring(0, 120) : JSON.stringify(result)}`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('missing revert data') || msg.includes('CALL_EXCEPTION')) {
        // Function doesn't exist
      } else if (msg.includes('execution reverted')) {
        console.log(`✗ ${sig.match(/function (\w+)/)[1]}: reverted (exists but failed)`);
      } else {
        console.log(`? ${sig.match(/function (\w+)/)[1]}: ${msg.substring(0, 80)}`);
      }
    }
  }

  // Also try to get the raw storage or call setAgentURI to see function selector
  console.log('\n--- Function selectors we are using ---');
  const iface = new ethers.Interface([
    'function setAgentURI(uint256 agentId, string memory uri)',
    'function agentURI(uint256 agentId) view returns (string)',
  ]);
  console.log(`setAgentURI selector: ${iface.getFunction('setAgentURI').selector}`);
  console.log(`agentURI selector: ${iface.getFunction('agentURI').selector}`);

  // Try reading raw bytecode to find function selectors
  const code = await provider.getCode(REGISTRY);
  console.log(`\nContract bytecode length: ${code.length} chars`);
  
  // Search for common 4-byte selectors in the bytecode
  const knownSelectors = {
    '0x78396cb3': 'agentURI(uint256)',
    '0xce91aede': 'getAgentURI(uint256)',
    '0xc87b56dd': 'tokenURI(uint256)',
    '0x0e89341c': 'uri(uint256)',
    '0x06fdde03': 'name()',
    '0x95d89b41': 'symbol()',
    '0x18160ddd': 'totalSupply()',
    '0x70a08231': 'balanceOf(address)',
    '0x6352211e': 'ownerOf(uint256)',
    '0x6c0360eb': 'baseURI()',
    '0x01ffc9a7': 'supportsInterface(bytes4)',
  };

  console.log('\nSelector scan in bytecode:');
  for (const [sel, name] of Object.entries(knownSelectors)) {
    const selNoPrefix = sel.slice(2);
    if (code.includes(selNoPrefix)) {
      console.log(`  ✓ ${sel} = ${name} FOUND in bytecode`);
    }
  }

  // Try supportsInterface for ERC-8004
  try {
    const erc165 = new ethers.Contract(REGISTRY, [
      'function supportsInterface(bytes4) view returns (bool)',
    ], provider);
    
    // Try common interface IDs
    const interfaces = {
      'ERC-721': '0x80ac58cd',
      'ERC-165': '0x01ffc9a7',
      'ERC-721Metadata': '0x5b5e139f',
    };
    
    for (const [name, id] of Object.entries(interfaces)) {
      try {
        const supported = await erc165.supportsInterface(id);
        console.log(`\n${name} (${id}): ${supported}`);
      } catch(e) {}
    }
  } catch(e) {}

  // Try tokenURI since it's ERC-721 based
  try {
    const c = new ethers.Contract(REGISTRY, ['function tokenURI(uint256) view returns (string)'], provider);
    const uri = await c.tokenURI(7);
    console.log(`\n✓✓✓ tokenURI(7) = ${uri.substring(0, 200)}`);
  } catch(e) {
    console.log(`\ntokenURI(7): ${e.message.substring(0, 120)}`);
  }
}

probeContract();
