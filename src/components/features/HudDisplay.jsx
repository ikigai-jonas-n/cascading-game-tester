import { createMemo } from 'solid-js';
import { gameState } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { computeFieldWin, isPayingField } from '../../services/spinService.js';
import { game } from '../../store/gameStore.js';

function scaledFontSize(val, baseEm = 1.6) {
  const len = String(val).length;
  if (len > 9) return baseEm * 0.55 + 'em';
  if (len > 7) return baseEm * 0.7 + 'em';
  if (len > 5) return baseEm * 0.85 + 'em';
  return baseEm + 'em';
}

export default function HudDisplay() {
  const spin = createMemo(() => globalHistory[currentSpinIndex()]);
  const field = createMemo(() => gameState.fields[gameState.currentIndex]);
  const phase = createMemo(() => gameState.currentFramePhase);
  const summary = createMemo(() => gameState.summary);

  const mult = createMemo(() => (field()?.features?.cumulativeMultiplier || 1) + 'x');

  const displayCoins = createMemo(() => {
    const f = field();
    if (!f) return 0;
    const isInitial = phase() === 'initial';
    return isInitial || !isPayingField(f, game()) ? 0 : computeFieldWin(f, game());
  });

  const displayAccWin = createMemo(() => {
    const f = field();
    const idx = gameState.currentIndex;
    if (!f) return 0;
    const isInitial = phase() === 'initial';
    const prev = idx > 0 ? gameState.accumulatedWins[idx - 1] : 0;
    return isInitial || !isPayingField(f, game()) ? prev : gameState.accumulatedWins[idx];
  });

  const totalWin = createMemo(() => summary()?.coins ?? 0);
  const tumbleCount = createMemo(() => gameState.fields.length);
  const cascadeCount = createMemo(
    () => gameState.fields.filter((f) => isPayingField(f, game())).length,
  );

  const tumbleLabel = createMemo(() => {
    const s = spin();
    const idx = gameState.currentIndex;
    if (!s) return '';
    const meta = s.fieldMetadata?.[idx];
    if (meta?.playgroundIndex !== undefined) {
      const localIdx = s.fieldMetadata
        .slice(0, idx + 1)
        .filter((m) => m.playgroundIndex === meta.playgroundIndex).length;
      const stats = s.playgroundStats?.[meta.playgroundIndex];
      const totalLocal = stats ? stats.tumbleCount : '?';
      return `TUMBLE ${localIdx} / ${totalLocal}`;
    }
    return `TUMBLE ${idx + 1} / ${tumbleCount()}`;
  });

  const cascadeLabel = createMemo(() => {
    const f = field();
    const idx = gameState.currentIndex;
    if (!f) return '';
    const payingBefore = gameState.fields
      .slice(0, idx)
      .filter((x) => isPayingField(x, game())).length;
    return `· CASCADE ${payingBefore + 1}`;
  });

  const phaseStatus = createMemo(() => {
    const f = field();
    if (!f) return '';
    const idx = gameState.currentIndex;
    const total = tumbleCount();
    const isInitial = phase() === 'initial';
    const isLastTumble = idx === total - 1;
    const isPayingTumble = isPayingField(f, game());
    if (isInitial) return { text: 'GROW', color: 'var(--bg-accent)' };
    if (isLastTumble) return { text: 'END', color: 'var(--text-muted)' };
    return isPayingTumble
      ? { text: 'POP', color: '#10b981' }
      : { text: 'GROW', color: 'var(--bg-accent)' };
  });

  return (
    <div class="glass" style="position:relative; max-width:380px; padding:10px 14px; border-radius:12px; display:flex; flex-direction:column; gap:10px; margin:0 auto 16px auto; box-sizing:border-box;">
      {/* Header row: tumble nav + phase badge in top-right */}
      <div style="display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
        <span
          id="tumbleNavLabel"
          style="font-size:11px; font-weight:900; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;"
        >
          {tumbleLabel()}
        </span>
        <span
          id="cascadeNavLabel"
          style={`font-size:10px; color:var(--bg-accent); font-weight:800; opacity:${isPayingField(field(), game()) ? '1' : '0.45'};`}
        >
          {cascadeLabel()}
        </span>

        {/* Phase badge — top-right of header */}
        <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
          <div style="font-size:9px; color:var(--text-muted); text-transform:uppercase; font-weight:700; letter-spacing:1.5px;">PHASE</div>
          <div
            id="phaseStatusText"
            style={`font-size:13px; font-weight:900; color:${phaseStatus().color}; letter-spacing:1px; min-width:36px; text-align:right;`}
          >
            {phaseStatus().text}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style="display:flex; justify-content:space-between; text-align:center; padding:4px 0;">
        <div class="hud-stat" style="flex:1;">
          <div class="hud-label" style="font-size:10px; color:var(--text-muted); font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">MULT</div>
          <div
            id="multDisplay"
            class="hud-value"
            style={`font-size:${scaledFontSize(mult(), 1.4)}; color:var(--bg-accent); font-weight:900;`}
          >
            {mult()}
          </div>
        </div>
        <div style="width:1px; background:rgba(255,255,255,0.05); margin:0 8px;"></div>
        <div class="hud-stat" style="flex:1;">
          <div class="hud-label" style="font-size:10px; color:var(--text-muted); font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">WIN</div>
          <div
            id="currentTumbleWin"
            class="hud-value"
            style={`font-size:${scaledFontSize(displayCoins(), 1.4)}; font-weight:900;`}
          >
            {displayCoins()}
          </div>
        </div>
        <div style="width:1px; background:rgba(255,255,255,0.05); margin:0 8px;"></div>
        <div class="hud-stat" style="flex:1;">
          <div class="hud-label" style="font-size:10px; color:var(--text-muted); font-weight:700; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px;">ACC WIN</div>
          <div
            id="accWinDisplay"
            class="hud-value"
            style={`font-size:${scaledFontSize(displayAccWin(), 1.4)}; color:var(--bg-accent); font-weight:900;`}
          >
            {displayAccWin()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style="display:flex; justify-content:center; align-items:center; gap:8px; font-size:10px; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
        <span><b>{tumbleCount()}</b> tumbles</span>
        <span>·</span>
        <span><b>{cascadeCount()}</b> cascades</span>
        <span>·</span>
        <span><b style="color:var(--success)">{totalWin()}</b> total</span>
        <span id="tumbleCount" style="display:none;">{tumbleCount()}</span>
        <span id="cascadeCount" style="display:none;">{cascadeCount()}</span>
      </div>
    </div>
  );
}

