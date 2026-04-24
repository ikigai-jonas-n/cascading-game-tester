/**
 * Stackable filter engine.
 * Filters are combined with AND logic — a spin must pass ALL active filters.
 *
 * Each filter definition:
 *   { id, label, type, apply(spin, value, gameConfig) => boolean }
 *
 * `type` controls the UI widget:
 *   'toggle'    — on/off chip (instant, no input)
 *   'select'    — inline button picker
 *   'condition' — operator + value combo (for win amount etc.)
 *   'number'    — single number input
 *   'date'      — date picker
 *   'text'      — free text input
 */

/** @typedef {{ id: string, value: any }} ActiveFilter */

/** Operators for condition-type filters */
export const WIN_OPERATORS = [
  { op: '>', label: '>' },
  { op: '>=', label: '>=' },
  { op: '<', label: '<' },
  { op: '<=', label: '<=' },
  { op: '==', label: '=' },
];

function evalCondition(actual, op, target) {
  const a = parseInt(actual);
  const t = parseInt(target);
  if (isNaN(a) || isNaN(t)) return true;
  switch (op) {
    case '>':
      return a > t;
    case '>=':
      return a >= t;
    case '<':
      return a < t;
    case '<=':
      return a <= t;
    case '==':
      return a === t;
    default:
      return true;
  }
}

export const FILTER_DEFS = [
  {
    id: 'result',
    label: 'Result',
    type: 'select',
    options: [
      { label: 'Win', value: 'win' },
      { label: 'Loss', value: 'loss' },
    ],
    apply: (spin, value) => (value === 'win' ? spin.isWin : !spin.isWin),
  },
  {
    id: 'bookmarked',
    label: 'Bookmarked',
    type: 'toggle',
    apply: (spin) => !!spin.bookmarked,
  },
  {
    id: 'winCondition',
    label: 'Win Amount',
    type: 'condition',
    placeholder: 'e.g. 500',
    // value = { op: '>', num: '500' }
    apply: (spin, value) => evalCondition(spin.totalWin, value.op, value.num),
    formatValue: (value) => `${value.op} ${value.num}`,
  },
  {
    id: 'minTumbles',
    label: 'Min Tumbles',
    type: 'number',
    placeholder: 'e.g. 3',
    apply: (spin, value) => spin.tumbleCount >= parseInt(value),
  },
  {
    id: 'minCascades',
    label: 'Min Cascades',
    type: 'number',
    placeholder: 'e.g. 2',
    apply: (spin, value) => (spin.cascadeCount || 0) >= parseInt(value),
  },
  {
    id: 'dateFrom',
    label: 'From Date',
    type: 'date',
    apply: (spin, value) => {
      const spinDate = new Date(spin.timestamp);
      return spinDate >= new Date(value);
    },
  },
  {
    id: 'dateTo',
    label: 'To Date',
    type: 'date',
    apply: (spin, value) => {
      const spinDate = new Date(spin.timestamp);
      const end = new Date(value);
      end.setHours(23, 59, 59, 999);
      return spinDate <= end;
    },
  },
  {
    id: 'hasSymbol',
    label: 'Has Symbol Quantity',
    type: 'symbolCount',
    apply: (spin, value) => {
      // Fallback for older cached single-string 'hasSymbol' values
      const symId = typeof value === 'object' ? parseInt(value.symId) : parseInt(value);
      const minCount = typeof value === 'object' ? parseInt(value.count || 1) : 1;
      return spin.fields.some((f) => {
        const initialCount = f.symbols.initial.filter((s) => s === symId).length;
        const finalCount = f.symbols.final.filter((s) => s === symId).length;
        return initialCount >= minCount || finalCount >= minCount;
      });
    },
    formatValue: (value, game) => {
      const symId = typeof value === 'object' ? value.symId : value;
      const count = typeof value === 'object' ? value.count : 1;
      const emoji = game.emojis[symId] || '';
      const name = game.symbols[symId] || symId;
      return `>= ${count}x ${emoji} ${name}`;
    },
  },
  {
    id: 'gameId',
    label: 'Game',
    type: 'select',
    optionsFromGames: true,
    apply: (spin, value) => spin.gameId === value,
  },
  {
    id: 'betAmount',
    label: 'Bet Amount',
    type: 'condition',
    apply: (spin, value) => evalCondition(spin.betAmount, value.op, value.num),
    formatValue: (value) => `${value.op} ${value.num}`,
  },
  {
    id: 'winTB',
    label: 'Win TB (Ratio)',
    type: 'condition',
    placeholder: 'e.g. 10',
    apply: (spin, value) => {
      const bet = parseFloat(spin.betAmount || 0);
      const win = parseFloat(spin.totalWin || 0);
      const ratio = bet > 0 ? win / bet : 0;
      return evalCondition(ratio, value.op, value.num);
    },
    formatValue: (value) => `${value.op} ${value.num}x`,
  },
  {
    id: 'spinMode',
    label: 'Spin Mode',
    type: 'select',
    options: [
      { label: 'Common', value: 'commonGame' },
      { label: 'Ante Bet', value: 'anteBet' },
      { label: 'Buy Bonus', value: 'buyBonusGame' },
    ],
    apply: (spin, value) => spin.spinMode === value,
  },
  {
    id: 'spinType',
    label: 'Spin Type',
    type: 'select',
    options: [
      { label: 'BaseSpin', value: 'hasBase' },
      { label: 'FreeSpin', value: 'hasFree' },
    ],
    apply: (spin, value) => {
      const hasBase = !!spin.hasBaseSpin || spin.spinType === 'baseSpin' || spin.spinType === 'basic';
      const hasFree = !!spin.hasFreeSpin || spin.spinType === 'freeSpin';
      if (value === 'hasFree') return hasFree;
      if (value === 'hasBase') return hasBase;
      return true;
    },
  },
  {
    id: 'hasMaxWin',
    label: 'Max Win Only',
    type: 'toggle',
    apply: (spin) => !!spin.hasMaxWin,
  },
  {
    id: 'hasGolden',
    label: 'Has Golden',
    type: 'toggle',
    apply: (spin) => !!spin.hasGolden,
  },
  {
    id: 'roundTags',
    label: 'Round Tags',
    type: 'text',
    placeholder: 'e.g. regular',
    apply: (spin, value) => {
      if (!spin.roundTags) return false;
      return spin.roundTags.some(t => t.toLowerCase().includes(value.toLowerCase()));
    },
  },
  {
    id: 'choices',
    label: 'Choices Search',
    type: 'text',
    placeholder: 'Search choices...',
    apply: (spin, value) => {
      if (!spin.choices) return false;
      return JSON.stringify(spin.choices).toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    id: 'text',
    label: 'Search Text',
    type: 'text',
    placeholder: 'Free text search...',
    apply: (spin, value) => {
      const q = value.toLowerCase();
      return (
        spin.num.toString().includes(q) ||
        spin.totalWin.toString().includes(q) ||
        JSON.stringify(spin.fields).toLowerCase().includes(q) ||
        (spin.spinMode && spin.spinMode.toLowerCase().includes(q)) ||
        (spin.roundTags && JSON.stringify(spin.roundTags).toLowerCase().includes(q))
      );
    },
  },
];

/**
 * Apply all active filters to the history array.
 * @param {Array} history
 * @param {ActiveFilter[]} activeFilters
 * @param {import('./game-registry.js').GameConfig} gameConfig
 * @returns {Array}
 */
export function applyFilters(history, activeFilters, gameConfig) {
  if (!activeFilters || activeFilters.length === 0) return history;

  return history.filter((spin) =>
    activeFilters.every((af) => {
      // OpenSearch style: disabled filters are ignored
      if (af.disabled) return true;
      const def = FILTER_DEFS.find((d) => d.id === af.id);
      if (!def) return true;
      if (af.value === '' || af.value === null || af.value === undefined) return true;
      return def.apply(spin, af.value, gameConfig);
    }),
  );
}
