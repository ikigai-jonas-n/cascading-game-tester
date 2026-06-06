/**
 * Session Domain Store
 *
 * Tracks the currently-selected spin: which tumble is displayed,
 * the playback state, and all derived display values.
 * Nothing here touches the DOM — components react to these signals.
 */
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

/** Complex nested state — use createStore for granular updates */
export const [gameState, setGameState] = createStore({
  fields: [],
  currentIndex: 0,
  currentFramePhase: 'final', // 'initial' | 'final'
  summary: null,
  isAnimating: false,
  accumulatedWins: [],
  goldenCandidates: [],
});

/** Index into globalHistory for the selected spin */
export const [currentSpinIndex, setCurrentSpinIndex] = createSignal(-1);

/** Auto-play batch running guard */
export const [autoPlayRunning, setAutoPlayRunning] = createSignal(false);

/** Playback interval ID (null = stopped) */
export const [playbackInterval, setPlaybackInterval] = createSignal(null);

export const [playbackSpeed, setPlaybackSpeed] = createSignal(
  parseFloat(localStorage.getItem('playback_speed') || '1.0'),
);

export const [isAutoReplay, setIsAutoReplay] = createSignal(
  localStorage.getItem('is_auto_replay') === 'true',
);

export const [isAutoplayOnSelect, setIsAutoplayOnSelect] = createSignal(
  localStorage.getItem('autoplay_on_select') === 'true',
);

export const [bypassAnimation, setBypassAnimation] = createSignal(
  localStorage.getItem('bypass_animation') !== 'false', // default ON (bypass = true)
);

export const [showDoubleGrid, setShowDoubleGrid] = createSignal(
  localStorage.getItem('show_double_grid') === 'true',
);

export const [singleViewMode, setSingleViewMode] = createSignal(
  localStorage.getItem('single_view_mode') || 'both', // 'both' | 'final' | 'initial'
);
