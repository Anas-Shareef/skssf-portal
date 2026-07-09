const fs = require('fs');
const readline = require('readline');

const logPath = "C:\\Users\\user\\.gemini\\antigravity\\brain\\2a30a17c-4f78-4712-8ede-9d3e29bc69fa\\.system_generated\\logs\\transcript_full.jsonl";

const rl = readline.createInterface({
  input: fs.createReadStream(logPath, { encoding: 'utf8' }),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    // Find steps where we wrote files or sent code blocks containing renderScanner
    if (line.includes('renderScanner') && data.type === 'PLANNER_RESPONSE') {
      console.log(`FOUND in PLANNER_RESPONSE at Step: ${data.step_index}`);
      // Find where renderScanner is defined and print the surrounding lines
      const content = JSON.stringify(data);
      const idx = content.indexOf('renderScanner');
      console.log(content.substring(idx - 100, idx + 400));
    }
  } catch (e) {}
});
