/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'captain-jack-fortune',
  gameCode: 'captain-jack-fortune',
  isEnabled: false,
  hooks: {},
  symbols: {
    undefined: { name: 'SCATTER', emoji: '', color: '#666' },
  },
  grid: { rows: 3, cols: 3 },
  paytable: [
    [0, 0, 0, 10],
    [0, 0, 0, 6],
    [0, 0, 0, 4],
    [0, 0, 0, 3],
    [0, 0, 0, 1.4],
    [0, 0, 0, 1],
    [0, 0, 0, 0.6],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 5],
  ],
  winCap: 2500,
  betBase: 1,
};
