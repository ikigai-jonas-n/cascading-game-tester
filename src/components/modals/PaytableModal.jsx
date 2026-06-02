import { Show, For } from 'solid-js';
import { paytableOpen, setPaytableOpen } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';

export default function PaytableModal() {
  const close = () => setPaytableOpen(false);

  return (
    <Show when={paytableOpen()}>
      <dialog
        id="paytableModal"
        class="modal-dialog"
        style="display:block;"
        open
        onClose={close}
        onClick={(e) => { if (e.target.id === 'paytableModal') close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <h2 id="paytableTitle">📊 PAYTABLE — {game().name}</h2>
            <button id="closePaytableBtn" class="btn-ghost" onClick={close}>×</button>
          </div>
          <div id="paytableContent" class="modal-body" style="display:flex; flex-direction:column; gap:8px;">
            <Show when={game().rawBackendConfig}>
              <pre style="background:#000; color:#10b981; padding:16px; border-radius:8px; font-family:'JetBrains Mono',monospace; font-size:10px; white-space:pre-wrap; overflow-x:auto; border:1px solid var(--border-color);">
                {game().rawBackendConfig}
              </pre>
            </Show>
            <Show when={!game().rawBackendConfig}>
              <div style="color:var(--error); font-size:11px; text-align:center; padding:10px; border:1px dashed var(--error); border-radius:8px;">
                ⚠️ No backend data found. Run the node extraction script.
              </div>
            </Show>
            <Show when={game().paytable && Object.keys(game().paytable || {}).length > 0}>
              <For each={Object.entries(game().paytable || {})}>
                {([id, rule]) => {
                  const emoji = game().emojis?.[id] || '';
                  const name = game().symbols?.[id] !== undefined ? game().symbols[id] : `Symbol ${id}`;
                  const color = game().colors?.[id] || '#666';
                  return (
                    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                      <div style="display:flex; align-items:center; gap:12px;">
                        <div style="font-size:24px; width:32px; text-align:center;">{emoji}</div>
                        <div style="display:flex; flex-direction:column;">
                          <span style={`color:${color}; font-weight:900; font-size:12px; text-transform:uppercase;`}>{name}</span>
                          <span style="color:var(--text-muted); font-size:9px; font-family:monospace;">ID: {id}</span>
                        </div>
                      </div>
                      <div style="color:var(--success); font-weight:800; font-size:11px; text-align:right; max-width:60%;">{rule}</div>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
