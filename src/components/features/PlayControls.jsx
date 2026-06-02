import { createSignal, Show, onMount, For } from 'solid-js';
import { game } from '../../store/gameStore.js';
import { playSpin } from '../../services/spinService.js';
import { autoPlayRunning, setAutoPlayRunning, bypassAnimation, setBypassAnimation } from '../../store/sessionStore.js';

// Shared cheat templates — loaded once at app level, shared across PlayControls + QuickCheatModal
import { allCheatTemplates, setAllCheatTemplates, cheatTemplatesLoaded, setCheatTemplatesLoaded } from './cheatTemplateStore.js';

export default function PlayControls() {
  // ── Spin settings: initialized from request body JSON ──────────────────
  function getRequestBody() {
    try { return JSON.parse(localStorage.getItem('request_body') || '{}'); } catch { return {}; }
  }

  const [spinType, setSpinType] = createSignal('base');
  const [betAmount, setBetAmount] = createSignal(20);
  const [stake, setStake] = createSignal('commonGame');
  const [mode, setMode] = createSignal(localStorage.getItem('play_mode') || 'single');
  const [playCount, setPlayCount] = createSignal(localStorage.getItem('play_count') || '10k');
  const [targetConditions, setTargetConditions] = createSignal([]);
  const [targetLogic, setTargetLogic] = createSignal('OR');
  const [targetCount, setTargetCount] = createSignal(1);

  onMount(() => {
    // Sync selects from request body
    const rb = getRequestBody();
    setBetAmount(rb.betAmount || 20);
    setStake(rb.spinMode || (rb.stakes?.[0]?.type) || 'commonGame');
    setSpinType(rb.choice === 1 ? 'free' : 'base');
  });

  function updateRequestBody(patch) {
    const rb = getRequestBody();
    const updated = { ...rb, ...patch };
    if (patch.betAmount !== undefined) updated.cashBet = patch.betAmount;
    if (patch.spinMode !== undefined && Array.isArray(updated.stakes)) {
      updated.stakes = updated.stakes.map((s, i) => i === 0 ? { ...s, type: patch.spinMode } : s);
    }
    localStorage.setItem('request_body', JSON.stringify(updated, null, 2));
  }

  async function handlePlay() {
    if (autoPlayRunning()) return;
    const config = getRequestBody();
    await playSpin({
      config,
      mode: mode(),
      playCount: playCount(),
      targetConditions: targetConditions(),
      targetConditionLogic: targetLogic(),
      targetCountLimit: targetCount(),
      cheatTemplates: allCheatTemplates()[game().id] || [],
    });
  }

  return (
    <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
      {/* Spin type / bet / stake row */}
      <section class="spin-settings-ui" style="display:flex; gap:6px; margin-bottom:8px;">
        <select
          id="uiSpinType"
          style="flex:1; padding:6px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
          value={spinType()}
          onChange={(e) => {
            setSpinType(e.target.value);
            updateRequestBody({ choice: e.target.value === 'free' ? 1 : undefined });
          }}
        >
          <option value="base">BaseSpin</option>
          <option value="free" disabled>FreeSpin (Legacy/Imported)</option>
        </select>

        <div style="position:relative; width:60px;">
          <span style="position:absolute; left:6px; top:50%; transform:translateY(-50%); font-size:9px; color:var(--text-muted); pointer-events:none;">Bet</span>
          <input
            type="number"
            id="uiBetAmount"
            value={betAmount()}
            style="width:100%; padding:6px 6px 6px 24px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
            onInput={(e) => {
              const v = parseFloat(e.target.value) || 20;
              setBetAmount(v);
              updateRequestBody({ betAmount: v });
            }}
          />
        </div>

        <select
          id="uiStake"
          style="flex:1; padding:6px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
          value={stake()}
          onChange={(e) => {
            setStake(e.target.value);
            updateRequestBody({ spinMode: e.target.value });
          }}
        >
          <option value="commonGame">commonGame</option>
          <option value="anteBet">anteBet</option>
          <option value="buyBonusGame">buyBonusGame</option>
        </select>
      </section>

      {/* Play row */}
      <div style="display:flex; gap:6px; align-items:center;">
        <button
          id="spinBtn"
          class="btn-primary"
          style="flex:1; height:36px; font-size:13px; font-weight:900;"
          disabled={autoPlayRunning()}
          onClick={handlePlay}
        >
          {autoPlayRunning() ? 'RUNNING...' : '▶ PLAY'}
        </button>

        <select
          id="playMode"
          style="padding:6px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
          value={mode()}
          onChange={(e) => { setMode(e.target.value); localStorage.setItem('play_mode', e.target.value); }}
        >
          <option value="single">Single</option>
          <option value="count">Play N</option>
          <option value="allCheatTemplates">All Cheats</option>
          <option value="untilWin">Until Win</option>
          <option value="untilLoss">Until Loss</option>
          <option value="untilFilter">Until Filter</option>
          <option value="untilConditionN">Until Targets</option>
        </select>

        <Show when={mode() === 'count'}>
          <input
            type="text"
            id="playCount"
            value={playCount()}
            placeholder="e.g. 100k"
            style="width:65px; padding:6px; font-size:11px; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
            onInput={(e) => { setPlayCount(e.target.value); localStorage.setItem('play_count', e.target.value); }}
          />
        </Show>

        <Show when={autoPlayRunning()}>
          <button id="stopAutoBtn" class="btn-ghost" onClick={() => setAutoPlayRunning(false)}>STOP</button>
        </Show>
      </div>

      {/* Until Targets condition picker */}
      <Show when={mode() === 'untilConditionN'}>
        <div id="targetConditionsGroup" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <div id="targetConditionsCheckboxes" style="display:flex; flex-wrap:wrap; gap:4px;">
            <For each={Object.entries(game().winCategories || {})}>
              {([cat, threshold]) => (
                <label style="display:flex; align-items:center; gap:4px; cursor:pointer; color:#ccc; font-size:10px;">
                  <input
                    type="checkbox"
                    class="target-cond-cb"
                    value={cat}
                    onChange={(e) => {
                      setTargetConditions((prev) =>
                        e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                      );
                    }}
                  />
                  {cat.replace('_WIN', '')} ({threshold}x)
                </label>
              )}
            </For>
          </div>
          <select
            id="targetConditionLogic"
            style="padding:4px; font-size:10px; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
            value={targetLogic()}
            onChange={(e) => setTargetLogic(e.target.value)}
          >
            <option value="OR">OR</option>
            <option value="AND">AND</option>
          </select>
          <input
            type="number"
            id="targetConditionCount"
            value={targetCount()}
            style="width:50px; padding:4px; font-size:10px; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
            onInput={(e) => setTargetCount(parseInt(e.target.value) || 1)}
          />
        </div>
      </Show>

      {/* Animation toggle */}
      <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-muted); cursor:pointer;">
        <input
          type="checkbox"
          id="disableAnimation"
          checked={bypassAnimation()}
          onChange={(e) => { setBypassAnimation(e.target.checked); localStorage.setItem('bypass_animation', e.target.checked); }}
        />
        Skip sequence animation
      </label>
    </div>
  );
}
