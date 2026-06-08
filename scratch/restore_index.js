const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logPath = 'C:\\Users\\pc\\.gemini\\antigravity\\brain\\554dfbc0-eb81-4e43-b067-f9539154915d\\.system_generated\\logs\\transcript.jsonl';
const targetPath = path.join(__dirname, '..', 'public', 'index.html.restored');

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lastIndexHtml = null;
  let stepIndex = -1;
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      // Let's look for VIEW_FILE or write tool calls or responses containing index.html content
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file' && tc.args && tc.args.TargetFile && tc.args.TargetFile.endsWith('index.html')) {
            lastIndexHtml = tc.args.CodeContent;
            stepIndex = obj.step_index;
          }
        }
      }
      if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('<!DOCTYPE html>')) {
        lastIndexHtml = obj.content;
        stepIndex = obj.step_index;
      }
    } catch (e) {}
  }
  if (lastIndexHtml) {
    // Remove line number prefixes if it came from VIEW_FILE output
    let cleaned = lastIndexHtml;
    if (cleaned.includes('1: <!DOCTYPE html>')) {
      cleaned = cleaned.split('\n').map(line => {
        const match = line.match(/^\d+:\s?(.*)$/);
        return match ? match[1] : line;
      }).join('\n');
    }
    fs.writeFileSync(targetPath, cleaned, 'utf-8');
    console.log(`Restored index.html from step ${stepIndex} to public/index.html.restored`);
  } else {
    console.log('No index.html found in transcript');
  }
}
run();
