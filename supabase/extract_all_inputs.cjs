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
    if (data.type === 'USER_INPUT' && data.content) {
      console.log(`Step: ${data.step_index}, Length: ${data.content.length}, Starts with: ${data.content.substring(0, 100).replace(/\n/g, ' ')}`);
    }
  } catch (e) {}
});
