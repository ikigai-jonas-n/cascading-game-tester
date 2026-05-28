/**
 * Game Registry — plugin system for game configurations.
 * Automatically registers any game dropped into the ./games/ folder using Vite.
 *
 * @typedef {{
 * id: string,
 * name: string,
 * gameCode: string,
 * grid: { rows: number, cols: number },
 * emptySymbolId: number,
 * scatterSymbolId: number,
 * wildSymbolId: number,
 * symbols: Record<number, string>,
 * emojis: Record<number, string>,
 * colors: Record<number, string>,
 * defaultRequestBody: object,
 * playerId: string,
 * }} GameConfig
 */

const registry = new Map();

function register(config) {
  if (config && config.id) {
    registry.set(config.id, config);
  }
}

// --- Auto-import all game configs ---
// Vite will automatically bundle and provide every JS file in the games folder
const gameModules = import.meta.glob('./games/*.js', { eager: true });

Object.values(gameModules).forEach((module) => {
  if (module.default) {
    register(module.default);
  }
});

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
  if (stored && registry.has(stored)) {
    return registry.get(stored);
  }
  // Fallback to the very first game loaded if no local storage value exists
  return registry.values().next().value;
}

/** @param {string} id */
export function setActiveGame(id) {
  if (!registry.has(id)) throw new Error(`Unknown game: ${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}
