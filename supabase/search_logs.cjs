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
    if (line.includes('write_to_file') && line.includes('html')) {
      console.log(`Step: ${data.step_index}, Type: ${data.type}`);
    }
  } catch (e) {}
});
