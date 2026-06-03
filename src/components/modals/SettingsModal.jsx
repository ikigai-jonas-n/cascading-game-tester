import { createSignal, Show, onCleanup } from 'solid-js';
import {
  settingsOpen,
  setSettingsOpen,
  apiUrl,
  setApiUrl,
  playerId,
  setPlayerId,
} from '../../store/uiStore.js';
import { clearAllDataAndReload } from '../../services/gameService.js';
import {
  showDoubleGrid,
  setShowDoubleGrid,
  singleViewMode,
  setSingleViewMode,
  bypassAnimation,
  setBypassAnimation,
} from '../../store/sessionStore.js';
import { game, switchGame, listGames } from '../../store/gameStore.js';
import { checkBackendHealth } from '../../services/gameService.js';
import { triggerFilterUpdate } from '../../services/gameService.js';

export default function SettingsModal() {
  let dialogRef;
  const [healthText, setHealthText] = createSignal('');
  const [healthColor, setHealthColor] = createSignal('#888');

  async function runHealthCheck(url) {
    setHealthText('Checking...');
    setHealthColor('#888');
    const result = await checkBackendHealth(url);
    setHealthText(result.text);
    setHealthColor(result.status === 'ok' ? '#22c55e' : '#ef4444');
  }

  function close() {
    setSettingsOpen(false);
  }

  return (
    <Show when={settingsOpen()}>
      <dialog
        ref={dialogRef}
        id="settingsModal"
        class="modal-dialog"
        style="display:block;"
        open
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef) close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <h2>Settings</h2>
            <button class="btn-ghost" onClick={close}>
              ×
            </button>
          </div>

          <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
            {/* Backend URL */}
            <div class="settings-group">
              <label class="settings-label">Backend URL</label>
              <input
                id="apiUrlInput"
                type="text"
                class="settings-input"
                value={apiUrl()}
                onInput={(e) => {
                  const url = e.target.value.trim();
                  setApiUrl(url);
                  localStorage.setItem('api_url', url);
                  clearTimeout(window._healthDebounce);
                  window._healthDebounce = setTimeout(() => runHealthCheck(url), 300);
                }}
              />
              <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                {[
                  'http://localhost:9000',
                  'https://letsgo-game-gs1.iki-cit.cc',
                  'https://letsgo-game-gs1.iki-qat.cc',
                ].map((url) => (
                  <button
                    class="backend-preset-btn btn-ghost"
                    data-url={url}
                    style="font-size:9px; padding:4px 8px;"
                    onClick={() => {
                      setApiUrl(url);
                      localStorage.setItem('api_url', url);
                      runHealthCheck(url);
                    }}
                  >
                    {url.includes('localhost') ? 'LOCAL' : url.includes('cit') ? 'CIT' : 'QAT'}
                  </button>
                ))}
              </div>
              <div
                id="backendHealthStatus"
                style={`font-size:10px; color:${healthColor()}; margin-top:4px;`}
              >
                {healthText()}
              </div>
            </div>

            {/* Player ID */}
            <div class="settings-group">
              <label class="settings-label">Player ID</label>
              <input
                id="playerIdInput"
                type="text"
                class="settings-input"
                value={playerId()}
                onInput={(e) => {
                  setPlayerId(e.target.value || 'cascading-game-tester');
                  localStorage.setItem('player_id', e.target.value);
                }}
              />
            </div>

            {/* Game Selector */}
            <div class="settings-group">
              <label class="settings-label">Active Game</label>
              <select
                id="gameSelect"
                class="settings-input"
                onChange={(e) => {
                  switchGame(e.target.value);
                  localStorage.removeItem('request_body');
                  triggerFilterUpdate();
                }}
              >
                {listGames().map((g) => (
                  <option value={g.id} selected={g.id === game().id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Request Body */}
            <div class="settings-group">
              <label class="settings-label">Request Body (JSON)</label>
              <textarea
                id="requestBody"
                class="settings-textarea"
                style="height:140px; font-family:monospace; font-size:11px;"
                value={
                  localStorage.getItem('request_body') ||
                  JSON.stringify(game().defaultRequestBody || {}, null, 2)
                }
                onInput={(e) => localStorage.setItem('request_body', e.target.value)}
              />
              <button
                class="btn-ghost"
                style="font-size:10px; padding:4px 8px; margin-top:4px;"
                id="syncHistoryBtn"
                onClick={async () => {
                  if (
                    !confirm(
                      'Re-sync default history from json_files/default_data.json? Existing data will be merged.',
                    )
                  )
                    return;
                  localStorage.removeItem('default_data_loaded');
                  const { loadDefaultData } = await import('../../services/gameService.js');
                  await loadDefaultData(true);
                }}
              >
                🔄 Re-sync Default History
              </button>
            </div>

            {/* Display Options */}
            <div class="settings-group">
              <label class="settings-label">Display Options</label>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11px; color:var(--text-muted);">
                  <input
                    type="checkbox"
                    id="showDoubleGrid"
                    checked={showDoubleGrid()}
                    onChange={(e) => {
                      setShowDoubleGrid(e.target.checked);
                      localStorage.setItem('show_double_grid', e.target.checked);
                    }}
                  />
                  Show Initial + Final side-by-side
                </label>
                <div style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-muted);">
                  <label>Grid View:</label>
                  <select
                    id="singleViewModeSelect"
                    style="background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); padding:4px 8px; border-radius:4px; font-size:11px;"
                    value={singleViewMode()}
                    onChange={(e) => {
                      setSingleViewMode(e.target.value);
                      localStorage.setItem('single_view_mode', e.target.value);
                    }}
                  >
                    <option value="both">Both (Initial → Final)</option>
                    <option value="initial">Initial only</option>
                    <option value="final">Final only</option>
                  </select>
                </div>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11px; color:var(--text-muted);">
                  <input
                    type="checkbox"
                    id="disableAnimation"
                    checked={bypassAnimation()}
                    onChange={(e) => {
                      setBypassAnimation(e.target.checked);
                      localStorage.setItem('bypass_animation', e.target.checked);
                    }}
                  />
                  Skip sequence animation (faster)
                </label>
              </div>
            </div>

            {/* Danger Zone */}
            <div
              class="settings-group"
              style="border-top:1px solid rgba(244,63,94,0.2); padding-top:12px;"
            >
              <label class="settings-label" style="color:var(--error);">
                Danger Zone
              </label>
              <button
                id="clearDataBtn"
                class="btn-primary"
                style="background:rgba(244,63,94,0.1); border:1px solid var(--error); color:var(--error);"
                onClick={() => {
                  close();
                  clearAllDataAndReload();
                }}
              >
                🗑️ Clear ALL Data &amp; Reset
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
