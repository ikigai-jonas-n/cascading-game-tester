import { createSignal, Show, createEffect } from 'solid-js';
import {
  customGameOpen,
  setCustomGameOpen,
  playerId,
  showLoading,
  hideLoading,
} from '../../store/uiStore.js';
import { game, refreshGame, listGames, switchGame } from '../../store/gameStore.js';
import { triggerFilterUpdate } from '../../services/gameService.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:600px;
    height:calc(100vh - 40px); max-height:700px;
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
  title: `font-size:15px; font-weight:700; color:#e2e8f0; letter-spacing:0.03em; margin:0;`,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:14px; min-height:0;`,
  label: `font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#f59e0b; margin:0 0 8px;`,
  textarea: `
    width:100%; box-sizing:border-box; flex:1; min-height:200px;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:11px; font-family:'JetBrains Mono',monospace;
    padding:10px 12px; resize:none;
    outline:none; transition:border-color 0.15s;
  `,
  footer: `padding:16px 24px; border-top:1px solid rgba(255,255,255,0.06); flex-shrink:0; display:flex; flex-direction:column; gap:10px;`,
};

export default function CustomGameModal() {
  const [json, setJson] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');

  createEffect(() => {
    if (customGameOpen()) {
      setErrorMsg('');
      setJson(
        JSON.stringify(
          {
            id: 'custom-sandbox-' + Date.now(),
            name: 'New Sandbox',
            gameCode: 'LGS-004',
            grid: { rows: 5, cols: 5 },
            emptySymbolId: -1,
            scatterSymbolId: 99,
            wildSymbolId: 98,
            symbols: { 1: 'H1', 2: 'H2', 99: 'SCAT' },
            emojis: { 1: '🍒', 2: '🍉', 99: '⭐' },
            colors: { 1: '#ff5252', 2: '#66bb6a', 99: '#ffeb3b' },
            winCategories: { BIG_WIN: 20, MEGA_WIN: 50, HUGE_WIN: 150, MAX_WIN: 5000 },
            defaultRequestBody: {
              betAmount: 20,
              cashBet: '20',
              currencyDec: 2,
              stakes: [{ type: 'commonGame' }],
              rtpOption: 'RTP_97',
            },
            playerId: playerId(),
          },
          null,
          2,
        ),
      );
    }
  });

  function close() {
    setCustomGameOpen(false);
  }

  async function handleSave() {
    setErrorMsg('');
    try {
      const config = JSON.parse(json());
      if (!config.id || !config.name || !config.gameCode)
        throw new Error('Missing required fields: id, name, gameCode');

      const { saveCustomGame } = await import('../../game-registry.js');
      saveCustomGame(config);
      refreshGame();
      switchGame(config.id);
      triggerFilterUpdate();

      close();
      showLoading('Custom Game Loaded! ✅');
      setTimeout(hideLoading, 1500);
    } catch (e) {
      setErrorMsg('Invalid JSON: ' + e.message);
    }
  }

  return (
    <Show when={customGameOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div style={S.panel} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          <div style={S.header}>
            <h2 style={S.title}>➕ Create Custom Sandbox Game</h2>
            <button
              id="closeCustomGameBtn"
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            >×</button>
          </div>

          <div style={S.body}>
            <div style="display:flex; flex-direction:column; flex:1; min-height:0;">
              <p style={S.label}>Game Config JSON</p>
              <textarea
                id="customGameJson"
                style={S.textarea}
                value={json()}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(245,158,11,0.5)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                onInput={(e) => setJson(e.target.value)}
              />
            </div>
          </div>

          <div style={S.footer}>
            <Show when={errorMsg()}>
              <div id="customGameError" style="color:#f43f5e; font-size:11px; padding:10px; background:rgba(244,63,94,0.1); border-radius:6px; border:1px solid rgba(244,63,94,0.25);">
                {errorMsg()}
              </div>
            </Show>
            <button
              id="saveCustomGameBtn"
              style="padding:10px 16px; border-radius:6px; font-size:12px; font-weight:700; letter-spacing:0.04em; cursor:pointer; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; transition:background 0.15s; width:100%;"
              onClick={handleSave}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; }}
            >
              💾 Save &amp; Load Game
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

