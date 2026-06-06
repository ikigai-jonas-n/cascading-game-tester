/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'sexy-fruits',
  name: 'Sexy Fruits',
  gameCode: 'LGS-008',
  symbols: {
    0: 'WILD',
    1: 'WMELON H1',
    2: 'GRAPES H2',
    3: 'BANANA H3',
    4: 'CHERRY H4',
    5: 'ACE A',
    6: 'KING K',
    7: 'QUEEN Q',
    8: 'JACK J',
    9: 'SCATTER',
    10: 'EMPTY',
  },
  emojis: {
    0: '🔥',
    1: '🍉',
    2: '🍇',
    3: '🍌',
    4: '🍒',
    5: 'A',
    6: 'K',
    7: 'Q',
    8: 'J',
    9: '⭐',
    10: '◌',
  },
  colors: {
    0: '#ff9800',
    1: '#ff5252',
    2: '#7e57c2',
    3: '#fbc02d',
    4: '#e91e63',
    5: '#26c6da',
    6: '#ff8f00',
    7: '#66bb6a',
    8: '#bdbdbd',
    9: '#ffeb3b',
    10: '#444',
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
    betBase: 20,
    wildSymbolId: 0,
    scatterSymbolId: 9,
    emptySymbolId: 10
};
