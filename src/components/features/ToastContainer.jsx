import { For, Show } from 'solid-js';
import { toasts, dismissToast } from '../../store/uiStore.js';
import { clearAllDataAndReload } from '../../services/gameService.js';

export default function ToastContainer() {
  return (
    <div style="position:fixed; top:16px; right:16px; z-index:9999; display:flex; flex-direction:column; gap:8px; max-width:360px;">
      <For each={toasts}>{(toast) => <Toast toast={toast} />}</For>
    </div>
  );
}

function Toast({ toast }) {
  if (toast.type === 'update') {
    return (
      <div class="update-toast">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <div style="font-size:11px; font-weight:900; color:var(--bg-accent); text-transform:uppercase; letter-spacing:1px;">
            New Version Available
          </div>
          <div style="font-size:10px; color:#fff; opacity:0.8;">{toast.message}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button
            class="btn-primary"
            style="padding:6px 12px; border-radius:8px; font-weight:800; font-size:10px;"
            onClick={() => clearAllDataAndReload(true)}
          >
            UPDATE
          </button>
          <button
            class="btn-ghost"
            style="padding:4px; border:none; background:transparent; color:#fff; opacity:0.4; font-size:14px;"
            title="Skip for now"
            onClick={() => {
              if (toast.serverVersion) localStorage.setItem('skip_update', toast.serverVersion);
              dismissToast(toast.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      class="error-toast update-toast"
      style="border-color:var(--error); background:rgba(244,63,94,0.15);"
    >
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="font-size:12px; font-weight:900; color:var(--error); text-transform:uppercase;">
          🚨 {toast.title}
        </div>
        <div style="font-size:11px; color:#fff; font-family:monospace;">{toast.message}</div>
      </div>
      <button
        style="background:transparent; color:#fff; border:none; font-size:16px; cursor:pointer;"
        onClick={() => dismissToast(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
