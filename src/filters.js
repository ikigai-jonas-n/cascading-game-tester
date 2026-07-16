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

/** Parse a feature-match value string into its real JS type — including arrays/objects (e.g. "[1]") */
function parseFeatureTarget(val) {
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;
  if (val.toLowerCase() === 'undefined' || val === '') return undefined;
  if (!isNaN(val)) return Number(val);
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // not valid JSON — fall through and treat as a plain string
    }
  }
  return val;
}

/** Resolve a dot-path (e.g. "modifier.multiplier") against an object */
export function getAtPath(obj, path) {
  return path
    .split('.')
    .reduce((o, key) => (o === undefined || o === null ? undefined : o[key]), obj);
}

/** Structural equality — arrays/objects compare by content, everything else by value */
function valuesMatch(actual, target) {
  if (actual === target) return true;
  if (
    typeof actual !== 'object' ||
    typeof target !== 'object' ||
    actual === null ||
    target === null
  ) {
    return false;
  }
  return JSON.stringify(actual) === JSON.stringify(target);
}

/**
 * Evaluate a set of { key, val } pairs against one field's `features` object.
 * Returns { matched, details } where details = [{ key, target, actual, ok }] for every pair.
 */
export function evalFeatureMatchPairs(features, pairs) {
  const details = (pairs || []).map(({ key, val }) => {
    const target = parseFeatureTarget(val);
    const actual = getAtPath(features, key);
    const ok = target === undefined ? actual === undefined : valuesMatch(actual, target);
    return { key, target, actual, ok };
  });
  return { matched: details.length > 0 && details.every((d) => d.ok), details };
}

/**
 * Find every field (tumble) in a spin that satisfies a featureMatch filter's pairs,
 * respecting its scope ('any' | 'base' | 'free'). Returns [{ tIdx, details }].
 */
export function findFeatureMatchTumbles(spin, value) {
  const pairs = value?.pairs || [];
  const scope = value?.scope || 'any';
  const hits = [];
  if (!pairs.length || !spin?.fields) return hits;

  for (let i = 0; i < spin.fields.length; i++) {
    const field = spin.fields[i];
    if (!field.features) continue;

    if (scope !== 'any') {
      const isFreeSpin = !!spin.fieldMetadata?.[i]?.isFreeSpin;
      if (scope === 'base' && isFreeSpin) continue;
      if (scope === 'free' && !isFreeSpin) continue;
    }

    const { matched, details } = evalFeatureMatchPairs(field.features, pairs);
    if (matched) hits.push({ tIdx: i, details });
  }
  return hits;
}

/**
 * Aggregate every enabled featureMatch filter's hits for a spin into a Map<tIdx, details[]>,
 * for UI highlighting (which tumble matched, and to what value).
 */
export function getFeatureMatchMap(spin, activeFilters) {
  const map = new Map();
  for (const af of activeFilters || []) {
    if (af.disabled || af.id !== 'featureMatch') continue;
    const hits = findFeatureMatchTumbles(spin, af.value);
    hits.forEach(({ tIdx, details }) => {
      const okDetails = details.filter((d) => d.ok);
      if (!map.has(tIdx)) map.set(tIdx, []);
      map.get(tIdx).push(...okDetails);
    });
  }
  return map;
}

export const FILTER_DEFS = [
  {
    id: 'featureMatch',
    label: 'Feature Match',
    type: 'featureMatch', // Custom UI type we will build in main.js
    // value = { pairs: [{ key, val }, ...], scope: 'any' | 'base' | 'free' }
    // All pairs must match on the SAME field (AND). scope restricts which fields are searched.
    // key supports dot-paths into nested objects, e.g. "modifier.multiplier".
    formatValue: (v) => {
      const pairs = v?.pairs || [];
      if (!pairs.length) return 'Add';
      const scopeLabel = v?.scope === 'base' ? ' [Base]' : v?.scope === 'free' ? ' [Free]' : '';
      return pairs.map((p) => `${p.key}: ${p.val}`).join(' & ') + scopeLabel;
    },
    apply: (spin, value) => findFeatureMatchTumbles(spin, value).length > 0,
  },
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
        const initialCount = (f.symbols.initial || f.symbols.final || []).filter(
          (s) => s === symId,
        ).length;
        const finalCount = (f.symbols.final || []).filter((s) => s === symId).length;
        return initialCount >= minCount || finalCount >= minCount;
      });
    },
    formatValue: (value, game) => {
      const symId = typeof value === 'object' ? value.symId : value;
      const count = typeof value === 'object' ? value.count : 1;
      const entry = game.symbols[symId];
      const emoji = typeof entry === 'object' ? entry.emoji : '';
      const name = typeof entry === 'object' ? entry.name : entry || symId;
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
      const hasBase =
        !!spin.hasBaseSpin || spin.spinType === 'baseSpin' || spin.spinType === 'basic';
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
      return spin.roundTags.some((t) => t.toLowerCase().includes(value.toLowerCase()));
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
  {
    id: 'isCheatTriggered',
    label: 'Cheat Triggered',
    type: 'toggle',
    // Now reads the fast, uncompressed top-level boolean!
    apply: (spin) => spin.isCheatTriggered === true,
  },
  {
    id: 'winCategory',
    label: 'Win Categories',
    type: 'multiselect', // Instructs the UI to build a checkbox group
    apply: (spin, selectedCategories, game) => {
      if (!selectedCategories || selectedCategories.length === 0) return true;

      const bet = parseFloat(spin.betAmount || 0);
      const win = parseFloat(spin.totalWin || 0);
      if (bet <= 0) return false;
      const tb = win / bet;

      const cats = game.winCategories || {};
      const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);

      let spinCategory = 'NONE';
      for (const [catName, threshold] of sortedCats) {
        if (tb >= threshold) {
          spinCategory = catName;
          break;
        }
      }

      // Returns true if the spin's category is included in your checked boxes
      return selectedCategories.includes(spinCategory);
    },
    formatValue: (value) => {
      if (Array.isArray(value)) return value.map((v) => v.replace('_WIN', '')).join(' + ');
      return value;
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
