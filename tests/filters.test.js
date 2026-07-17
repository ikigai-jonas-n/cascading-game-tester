import { describe, test, expect } from 'bun:test';
import { evalFeatureMatchPairs, getAtPath, FILTER_DEFS, applyFilters } from '../src/filters.js';

const findDef = (id) => FILTER_DEFS.find((d) => d.id === id);

describe('getAtPath — dot-path resolution', () => {
  test('resolves a nested path', () => {
    expect(getAtPath({ modifier: { multiplier: 5 } }, 'modifier.multiplier')).toBe(5);
  });

  test('missing intermediate object returns undefined, does not throw', () => {
    expect(() => getAtPath({}, 'modifier.multiplier')).not.toThrow();
    expect(getAtPath({}, 'modifier.multiplier')).toBeUndefined();
    expect(getAtPath(null, 'a.b.c')).toBeUndefined();
    expect(getAtPath(undefined, 'a.b.c')).toBeUndefined();
  });

  test('top-level key with no dots', () => {
    expect(getAtPath({ lives: 3 }, 'lives')).toBe(3);
  });
});

describe('evalFeatureMatchPairs — usual cases', () => {
  test('single exact scalar match', () => {
    const { matched } = evalFeatureMatchPairs({ modifierActivated: true }, [
      { key: 'modifierActivated', val: 'true' },
    ]);
    expect(matched).toBe(true);
  });

  test('multiple pairs are AND-ed — one mismatch fails the whole match', () => {
    const { matched, details } = evalFeatureMatchPairs({ lives: 3, modifierActivated: false }, [
      { key: 'lives', val: '3' },
      { key: 'modifierActivated', val: 'true' },
    ]);
    expect(matched).toBe(false);
    expect(details.find((d) => d.key === 'lives').ok).toBe(true);
    expect(details.find((d) => d.key === 'modifierActivated').ok).toBe(false);
  });

  test('exact array match (JSON-parseable)', () => {
    const { matched } = evalFeatureMatchPairs({ nudgeAt: [0, 3] }, [
      { key: 'nudgeAt', val: '[0,3]' },
    ]);
    expect(matched).toBe(true);
  });
});

describe('evalFeatureMatchPairs — weird cases', () => {
  test('empty pairs array never matches (details.length must be > 0)', () => {
    const { matched, details } = evalFeatureMatchPairs({ anything: true }, []);
    expect(matched).toBe(false);
    expect(details).toEqual([]);
  });

  test('undefined pairs (not even an array) never matches, does not throw', () => {
    expect(() => evalFeatureMatchPairs({ a: 1 }, undefined)).not.toThrow();
    expect(evalFeatureMatchPairs({ a: 1 }, undefined).matched).toBe(false);
  });

  test('explicit "undefined" target matches an actually-absent field', () => {
    const { matched } = evalFeatureMatchPairs({}, [{ key: 'missingKey', val: 'undefined' }]);
    expect(matched).toBe(true);
  });

  test('array length mismatch never matches, even with wildcards', () => {
    const { matched } = evalFeatureMatchPairs({ nudgeAt: [0, 3, 1] }, [
      { key: 'nudgeAt', val: '[*, 3]' },
    ]);
    expect(matched).toBe(false);
  });
});

describe('evalFeatureMatchPairs — array pattern DSL edge cases', () => {
  test('mixed wildcard + range + literal in one pattern', () => {
    const pattern = '[*, 0-2, 3]';
    expect(evalFeatureMatchPairs({ a: [99, 1, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(
      true,
    );
    expect(evalFeatureMatchPairs({ a: [99, 5, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(
      false,
    );
    expect(evalFeatureMatchPairs({ a: [99, 1, 4] }, [{ key: 'a', val: pattern }]).matched).toBe(
      false,
    );
  });

  test('negative-bound range', () => {
    const pattern = '[-5--2, 3]';
    expect(evalFeatureMatchPairs({ a: [-3, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(true);
    expect(evalFeatureMatchPairs({ a: [-5, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(true);
    expect(evalFeatureMatchPairs({ a: [-2, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(true);
    expect(evalFeatureMatchPairs({ a: [-1, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(false);
    expect(evalFeatureMatchPairs({ a: [-6, 3] }, [{ key: 'a', val: pattern }]).matched).toBe(false);
  });

  test('lone negative literal (not a range) still parses as a scalar', () => {
    expect(evalFeatureMatchPairs({ a: [-1, 3] }, [{ key: 'a', val: '[-1, 3]' }]).matched).toBe(
      true,
    );
    expect(evalFeatureMatchPairs({ a: [-2, 3] }, [{ key: 'a', val: '[-1, 3]' }]).matched).toBe(
      false,
    );
  });

  test('whitespace around commas is fully ignored', () => {
    const a = evalFeatureMatchPairs({ a: [1, 3] }, [{ key: 'a', val: '[0-2,3]' }]).matched;
    const b = evalFeatureMatchPairs({ a: [1, 3] }, [{ key: 'a', val: '[0-2, 3]' }]).matched;
    const c = evalFeatureMatchPairs({ a: [1, 3] }, [{ key: 'a', val: '[ 0-2 , 3 ]' }]).matched;
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
  });

  test('empty array pattern only matches an empty actual array', () => {
    expect(evalFeatureMatchPairs({ a: [] }, [{ key: 'a', val: '[]' }]).matched).toBe(true);
  });
});

describe('FILTER_DEFS.winCategory — threshold ties', () => {
  const game = { winCategories: { BIG_WIN: 10, MEGA_WIN: 50, EPIC_WIN: 100 } };

  test('exact threshold value counts as reaching that category (>=), not the one below', () => {
    const def = findDef('winCategory');
    const spinAt50 = { betAmount: '1', totalWin: '50' };
    expect(def.apply(spinAt50, ['MEGA_WIN'], game)).toBe(true);
    expect(def.apply(spinAt50, ['BIG_WIN'], game)).toBe(false);
  });

  test('below every threshold falls into NONE, matching nothing in the selection', () => {
    const def = findDef('winCategory');
    const spinAt5 = { betAmount: '1', totalWin: '5' };
    expect(def.apply(spinAt5, ['BIG_WIN', 'MEGA_WIN', 'EPIC_WIN'], game)).toBe(false);
  });

  test('betAmount of 0 never matches (division-by-zero guard)', () => {
    const def = findDef('winCategory');
    expect(def.apply({ betAmount: '0', totalWin: '50' }, ['MEGA_WIN'], game)).toBe(false);
  });

  test('empty selection always matches (no filter applied)', () => {
    const def = findDef('winCategory');
    expect(def.apply({ betAmount: '1', totalWin: '50' }, [], game)).toBe(true);
  });
});

describe('applyFilters — combining multiple filter types', () => {
  const game = {};
  const spins = [
    { num: 1, isWin: true, spinMode: 'commonGame', totalWin: '100' },
    { num: 2, isWin: false, spinMode: 'commonGame', totalWin: '0' },
    { num: 3, isWin: true, spinMode: 'buyBonusGame', totalWin: '500' },
  ];

  test('AND across two filter types', () => {
    const active = [
      { id: 'result', value: 'win' },
      { id: 'spinMode', value: 'commonGame' },
    ];
    const result = applyFilters(spins, active, game);
    expect(result.map((s) => s.num)).toEqual([1]);
  });

  test('disabled filter is ignored', () => {
    const active = [{ id: 'result', value: 'win', disabled: true }];
    const result = applyFilters(spins, active, game);
    expect(result.map((s) => s.num)).toEqual([1, 2, 3]);
  });

  test('empty activeFilters returns everything unfiltered', () => {
    expect(applyFilters(spins, [], game)).toEqual(spins);
  });
});
