import { createSignal, Show, createMemo, onMount, onCleanup } from 'solid-js';
import HudDisplay from '../features/HudDisplay.jsx';
import GameGrid from '../features/GameGrid.jsx';
import PlaybackControls from '../features/PlaybackControls.jsx';
import { gameState } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { game } from '../../store/gameStore.js';

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
      style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; overflow:hidden; padding:20px; gap:0;"
    >
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
        <HudDisplay />
      </Show>

      {/* GRID — only this area scales */}
      <div
        ref={gridContainerRef}
        style="flex:1; display:flex; align-items:center; justify-content:center; min-height:0; overflow:hidden; width:100%;"
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
