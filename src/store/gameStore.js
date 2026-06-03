import { createSignal } from 'solid-js';
import { getActiveGame, setActiveGame as persistGame, listGames } from '../game-registry.js';

const [_game, _setGame] = createSignal(getActiveGame());

export const game = _game;

// FIX: Removed createMemo. Computations outside a root component crash SolidJS.
// Standard arrow functions provide the exact same reactivity without the fatal error.
export const symbols = () => _game().symbols || {};
export const emojis = () => _game().emojis || {};
export const symbolColors = () => _game().colors || {};

export function switchGame(id) {
  persistGame(id);
  _setGame(getActiveGame());
}

export function refreshGame() {
  _setGame(getActiveGame());
}

export { listGames };
