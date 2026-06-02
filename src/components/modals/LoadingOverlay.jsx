import { Show } from 'solid-js';
import { loadingState } from '../../store/uiStore.js';

export default function LoadingOverlay() {
  return (
    <Show when={loadingState.visible}>
      <div id="loadingOverlay" class="show" style="position:fixed; inset:0; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);">
        <div style="background:var(--bg-card); padding:32px 48px; border-radius:16px; border:1px solid var(--border-color); display:flex; flex-direction:column; align-items:center; gap:16px; min-width:280px;">
          <div style="font-size:12px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;" id="loadingText">
            {loadingState.message}
          </div>
          <Show when={loadingState.percent >= 0}>
            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
              <div id="loadingBar" style={`height:100%; background:var(--bg-accent); transition:width 0.3s; width:${loadingState.percent}%;`} />
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
