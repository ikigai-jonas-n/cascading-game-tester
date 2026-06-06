import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';

export default function backendExtractorPlugin() {
  return {
    name: 'backend-extractor',
    buildStart() {
      extractBackendData();
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

function extractBackendData() {
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

  let modifiedCount = 0;

  for (const gameCode of games) {
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

    const paytable = extractValueFromClass(gameConfigClass, 'paytable');
    const screenXSize = extractValueFromClass(gameConfigClass, 'screenXSize');
    const screenYSize = extractValueFromClass(gameConfigClass, 'screenYSize');
    const winCap = extractValueFromClass(gameConfigClass, 'winCap');
    const betBase = extractValueFromClass(gameConfigClass, 'betBase');

    let wildSymbolId, scatterSymbolId, emptySymbolId;
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
                if (category === 'WILD') wildSymbolId = id;
                if (category === 'SCATTER') scatterSymbolId = id;
                if (category === 'EMPTY') emptySymbolId = id;
              }
            }
          }
        }
      }
    }

    // Write directly to frontend JS file
    const jsFilePath = path.join(frontendGamesDir, `${gameCode}.js`);
    let fileWasCreated = false;
    if (!fs.existsSync(jsFilePath)) {
      console.log(
        `[Backend Extractor] Frontend file not found for ${gameCode}, creating new file...`,
      );
      const skeleton = `/** @type {import('../game-registry.js').GameConfig} */
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
          if (paytable) setObjProp(objExpr, 'paytable', JSON.stringify(paytable, null, 2));
          if (winCap !== null && winCap !== undefined)
            setObjProp(objExpr, 'winCap', String(winCap));
          if (betBase !== null && betBase !== undefined)
            setObjProp(objExpr, 'betBase', String(betBase));
          if (wildSymbolId !== undefined) setObjProp(objExpr, 'wildSymbolId', String(wildSymbolId));
          if (scatterSymbolId !== undefined)
            setObjProp(objExpr, 'scatterSymbolId', String(scatterSymbolId));
          if (emptySymbolId !== undefined)
            setObjProp(objExpr, 'emptySymbolId', String(emptySymbolId));

          // Ensure isEnabled exists, but don't overwrite if it does
          setObjProp(objExpr, 'isEnabled', 'false', false);

          jsFile.saveSync();
          modifiedCount++;
          console.log(`[Backend Extractor] Updated ${gameCode}.js via AST.`);
        }
      }
    }
  }

  console.log(`[Backend Extractor] Successfully modified ${modifiedCount} frontend game configs.`);
}
