import { For, Show, createSignal, createMemo, onCleanup } from 'solid-js';
import {
  currentSortedList,
  globalHistory,
  setActiveFilters,
  rebuildSortedList,
} from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { loadSpin } from '../../services/spinService.js';
import { triggerFilterUpdate, loadMoreSpins } from '../../services/gameService.js';
import { lastLoadedKey } from '../../store/historyStore.js';
import SpinCard from './SpinCard.jsx';

const CHUNK = 30;

export default function SpinHistory() {
  const [renderLimit, setRenderLimit] = createSignal(CHUNK);
  let sentinelRef;
  let observer;

  // Expand render limit if active item is past current limit
  const effectiveLimit = createMemo(() => {
    const sorted = currentSortedList();
    const limit = renderLimit();
    const activeIdx = sorted.findIndex((s) => globalHistory.indexOf(s) === currentSpinIndex());
    return activeIdx >= limit ? activeIdx + 5 : limit;
  });

  const visibleSpins = createMemo(() => currentSortedList().slice(0, effectiveLimit()));

  function setupObserver(sentinel) {
    if (observer) observer.disconnect();
    if (!sentinel) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderLimit((prev) => Math.min(prev + CHUNK, currentSortedList().length));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
  }

  onCleanup(() => observer?.disconnect());

  const isEmpty = createMemo(() => currentSortedList().length === 0);
  const hasHistory = createMemo(() => globalHistory.length > 0);

  return (
    <div>
      <Show
        when={!isEmpty()}
        fallback={
          <Show
            when={hasHistory()}
            fallback={
              <p style="color:var(--text-muted); text-align:center; font-size:0.8em; margin-top:40px;">
                No history available
              </p>
            }
          >
            <div style="color:#444; text-align:center; font-size:0.8em; margin-top:40px;">
              <p>No spins match filters</p>
              <button
                id="clearFiltersBtn"
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
        }
      >
        <For each={visibleSpins()}>
          {(spin) => {
            const originalIdx = createMemo(() => globalHistory.indexOf(spin));
            const isActive = createMemo(() => originalIdx() === currentSpinIndex());
            return (
              <SpinCard spin={spin} isActive={isActive()} onClick={() => loadSpin(originalIdx())} />
            );
          }}
        </For>

        {/* Infinite scroll sentinel */}
        <Show when={renderLimit() < currentSortedList().length}>
          <div
            ref={(el) => {
              sentinelRef = el;
              setupObserver(el);
            }}
            style="height:10px;"
            id="scrollSentinel"
          />
        </Show>

        {/* Load older spins from DB */}
        <Show when={lastLoadedKey() != null}>
          <button
            onClick={loadMoreSpins}
            style="width:100%; padding:8px; margin-top:4px; background:var(--surface-2,#2a2a2a); border:1px solid var(--border,#333); color:var(--text-muted,#888); cursor:pointer; font-size:0.75em; border-radius:4px;"
          >
            Load older spins…
          </button>
        </Show>
      </Show>
    </div>
  );
}
