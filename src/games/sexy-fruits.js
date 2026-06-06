/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'sexy-fruits',
  name: 'Sexy Fruits',
  gameCode: 'LGS-008',
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
    SUPER_WIN: 100,
    EPIC_WIN: 150,
    MAX_WIN: 5000,
  },
  hooks: {
    /**
     * SexyFruits win model:
     * - Only fields where features.isSettle === true count as wins.
     * - The payout is coins * cumulativeMultiplier.
     */
    computeFieldWin(field) {
      const isSettle = field.features?.isSettle === true;
      if (!isSettle) return 0;
      const raw = parseFloat(field.coins || 0);
      if (!raw) return 0;
      return parseFloat((raw * (field.features?.cumulativeMultiplier || 1)).toFixed(2));
    },
    /** SexyFruits uses golden[] positions to highlight transformed symbols. */
    goldenEnabled: true,
  },
  isEnabled: true,
  grid: { rows: 5, cols: 5 },
  paytable: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 16, 20, 24, 30, 40, 60, 100, 150, 300, 600, 1200],
    [0, 0, 0, 0, 0, 12, 16, 20, 24, 30, 40, 60, 100, 200, 250, 400],
    [0, 0, 0, 0, 0, 10, 12, 16, 20, 24, 32, 40, 80, 150, 200, 300],
    [0, 0, 0, 0, 0, 10, 12, 16, 20, 24, 32, 40, 80, 150, 200, 300],
    [0, 0, 0, 0, 0, 6, 8, 10, 12, 16, 20, 28, 40, 80, 120, 160],
    [0, 0, 0, 0, 0, 6, 8, 10, 12, 16, 20, 28, 40, 80, 120, 160],
    [0, 0, 0, 0, 0, 4, 6, 8, 10, 12, 16, 20, 24, 40, 60, 100],
    [0, 0, 0, 0, 0, 4, 6, 8, 10, 12, 16, 20, 24, 40, 60, 100],
  ],
  winCap: 100000,
  betBase: 20,
  minClusterSize: 5,
  scatterPayoutCoins: 100,
  anteBetMultiplier: 1.25,
  buyFeatureMultiplier: 100,
  wildSymbolId: 0,
  scatterSymbolId: 9,
  emptySymbolId: 10,
  symbols: {
    0: { name: 'WILD', emoji: '🔥', color: '#ff9800' },
    1: { name: 'HIGH', emoji: '🍉', color: '#ff5252' },
    2: { name: 'HIGH', emoji: '🍇', color: '#7e57c2' },
    3: { name: 'HIGH', emoji: '🍌', color: '#fbc02d' },
    4: { name: 'HIGH', emoji: '🍒', color: '#e91e63' },
    5: { name: 'LOW', emoji: 'A', color: '#26c6da' },
    6: { name: 'LOW', emoji: 'K', color: '#ff8f00' },
    7: { name: 'LOW', emoji: 'Q', color: '#66bb6a' },
    8: { name: 'LOW', emoji: 'J', color: '#bdbdbd' },
    9: { name: 'SCATTER', emoji: '⭐', color: '#ffeb3b' },
    10: { name: 'EMPTY', emoji: '◌', color: '#444' },
  },
};
