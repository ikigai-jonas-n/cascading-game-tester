import { createSignal } from 'solid-js';
import { getActiveGame, setActiveGame as persistGame, listGames } from '../game-registry.js';

const [_game, _setGame] = createSignal(getActiveGame());

export const game = _game;

// FIX: Removed createMemo. Computations outside a root component crash SolidJS.
// Standard arrow functions provide the exact same reactivity without the fatal error.
export const symbols = () => _game().symbols || {};
/** Derives emoji map from unified symbols for legacy consumers */
export const emojis = () => {
  const s = _game().symbols || {};
  return Object.fromEntries(Object.entries(s).map(([id, v]) => [id, typeof v === 'object' ? v.emoji : v]));
};
/** Derives color map from unified symbols for legacy consumers */
export const symbolColors = () => {
  const s = _game().symbols || {};
  return Object.fromEntries(Object.entries(s).map(([id, v]) => [id, typeof v === 'object' ? v.color : '#666']));
};

export function switchGame(id) {
  persistGame(id);
  _setGame(getActiveGame());
}

export function refreshGame() {
  _setGame(getActiveGame());
}

export { listGames };
