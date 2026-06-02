import { createSignal, Show, createMemo } from 'solid-js';
import HudDisplay from '../features/HudDisplay.jsx';
import GameGrid from '../features/GameGrid.jsx';
import PlaybackControls from '../features/PlaybackControls.jsx';
import { gameState } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { currentSpinIndex } from '../../store/sessionStore.js';
import { game } from '../../store/gameStore.js';

export default function CenterPanel() {
  const currentSpin = createMemo(() => globalHistory[currentSpinIndex()]);

  return (
    <main
      id="col2"
      style="flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; padding:20px;"
    >
      {/* Top HUD */}
      <Show when={currentSpin()}>
        <HudDisplay spin={currentSpin()} />
      </Show>

      {/* Grid Area */}
      <div style="flex:1; display:flex; align-items:center; justify-content:center; position:relative; min-height:0; overflow:hidden;">
        <div
          id="grid-main-wrapper"
          style="display:flex; flex-direction:column; align-items:center; gap:16px;"
        >
          <GameGrid />
        </div>
      </div>

      {/* Playback Controls */}
      <Show when={currentSpin()}>
        <PlaybackControls />
      </Show>
    </main>
  );
}
