import { createSignal, onMount } from 'solid-js';
import {
  togglePlayback,
  stepPlayback,
  startSpinPlayback,
  navigateFrame,
  navigateRound,
  navigateSpinFiltered,
} from '../../services/spinService.js';
import {
  playbackSpeed,
  setPlaybackSpeed,
  isAutoReplay,
  setIsAutoReplay,
  isAutoplayOnSelect,
  setIsAutoplayOnSelect,
  playbackInterval,
} from '../../store/sessionStore.js';
import { gameState, currentSpinIndex } from '../../store/sessionStore.js';
import { globalHistory } from '../../store/historyStore.js';
import { registerPlaybackLabelSetters } from '../../services/drawerService.js';

export default function PlaybackControls() {
  const [phase, setPhase] = createSignal('INITIAL');
  const [tumbleLabel, setTumbleLabel] = createSignal('');
  const [spinId, setSpinId] = createSignal('');
  const [isPlaying, setIsPlaying] = createSignal(false);

  onMount(() => {
    registerPlaybackLabelSetters({
      setPhase,
      setTumble: setTumbleLabel,
      setSpinId,
      setPlaying: setIsPlaying,
    });
  });

  const speedLabel = () => playbackSpeed().toFixed(2) + 'x';

  function handleSpeedChange(e) {
    const val = parseFloat(e.target.value);
    setPlaybackSpeed(val);
    localStorage.setItem('playback_speed', val);
    if (playbackInterval()) {
      stopPlayback();
      togglePlayback();
    }
  }

  return (
    <nav
      class="glass playback-nav"
      style="margin-top:40px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; padding:10px 24px; border-radius:16px; margin-left:auto; margin-right:auto; max-width:fit-content; gap:32px;"
    >
      {/* Left: Speed */}
      <div style="display:flex; align-items:center; gap:12px; border-right:1px solid rgba(255,255,255,0.1); padding-right:24px; justify-self:start;">
        <div style="display:flex; flex-direction:column; gap:2px; min-width:90px;">
          <span style="font-size:8px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">
            SPEED
          </span>
          <span
            id="speedValueLabel"
            style="font-size:12px; font-weight:900; color:var(--bg-accent); font-family:monospace;"
          >
            {speedLabel()}
          </span>
        </div>
        <input
          type="range"
          id="playbackSpeed"
          min="0.25"
          max="4"
          step="0.25"
          value={playbackSpeed()}
          class="speed-slider"
          style="width:90px;"
          onInput={handleSpeedChange}
        />
      </div>

      {/* Center: Playback Buttons */}
      <div style="display:flex; flex-direction:column; align-items:center; gap:6px; justify-self:center;">
        <div class="control-hub" style="display:flex; align-items:flex-start; gap:10px;">
          {/* Prev Spin */}
          <div class="nav-btn-container">
            <button
              id="prevBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Previous Spin (⏮️)"
              onClick={() => navigateSpinFiltered(-1)}
            >
              <span style="font-size:14px;">⏮️</span>
            </button>
            <span class="nav-label">prev spin</span>
          </div>
          {/* Prev Round */}
          <div class="nav-btn-container">
            <button
              id="prevRoundBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Previous Round"
              onClick={() => navigateRound(-1)}
            >
              <span style="font-size:14px;">⏪</span>
            </button>
            <span class="nav-label">prev round</span>
          </div>
          {/* Prev Frame */}
          <div class="nav-btn-container">
            <button
              id="playbackBackBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Previous Frame"
              onClick={() => stepPlayback(-1)}
            >
              <span style="font-size:14px;">◀</span>
            </button>
            <span class="nav-label">prev frame</span>
          </div>
          {/* Play/Pause */}
          <div class="nav-btn-container">
            <button
              id="playbackPlayBtn"
              class={`btn-primary ${isPlaying() ? 'playing' : ''}`}
              style="padding:10px; border-radius:12px; width:44px; height:44px; font-size:18px; display:flex; align-items:center; justify-content:center;"
              onClick={togglePlayback}
            >
              {isPlaying() ? <span id="pauseIcon">⏸</span> : <span id="playIcon">▶</span>}
            </button>
            <span class="nav-label">play</span>
          </div>
          {/* Next Frame */}
          <div class="nav-btn-container">
            <button
              id="playbackForwardBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Next Frame"
              onClick={() => stepPlayback(1)}
            >
              <span style="font-size:14px;">▶</span>
            </button>
            <span class="nav-label">next frame</span>
          </div>
          {/* Next Round */}
          <div class="nav-btn-container">
            <button
              id="nextRoundBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Next Round"
              onClick={() => navigateRound(1)}
            >
              <span style="font-size:14px;">⏩</span>
            </button>
            <span class="nav-label">next round</span>
          </div>
          {/* Next Spin */}
          <div class="nav-btn-container">
            <button
              id="nextBtn"
              class="btn-ghost"
              style="padding:6px; border-radius:8px;"
              title="Next Spin (⏭️)"
              onClick={() => navigateSpinFiltered(1)}
            >
              <span style="font-size:14px;">⏭️</span>
            </button>
            <span class="nav-label">next spin</span>
          </div>
        </div>

        {/* Labels */}
        <div style="display:flex; align-items:center; gap:8px; font-size:10px; color:var(--text-muted);">
          <span
            id="currentPhaseLabel"
            style="font-weight:800; text-transform:uppercase; color:var(--text-primary);"
          >
            {phase()}
          </span>
          <span>·</span>
          <span id="currentTumbleLabel">{tumbleLabel()}</span>
          <span id="currentSpinIdLabel" style="color:var(--text-muted); opacity:0.6;">
            {spinId()}
          </span>
        </div>
      </div>

      {/* Right: Auto controls */}
      <div style="display:flex; align-items:center; gap:8px; border-left:1px solid rgba(255,255,255,0.1); padding-left:24px; justify-self:end;">
        {/* Auto ON */}
        <div class="nav-btn-container">
          <button
            id="playbackAutoBtn"
            class={`btn-ghost ${isAutoReplay() ? 'active-pulse' : ''}`}
            style="padding:6px; border-radius:8px;"
            title="Auto Replay"
            onClick={() => {
              const next = !isAutoReplay();
              setIsAutoReplay(next);
              localStorage.setItem('is_auto_replay', next);
            }}
          >
            <span style="font-size:14px;">🔁</span>
          </button>
          <span class="nav-label">auto on</span>
        </div>
        {/* Replay */}
        <div class="nav-btn-container">
          <button
            id="playbackReplayBtn"
            class="btn-ghost"
            style="padding:6px; border-radius:8px;"
            title="Replay Spin"
            onClick={startSpinPlayback}
          >
            <span style="font-size:14px;">🔄</span>
          </button>
          <span class="nav-label">replay</span>
        </div>
        {/* Autoplay on Select */}
        <div class="nav-btn-container">
          <button
            id="playbackAutoplayBtn"
            class={`btn-ghost ${isAutoplayOnSelect() ? 'active-pulse' : ''}`}
            style="padding:6px; border-radius:8px;"
            title="Auto-play on select"
            onClick={() => {
              const next = !isAutoplayOnSelect();
              setIsAutoplayOnSelect(next);
              localStorage.setItem('autoplay_on_select', next);
            }}
          >
            <span style="font-size:14px;">▶️</span>
          </button>
          <span class="nav-label">repeat</span>
        </div>
      </div>
    </nav>
  );
}
