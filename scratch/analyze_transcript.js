const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logPath = 'C:\\Users\\pc\\.gemini\\antigravity\\brain\\554dfbc0-eb81-4e43-b067-f9539154915d\\.system_generated\\logs\\transcript.jsonl';

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      let content = '';
      let source = '';
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file' && tc.args && tc.args.TargetFile && tc.args.TargetFile.endsWith('index.html')) {
            content = tc.args.CodeContent;
            source = 'write_to_file';
          }
          if (tc.name === 'replace_file_content' && tc.args && tc.args.TargetFile && tc.args.TargetFile.endsWith('index.html')) {
            content = tc.args.ReplacementContent;
            source = 'replace_file_content';
          }
        }
      }
      if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('<!DOCTYPE html>')) {
        content = obj.content;
        source = 'VIEW_FILE';
      }
      if (content) {
        const hasReplacement = content.includes('') || content.includes('\uFFFD') || content.includes('Gestin') || content.includes('Gestin');
        console.log(`Step ${obj.step_index} (${source}): length=${content.length}, hasReplacementChar=${hasReplacement}`);
      }
    } catch (e) {}
  }
}
run();
