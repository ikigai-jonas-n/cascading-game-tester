import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import prettier from 'prettier';
import crypto from 'crypto';

export default function backendExtractorPlugin() {
  return {
    name: 'backend-extractor',
    async buildStart() {
      await extractBackendData();
    },
  };
}

function evaluateLiteral(node) {
  if (!node) return undefined;
  const kind = node.getKind();
  if (kind === SyntaxKind.NumericLiteral) return Number(node.getText().replace(/_/g, ''));
  if (kind === SyntaxKind.StringLiteral) return node.getLiteralText();
  if (kind === SyntaxKind.TrueKeyword) return true;
  if (kind === SyntaxKind.FalseKeyword) return false;
  if (kind === SyntaxKind.ArrayLiteralExpression) {
    return node.getElements().map(evaluateLiteral);
  }
  if (kind === SyntaxKind.ObjectLiteralExpression) {
    const obj = {};
    node.getProperties().forEach((prop) => {
      if (prop.getKind() === SyntaxKind.PropertyAssignment) {
        const key = prop.getName();
        obj[key] = evaluateLiteral(prop.getInitializer());
      }
    });
    return obj;
  }
  if (
    kind === SyntaxKind.PrefixUnaryExpression &&
    node.getOperatorToken() === SyntaxKind.MinusToken
  ) {
    return -Number(node.getOperand().getText());
  }
  return undefined;
}

function setObjProp(objLiteral, key, valueStr, overwrite = true) {
  if (valueStr === undefined || valueStr === null) return;
  const existing = objLiteral.getProperty(
    (p) => (p.getName && p.getName() === key) || p.getText().startsWith(key + ':'),
  );
  if (existing) {
    if (!overwrite) return; // Do not overwrite if it exists
    existing.remove();
  }
  objLiteral.addPropertyAssignment({ name: key, initializer: valueStr });
}

function extractValueFromClass(classDecl, propName) {
  if (!classDecl) return null;
  // Check property initializers
  const prop = classDecl.getProperty(propName);
  if (prop) {
    const init = prop.getInitializer();
    if (init) return evaluateLiteral(init);
  }
  // Check constructor assignments
  const ctor = classDecl.getConstructors()[0];
  if (ctor) {
    const body = ctor.getBody();
    if (body) {
      const assignments = body.getDescendantsOfKind(SyntaxKind.BinaryExpression);
      for (const expr of assignments) {
        if (expr.getLeft().getText() === `this.${propName}`) {
          return evaluateLiteral(expr.getRight());
        }
      }
    }
  }
  return null;
}

// Games to never auto-generate/overwrite (hand-written plugins). Set in .env as a
// comma-separated list, e.g. DISABLE_AUTO_GENERATE_GAME=olympus,my-other-game
// (brackets/quotes/backticks are tolerated: `[olympus, foo]`, "olympus", etc).
function getDisabledGames() {
  const raw = process.env.DISABLE_AUTO_GENERATE_GAME;
  if (!raw) return new Set();
  return new Set(
    raw
      .replace(/[[\]'"`]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

async function extractBackendData() {
  const repoPath = process.env.SLOT_GAME_SERVER_REPO_PATH;
  if (!repoPath) {
    console.warn('[Backend Extractor] SLOT_GAME_SERVER_REPO_PATH not set in .env. Skipping.');
    return;
  }

  const absRepoPath = path.resolve(repoPath);
  if (!fs.existsSync(absRepoPath)) {
    console.warn(`[Backend Extractor] Not found at ${absRepoPath}. Skipping.`);
    return;
  }

  const gamesDir = path.join(absRepoPath, 'games');
  if (!fs.existsSync(gamesDir)) {
    console.warn(`[Backend Extractor] No 'games' directory at ${gamesDir}.`);
    return;
  }

  console.log('[Backend Extractor] Crawling slot-game-server repo...');
  const games = fs.readdirSync(gamesDir).filter((name) => {
    const p = path.join(gamesDir, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'src'));
  });

  const frontendGamesDir = path.join(process.cwd(), 'src', 'games');
  const project = new Project();
  const frontendProject = new Project({ compilerOptions: { allowJs: true } });

  const disabledGames = getDisabledGames();
  let modifiedCount = 0;

  for (const gameCode of games) {
    if (disabledGames.has(gameCode)) {
      console.log(
        `[Backend Extractor] ⏭️  ${gameCode} -> \x1b[35mSKIPPED\x1b[0m (in DISABLE_AUTO_GENERATE_GAME)`,
      );
      continue;
    }
    const gamePath = path.join(gamesDir, gameCode);
    const configDirs = [
      path.join(gamePath, 'src', 'config'),
      path.join(gamePath, 'src', 'gamelogic', 'config'),
    ];

    let configDir = configDirs.find((d) => fs.existsSync(d));
    if (!configDir) continue;

    const configFilePath = path.join(configDir, 'game-config.ts');
    if (!fs.existsSync(configFilePath)) continue;

    const sourceFile = project.addSourceFileAtPath(configFilePath);
    const gameConfigClass = sourceFile.getClass('GameConfig') || sourceFile.getClasses()[0];

    // Support both naming conventions: 'paytable' (MagicG) and 'payTable' (SexyFruits)
    const paytableRaw =
      extractValueFromClass(gameConfigClass, 'paytable') ??
      extractValueFromClass(gameConfigClass, 'payTable');
    const screenXSize = extractValueFromClass(gameConfigClass, 'screenXSize');
    const screenYSize = extractValueFromClass(gameConfigClass, 'screenYSize');
    // Support both 'winCap' and 'winCapCoins'
    const winCap =
      extractValueFromClass(gameConfigClass, 'winCap') ??
      extractValueFromClass(gameConfigClass, 'winCapCoins');
    const betBase = extractValueFromClass(gameConfigClass, 'betBase');
    const minClusterSize = extractValueFromClass(gameConfigClass, 'minClusterSize');
    const scatterPayoutCoins = extractValueFromClass(gameConfigClass, 'scatterPayoutCoins');
    const anteBetMultiplier = extractValueFromClass(gameConfigClass, 'anteBetMultiplier');
    const buyFeatureMultiplier =
      extractValueFromClass(gameConfigClass, 'buyFeatureMultiplier') ??
      extractValueFromClass(gameConfigClass, 'buyBonusMultiplier');
    // wildIndex/scatterIndex/emptyIndex — fallbacks for games that don't use a symbol enum file
    const wildIndex = extractValueFromClass(gameConfigClass, 'wildIndex');
    const scatterIndex = extractValueFromClass(gameConfigClass, 'scatterIndex');
    const emptyIndex = extractValueFromClass(gameConfigClass, 'emptyIndex');

    let wildSymbolId, scatterSymbolId, emptySymbolId;
    /** id -> category string, e.g. { 0: 'WILD', 1: 'H1_Watermelon', ... } */
    const backendSymbolNames = {};

    // Seed from inline config properties (e.g. SexyFruits uses wildIndex/scatterIndex/emptyIndex)
    if (wildIndex !== null && wildIndex !== undefined) wildSymbolId = wildIndex;
    if (scatterIndex !== null && scatterIndex !== undefined) scatterSymbolId = scatterIndex;
    if (emptyIndex !== null && emptyIndex !== undefined) emptySymbolId = emptyIndex;

    const symbolFiles = fs
      .readdirSync(configDir)
      .filter((f) => f.includes('symbol-enum') || f.includes('game-symbol.ts'));
    if (symbolFiles.length > 0) {
      const symFile = project.addSourceFileAtPath(path.join(configDir, symbolFiles[0]));
      const symbolsVar = symFile.getVariableDeclaration('Symbols');
      if (symbolsVar) {
        const arr = symbolsVar.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
        if (arr) {
          for (const elem of arr.getElements()) {
            if (elem.getKind() === SyntaxKind.NewExpression) {
              const args = elem.getArguments();
              if (args.length >= 2) {
                const id = evaluateLiteral(args[0]);
                const category = args[1].getText().split('.').pop();
                backendSymbolNames[id] = category;
                if (category === 'WILD') wildSymbolId = id;
                if (category === 'SCATTER') scatterSymbolId = id;
                if (category === 'EMPTY') emptySymbolId = id;
              }
            }
          }
        }
      }
    }

    // Determine whether this cartridge utilizes component overrides to set the file extension properly (.jsx vs .js)
    const isJsxGame = gameCode === 'captain-jack-go-ways' || gameCode === 'mr-booms-rocketman';
    const extension = isJsxGame ? 'jsx' : 'js';
    const jsFilePath = path.join(frontendGamesDir, `${gameCode}.${extension}`);

    let fileWasCreated = false;
    if (!fs.existsSync(jsFilePath)) {
      console.log(
        `[Backend Extractor] Frontend file not found for ${gameCode}, creating new file...`,
      );

      // Inject standard SolidJS reactive primitives for component structures
      const imports = isJsxGame ? "import { createMemo, Show, For } from 'solid-js';\n\n" : '';
      const skeleton = `${imports}/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: '${gameCode}',
  gameCode: '${gameCode}',
  isEnabled: false,
  hooks: {},
};
`;
      fs.writeFileSync(jsFilePath, skeleton, 'utf8');
      fileWasCreated = true;
    }

    const jsFile = frontendProject.addSourceFileAtPath(jsFilePath);
    const defaultExport = jsFile.getDefaultExportSymbol();
    if (defaultExport) {
      const decl = defaultExport.getDeclarations()[0];
      if (decl && decl.getKind() === SyntaxKind.ExportAssignment) {
        const objExpr = decl.getExpression();
        if (objExpr.getKind() === SyntaxKind.ObjectLiteralExpression) {
          if (screenXSize && screenYSize) {
            setObjProp(objExpr, 'grid', `{ rows: ${screenYSize}, cols: ${screenXSize} }`);
          }
          if (paytableRaw) {
            // Detect whether this is a compact paytable (SexyFruits-style) or already a full matrix.
            //
            // SexyFruits compact format:
            //   - Row 0 corresponds to symbol ordinal 1 (first non-wild paying symbol)
            //   - Columns start at minClusterSize, not at 0
            //   => We need to:
            //     a) Prepend minClusterSize zeroed columns to each row
            //     b) Shift rows down by 1 (insert empty row 0 for WILD)
            //
            // A full matrix (MagicG-style) already has a row per symbol starting at index 0,
            // with columns starting at 0. We detect by checking if minClusterSize > 0.
            let paytable;
            if (minClusterSize > 0) {
              // Compact: prepend (minClusterSize) zeros to each row, then prepend WILD row
              const padding = Array(minClusterSize).fill(0);
              const expandedRows = paytableRaw.map((row) => [...padding, ...row]);
              // Row 0 in the raw array = symbol ordinal 1 (first H symbol)
              // Insert an all-zero row for symbol 0 (WILD)
              paytable = [
                Array(minClusterSize + (paytableRaw[0]?.length ?? 0)).fill(0),
                ...expandedRows,
              ];
            } else {
              paytable = paytableRaw;
            }
            setObjProp(objExpr, 'paytable', JSON.stringify(paytable, null, 2));
          }
          if (winCap !== null && winCap !== undefined)
            setObjProp(objExpr, 'winCap', String(winCap));
          if (betBase !== null && betBase !== undefined)
            setObjProp(objExpr, 'betBase', String(betBase));
          if (minClusterSize !== null && minClusterSize !== undefined)
            setObjProp(objExpr, 'minClusterSize', String(minClusterSize));
          if (scatterPayoutCoins !== null && scatterPayoutCoins !== undefined)
            setObjProp(objExpr, 'scatterPayoutCoins', String(scatterPayoutCoins));
          if (anteBetMultiplier !== null && anteBetMultiplier !== undefined)
            setObjProp(objExpr, 'anteBetMultiplier', String(anteBetMultiplier));
          if (buyFeatureMultiplier !== null && buyFeatureMultiplier !== undefined)
            setObjProp(objExpr, 'buyFeatureMultiplier', String(buyFeatureMultiplier));

          if (wildSymbolId !== undefined) setObjProp(objExpr, 'wildSymbolId', String(wildSymbolId));
          if (scatterSymbolId !== undefined)
            setObjProp(objExpr, 'scatterSymbolId', String(scatterSymbolId));
          if (emptySymbolId !== undefined)
            setObjProp(objExpr, 'emptySymbolId', String(emptySymbolId));

          // Build/merge unified symbols object
          if (Object.keys(backendSymbolNames).length > 0) {
            // Read any existing frontend symbols to preserve emoji + color
            const existingSymbolsProp = objExpr.getProperty(
              (p) => (p.getName && p.getName() === 'symbols') || p.getText().startsWith('symbols:'),
            );
            const preserved = {}; // id -> { emoji, color }
            if (existingSymbolsProp) {
              try {
                const init = existingSymbolsProp.getInitializer?.();
                if (init && init.getKind() === SyntaxKind.ObjectLiteralExpression) {
                  for (const prop of init.getProperties()) {
                    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
                    const id = prop.getName();
                    const valInit = prop.getInitializer();
                    if (valInit && valInit.getKind() === SyntaxKind.ObjectLiteralExpression) {
                      // Already unified format: { name, emoji, color }
                      const existing = evaluateLiteral(valInit);
                      preserved[id] = {
                        emoji: existing?.emoji || '',
                        color: existing?.color || '',
                      };
                    }
                    // If string format (old) — no emoji/color to preserve
                  }
                }
              } catch (_) {
                /* ignore parse errors */
              }
            }

            // Build the unified symbols object literal string
            const entries = Object.entries(backendSymbolNames)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([id, backendName]) => {
                const p = preserved[id] || {};
                const emoji = p.emoji || '';
                const color = p.color || '#666';
                return `  ${id}: { name: '${backendName}', emoji: '${emoji}', color: '${color}' }`;
              })
              .join(',\n');
            setObjProp(objExpr, 'symbols', `{\n${entries}\n}`);

            // Remove legacy top-level emojis and colors keys if they exist
            for (const legacyKey of ['emojis', 'colors']) {
              const legacyProp = objExpr.getProperty(
                (p) =>
                  (p.getName && p.getName() === legacyKey) ||
                  p.getText().startsWith(legacyKey + ':'),
              );
              if (legacyProp) legacyProp.remove();
            }
          }

          // Ensure isEnabled exists, but don't overwrite if it does
          setObjProp(objExpr, 'isEnabled', 'false', false);

          // Get the AST-modified code as a raw string
          const unformattedCode = jsFile.getFullText();

          // Resolve the project's Prettier config and format the code programmatically
          const prettierConfig = (await prettier.resolveConfig(jsFilePath)) || {};
          const formattedCode = await prettier.format(unformattedCode, {
            ...prettierConfig,
            filepath: jsFilePath,
          });

          // ANSI Color codes for clean and intuitive terminal outputs
          const GREEN = '\x1b[32m';
          const YELLOW = '\x1b[33m';
          const BLUE = '\x1b[34m';
          const RESET = '\x1b[0m';

          if (!fileWasCreated && fs.existsSync(jsFilePath)) {
            const currentContent = fs.readFileSync(jsFilePath, 'utf8');

            const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
            const incomingHash = crypto.createHash('sha256').update(formattedCode).digest('hex');

            if (currentHash === incomingHash) {
              console.log(
                `[Backend Extractor] 🔍 ${gameCode}.${extension} -> ${BLUE}UNCHANGED${RESET} (No relevant changes detected in backend configuration files)`,
              );
            } else {
              fs.writeFileSync(jsFilePath, formattedCode, 'utf8');
              modifiedCount++;
              console.log(
                `[Backend Extractor] ⚡ ${gameCode}.${extension} -> ${YELLOW}MODIFIED${RESET} (Relevant configuration changes extracted and written)`,
              );
            }
          } else {
            fs.writeFileSync(jsFilePath, formattedCode, 'utf8');
            modifiedCount++;
            console.log(
              `[Backend Extractor] ✨ ${gameCode}.${extension} -> ${GREEN}CREATED${RESET} (Fresh configuration generated for new game cartridge)`,
            );
          }

          // Clean up conflicting legacy files if migrating from .js to .jsx
          if (isJsxGame) {
            const legacyJsPath = path.join(frontendGamesDir, `${gameCode}.js`);
            if (fs.existsSync(legacyJsPath)) {
              fs.unlinkSync(legacyJsPath);
            }
          }
        }
      }
    }
  }

  const BOLD = '\x1b[1m';
  const RESET = '\x1b[0m';
  if (modifiedCount > 0) {
    console.log(
      `\n[Backend Extractor] 🚀 ${BOLD}Sync Summary:${RESET} Extracted and synchronized updates for ${modifiedCount} configuration targets.\n`,
    );
  } else {
    console.log(
      `\n[Backend Extractor] ✅ ${BOLD}Sync Summary:${RESET} Everything up to date! Unrelated repo shifts ignored.\n`,
    );
  }
}
