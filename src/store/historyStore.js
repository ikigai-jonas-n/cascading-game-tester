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

/** Active filter definitions */
export const [activeFilters, setActiveFilters] = createStore([]);

/** The sorted+filtered view — rebuilt on every filter/sort change */
export const [currentSortedList, setCurrentSortedList] = createSignal([]);

/** Sort preference */
export const [sortField, setSortField] = createSignal(
  localStorage.getItem('sort_field') || 'num_desc',
);

export const MAX_RAM_HISTORY = 10000;

/** Recompute currentSortedList from globalHistory + activeFilters + sortField */
export function rebuildSortedList() {
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

/** Replace history entirely */
export function replaceHistory(spins) {
  setGlobalHistory(reconcile(spins));
}

/** Prepend new spins to the front */
export function prependSpins(newSpins) {
  setGlobalHistory((prev) => {
    const next = [...newSpins, ...prev];
    if (next.length > MAX_RAM_HISTORY) next.length = MAX_RAM_HISTORY;
    return next;
  });
}

/** Mutate a single spin in-place (e.g. bookmark, description) */
export function updateSpin(num, patch) {
  setGlobalHistory(
    (s) => s.num === num,
    patch,
  );
}

/** Remove spins by num set */
export function removeSpins(numsSet) {
  setGlobalHistory((prev) => prev.filter((s) => !numsSet.has(s.num)));
}
