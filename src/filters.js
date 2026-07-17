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

// parseFeatureTarget is pure given `val` (a fixed filter-config string, never
// per-row data) but was being re-parsed on every (spin x field x pair) check
// — memoize it since the same handful of `val` strings repeat across an
// entire filtered scan.
const _featureTargetCache = new Map();
export function parseFeatureTargetCached(val) {
  if (_featureTargetCache.has(val)) return _featureTargetCache.get(val);
  const result = parseFeatureTarget(val);
  _featureTargetCache.set(val, result);
  return result;
}

/** Parse a feature-match value string into its real JS type — including arrays/objects (e.g. "[1]") */
function parseFeatureTarget(val) {
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;
  if (val.toLowerCase() === 'undefined' || val === '') return undefined;
  if (!isNaN(val)) return Number(val);
  const trimmed = val.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not plain JSON — try a per-slot pattern instead, e.g. "[0-2, 3, *]"
      // (range | wildcard | literal per element). Falls back to a plain string
      // below if even that doesn't parse cleanly.
      const inner = trimmed.slice(1, -1).trim();
      const tokens = inner === '' ? [] : inner.split(',');
      return { __pattern: tokens.map(parseArrayToken) };
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // not valid JSON — fall through and treat as a plain string
    }
  }
  return val;
}

/** Classify one comma-split array-pattern element: wildcard ("*"), inclusive numeric range ("0-2"), or literal */
function parseArrayToken(token) {
  const trimmed = token.trim();
  if (trimmed === '*') return { __wildcard: true };
  const rangeMatch = trimmed.match(/^(-?\d+)-(-?\d+)$/);
  if (rangeMatch) return { __range: [Number(rangeMatch[1]), Number(rangeMatch[2])] };
  return { __literal: parseFeatureTarget(trimmed) };
}

/** Resolve a dot-path (e.g. "modifier.multiplier") against an object */
export function getAtPath(obj, path) {
  return path
    .split('.')
    .reduce((o, key) => (o === undefined || o === null ? undefined : o[key]), obj);
}

/** Match an array against a per-slot pattern (wildcard / range / literal), same length required */
function matchArrayPattern(actual, patternTokens) {
  if (!Array.isArray(actual) || actual.length !== patternTokens.length) return false;
  return patternTokens.every((tok, i) => {
    const val = actual[i];
    if (tok.__wildcard) return true;
    if (tok.__range) {
      const [min, max] = tok.__range;
      return typeof val === 'number' && val >= min && val <= max;
    }
    return valuesMatch(val, tok.__literal);
  });
}

/** Structural equality — arrays/objects compare by content, everything else by value */
function valuesMatch(actual, target) {
  if (target && typeof target === 'object' && Array.isArray(target.__pattern)) {
    return matchArrayPattern(actual, target.__pattern);
  }
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
 * Returns { matched, details } where details = [{ key, val, target, actual, ok }] for every pair.
 */
export function evalFeatureMatchPairs(features, pairs) {
  const details = (pairs || []).map(({ key, val }) => {
    const target = parseFeatureTargetCached(val);
    const actual = getAtPath(features, key);
    const ok = target === undefined ? actual === undefined : valuesMatch(actual, target);
    return { key, val, target, actual, ok };
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
      const countMatches = (arr) => {
        let n = 0;
        for (const s of arr) if (s === symId) n++;
        return n;
      };
      return spin.fields.some((f) => {
        const initial = f.symbols.initial || f.symbols.final || [];
        if (countMatches(initial) >= minCount) return true;
        return countMatches(f.symbols.final || []) >= minCount;
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
        getSearchText(spin).includes(q) ||
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

/** O(1) lookup by id instead of FILTER_DEFS.find() — built once, reused everywhere. */
export const FILTER_DEFS_MAP = new Map(FILTER_DEFS.map((d) => [d.id, d]));

// The 'text' filter's apply() ran JSON.stringify(spin.fields).toLowerCase()
// fresh on every call, even though a spin's `fields` never change after
// creation and the same spin gets re-checked repeatedly across scroll/re-
// filter passes. Cache the lowercased stringified form per spin object —
// safe since object identity is stable for a spin's lifetime in RAM
// (reconcile() preserves it), invalid the moment `fields` would change,
// which never happens post-creation.
const _searchTextCache = new WeakMap();
function getSearchText(spin) {
  let cached = _searchTextCache.get(spin);
  if (cached === undefined) {
    cached = JSON.stringify(spin.fields).toLowerCase();
    _searchTextCache.set(spin, cached);
  }
  return cached;
}

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
      const def = FILTER_DEFS_MAP.get(af.id);
      if (!def) return true;
      if (af.value === '' || af.value === null || af.value === undefined) return true;
      return def.apply(spin, af.value, gameConfig);
    }),
  );
}
