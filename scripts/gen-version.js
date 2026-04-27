const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generates a SHA-256 hash for a file.
 */
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively gets all files in a directory.
 */
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * Main function to generate the version hash.
 */
function generateVersion() {
  const ROOT = path.join(__dirname, '..');
  const watchPaths = [
    path.join(ROOT, 'src'),
    path.join(ROOT, 'json_files'),
    path.join(ROOT, 'public/history-parts'),
    path.join(ROOT, 'index.html'),
  ];

  let combinedHashContent = '';

  watchPaths.forEach((p) => {
    if (!fs.existsSync(p)) return;

    if (fs.statSync(p).isDirectory()) {
      const files = getAllFiles(p).sort(); // Sort to ensure consistent combined hash
      files.forEach((f) => {
        combinedHashContent += getFileHash(f);
      });
    } else {
      combinedHashContent += getFileHash(p);
    }
  });

  const finalHash = crypto.createHash('sha256').update(combinedHashContent).digest('hex').substring(0, 16);
  
  console.log(`[gen-version] Generated Hash: ${finalHash}`);

  // Write to public/version.json
  const publicDir = path.join(ROOT, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify({ version: finalHash }, null, 2));

  // Write to src/version.js
  fs.writeFileSync(path.join(ROOT, 'src/version.js'), `export const APP_VERSION = '${finalHash}';\n`);

  console.log('[gen-version] Updated version files.');
}

generateVersion();
