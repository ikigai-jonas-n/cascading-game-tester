import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import { currentSortedList, globalHistory, activeFilters, rebuildSortedList, setActiveFilters } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { loadSpin } from '../../services/spinService.js';
import { triggerFilterUpdate } from '../../services/gameService.js';
import SpinCard from './SpinCard.jsx';

const CHUNK = 30;

export default function SpinHistory() {
  const [renderLimit, setRenderLimit] = createSignal(CHUNK);
  let sentinelRef;
  let observer;

  function setupObserver() {
    if (observer) observer.disconnect();
    if (renderLimit() >= currentSortedList().length) return;

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderLimit((prev) => Math.min(prev + CHUNK, currentSortedList().length));
        }
      },
      { rootMargin: '200px' },
    );
    if (sentinelRef) observer.observe(sentinelRef);
  }

  // Reset renderLimit when the sorted list changes significantly
  const visibleSpins = () => {
    const all = currentSortedList();
    const limit = renderLimit();
    return all.slice(0, Math.max(limit, getActiveSortIndex() + 5));
  };

  function getActiveSortIndex() {
    const sorted = currentSortedList();
    return sorted.findIndex((s) => globalHistory.indexOf(s) === currentSpinIndex());
  }

  onCleanup(() => observer?.disconnect());

  const isEmpty = () => currentSortedList().length === 0;
  const hasHistory = () => globalHistory.length > 0;

  return (
    <div>
      <Show when={!isEmpty()} fallback={
        <Show when={hasHistory()}
          fallback={<p style="color:var(--text-muted); text-align:center; font-size:0.8em; margin-top:40px;">No history available</p>}
        >
          <div style="color:#444; text-align:center; font-size:0.8em; margin-top:40px;">
            <p>No spins match filters</p>
            <button
              style="background:none; border:none; color:var(--accent); cursor:pointer; text-decoration:underline; font-size:1em; margin-top:8px;"
              onClick={async () => {
                setActiveFilters([]);
                localStorage.setItem('active_filters', '[]');
                await triggerFilterUpdate();
              }}
            >
              Clear all filters
            </button>
          </div>
        </Show>
      }>
        <For each={visibleSpins()}>
          {(spin) => {
            const originalIdx = () => globalHistory.indexOf(spin);
            const isActive = () => originalIdx() === currentSpinIndex();
            return (
              <SpinCard
                spin={spin}
                isActive={isActive()}
                onClick={() => { loadSpin(originalIdx()); }}
              />
            );
          }}
        </For>
        <Show when={renderLimit() < currentSortedList().length}>
          <div ref={sentinelRef} style="height:10px;" />
        </Show>
      </Show>
    </div>
  );
}
