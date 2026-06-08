const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
const buf = fs.readFileSync(filePath);
let hexStr = buf.toString('hex');

const replacements = [
  // Key 🔑
  { from: 'c383c2b0c385c2b8c3a2e282acc29dc3a2e282ace284a2', to: 'f09f9491' },
  // Building 🏢
  { from: 'c383c2b0c385c2b8c382c28fc382c2a2', to: 'f09f8fa2' },
  // Lock 🔒
  { from: 'c383c2b0c385c2b8c3a2e282acc29dc382c290', to: 'f09f9492' },
  // Red X ❌
  { from: 'c383c2a2c382c29dc385e28099', to: 'e29d8c' },
  // Globe 🌐
  { from: 'c383c2b0c385c2b8c385e28099c382c290', to: 'f09f8c90' },
  // Status dot ●
  { from: 'c383c2a2c3a2e282ace2809dc382c28f', to: 'e2978f' },
  // Double horizontal ═
  { from: 'c383c2a2c3a2e282acc2a2c382c290', to: 'e29590' },
  // Single horizontal ─
  { from: 'c383c2a2c3a2e282acc29dc3a2e2809ac2ac', to: 'e29480' }
];

replacements.forEach(r => {
  hexStr = hexStr.split(r.from).join(r.to);
});

fs.writeFileSync(filePath, Buffer.from(hexStr, 'hex'));
console.log('Successfully completed binary replacements on index.html');
