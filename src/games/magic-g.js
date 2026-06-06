/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'magic-g',
  name: 'Magic G',
  gameCode: 'LGS-004', // Change if your gameCode is different
  grid: { rows: 5, cols: 6 }, // 30 symbols per field
  emptySymbolId: 11,
  scatterSymbolId: 9,
  wildSymbolId: -1, // Magic G doesn't use a wild, it uses a multiplier
  symbols: {
    0: 'H1 ALADDIN',
    1: 'H2 PRINCESS',
    2: 'H3 SULTAN',
    3: 'H4 MAGICIAN',
    4: 'L1 CROWN',
    5: 'L2 DIAMONDS',
    6: 'L3 CARPET',
    7: 'L4 SWORD',
    8: 'L5 LAMP',
    9: 'SCATTER',
    10: 'MULTIPLIER',
    11: 'EMPTY',
  },
  emojis: {
    0: '🧞', // Aladdin
    1: '👸', // Princess
    2: '👳', // Sultan
    3: '🧙', // Magician
    4: '👑', // Crown
    5: '💎', // Diamonds
    6: 'L3', // Fallback to L3 for Carpet
    7: '🗡️', // Sword
    8: '🪔', // Lamp
    9: '⭐', // Scatter
    10: 'Ⓜ️', // Multiplier
    11: '◌', // Empty
  },
  colors: {
    0: '#ff9800', // Orange
    1: '#e91e63', // Pink
    2: '#ab47bc', // Purple
    3: '#5c6bc0', // Deep Purple
    4: '#fbc02d', // Gold
    5: '#26c6da', // Cyan
    6: '#8d6e63', // Brown
    7: '#78909c', // Blue Grey
    8: '#ffa726', // Light Orange
    9: '#ffeb3b', // Yellow
    10: '#ef5350', // Red
    11: '#444444', // Dark Grey
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
};
