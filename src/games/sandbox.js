/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'sandbox',
  name: 'Sandbox',
  gameCode: 'CUSTOM',
  grid: { rows: 5, cols: 5 }, // Will be dynamically overridden at runtime
  emptySymbolId: -1,
  scatterSymbolId: 99,
  wildSymbolId: 98,
  symbols: {},
  emojis: {},
  colors: {},
  winCategories: {
    BIG_WIN: 20,
    MEGA_WIN: 50,
    HUGE_WIN: 150,
    MAX_WIN: 5000,
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
};
