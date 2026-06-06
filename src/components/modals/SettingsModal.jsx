import { createSignal, Show } from 'solid-js';
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
} from '../../store/sessionStore.js';
import { game, switchGame, listGames } from '../../store/gameStore.js';
import { checkBackendHealth } from '../../services/gameService.js';
import { triggerFilterUpdate } from '../../services/gameService.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:680px;
    height:calc(100vh - 40px); max-height:860px;
    background:#0f1318;
    border:1px solid rgba(255,255,255,0.1);
    border-radius:12px;
    display:flex; flex-direction:column;
    overflow:hidden;
    box-shadow:0 24px 80px rgba(0,0,0,0.7);
  `,
  header: `
    display:flex; align-items:center; justify-content:space-between;
    padding:18px 24px 16px;
    border-bottom:1px solid rgba(255,255,255,0.07);
    flex-shrink:0;
    background:rgba(245,158,11,0.04);
  `,
  title: `
    font-size:15px; font-weight:700; color:#e2e8f0;
    letter-spacing:0.03em; margin:0;
  `,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `
    flex:1; overflow-y:auto; padding:0; min-height:0;
  `,
  section: `
    padding:20px 24px;
    border-bottom:1px solid rgba(255,255,255,0.05);
  `,
  sectionLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.1em;
    text-transform:uppercase; color:#f59e0b; margin:0 0 12px;
  `,
  input: `
    width:100%; box-sizing:border-box;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:12px; padding:9px 12px;
    outline:none; transition:border-color 0.15s;
  `,
  textarea: `
    width:100%; box-sizing:border-box;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:11px; font-family:'JetBrains Mono',monospace;
    padding:10px 12px; resize:vertical;
    outline:none; transition:border-color 0.15s; min-height:120px;
  `,
  select: `
    width:100%; box-sizing:border-box;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:12px; padding:9px 12px;
    outline:none; cursor:pointer;
  `,
  presetRow: `
    display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;
  `,
  presetBtn: `
    font-size:10px; font-weight:600; letter-spacing:0.05em;
    padding:5px 10px; border-radius:5px;
    background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; cursor:pointer;
    transition:background 0.15s, color 0.15s, border-color 0.15s;
  `,
  healthRow: `
    margin-top:6px; font-size:10px; height:14px;
  `,
  checkRow: `
    display:flex; align-items:center; gap:10px;
    font-size:12px; color:#cbd5e1; cursor:pointer;
    padding:4px 0;
  `,
  selectSmall: `
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:5px; color:#e2e8f0;
    font-size:11px; padding:5px 8px; cursor:pointer;
  `,
  helperBtn: `
    font-size:10px; font-weight:600; letter-spacing:0.04em;
    padding:6px 12px; border-radius:5px; margin-top:8px;
    background:rgba(245,158,11,0.08);
    border:1px solid rgba(245,158,11,0.25);
    color:#f59e0b; cursor:pointer;
    transition:background 0.15s;
  `,
  dangerSection: `
    padding:20px 24px;
  `,
  dangerLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.1em;
    text-transform:uppercase; color:#f43f5e; margin:0 0 12px;
  `,
  dangerBtn: `
    font-size:12px; font-weight:600;
    padding:9px 16px; border-radius:6px;
    background:rgba(244,63,94,0.08);
    border:1px solid rgba(244,63,94,0.3);
    color:#f43f5e; cursor:pointer;
    transition:background 0.15s;
  `,
};

export default function SettingsModal() {
  const [healthText, setHealthText] = createSignal('');
  const [healthColor, setHealthColor] = createSignal('#475569');

  async function runHealthCheck(url) {
    setHealthText('Checking…');
    setHealthColor('#475569');
    const result = await checkBackendHealth(url);
    setHealthText(result.text);
    setHealthColor(result.status === 'ok' ? '#10b981' : '#f43f5e');
  }

  function close() {
    setSettingsOpen(false);
  }

  return (
    <Show when={settingsOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          style={S.panel}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          {/* Header */}
          <div style={S.header}>
            <h2 style={S.title}>⚙ Settings</h2>
            <button
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={S.body}>
            {/* Backend URL */}
            <div style={S.section}>
              <p style={S.sectionLabel}>Backend</p>
              <input
                id="apiUrlInput"
                type="text"
                style={S.input}
                value={apiUrl()}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                onInput={(e) => {
                  const url = e.target.value.trim();
                  setApiUrl(url);
                  localStorage.setItem('api_url', url);
                  clearTimeout(window._healthDebounce);
                  window._healthDebounce = setTimeout(() => runHealthCheck(url), 300);
                }}
              />
              <div style={S.presetRow}>
                {[
                  { label: 'LOCAL', url: 'http://localhost:9000' },
                  { label: 'CIT', url: 'https://letsgo-game-gs1.iki-cit.cc' },
                  { label: 'QAT', url: 'https://letsgo-game-gs1.iki-qat.cc' },
                ].map(({ label, url }) => (
                  <button
                    style={S.presetBtn}
                    onClick={() => {
                      setApiUrl(url);
                      localStorage.setItem('api_url', url);
                      runHealthCheck(url);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(245,158,11,0.1)';
                      e.currentTarget.style.color = '#f59e0b';
                      e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div id="backendHealthStatus" style={{ ...S.healthRow, color: healthColor() }}>
                {healthText()}
              </div>
            </div>

            {/* Player ID */}
            <div style={S.section}>
              <p style={S.sectionLabel}>Player</p>
              <input
                id="playerIdInput"
                type="text"
                style={S.input}
                value={playerId()}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                onInput={(e) => {
                  setPlayerId(e.target.value || 'cascading-game-tester');
                  localStorage.setItem('player_id', e.target.value);
                }}
              />
            </div>

            {/* Game Selector */}
            <div style={S.section}>
              <p style={S.sectionLabel}>Active Game</p>
              <select
                id="gameSelect"
                style={S.select}
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
            <div style={S.section}>
              <p style={S.sectionLabel}>Request Body (JSON)</p>
              <textarea
                id="requestBody"
                style={S.textarea}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                value={
                  localStorage.getItem('request_body') ||
                  JSON.stringify(game().defaultRequestBody || {}, null, 2)
                }
                onInput={(e) => localStorage.setItem('request_body', e.target.value)}
              />
              <button
                id="syncHistoryBtn"
                style={S.helperBtn}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.08)';
                }}
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
            <div style={S.section}>
              <p style={S.sectionLabel}>Display</p>
              <div style="display:flex; flex-direction:column; gap:10px;">
                <label style={S.checkRow}>
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
                <div style="display:flex; align-items:center; gap:10px; font-size:12px; color:#94a3b8;">
                  <span>Grid View:</span>
                  <select
                    id="singleViewModeSelect"
                    style={S.selectSmall}
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
              </div>
            </div>

            {/* Danger Zone */}
            <div style={S.dangerSection}>
              <p style={S.dangerLabel}>⚠ Danger Zone</p>
              <button
                id="clearDataBtn"
                style={S.dangerBtn}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.08)';
                }}
                onClick={() => {
                  close();
                  clearAllDataAndReload();
                }}
              >
                🗑 Clear ALL Data &amp; Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
