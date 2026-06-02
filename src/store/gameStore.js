/**
 * Game Domain Store
 *
 * Single source of truth for the active game configuration.
 * All symbol maps, grid dimensions, and game metadata live here.
 */
import { createSignal, createMemo } from 'solid-js';
import { getActiveGame, setActiveGame as persistGame, listGames } from '../game-registry.js';

const [_game, _setGame] = createSignal(getActiveGame());

/** Active game config object */
export const game = _game;

/** Derived symbol maps — cheap memos, no duplication */
export const symbols = createMemo(() => _game().symbols || {});
export const emojis = createMemo(() => _game().emojis || {});
export const symbolColors = createMemo(() => _game().colors || {});

/** Switch to a different game and notify all subscribers */
export function switchGame(id) {
  persistGame(id);
  _setGame(getActiveGame());
}

/** Re-read active game (e.g. after custom game save) */
export function refreshGame() {
  _setGame(getActiveGame());
}

export { listGames };
