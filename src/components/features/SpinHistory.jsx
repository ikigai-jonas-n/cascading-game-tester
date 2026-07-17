import { For, Show, createSignal, createMemo, onMount, onCleanup, createEffect } from 'solid-js';
import {
  currentSortedList,
  globalHistory,
  setActiveFilters,
  rebuildSortedList,
  hasMoreData,
  isLoadingMore,
} from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { loadSpin } from '../../services/spinService.js';
import { triggerFilterUpdate, loadMore } from '../../services/gameService.js';
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

  // Fast num -> globalHistory-index lookup, rebuilt once per globalHistory
  // change instead of an indexOf() (O(n) scan) per spin card / per effect
  // run. Without this, the effect below was sorted.findIndex(s =>
  // globalHistory.indexOf(s) === ...) — an O(n) indexOf nested inside an
  // O(n) findIndex, i.e. O(n^2) — which is exactly why autoplay throttled
  // hard once history grew into the thousands: this ran on every RAM flush.
  const numToIndex = createMemo(() => {
    const m = new Map();
    globalHistory.forEach((s, i) => m.set(s.num, i));
    return m;
  });

  // Jump to active index if it goes outside our window
  createEffect(() => {
    const sorted = currentSortedList();
    const idx = currentSpinIndex();
    const targetSpin = idx >= 0 && idx < globalHistory.length ? globalHistory[idx] : undefined;
    const activeIdx = targetSpin !== undefined ? sorted.indexOf(targetSpin) : -1;
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
    topObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && windowStart() > 0) {
          setWindowStart((prev) => Math.max(0, prev - CHUNK));
        }
      },
      { rootMargin: '400px' },
    );
    topObserver.observe(el);
  }

  function setupBottomObserver(el) {
    if (bottomObserver) bottomObserver.disconnect();
    if (!el) return;
    bottomObserver = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        const sorted = currentSortedList();
        if (windowEnd() < sorted.length) {
          setWindowEnd((prev) => Math.min(sorted.length, prev + CHUNK));
          return;
        }
        // RAM window exhausted — pull more from the DB. Guarded here AND inside
        // loadMore() itself (defense in depth): a fast re-scroll re-firing this
        // observer before the previous load resolves must never issue a second
        // overlapping load — that race is exactly what caused the old
        // "scroll too fast -> blank list" bug.
        if (isLoadingMore() || !hasMoreData()) return;
        loadMore().then(() => {
          // Reveal whatever just got appended immediately, without waiting for
          // another scroll/intersection event.
          setWindowEnd(currentSortedList().length);
        });
      },
      { rootMargin: '400px' },
    );
    bottomObserver.observe(el);
  }

  onCleanup(() => {
    topObserver?.disconnect();
    bottomObserver?.disconnect();
  });

  // Fallback for scrollbar-thumb drags ONLY: the IntersectionObservers above
  // only advance the window when a sentinel at the edge of the *currently
  // rendered* range crosses their 400px rootMargin. A drag can jump 1000s of
  // px in one gesture — far past that margin — landing the viewport inside
  // an empty filler div with no sentinel anywhere nearby, so nothing ever
  // fires and the list stays blank.
  //
  // This must gate on a LARGE jump (> 2 viewports) and do nothing otherwise.
  // Row heights vary per card (expanded/collapsed, content differences), so
  // `approxStart = scrollTop / ESTIMATED_ROW_HEIGHT` is only ever a rough
  // guess — close enough to catch a drag, but wrong by enough that treating
  // it as authoritative on every single scroll tick fought the sentinels'
  // precise DOM-intersection-based window and caused visible jump-back
  // jerkiness on ordinary wheel/trackpad scroll too. Small/normal scroll is
  // left entirely to the IntersectionObservers above.
  onMount(() => {
    const container = document.getElementById('spinHistory');
    if (!container) return;
    let ticking = false;
    let lastScrollTop = container.scrollTop;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollTop = container.scrollTop;
        const jump = Math.abs(scrollTop - lastScrollTop);
        lastScrollTop = scrollTop;
        if (jump <= container.clientHeight * 2) return; // ordinary scroll — sentinels own this

        const sorted = currentSortedList();
        const total = sorted.length;
        const viewportRows = Math.ceil(container.clientHeight / ESTIMATED_ROW_HEIGHT) || CHUNK;
        const approxStart = Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT);
        const neededStart = Math.max(0, approxStart - CHUNK);
        const neededEnd = Math.min(total, approxStart + viewportRows + CHUNK);
        if (neededStart < windowStart() || neededEnd > windowEnd()) {
          setWindowStart(neededStart);
          setWindowEnd(neededEnd);
        }
        // Landed near/past the end of what's actually loaded — pull more,
        // same as the bottom IntersectionObserver does for normal scroll.
        if (approxStart + viewportRows >= total - CHUNK && !isLoadingMore() && hasMoreData()) {
          loadMore().then(() => setWindowEnd(currentSortedList().length));
        }
      });
    };
    container.addEventListener('scroll', onScroll);
    onCleanup(() => container.removeEventListener('scroll', onScroll));
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
        <div ref={setupTopObserver} style={`height:${windowStart() > 0 ? 10 : 0}px;`} />

        <For each={visibleSpins()}>
          {(spin) => {
            const originalIdx = createMemo(() => numToIndex().get(spin.num) ?? -1);
            const isActive = createMemo(() => originalIdx() === currentSpinIndex());
            return (
              <SpinCard
                spin={spin}
                isActive={isActive()}
                originalIdx={originalIdx()}
                onClick={() =>
                  import('../../services/spinService.js').then(({ loadSpin }) =>
                    loadSpin(originalIdx()),
                  )
                }
              />
            );
          }}
        </For>

        {/* Infinite scroll sentinel (RAM or DB) */}
        <Show when={windowEnd() < currentSortedList().length || hasMoreData()}>
          <div ref={setupBottomObserver} style="height:10px;" id="scrollSentinel" />
        </Show>
        <Show when={windowEnd() < currentSortedList().length}>
          <div
            style={`height:${(currentSortedList().length - windowEnd()) * ESTIMATED_ROW_HEIGHT}px;`}
          />
        </Show>
      </Show>
    </div>
  );
}
