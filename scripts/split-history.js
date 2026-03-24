const fs = require('fs');
const path = require('path');

/**
 * Splits a large history JSON file into smaller parts for efficient loading (e.g. for Cloudflare)
 * Usage: node scripts/split-history.js [inputFile] [outputDir] [entriesPerPart]
 */

const inputFile = process.argv[2] || path.join(__dirname, '../json_files/default_data.json');
const outputDir = process.argv[3] || path.join(__dirname, '../public/history-parts');
const entriesPerPart = parseInt(process.argv[4]) || 5000; // 5k-10k is optimal for balancing HTTP overhead and file size

if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Reading ${inputFile}...`);
const raw = fs.readFileSync(inputFile, 'utf8');
const data = JSON.parse(raw);

if (!data.h || !Array.isArray(data.h)) {
  console.error('JSON must contain a top-level "h" array of history entries.');
  process.exit(1);
}

const history = data.h;
const totalParts = Math.ceil(history.length / entriesPerPart);
console.log(`Splitting ${history.length} entries into ${totalParts} parts...`);

// Clean old parts
const files = fs.readdirSync(outputDir);
for (const file of files) {
  if (file.startsWith('default-history-') && file.endsWith('.json')) {
    fs.unlinkSync(path.join(outputDir, file));
  }
}

for (let part = 1; part <= totalParts; part++) {
  const start = (part - 1) * entriesPerPart;
  const chunk = history.slice(start, start + entriesPerPart);
  
  const output = {
    v: data.v, // version
    f: part === 1 ? data.f : undefined, // filters only in part 1
    o: part === 1 ? data.o : undefined, // order only in part 1
    h: chunk,
    total_parts: totalParts,
    part: part
  };
  
  const outputName = `default-history-${part}.json`;
  fs.writeFileSync(path.join(outputDir, outputName), JSON.stringify(output));
  console.log(`[${part}/${totalParts}] Wrote ${outputName} (${chunk.length} entries)`);
}

console.log('Done.');
