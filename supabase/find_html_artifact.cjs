const fs = require('fs');
const readline = require('readline');

const logPath = "C:\\Users\\user\\.gemini\\antigravity\\brain\\2a30a17c-4f78-4712-8ede-9d3e29bc69fa\\.system_generated\\logs\\transcript_full.jsonl";
const outPath = "d:/skssf-main/skssf-main/supabase/prototype_actual.html";

const rl = readline.createInterface({
  input: fs.createReadStream(logPath, { encoding: 'utf8' }),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.step_index === 11759) {
      let content = data.content;
      const startTag = "<USER_REQUEST>";
      const endTag = "</USER_REQUEST>";
      
      let htmlContent = content;
      if (content.includes(startTag)) {
        const startIdx = content.indexOf(startTag) + startTag.length;
        const endIdx = content.indexOf(endTag);
        if (endIdx !== -1) {
          htmlContent = content.substring(startIdx, endIdx).trim();
        } else {
          htmlContent = content.substring(startIdx).trim();
        }
      }
      
      fs.writeFileSync(outPath, htmlContent, 'utf8');
      console.log(`Successfully extracted exact prototype HTML from step 11759 to ${outPath}!`);
      rl.close();
      process.exit(0);
    }
  } catch (e) {
    // Ignore JSON errors
  }
});
