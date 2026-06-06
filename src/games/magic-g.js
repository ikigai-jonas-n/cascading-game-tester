/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'magic-g',
  name: 'Magic G',
  gameCode: 'LGS-004', // Change if your gameCode is different // 30 symbols per field
  wildSymbolId: -1, // Magic G doesn't use a wild, it uses a multiplier
  symbols: {
    0: { name: 'H1 ALADDIN', emoji: '🧞', color: '#ff9800' }, // Orange
    1: { name: 'H2 PRINCESS', emoji: '👸', color: '#e91e63' }, // Pink
    2: { name: 'H3 SULTAN', emoji: '👳', color: '#ab47bc' }, // Purple
    3: { name: 'H4 MAGICIAN', emoji: '🧙', color: '#5c6bc0' }, // Deep Purple
    4: { name: 'L1 CROWN', emoji: '👑', color: '#fbc02d' }, // Gold
    5: { name: 'L2 DIAMONDS', emoji: '💎', color: '#26c6da' }, // Cyan
    6: { name: 'L3 CARPET', emoji: 'L3', color: '#8d6e63' }, // Brown
    7: { name: 'L4 SWORD', emoji: '🗡️', color: '#78909c' }, // Blue Grey
    8: { name: 'L5 LAMP', emoji: '🪔', color: '#ffa726' }, // Light Orange
    9: { name: 'SCATTER', emoji: '⭐', color: '#ffeb3b' }, // Yellow
    10: { name: 'MULTIPLIER', emoji: 'Ⓜ️', color: '#ef5350' }, // Red
    11: { name: 'EMPTY', emoji: '◌', color: '#444444' }, // Dark Grey
  },
  defaultRequestBody: {
    betAmount: 20,
    cashBet: '20',
    currencyDec: 2,
    stakes: [{ type: 'commonGame' }],
    rtpOption: 'RTP_97',
  },
  playerId: 'QARealGameOperator:QARealGameBrand:jonas0n',
  actions: [
    { id: 1, desc: 'FreeSpin / Continue' },
    { id: 2, desc: 'Cash Out' }, // Standardized for future multi-stage games
  ],
  winCategories: {
    BIG_WIN: 20,
    MEGA_WIN: 50,
    HUGE_WIN: 150,
    MAX_WIN: 5000,
  },
  hooks: {
    /**
     * MagicG win model:
     * - Every tumble that has coins contributes to accumulatedWin.
     * - The payout is coins * cumulativeMultiplier (multiplier applies unconditionally).
     * - No isSettle gate.
     */
    computeFieldWin(field) {
      const raw = parseFloat(field.coins || 0);
      if (!raw) return 0;
      return parseFloat((raw * (field.features?.cumulativeMultiplier || 1)).toFixed(2));
    },
    /** MagicG does not use golden[] for visual highlighting. */
    goldenEnabled: false,
  },
  isEnabled: true,
  grid: { rows: 5, cols: 6 },
  paytable: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 200, 500, 1000],
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 200, 500],
    [0, 0, 0, 0, 0, 0, 0, 0, 40, 100, 300],
    [0, 0, 0, 0, 0, 0, 0, 0, 30, 40, 240],
    [0, 0, 0, 0, 0, 0, 0, 0, 20, 30, 200],
    [0, 0, 0, 0, 0, 0, 0, 0, 16, 24, 160],
    [0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 100],
    [0, 0, 0, 0, 0, 0, 0, 0, 8, 18, 80],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 15, 40],
  ],
  winCap: 100000,
  betBase: 20,
  minClusterSize: 8,
  anteBetMultiplier: 1.4,
  scatterSymbolId: 9,
  emptySymbolId: 11,
};
