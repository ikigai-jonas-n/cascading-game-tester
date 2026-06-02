import { createSignal, Show } from 'solid-js';
import { game } from '../../store/gameStore.js';
import { playSpin } from '../../services/spinService.js';
import { autoPlayRunning, setAutoPlayRunning, bypassAnimation, setBypassAnimation } from '../../store/sessionStore.js';

export default function PlayControls() {
  const [cheatTemplates, setCheatTemplates] = createSignal([]);
  const [allCheatTemplates, setAllCheatTemplates] = createSignal({});

  async function loadTemplates() {
    try {
      const resp = await fetch('/cheat-tool-templates.json');
      if (!resp.ok) return;
      const data = await resp.json();
      setAllCheatTemplates(data);
      setCheatTemplates(data[game().id] || []);
    } catch (e) {
      console.warn('Failed to load cheat templates', e);
    }
  }

  // Load on mount
  if (typeof window !== 'undefined') loadTemplates();

  const [mode, setMode] = createSignal(localStorage.getItem('play_mode') || 'single');
  const [playCount, setPlayCount] = createSignal(localStorage.getItem('play_count') || '10k');
  const [targetConditions, setTargetConditions] = createSignal([]);
  const [targetLogic, setTargetLogic] = createSignal('OR');
  const [targetCount, setTargetCount] = createSignal(1);

  async function handlePlay() {
    if (autoPlayRunning()) return;
    const config = JSON.parse(localStorage.getItem('request_body') || '{}');
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
      {/* Spin type / bet row */}
      <section class="spin-settings-ui" style="display:flex; gap:6px;">
        <select
          id="uiSpinType"
          style="flex:1; padding:6px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
          onChange={(e) => {
            const rb = JSON.parse(localStorage.getItem('request_body') || '{}');
            rb.choice = e.target.value === 'free' ? 1 : undefined;
            localStorage.setItem('request_body', JSON.stringify(rb, null, 2));
          }}
        >
          <option value="base">BaseSpin</option>
          <option value="free" disabled>FreeSpin (Legacy/Imported)</option>
        </select>
        <div style="position:relative; width:60px;">
          <span style="position:absolute; left:6px; top:50%; transform:translateY(-50%); font-size:9px; color:var(--text-muted);">Bet</span>
          <input
            type="number"
            id="uiBetAmount"
            value="20"
            style="width:100%; padding:6px 6px 6px 24px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
            onInput={(e) => {
              const rb = JSON.parse(localStorage.getItem('request_body') || '{}');
              rb.betAmount = parseFloat(e.target.value) || 20;
              rb.cashBet = rb.betAmount;
              localStorage.setItem('request_body', JSON.stringify(rb, null, 2));
            }}
          />
        </div>
        <select
          id="uiStake"
          style="flex:1; padding:6px; font-size:11px; font-weight:800; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;"
          onChange={(e) => {
            const rb = JSON.parse(localStorage.getItem('request_body') || '{}');
            rb.spinMode = e.target.value;
            if (Array.isArray(rb.stakes)) rb.stakes[0] = { type: e.target.value };
            localStorage.setItem('request_body', JSON.stringify(rb, null, 2));
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

      {/* Win condition targets */}
      <Show when={mode() === 'untilConditionN'}>
        <div id="targetConditionsGroup" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <div id="targetConditionsCheckboxes" style="display:flex; flex-wrap:wrap; gap:4px;">
            {Object.entries(game().winCategories || {}).map(([cat, threshold]) => (
              <label style="display:flex; align-items:center; gap:4px; cursor:pointer; color:#ccc; font-size:10px;">
                <input
                  type="checkbox"
                  class="target-cond-cb"
                  value={cat}
                  onChange={(e) => {
                    const val = cat;
                    setTargetConditions((prev) =>
                      e.target.checked ? [...prev, val] : prev.filter((c) => c !== val),
                    );
                  }}
                />
                {cat.replace('_WIN', '')} ({threshold}x)
              </label>
            ))}
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

      {/* Disable animation toggle */}
      <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-muted); cursor:pointer;">
        <input
          type="checkbox"
          id="disableAnimation"
          checked={bypassAnimation()}
          onChange={(e) => {
            setBypassAnimation(e.target.checked);
            localStorage.setItem('bypass_animation', e.target.checked);
          }}
        />
        Skip sequence animation
      </label>
    </div>
  );
}
