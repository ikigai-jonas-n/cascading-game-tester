import { createMemo } from 'solid-js';
import { gameState } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { isSettleField, getFieldEffectiveWin } from '../../services/spinService.js';

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
    return isInitial || !isSettleField(f) ? 0 : getFieldEffectiveWin(f);
  });

  const displayAccWin = createMemo(() => {
    const f = field();
    const idx = gameState.currentIndex;
    if (!f) return 0;
    const isInitial = phase() === 'initial';
    const prev = idx > 0 ? gameState.accumulatedWins[idx - 1] : 0;
    return isInitial || !isSettleField(f) ? prev : gameState.accumulatedWins[idx];
  });

  const totalWin = createMemo(() => summary()?.coins ?? 0);
  const tumbleCount = createMemo(() => gameState.fields.length);
  const cascadeCount = createMemo(() =>
    gameState.fields.filter((f) => parseFloat(f.coins || 0) > 0 && isSettleField(f)).length,
  );

  const tumbleLabel = createMemo(() => {
    const s = spin();
    const idx = gameState.currentIndex;
    if (!s) return '';
    const meta = s.fieldMetadata?.[idx];
    if (meta?.playgroundIndex !== undefined) {
      const localIdx = s.fieldMetadata.slice(0, idx + 1).filter((m) => m.playgroundIndex === meta.playgroundIndex).length;
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
    const payingBefore = gameState.fields.slice(0, idx).filter((x) => parseFloat(x.coins || 0) > 0 && isSettleField(x)).length;
    return `· CASCADE ${payingBefore + 1}`;
  });

  const phaseStatus = createMemo(() => {
    const f = field();
    if (!f) return '';
    const idx = gameState.currentIndex;
    const total = tumbleCount();
    const isInitial = phase() === 'initial';
    const isLastTumble = idx === total - 1;
    const isPayingTumble = parseFloat(f.coins || 0) > 0 && isSettleField(f);
    if (isInitial) return { text: 'GROW', color: 'var(--bg-accent)' };
    if (isLastTumble) return { text: 'END', color: 'var(--text-muted)' };
    return isPayingTumble ? { text: 'POP', color: '#10b981' } : { text: 'GROW', color: 'var(--bg-accent)' };
  });

  return (
    <div class="glass hud-top" style="display:grid; grid-template-columns:1fr auto 1fr; gap:16px; padding:12px 20px; border-radius:12px; margin-bottom:16px; align-items:center;">

      {/* Left: Tumble nav */}
      <div style="display:flex; flex-direction:column; gap:2px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="tumbleNavLabel" style="font-size:11px; font-weight:900; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">{tumbleLabel()}</span>
          <span id="cascadeNavLabel" style={`font-size:10px; color:var(--text-muted); opacity:${(parseFloat(field()?.coins || 0) > 0 && isSettleField(field())) ? '1' : '0.45'};`}>{cascadeLabel()}</span>
        </div>
        <div style="display:flex; gap:12px; font-size:10px; color:var(--text-muted);">
          <span><b>{tumbleCount()}</b> tumbles</span>
          <span id="cascadeCountTop"><b>{cascadeCount()}</b> cascades</span>
          <span id="tumbleCount" style="display:none;">{tumbleCount()}</span>
          <span id="cascadeCount" style="display:none;">{cascadeCount()}</span>
        </div>
      </div>

      {/* Center: MULT / WIN / ACC WIN */}
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:20px; text-align:center;">
        <div class="hud-stat">
          <div class="hud-label">MULT</div>
          <div id="multDisplay" class="hud-value" style={`font-size:${scaledFontSize(mult())}; color:var(--bg-accent);`}>{mult()}</div>
        </div>
        <div class="hud-stat">
          <div class="hud-label">WIN</div>
          <div id="currentTumbleWin" class="hud-value" style={`font-size:${scaledFontSize(displayCoins())};`}>{displayCoins()}</div>
        </div>
        <div class="hud-stat">
          <div class="hud-label">ACC WIN</div>
          <div id="accWinDisplay" class="hud-value" style={`font-size:${scaledFontSize(displayAccWin())}; color:var(--bg-accent);`}>{displayAccWin()}</div>
        </div>
      </div>

      {/* Right: Phase + Total */}
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
        <div class="glass phase-badge" style="text-align:center; padding:6px 16px; border-radius:8px;">
          <div style="font-size:8px; color:var(--text-muted); text-transform:uppercase; font-weight:700; letter-spacing:1px;">PHASE</div>
          <div id="phaseStatusText" style={`font-size:14px; font-weight:900; color:${phaseStatus().color}; letter-spacing:1px;`}>{phaseStatus().text}</div>
        </div>
        <div style="font-size:9px; color:var(--text-muted); text-align:right;">
          <span id="totalWin" style={`font-size:${scaledFontSize(totalWin(), 1.0)}; font-weight:900; color:var(--text-primary);`}>{totalWin()}</span>
          <span style="margin-left:4px;">total</span>
        </div>
      </div>
    </div>
  );
}
