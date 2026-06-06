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
 *   /**
 *    * Returns the effective win coins for a single field to add to accumulatedWin.
 *    * Receives the raw field object. Return 0 to skip.
 *    * Default: every tumble with coins > 0 contributes its raw coins.
 *    * @param {object} field
 *    * @returns {number}
 *    *
 *   computeFieldWin?: (field: object) => number,
 *   /**
 *    * If true, features.golden[] positions are highlighted on the grid.
 *    * Default: false.
 *    *
 *   goldenEnabled?: boolean,
 * }
 * }} GameConfig
 */

const registry = new Map();

export function register(config) {
  if (config && config.id) {
    registry.set(config.id, config);
  }
}

// --- Auto-import all game configs ---
const gameModules = import.meta.glob('./games/*.js', { eager: true });
Object.values(gameModules).forEach((module) => {
  if (module.default) register(module.default);
});

// --- Hydrate Backend Data ---
let backendData = {};
import('./games/backend-extracted-data.json')
  .then((module) => {
    backendData = module.default || module;
  })
  .catch(() => console.warn('backend-extracted-data.json not found. Run the extraction script.'));

// --- Hydrate Custom Games from LocalStorage ---
export function loadCustomGames() {
  try {
    const custom = JSON.parse(localStorage.getItem('custom_games') || '[]');
    custom.forEach(register);
  } catch (e) {
    console.error('Failed to load custom games', e);
  }
}
loadCustomGames();

export function saveCustomGame(config) {
  if (!config || !config.id) throw new Error("Config must have an 'id'");
  register(config);
  try {
    const custom = JSON.parse(localStorage.getItem('custom_games') || '[]');
    const existingIdx = custom.findIndex((g) => g.id === config.id);
    if (existingIdx >= 0) custom[existingIdx] = config;
    else custom.push(config);
    localStorage.setItem('custom_games', JSON.stringify(custom));
  } catch (e) {
    console.error('Failed to save custom game', e);
  }
}

/** @returns {GameConfig[]} */
export function listGames() {
  return [...registry.values()];
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

  // Attach the raw backend configs to the active game object at runtime
  if (backendData[active.id]) {
    active.rawBackendConfig = backendData[active.id].rawConfig;
  }

  return active;
}

/** @param {string} id */
export function setActiveGame(id) {
  if (!registry.has(id)) throw new Error(`Unknown game: ${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}
