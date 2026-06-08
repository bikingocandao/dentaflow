const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find the style tag
const startIdx = html.indexOf('<style>');
const endIdx = html.indexOf('</style>');

if (startIdx !== -1 && endIdx !== -1) {
  const css = html.substring(startIdx + 7, endIdx);
  const lines = css.split('\n');
  console.log('Total CSS lines:', lines.length);
  
  // Find lines containing admin, login-panel, panel, etc.
  lines.forEach((line, idx) => {
    if (line.includes('admin') || line.includes('panel') || line.includes('visible') || line.includes('logo')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log('No style tag found!');
}
