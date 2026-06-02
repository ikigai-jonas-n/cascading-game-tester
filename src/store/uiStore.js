/**
 * UI Domain Store
 *
 * Owns transient UI state: modals, loading overlay, toasts,
 * the raw JSON drawer, and display preferences.
 * No business logic — pure presentation state.
 */
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

// ── Raw Drawer ────────────────────────────────────────────────────────────────
export const [rawDrawerTabs, setRawDrawerTabs] = createStore([]);
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
  localStorage.getItem('show_symbol_map') !== 'false', // default ON
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
export const [customGameOpen, setCustomGameOpen] = createSignal(false);
export const [paytableOpen, setPaytableOpen] = createSignal(false);
export const [choicePromptOpen, setChoicePromptOpen] = createSignal(false);
export const [choicePromptChoices, setChoicePromptChoices] = createSignal([]);

// ── Storage stats ─────────────────────────────────────────────────────────────
export const [storageStats, setStorageStats] = createSignal('');

// ── Auto-play status text ─────────────────────────────────────────────────────
export const [autoStatus, setAutoStatus] = createSignal('');
