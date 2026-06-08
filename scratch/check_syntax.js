const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find the main script tag
// It starts around line 1711: <script src="/socket.io/socket.io.js"></script>\n<script>
// Let's find the script block
const startMarker = '<script src="/socket.io/socket.io.js"></script>\n<script>';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Could not find start marker!');
  process.exit(1);
}

// Find the closing </script> tag after the start index
const scriptContentStart = startIdx + startMarker.length;
const endIdx = html.indexOf('</script>', scriptContentStart);
if (endIdx === -1) {
  console.error('Could not find end marker!');
  process.exit(1);
}

const jsCode = html.substring(scriptContentStart, endIdx);

try {
  // Try to create a Script object which compiles the code
  new vm.Script(jsCode, { filename: 'public/index.html' });
  console.log('✅ JavaScript compiled successfully in vm.Script (No syntax errors)');
} catch (e) {
  console.error('❌ JavaScript Syntax Error found:');
  console.error(e.stack || e.message);
  
  // Print a few lines around the error line if we can get the line number
  if (e.stack) {
    const match = e.stack.match(/:(\d+):(\d+)/);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      const lines = jsCode.split('\n');
      console.log('\nError Context:');
      for (let i = Math.max(0, lineNum - 5); i < Math.min(lines.length, lineNum + 5); i++) {
        console.log(`${i + 1713}: ${lines[i]}`);
      }
    }
  }
}
