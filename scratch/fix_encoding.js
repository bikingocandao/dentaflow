const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
const content = fs.readFileSync(filePath, 'binary');
// Interpret binary (latin1) as UTF-8
const fixed = Buffer.from(content, 'binary').toString('utf-8');

fs.writeFileSync(filePath + '.fixed', fixed, 'utf-8');
console.log('Fixed file written to public/index.html.fixed');
