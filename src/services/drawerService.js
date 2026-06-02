/**
 * Drawer Service
 *
 * Manages the raw JSON drawer (right panel) tab state and playback label sync.
 * Separated from spinService to avoid circular imports.
 */
import {
  rawDrawerTabs,
  setRawDrawerTabs,
  setRawDrawerActiveTab,
  lastSelectedTabLabel,
  setLastSelectedTabLabel,
} from '../store/uiStore.js';
import { gameState, currentSpinIndex, playbackInterval } from '../store/sessionStore.js';
import { globalHistory } from '../store/historyStore.js';
import { game } from '../store/gameStore.js';

// Mutable signal refs injected by components — avoids React-style prop drilling
let _setCurrentPhaseLabel = null;
let _setCurrentTumbleLabel = null;
let _setCurrentSpinIdLabel = null;
let _setPlayingState = null;

export function registerPlaybackLabelSetters({ setPhase, setTumble, setSpinId, setPlaying }) {
  _setCurrentPhaseLabel = setPhase;
  _setCurrentTumbleLabel = setTumble;
  _setCurrentSpinIdLabel = setSpinId;
  _setPlayingState = setPlaying;
}

export function updatePlaybackLabels() {
  const spin = globalHistory[currentSpinIndex()];
  if (!spin) return;

  _setCurrentPhaseLabel?.(gameState.currentFramePhase?.toUpperCase() || 'INITIAL');

  const field = spin.fields[gameState.currentIndex];
  const prefix = field && field._isFreeSpin ? `FS #${(field._roundIndex || 0) + 1} · ` : '';
  _setCurrentTumbleLabel?.(`${prefix}Tumble ${gameState.currentIndex + 1}`);
  _setCurrentSpinIdLabel?.(` . #${spin.num ?? currentSpinIndex()}`);
}

export function syncPlaybackUI() {
  _setPlayingState?.(!!playbackInterval());
}

export function openRawDrawer(tabs) {
  const label = lastSelectedTabLabel();
  let targetIndex = tabs.findIndex((t) => {
    if (label === 'STEP_X_STATE' || label === 'TUMBLE_X_FIELD')
      return t.label.includes('STEP_') || t.label.includes('TUMBLE_');
    return t.label === label;
  });
  setRawDrawerTabs(tabs);
  setRawDrawerActiveTab(targetIndex >= 0 ? targetIndex : 0);
}

export function selectDrawerTab(index) {
  const tabs = rawDrawerTabs;
  const label = tabs[index]?.label || '';
  setRawDrawerActiveTab(index);
  setLastSelectedTabLabel(label.includes('TUMBLE_') ? 'TUMBLE_X_FIELD' : label);
}
