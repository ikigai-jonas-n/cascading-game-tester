/**
 * @typedef {{
 * id: string,
 * name: string,
 * gameCode: string,
 * grid: { rows?: number, cols?: number },
 * emptySymbolId: number,
 * scatterSymbolId: number,
 * wildSymbolId: number,
 * symbols: Record<number, string>,
 * emojis: Record<number, string>,
 * colors: Record<number, string>,
 * defaultRequestBody: object,
 * playerId: string,
 * winCategories: object,
 * actions?: Array<{id: number, desc: string}>,
 * hooks?: {
 * /**
 * * Returns the effective win coins for a single field to add to accumulatedWin.
 * * Receives the raw field object. Return 0 to skip.
 * * Default: every tumble with coins > 0 contributes its raw coins.
 * * @param {object} field
 * * @returns {number}
 * *
 * computeFieldWin?: (field: object) => number,
 * /**
 * * If true, features.golden[] positions are highlighted on the grid.
 * * Default: false.
 * *
 * goldenEnabled?: boolean,
 * /** * * Intercept and map raw API responses for non-standard engines (Crash/Choice/Go-Ways).
 * * @param {object} data
 * * @returns {object}
 * *
 * extractFields?: (data: object) => object,
 * },
 * components?: {
 * /** Optional: Custom GameBoard UI override (e.g., Crash Graph, Dynamic Megaways Grid) *
 * GameBoard?: import('solid-js').Component<{ frameData: any, phase: string }>,
 * /** Optional: Custom Audit Trail UI override *
 * AuditTrail?: import('solid-js').Component<{ spin: any }>
 * }
 * }} GameConfig
 */

const registry = new Map();

export function register(config) {
  if (config && config.id) {
    registry.set(config.id, config);
  }
}

// --- Auto-import all game configs (Matches both pure data .js and UI component .jsx files) ---
const gameModules = import.meta.glob('./games/*.{js,jsx}', { eager: true });
Object.values(gameModules).forEach((module) => {
  if (module.default) register(module.default);
});

/** @returns {GameConfig[]} */
export function listGames() {
  return [...registry.values()]
    .filter((g) => g.isEnabled !== false)
    .sort((a, b) => {
      const codeA = a.gameCode || '';
      const codeB = b.gameCode || '';
      return codeA.localeCompare(codeB);
    });
}

/** @returns {GameConfig|undefined} */
export function getGame(id) {
  return registry.get(id);
}

const STORAGE_KEY = 'active_game_id';

/** @returns {GameConfig} */
export function getActiveGame() {
  const stored = localStorage.getItem(STORAGE_KEY);
  let active = registry.values().next().value;
  if (stored && registry.has(stored)) {
    active = registry.get(stored);
  }

  return active;
}

/** @param {string} id */
export function setActiveGame(id) {
  if (!registry.has(id)) throw new Error(`Unknown game: ${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}
