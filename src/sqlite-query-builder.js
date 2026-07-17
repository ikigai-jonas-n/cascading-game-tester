/**
 * Whitelist-only translator: active filter -> SQL WHERE fragment.
 *
 * Only filters with a fixed 1:1 scalar field on the spin row are ever
 * translated here (see FILTER_DEFS in filters.js for the full list). Anything
 * NOT in this whitelist (featureMatch, hasSymbol, roundTags, choices, text,
 * winCategory) is deliberately skipped — those stay JS-only via
 * FILTER_DEFS[].apply(), which always runs as the final correctness pass
 * regardless of what SQL narrowed down. This file must never grow to cover
 * those — that's exactly the mistake that makes a parallel SQL reimplementation
 * silently diverge from the real filter DSL.
 *
 * Numeric comparisons CAST both sides to INTEGER to exactly mirror
 * evalCondition()'s parseInt-based comparison in filters.js — this keeps SQL
 * and JS agreeing bit-for-bit on condition filters, not just as a safe superset.
 *
 * featureMatch is a partial exception to the "stays JS-only" rule above: when
 * every pair's target is a plain scalar (string/number/boolean — never a DSL
 * pattern, undefined-check, or array/object) AND scope is 'any' (no
 * base/free-spin filtering, which the featureValues side table doesn't track),
 * it gets narrowed via the featureValues EAV table (see sqlite-schema.js).
 * JS's evalFeatureMatchPairs still re-verifies every candidate afterward — SQL
 * only narrows, it never becomes the correctness authority. Any pair that
 * isn't a plain scalar, or a non-'any' scope, makes the WHOLE filter instance
 * fall back to no SQL clause (today's exact behavior) — never a partial/mixed
 * translation.
 */
import { parseFeatureTargetCached } from './filters.js';

const OP_SQL = { '>': '>', '>=': '>=', '<': '<', '<=': '<=', '==': '=' };

function isPlainScalar(v) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * Returns a SQL fragment ("spins.num IN (...)") + its bind params for a
 * SQL-eligible featureMatch filter, or null if any pair/scope makes it
 * ineligible (caller must skip SQL narrowing entirely in that case).
 */
function buildFeatureMatchClause(value) {
  const pairs = value?.pairs || [];
  const scope = value?.scope || 'any';
  if (!pairs.length || scope !== 'any') return null;

  const targets = pairs.map((p) => ({ key: p.key, target: parseFeatureTargetCached(p.val) }));
  if (!targets.every((t) => isPlainScalar(t.target))) return null;

  const orParts = targets.map(() => '(key = ? AND value = ?)').join(' OR ');
  const params = [];
  for (const t of targets) params.push(t.key, String(t.target));

  return {
    sql:
      `num IN (SELECT spinNum FROM featureValues WHERE ${orParts} ` +
      `GROUP BY spinNum, fieldIndex HAVING COUNT(DISTINCT key) = ?)`,
    params: [...params, targets.length],
  };
}

/**
 * @param {Array<{id:string, value:any, disabled?:boolean}>} filters
 * @param {string} gameId
 * @returns {{ whereSql: string, params: any[] }}
 */
export function buildWhitelistedWhere(filters, gameId) {
  const clauses = ['gameId = ?'];
  const params = [gameId];

  for (const af of filters || []) {
    if (af.disabled) continue;
    if (af.value === '' || af.value === null || af.value === undefined) continue;

    switch (af.id) {
      case 'result':
        clauses.push('isWin = ?');
        params.push(af.value === 'win' ? 1 : 0);
        break;
      case 'bookmarked':
        clauses.push('bookmarked = 1');
        break;
      case 'winCondition':
        if (OP_SQL[af.value.op] && !isNaN(af.value.num)) {
          clauses.push(`CAST(totalWin AS INTEGER) ${OP_SQL[af.value.op]} CAST(? AS INTEGER)`);
          params.push(af.value.num);
        }
        break;
      case 'betAmount':
        if (OP_SQL[af.value.op] && !isNaN(af.value.num)) {
          clauses.push(`CAST(betAmount AS INTEGER) ${OP_SQL[af.value.op]} CAST(? AS INTEGER)`);
          params.push(af.value.num);
        }
        break;
      case 'winTB':
        if (OP_SQL[af.value.op] && !isNaN(af.value.num)) {
          clauses.push(`CAST(winTB AS INTEGER) ${OP_SQL[af.value.op]} CAST(? AS INTEGER)`);
          params.push(af.value.num);
        }
        break;
      case 'minTumbles':
        if (!isNaN(parseInt(af.value))) {
          clauses.push('tumbleCount >= CAST(? AS INTEGER)');
          params.push(parseInt(af.value));
        }
        break;
      case 'minCascades':
        if (!isNaN(parseInt(af.value))) {
          clauses.push('cascadeCount >= CAST(? AS INTEGER)');
          params.push(parseInt(af.value));
        }
        break;
      case 'dateFrom': {
        const t = new Date(af.value).getTime();
        if (!isNaN(t)) {
          clauses.push('timestamp >= ?');
          params.push(t);
        }
        break;
      }
      case 'dateTo': {
        const end = new Date(af.value);
        end.setHours(23, 59, 59, 999);
        const t = end.getTime();
        if (!isNaN(t)) {
          clauses.push('timestamp <= ?');
          params.push(t);
        }
        break;
      }
      case 'spinMode':
        clauses.push('spinMode = ?');
        params.push(af.value);
        break;
      case 'spinType':
        if (af.value === 'hasFree') clauses.push('hasFreeSpin = 1');
        else if (af.value === 'hasBase') clauses.push('hasBaseSpin = 1');
        break;
      case 'hasMaxWin':
        clauses.push('hasMaxWin = 1');
        break;
      case 'hasGolden':
        clauses.push('hasGolden = 1');
        break;
      case 'isCheatTriggered':
        clauses.push('isCheatTriggered = 1');
        break;
      case 'featureMatch': {
        const fm = buildFeatureMatchClause(af.value);
        if (fm) {
          clauses.push(fm.sql);
          params.push(...fm.params);
        }
        // Ineligible (DSL/array/object/undefined pair, or scope !== 'any'):
        // no clause added — full JS-only fallback via FILTER_DEFS[].apply().
        break;
      }
      default:
        // hasSymbol, roundTags, choices, text, winCategory — intentionally
        // not translated. Left for FILTER_DEFS[].apply() in JS.
        break;
    }
  }

  return { whereSql: clauses.join(' AND '), params };
}

/**
 * Map a historyStore sortField to the worker's orderBy descriptor. totalWin
 * and cascadeCount are real indexed columns (see sqlite-worker.js schema), so
 * win_desc/cascade_desc get true indexed keyset pagination too — never a
 * full-scan-then-sort in JS.
 */
export function sortFieldToOrderBy(sortField) {
  switch (sortField) {
    case 'num_asc':
      return { column: 'num', dir: 'ASC' };
    case 'win_desc':
      return { column: 'totalWin', dir: 'DESC' };
    case 'cascade_desc':
      return { column: 'cascadeCount', dir: 'DESC' };
    default:
      return { column: 'num', dir: 'DESC' }; // num_desc
  }
}
