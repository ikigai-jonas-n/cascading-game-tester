import { Show } from 'solid-js';
import { loadingState, hideLoading } from '../../store/uiStore.js';

export default function LoadingOverlay() {
  return (
    <Show when={loadingState.visible}>
      <div
        id="loadingOverlay"
        style={`
          position:fixed;
          bottom:20px;
          left:50%;
          transform:translateX(-50%);
          z-index:99999;
          pointer-events:auto;
          display:flex;
          flex-direction:column;
          align-items:stretch;
          gap:8px;
          min-width:280px;
          max-width:480px;
        `}
        onKeyDown={(e) => { if (e.key === 'Escape') hideLoading(); }}
      >
        <div style="background:#0f1318; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:12px 16px; display:flex; align-items:center; gap:12px; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
          {/* Spinner */}
          <div style="width:16px; height:16px; border:2px solid rgba(255,255,255,0.1); border-top-color:var(--bg-accent); border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0;" />

          {/* Text */}
          <div id="loadingText" style="font-size:11px; font-weight:700; color:var(--text-primary); letter-spacing:0.5px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            {loadingState.message}
          </div>

          {/* Dismiss button */}
          <button
            style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:0 4px; line-height:1; flex-shrink:0;"
            title="Dismiss (Esc)"
            onClick={hideLoading}
          >×</button>
        </div>

        {/* Progress bar — only shown when percent >= 0 */}
        <Show when={loadingState.percent >= 0}>
          <div style="height:3px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
            <div
              id="loadingBar"
              style={`height:100%; background:var(--bg-accent); transition:width 0.3s; width:${loadingState.percent}%;`}
            />
          </div>
        </Show>
      </div>

      {/* CSS spinner keyframe injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Show>
  );
}

