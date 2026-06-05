import { For, Show, createSignal, createMemo, onCleanup, createEffect } from 'solid-js';
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

  const [windowStart, setWindowStart] = createSignal(0);
  const [windowEnd, setWindowEnd] = createSignal(CHUNK);
  let topSentinelRef, bottomSentinelRef;
  let topObserver, bottomObserver;
  const ESTIMATED_ROW_HEIGHT = 68; // approx collapsed height

  // Jump to active index if it goes outside our window
  createEffect(() => {
    const sorted = currentSortedList();
    const activeIdx = sorted.findIndex((s) => globalHistory.indexOf(s) === currentSpinIndex());
    if (activeIdx !== -1) {
      if (activeIdx < windowStart() || activeIdx >= windowEnd()) {
        setWindowStart(Math.max(0, activeIdx - 10));
        setWindowEnd(Math.min(sorted.length, activeIdx + Math.max(CHUNK, 20)));
      }
    }
  });

  const visibleSpins = createMemo(() => {
    const sorted = currentSortedList();
    return sorted.slice(windowStart(), windowEnd());
  });

  function setupTopObserver(el) {
    if (topObserver) topObserver.disconnect();
    if (!el) return;
    topObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && windowStart() > 0) {
        setWindowStart((prev) => Math.max(0, prev - CHUNK));
      }
    }, { rootMargin: '400px' });
    topObserver.observe(el);
  }

  function setupBottomObserver(el) {
    if (bottomObserver) bottomObserver.disconnect();
    if (!el) return;
    bottomObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const sorted = currentSortedList();
        if (windowEnd() < sorted.length) {
          setWindowEnd((prev) => Math.min(sorted.length, prev + CHUNK));
        } else if (lastLoadedKey() != null) {
          import('../../services/spinService.js').then(({ loadMoreSpins }) => loadMoreSpins());
        }
      }
    }, { rootMargin: '400px' });
    bottomObserver.observe(el);
  }

  onCleanup(() => {
    topObserver?.disconnect();
    bottomObserver?.disconnect();
  });

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
                  import('../../store/historyStore.js').then(({ setActiveFilters }) => {
                    setActiveFilters([]);
                    localStorage.setItem('active_filters', '[]');
                  });
                  import('../../services/gameService.js').then(({ triggerFilterUpdate }) => {
                    triggerFilterUpdate();
                  });
                }}
              >
                Clear all filters
              </button>
            </div>
          </Show>
        }
      >
        <Show when={windowStart() > 0}>
          <div style={`height:${windowStart() * ESTIMATED_ROW_HEIGHT}px;`} />
        </Show>
        <div
          ref={setupTopObserver}
          style={`height:${windowStart() > 0 ? 10 : 0}px;`}
        />

        <For each={visibleSpins()}>
          {(spin) => {
            const originalIdx = createMemo(() => globalHistory.indexOf(spin));
            const isActive = createMemo(() => originalIdx() === currentSpinIndex());
            return (
              <SpinCard spin={spin} isActive={isActive()} onClick={() => import('../../services/spinService.js').then(({ loadSpin }) => loadSpin(originalIdx()))} />
            );
          }}
        </For>

        {/* Infinite scroll sentinel (RAM or DB) */}
        <Show when={windowEnd() < currentSortedList().length || lastLoadedKey() != null}>
          <div
            ref={setupBottomObserver}
            style="height:10px;"
            id="scrollSentinel"
          />
        </Show>
        <Show when={windowEnd() < currentSortedList().length}>
          <div style={`height:${(currentSortedList().length - windowEnd()) * ESTIMATED_ROW_HEIGHT}px;`} />
        </Show>
      </Show>
    </div>
  );
}
