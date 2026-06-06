import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

// ── Raw Drawer ────────────────────────────────────────────────────────────────
// FIX: Using createSignal so replacing arrays forces a full teardown
export const [rawDrawerTabs, setRawDrawerTabs] = createSignal([]);
export const [rawDrawerActiveTab, setRawDrawerActiveTab] = createSignal(0);
export const [lastSelectedTabLabel, setLastSelectedTabLabel] = createSignal('STEP_1_STATE');

// ── Loading Overlay ───────────────────────────────────────────────────────────
export const [loadingState, setLoadingState] = createStore({
  visible: false,
  message: '',
  percent: -1,
});

export function showLoading(msg, percent = -1) {
  setLoadingState({ visible: true, message: msg, percent });
}

export function hideLoading() {
  setLoadingState({ visible: false, message: '', percent: -1 });
}

// ── Toasts ────────────────────────────────────────────────────────────────────
export const [toasts, setToasts] = createStore([]);
let _toastId = 0;

export function pushToast(toast) {
  const id = ++_toastId;
  setToasts((t) => [...t, { ...toast, id }]);
  if (toast.autoDismiss !== false) {
    setTimeout(() => dismissToast(id), toast.duration || 8000);
  }
  return id;
}

export function dismissToast(id) {
  setToasts((t) => t.filter((x) => x.id !== id));
}

// ── Display Preferences ───────────────────────────────────────────────────────
export const [showSymbolMap, setShowSymbolMap] = createSignal(
  localStorage.getItem('show_symbol_map') !== 'false',
);
export const [leftPanelFontSize, setLeftPanelFontSize] = createSignal(
  parseInt(localStorage.getItem('left_panel_font_size') || '14', 10),
);
export const [rightPanelFontSize, setRightPanelFontSize] = createSignal(
  parseInt(localStorage.getItem('right_panel_font_size') || '12', 10),
);
export const [showFloatingTumbleStats, setShowFloatingTumbleStats] = createSignal(
  localStorage.getItem('show_floating_tumble_stats') === 'true',
);
export const [floatingStatsWidth, setFloatingStatsWidth] = createSignal(
  parseInt(localStorage.getItem('floating_stats_width') || '200', 10),
);
export const [floatingStatsHeight, setFloatingStatsHeight] = createSignal(
  parseInt(localStorage.getItem('floating_stats_height') || '200', 10),
);

// ── API / Player Settings ─────────────────────────────────────────────────────
export const [apiUrl, setApiUrl] = createSignal(
  localStorage.getItem('api_url') ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : null) ||
    'http://localhost:9000',
);

export const [playerId, setPlayerId] = createSignal(
  localStorage.getItem('player_id') || 'cascading-game-tester',
);

// ── Modal open/close signals ──────────────────────────────────────────────────
export const [settingsOpen, setSettingsOpen] = createSignal(false);
export const [quickCheatOpen, setQuickCheatOpen] = createSignal(false);
export const [shortcutsOpen, setShortcutsOpen] = createSignal(false);

export const [paytableOpen, setPaytableOpen] = createSignal(false);
export const [mongoRoundImportOpen, setMongoRoundImportOpen] = createSignal(false);
export const [choicePromptOpen, setChoicePromptOpen] = createSignal(false);
export const [choicePromptChoices, setChoicePromptChoices] = createSignal([]);

// ── Panel Collapse ────────────────────────────────────────────────────────────
export const [leftCollapsed, setLeftCollapsed] = createSignal(
  localStorage.getItem('left_panel_collapsed') === 'true',
);
export const [rightCollapsed, setRightCollapsed] = createSignal(
  localStorage.getItem('right_panel_collapsed') === 'true',
);

// ── Auto-play status text ─────────────────────────────────────────────────────
export const [autoStatus, setAutoStatus] = createSignal('');
