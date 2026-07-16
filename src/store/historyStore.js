/**
 * History Domain Store
 *
 * Owns the spin history list, active filters, and the derived sorted list
 * that the SpinHistory component renders.
 */
import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { applyFilters } from '../filters.js';
import { game } from './gameStore.js';

/** Full in-RAM history for the active game (capped at MAX_RAM_HISTORY) */
export const [globalHistory, setGlobalHistory] = createStore([]);

/** Active filter definitions (persisted across refreshes) */
function loadStoredFilters() {
  try {
    return JSON.parse(localStorage.getItem('active_filters')) || [];
  } catch {
    return [];
  }
}
export const [activeFilters, setActiveFilters] = createStore(loadStoredFilters());

/** The sorted+filtered view — rebuilt on every filter/sort change */
export const [currentSortedList, setCurrentSortedList] = createSignal([]);

/** True count of spins in the DB for the active game */
export const [totalDbCount, setTotalDbCount] = createSignal(0);

/** Sort preference */
export const [sortField, setSortField] = createSignal(
  localStorage.getItem('sort_field') || 'num_desc',
);

export const MAX_RAM_HISTORY = 5000;

/** Key of the oldest spin currently in RAM — used for cursor-based "load more" */
export const [lastLoadedKey, setLastLoadedKey] = createSignal(null);

/** Recompute currentSortedList from globalHistory + activeFilters + sortField */
export function rebuildSortedList() {
  localStorage.setItem('active_filters', JSON.stringify(activeFilters));
  const filtered = applyFilters(globalHistory, activeFilters, game());
  const sorted = [...filtered].sort((a, b) => {
    switch (sortField()) {
      case 'num_asc':
        return a.num - b.num;
      case 'win_desc':
        return (parseFloat(b.totalWin) || 0) - (parseFloat(a.totalWin) || 0);
      case 'cascade_desc':
        return (b.cascadeCount || 0) - (a.cascadeCount || 0);
      default:
        return b.num - a.num;
    }
  });
  setCurrentSortedList(sorted);
  return sorted;
}

// Spins are identified by `num`, not `id` — without this, reconcile()'s default
// key ('id') is undefined on every item, so it can't tell old and new spins apart
// and may patch the wrong object's properties into place.
const RECONCILE_OPTS = { key: 'num' };

/** Replace history entirely */
export function replaceHistory(spins) {
  setGlobalHistory(reconcile(spins, RECONCILE_OPTS));
}

/** Prepend new spins to the front */
export function prependSpins(newSpins) {
  const next = [...newSpins, ...globalHistory];
  if (next.length > MAX_RAM_HISTORY) next.length = MAX_RAM_HISTORY;
  setGlobalHistory(reconcile(next, RECONCILE_OPTS));
}

/** Mutate a single spin in-place (e.g. bookmark, description) */
export function updateSpin(num, patch) {
  setGlobalHistory((s) => s.num === num, patch);
}

/** Remove spins by num set */
export function removeSpins(numsSet) {
  setGlobalHistory((prev) => prev.filter((s) => !numsSet.has(s.num)));
}
