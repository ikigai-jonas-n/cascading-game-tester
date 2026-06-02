import { createSignal, Show } from 'solid-js';
import {
  customGameOpen,
  setCustomGameOpen,
  playerId,
  showLoading,
  hideLoading,
} from '../../store/uiStore.js';
import { game, refreshGame, listGames, switchGame } from '../../store/gameStore.js';
import { triggerFilterUpdate } from '../../services/gameService.js';

export default function CustomGameModal() {
  const [json, setJson] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');

  function openModal() {
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

  function close() {
    setCustomGameOpen(false);
  }

  async function handleSave() {
    setErrorMsg('');
    try {
      const config = JSON.parse(json());
      if (!config.id || !config.name || !config.gameCode)
        throw new Error('Missing required fields: id, name, gameCode');

      const { saveCustomGame } = await import('../../game-registry.js'); // dynamic OK: infrequent action
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
    <Show when={customGameOpen()} keyed>
      {(() => {
        openModal();
        return null;
      })()}
      <dialog
        id="customGameModal"
        class="modal-dialog"
        style="display:block;"
        open
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <h2>➕ Create Custom Sandbox Game</h2>
            <button id="closeCustomGameBtn" class="btn-ghost" onClick={close}>
              ×
            </button>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
            <div class="settings-group">
              <label class="settings-label">Game Config JSON</label>
              <textarea
                id="customGameJson"
                class="settings-textarea"
                style="height:300px; font-family:monospace; font-size:11px;"
                value={json()}
                onInput={(e) => setJson(e.target.value)}
              />
            </div>
            <Show when={errorMsg()}>
              <div
                id="customGameError"
                style="color:var(--error); font-size:11px; padding:8px; background:rgba(244,63,94,0.1); border-radius:6px;"
              >
                {errorMsg()}
              </div>
            </Show>
            <button id="saveCustomGameBtn" class="btn-primary" onClick={handleSave}>
              💾 Save &amp; Load Game
            </button>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
