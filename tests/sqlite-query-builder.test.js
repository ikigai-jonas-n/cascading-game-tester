import { describe, test, expect } from 'bun:test';
import { buildWhitelistedWhere, sortFieldToOrderBy } from '../src/sqlite-query-builder.js';

const GAME_ID = 'sexy-fruits';

describe('buildWhitelistedWhere — always includes gameId', () => {
  test('no filters -> just the gameId clause', () => {
    const { whereSql, params } = buildWhitelistedWhere([], GAME_ID);
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });

  test('null filters array -> just the gameId clause', () => {
    const { whereSql, params } = buildWhitelistedWhere(null, GAME_ID);
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });
});

describe('buildWhitelistedWhere — usual cases, one whitelisted filter each', () => {
  test('result: win', () => {
    const { whereSql, params } = buildWhitelistedWhere([{ id: 'result', value: 'win' }], GAME_ID);
    expect(whereSql).toBe('gameId = ? AND isWin = ?');
    expect(params).toEqual([GAME_ID, 1]);
  });

  test('result: loss', () => {
    const { params } = buildWhitelistedWhere([{ id: 'result', value: 'loss' }], GAME_ID);
    expect(params).toEqual([GAME_ID, 0]);
  });

  test('bookmarked toggle', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'bookmarked', value: true }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ? AND bookmarked = 1');
    expect(params).toEqual([GAME_ID]);
  });

  test('hasMaxWin / hasGolden / isCheatTriggered toggles', () => {
    const { whereSql } = buildWhitelistedWhere(
      [
        { id: 'hasMaxWin', value: true },
        { id: 'hasGolden', value: true },
        { id: 'isCheatTriggered', value: true },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe(
      'gameId = ? AND hasMaxWin = 1 AND hasGolden = 1 AND isCheatTriggered = 1',
    );
  });

  test('winCondition condition op', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'winCondition', value: { op: '>=', num: '500' } }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ? AND CAST(totalWin AS INTEGER) >= CAST(? AS INTEGER)');
    expect(params).toEqual([GAME_ID, '500']);
  });

  test('betAmount condition op', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'betAmount', value: { op: '<', num: '10' } }],
      GAME_ID,
    );
    expect(whereSql).toContain('CAST(betAmount AS INTEGER) < CAST(? AS INTEGER)');
  });

  test('winTB condition op', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'winTB', value: { op: '==', num: '10' } }],
      GAME_ID,
    );
    expect(whereSql).toContain('CAST(winTB AS INTEGER) = CAST(? AS INTEGER)');
  });

  test('minTumbles / minCascades', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [
        { id: 'minTumbles', value: '3' },
        { id: 'minCascades', value: '2' },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe(
      'gameId = ? AND tumbleCount >= CAST(? AS INTEGER) AND cascadeCount >= CAST(? AS INTEGER)',
    );
    expect(params).toEqual([GAME_ID, 3, 2]);
  });

  test('dateFrom / dateTo', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [
        { id: 'dateFrom', value: '2026-01-01' },
        { id: 'dateTo', value: '2026-01-31' },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ? AND timestamp >= ? AND timestamp <= ?');
    expect(params[1]).toBe(new Date('2026-01-01').getTime());
    const expectedEnd = new Date('2026-01-31');
    expectedEnd.setHours(23, 59, 59, 999);
    expect(params[2]).toBe(expectedEnd.getTime());
  });

  test('spinMode exact match', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'spinMode', value: 'buyBonusGame' }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ? AND spinMode = ?');
    expect(params).toEqual([GAME_ID, 'buyBonusGame']);
  });

  test('spinType hasFree', () => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'spinType', value: 'hasFree' }], GAME_ID);
    expect(whereSql).toBe('gameId = ? AND hasFreeSpin = 1');
  });

  test('spinType hasBase', () => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'spinType', value: 'hasBase' }], GAME_ID);
    expect(whereSql).toBe('gameId = ? AND hasBaseSpin = 1');
  });
});

describe('buildWhitelistedWhere — weird cases', () => {
  test('disabled filter is ignored entirely', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'result', value: 'win', disabled: true }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });

  test.each(['', null, undefined])('value=%p is skipped', (value) => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'spinMode', value }], GAME_ID);
    expect(whereSql).toBe('gameId = ?');
  });

  test('malformed op is skipped (no clause, no param)', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'winCondition', value: { op: '!=', num: '5' } }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });

  test('non-numeric num is skipped for condition filters', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'winCondition', value: { op: '>', num: 'abc' } }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
  });

  test('non-numeric minTumbles is skipped', () => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'minTumbles', value: 'abc' }], GAME_ID);
    expect(whereSql).toBe('gameId = ?');
  });

  test('invalid date string is skipped', () => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'dateFrom', value: 'not-a-date' }], GAME_ID);
    expect(whereSql).toBe('gameId = ?');
  });

  test('spinType with an unrecognized value produces no clause', () => {
    const { whereSql } = buildWhitelistedWhere([{ id: 'spinType', value: 'huh' }], GAME_ID);
    expect(whereSql).toBe('gameId = ?');
  });

  test('unknown filter id is silently skipped', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'madeUpFilter', value: 'x' }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });
});

describe('buildWhitelistedWhere — JS-only filters are NEVER translated', () => {
  test.each(['hasSymbol', 'roundTags', 'choices', 'text', 'winCategory'])(
    '%s produces no WHERE fragment and no extra params',
    (id) => {
      const { whereSql, params } = buildWhitelistedWhere(
        [{ id, value: { pairs: [{ key: 'a', val: '1' }] } }],
        GAME_ID,
      );
      expect(whereSql).toBe('gameId = ?');
      expect(params).toEqual([GAME_ID]);
    },
  );
});

describe('buildWhitelistedWhere — featureMatch: SQL-narrow only the scalar-eligible case', () => {
  test('single scalar pair, scope any -> translated via featureValues EAV clause', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'multiplier', val: '5' }], scope: 'any' } }],
      GAME_ID,
    );
    expect(whereSql).toBe(
      'gameId = ? AND num IN (SELECT spinNum FROM featureValues WHERE (key = ? AND value = ?) ' +
        'GROUP BY spinNum, fieldIndex HAVING COUNT(DISTINCT key) = ?)',
    );
    expect(params).toEqual([GAME_ID, 'multiplier', '5', 1]);
  });

  test('multiple scalar pairs -> ORed key/value checks, HAVING count = pair count', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [
        {
          id: 'featureMatch',
          value: {
            pairs: [
              { key: 'modifier.kind', val: 'multiplier' },
              { key: 'triggerFreeSpin', val: 'true' },
            ],
            scope: 'any',
          },
        },
      ],
      GAME_ID,
    );
    expect(whereSql).toContain(
      '(key = ? AND value = ?) OR (key = ? AND value = ?) GROUP BY spinNum, fieldIndex HAVING COUNT(DISTINCT key) = ?',
    );
    expect(params).toEqual([GAME_ID, 'modifier.kind', 'multiplier', 'triggerFreeSpin', 'true', 2]);
  });

  test('boolean/number scalar targets stringify consistently with the EAV insert side', () => {
    const { params } = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'golden', val: 'true' }], scope: 'any' } }],
      GAME_ID,
    );
    expect(params).toEqual([GAME_ID, 'golden', 'true', 1]);
  });

  test('missing scope defaults to any and is still eligible', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'lives', val: '3' }] } }],
      GAME_ID,
    );
    expect(whereSql).toContain('num IN (SELECT spinNum FROM featureValues');
  });

  test('array-pattern DSL target ("[0-2, 3, *]") -> ineligible, no clause, JS-only fallback', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'nudgeAt', val: '[0,3]' }], scope: 'any' } }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });

  test('undefined-check target ("undefined") -> ineligible, no clause', () => {
    const { whereSql } = buildWhitelistedWhere(
      [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'nudgeAt', val: 'undefined' }], scope: 'any' },
        },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
  });

  test('object-pattern target -> ineligible, no clause', () => {
    const { whereSql } = buildWhitelistedWhere(
      [
        {
          id: 'featureMatch',
          value: { pairs: [{ key: 'modifier', val: '{"kind":"multiplier"}' }], scope: 'any' },
        },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
  });

  test('mixed scalar + non-scalar pairs -> WHOLE filter falls back, never partial translation', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [
        {
          id: 'featureMatch',
          value: {
            pairs: [
              { key: 'multiplier', val: '5' },
              { key: 'nudgeAt', val: '[0,3]' },
            ],
            scope: 'any',
          },
        },
      ],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
    expect(params).toEqual([GAME_ID]);
  });

  test('scope "base" or "free" -> ineligible (featureValues has no per-field isFreeSpin), JS-only fallback', () => {
    const base = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'multiplier', val: '5' }], scope: 'base' } }],
      GAME_ID,
    );
    expect(base.whereSql).toBe('gameId = ?');

    const free = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [{ key: 'multiplier', val: '5' }], scope: 'free' } }],
      GAME_ID,
    );
    expect(free.whereSql).toBe('gameId = ?');
  });

  test('no pairs -> ineligible, no clause', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'featureMatch', value: { pairs: [], scope: 'any' } }],
      GAME_ID,
    );
    expect(whereSql).toBe('gameId = ?');
  });
});

describe('buildWhitelistedWhere — edge cases', () => {
  test('negative numbers work for condition filters', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [{ id: 'winCondition', value: { op: '<', num: '-5' } }],
      GAME_ID,
    );
    expect(whereSql).toContain('CAST(totalWin AS INTEGER) < CAST(? AS INTEGER)');
    expect(params).toEqual([GAME_ID, '-5']);
  });

  test('boundary op: exact equality (==)', () => {
    const { whereSql } = buildWhitelistedWhere(
      [{ id: 'winCondition', value: { op: '==', num: '0' } }],
      GAME_ID,
    );
    expect(whereSql).toContain('= CAST(? AS INTEGER)');
  });

  test('num=0 is not treated as falsy/skipped for minTumbles', () => {
    const { whereSql, params } = buildWhitelistedWhere([{ id: 'minTumbles', value: '0' }], GAME_ID);
    expect(whereSql).toBe('gameId = ? AND tumbleCount >= CAST(? AS INTEGER)');
    expect(params).toEqual([GAME_ID, 0]);
  });

  test('multiple filters AND together in declaration order', () => {
    const { whereSql, params } = buildWhitelistedWhere(
      [
        { id: 'result', value: 'win' },
        { id: 'spinMode', value: 'commonGame' },
        { id: 'minTumbles', value: '3' },
        { id: 'featureMatch', value: { pairs: [{ key: 'nudgeAt', val: '[0,3]' }] } }, // must NOT appear
      ],
      GAME_ID,
    );
    expect(whereSql).toBe(
      'gameId = ? AND isWin = ? AND spinMode = ? AND tumbleCount >= CAST(? AS INTEGER)',
    );
    expect(params).toEqual([GAME_ID, 1, 'commonGame', 3]);
  });

  test('dateTo end-of-day boundary is inclusive at 23:59:59.999', () => {
    const { params } = buildWhitelistedWhere([{ id: 'dateTo', value: '2026-06-15' }], GAME_ID);
    const d = new Date(params[1]);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });
});

describe('sortFieldToOrderBy', () => {
  test('num_desc (default/unknown falls back here too)', () => {
    expect(sortFieldToOrderBy('num_desc')).toEqual({ column: 'num', dir: 'DESC' });
    expect(sortFieldToOrderBy(undefined)).toEqual({ column: 'num', dir: 'DESC' });
    expect(sortFieldToOrderBy('literally anything else')).toEqual({ column: 'num', dir: 'DESC' });
  });

  test('num_asc', () => {
    expect(sortFieldToOrderBy('num_asc')).toEqual({ column: 'num', dir: 'ASC' });
  });

  test('win_desc maps to the indexed totalWin column', () => {
    expect(sortFieldToOrderBy('win_desc')).toEqual({ column: 'totalWin', dir: 'DESC' });
  });

  test('cascade_desc maps to the indexed cascadeCount column', () => {
    expect(sortFieldToOrderBy('cascade_desc')).toEqual({ column: 'cascadeCount', dir: 'DESC' });
  });
});
