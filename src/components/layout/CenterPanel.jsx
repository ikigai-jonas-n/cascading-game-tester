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
  
  let containerRef;
  let contentRef;
  const [scale, setScale] = createSignal(1);

  onMount(() => {
    const updateScale = () => {
      if (!containerRef || !contentRef) return;
      const containerW = containerRef.clientWidth;
      const containerH = containerRef.clientHeight;
      const contentW = contentRef.offsetWidth;
      const contentH = contentRef.offsetHeight;

      if (contentW === 0 || contentH === 0) return;

      const style = window.getComputedStyle(containerRef);
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

      const availW = Math.max(0, containerW - paddingX);
      const availH = Math.max(0, containerH - paddingY);

      // Allow scaling down and up to fit the screen
      const newScale = Math.min(availW / contentW, availH / contentH);
      
      setScale(newScale);
    };

    const observer = new ResizeObserver(() => {
      updateScale();
    });

    if (containerRef) observer.observe(containerRef);
    if (contentRef) observer.observe(contentRef);

    onCleanup(() => observer.disconnect());
  });

  return (
    <main
      ref={containerRef}
      id="col2"
      style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; overflow:hidden; padding:20px;"
    >
      <div
        ref={contentRef}
        style={`display:flex; flex-direction:column; align-items:stretch; justify-content:center; width:max-content; height:max-content; transform:scale(${scale()}); transform-origin:center center;`}
      >
        <Show 
          when={currentSpin()}
          fallback={
            <div style="display:flex; flex-direction:column; align-items:center; gap:24px; padding:60px 80px; background:rgba(255,255,255,0.02); border-radius:24px; border:1px dashed rgba(255,255,255,0.1); text-align:center;">
              <div style="font-size:64px; opacity:0.8; filter:drop-shadow(0 4px 12px rgba(0,0,0,0.5));">{globalHistory.length > 0 ? '👈' : '🎰'}</div>
              <div>
                <h3 style="margin:0 0 12px 0; color:var(--text-primary); font-size:24px; font-weight:800; letter-spacing:0.5px;">
                  {globalHistory.length > 0 ? 'Select a Spin' : 'No Data Available'}
                </h3>
                <p style="margin:0; color:var(--text-muted); font-size:14px; max-width:300px; line-height:1.6;">
                  {globalHistory.length > 0 
                    ? 'Please select a spin history card from the left panel to view its full details and playback.' 
                    : 'Run a test config or play a spin to generate history data.'}
                </p>
              </div>
            </div>
          }
        >
          {/* Top HUD */}
          <HudDisplay spin={currentSpin()} />

          {/* Grid Area */}
          <div style="display:flex; align-items:center; justify-content:center; position:relative;">
            <div
              id="grid-main-wrapper"
              style="display:flex; flex-direction:column; align-items:center; gap:16px;"
            >
              <GameGrid />
            </div>
          </div>

          {/* Playback Controls */}
          <PlaybackControls />
        </Show>
      </div>
    </main>
  );
}
