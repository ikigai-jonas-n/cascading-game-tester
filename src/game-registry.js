/**
 * Game Registry — plugin system for game configurations.
 *
 * To add a new game, create a file in ./games/<name>.js exporting a GameConfig
 * and register it in GAME_MODULES below. The rest of the app uses getGame() / getActiveGame().
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   gameCode: string,
 *   grid: { rows: number, cols: number },
 *   emptySymbolId: number,
 *   scatterSymbolId: number,
 *   wildSymbolId: number,
 *   symbols: Record<number, string>,
 *   emojis: Record<number, string>,
 *   colors: Record<number, string>,
 *   defaultRequestBody: object,
 *   playerId: string,
 * }} GameConfig
 */

// --- Static imports (add new games here) ---
import sexyFruits from './games/sexy-fruits.js';
import captainJack from './games/captain-jack.js';

const registry = new Map();

function register(config) {
  registry.set(config.id, config);
}

// Register all bundled games
[sexyFruits, captainJack].forEach(register);

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
  return registry.get(stored) || sexyFruits;
}

/** @param {string} id */
export function setActiveGame(id) {
  if (!registry.has(id)) throw new Error(`Unknown game: ${id}`);
  localStorage.setItem(STORAGE_KEY, id);
}
