const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(filePath, 'utf-8');

const regex = /[^\s]*Ã[^\s]*/g;
const matches = content.match(regex) || [];
const unique = [...new Set(matches)];

console.log('Unique corrupted sequences:');
unique.forEach(m => console.log(m));
