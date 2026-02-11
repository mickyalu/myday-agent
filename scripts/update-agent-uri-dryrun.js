#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  const manifestPath = path.join(__dirname, '../manifests/myday-agent.json');
  const manifestData = fs.readFileSync(manifestPath, 'utf8');

  JSON.parse(manifestData);
  console.log('✓ Manifest JSON is valid');

  const encoded = Buffer.from(manifestData).toString('base64');
  console.log('✓ Manifest base64 encoded');
  console.log(`Encoded length: ${encoded.length}`);

  const hash = crypto.createHash('sha256').update(encoded).digest('hex');
  console.log(`SHA256(Base64): ${hash}`);

  console.log('\nPreview (first 120 chars):');
  console.log(encoded.slice(0, 120));

  console.log('\nPreview (last 120 chars):');
  console.log(encoded.slice(-120));

  console.log('\nDry-run complete. No on-chain transaction was made.');
  process.exit(0);
} catch (err) {
  console.error('Error in dry-run:', err.message);
  process.exit(1);
}
