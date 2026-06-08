const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

lines.forEach((line, i) => {
  if (line.includes('Ã')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
