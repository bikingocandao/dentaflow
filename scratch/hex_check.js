const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(filePath, 'utf-8');

// Find all matches for Ã and print their hex values
const regex = /[^\s]*Ã[^\s]*/g;
const matches = content.match(regex) || [];
const unique = [...new Set(matches)];

unique.forEach(m => {
  const buf = Buffer.from(m, 'utf-8');
  console.log(`${m} -> ${buf.toString('hex')}`);
});
