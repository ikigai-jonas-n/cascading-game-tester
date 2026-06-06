import { createSignal, Show, createMemo, onMount, onCleanup } from 'solid-js';
import HudDisplay from '../features/HudDisplay.jsx';
import GameGrid from '../features/GameGrid.jsx';
import PlaybackControls from '../features/PlaybackControls.jsx';
import { gameState } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { game } from '../../store/gameStore.js';
import { 
  leftCollapsed, 
  showFloatingTumbleStats,
  floatingStatsWidth,
  setFloatingStatsWidth,
  floatingStatsHeight,
  setFloatingStatsHeight
} from '../../store/uiStore.js';
import { TumbleRow } from '../features/TumbleAudit.jsx';

export default function CenterPanel() {
  const currentSpin = createMemo(() => globalHistory[currentSpinIndex()]);

  let gridContainerRef;
  let gridContentRef;
  const [scale, setScale] = createSignal(1);

  onMount(() => {
    const updateScale = () => {
      if (!gridContainerRef || !gridContentRef) return;
      const containerW = gridContainerRef.clientWidth;
      const containerH = gridContainerRef.clientHeight;
      const contentW = gridContentRef.offsetWidth;
      const contentH = gridContentRef.offsetHeight;

      if (contentW === 0 || contentH === 0) return;

      const style = window.getComputedStyle(gridContainerRef);
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

      const availW = Math.max(0, containerW - paddingX);
      const availH = Math.max(0, containerH - paddingY);

      const newScale = Math.min(availW / contentW, availH / contentH, 1);
      setScale(newScale);
    };

    const observer = new ResizeObserver(() => {
      updateScale();
    });

    if (gridContainerRef) observer.observe(gridContainerRef);
    if (gridContentRef) observer.observe(gridContentRef);

    onCleanup(() => observer.disconnect());
  });

  return (
    <main
      id="col2"
      style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; overflow:hidden; padding:20px; gap:0; position:relative;"
    >
      <Show when={currentSpin() && (leftCollapsed() || showFloatingTumbleStats())}>
        <FloatingTumbleStats spin={currentSpin()} idx={gameState.currentIndex} />
      </Show>

      {/* TOP HUD — fixed size, not scaled */}
      <Show when={!currentSpin()}>
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-bottom:16px; padding:20px; background:rgba(255,255,255,0.02); border-radius:16px; border:1px dashed rgba(255,255,255,0.1); text-align:center;">
          <h3 style="margin:0; color:var(--text-primary); font-size:18px; font-weight:800; letter-spacing:0.5px;">
            {globalHistory.length > 0 ? 'Select a Spin' : 'No Data Available'}
          </h3>
          <p style="margin:0; color:var(--text-muted); font-size:13px; max-width:300px;">
            {globalHistory.length > 0
              ? 'Select a spin card from the left panel to playback.'
              : 'Play a spin to generate history.'}
          </p>
        </div>
      </Show>

      <Show when={currentSpin()}>
        <div style="position:relative; display:flex; flex-direction:column; align-items:center; z-index:10;">
          <HudDisplay />
          <Show when={currentSpin().description}>
            <div style="position:absolute; top:95%; left:50%; transform:translateX(-50%); font-size:14px; font-weight:800; color:var(--text-primary); letter-spacing:0.5px; white-space:nowrap; pointer-events:none;">
              {currentSpin().description}
            </div>
          </Show>
        </div>
      </Show>

      {/* GRID — only this area scales */}
      <div
        ref={gridContainerRef}
        style="flex:1; display:flex; align-items:center; justify-content:center; min-height:0; overflow:hidden; width:100%; position:relative;"
      >

        <div
          ref={gridContentRef}
          style={`transform:scale(${scale()}); transform-origin:center center; display:inline-flex; flex-direction:column; align-items:center;`}
        >
          <div id="grid-main-wrapper" style="display:flex; flex-direction:column; align-items:center; gap:16px;">
            <GameGrid />
          </div>
        </div>
      </div>

      {/* BOTTOM PLAYBACK — fixed size, not scaled */}
      <Show when={currentSpin()}>
        <PlaybackControls />
      </Show>
    </main>
  );
}

function FloatingTumbleStats(props) {
  const f = createMemo(() => props.spin?.fields?.[props.idx]);
  
  const localIdx = createMemo(() => {
    const s = props.spin;
    if (!s) return 1;
    const meta = s.fieldMetadata?.[props.idx];
    if (meta?.playgroundIndex !== undefined) {
      return s.fieldMetadata
        .slice(0, props.idx + 1)
        .filter((m) => m.playgroundIndex === meta.playgroundIndex).length;
    }
    return props.idx + 1;
  });

  let statsRef;

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Need to add padding/border to the contentRect to get actual style size
        const target = entry.target;
        const computed = window.getComputedStyle(target);
        const pb = parseFloat(computed.paddingBottom) || 0;
        const pt = parseFloat(computed.paddingTop) || 0;
        const pl = parseFloat(computed.paddingLeft) || 0;
        const pr = parseFloat(computed.paddingRight) || 0;
        
        const totalW = Math.round(width + pl + pr);
        const totalH = Math.round(height + pt + pb);

        // Only save if it actually changed meaningfully (prevents saving on initial mount layout)
        if (Math.abs(totalW - floatingStatsWidth()) > 5 || Math.abs(totalH - floatingStatsHeight()) > 5) {
          setFloatingStatsWidth(totalW);
          setFloatingStatsHeight(totalH);
          localStorage.setItem('floating_stats_width', totalW);
          localStorage.setItem('floating_stats_height', totalH);
        }
      }
    });

    if (statsRef) observer.observe(statsRef);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div 
      ref={statsRef}
      style={`position:absolute; top:20px; right:25px; z-index:5; background:rgba(0,0,0,0.85); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px; overflow-y:auto; overflow-x:hidden; backdrop-filter:blur(8px); resize:both; width:${floatingStatsWidth()}px; height:${floatingStatsHeight()}px;`}
    >
      <Show when={f()} fallback={<div style="color:var(--text-muted); font-size:10px;">No tumble data</div>}>
        <TumbleRow f={f()} tIdx={props.idx} localIdx={localIdx()} isCurrent={true} />
      </Show>
    </div>
  );
}
