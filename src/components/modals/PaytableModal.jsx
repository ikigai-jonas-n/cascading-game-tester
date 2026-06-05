import { Show, For } from 'solid-js';
import { paytableOpen, setPaytableOpen } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:600px;
    max-height:calc(100vh - 40px);
    background:#0f1318;
    border:1px solid rgba(255,255,255,0.1);
    border-radius:12px;
    display:flex; flex-direction:column;
    overflow:hidden;
    box-shadow:0 24px 80px rgba(0,0,0,0.7);
  `,
  header: `
    display:flex; align-items:center; justify-content:space-between;
    padding:18px 24px 16px;
    border-bottom:1px solid rgba(255,255,255,0.07);
    flex-shrink:0;
  `,
  title: `
    font-size:15px; font-weight:700; color:#e2e8f0;
    letter-spacing:0.03em; margin:0;
  `,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `
    flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:8px;
  `,
};

export default function PaytableModal() {
  const close = () => setPaytableOpen(false);

  return (
    <Show when={paytableOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div style={S.panel} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          <div style={S.header}>
            <h2 id="paytableTitle" style={S.title}>📊 PAYTABLE — {game().name}</h2>
            <button
              id="closePaytableBtn"
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            >×</button>
          </div>
          <div id="paytableContent" style={S.body}>
            <Show when={game().rawBackendConfig}>
              <pre style="background:#000; color:#10b981; padding:16px; border-radius:8px; font-family:'JetBrains Mono',monospace; font-size:10px; white-space:pre-wrap; overflow-x:auto; border:1px solid rgba(255,255,255,0.1);">
                {game().rawBackendConfig}
              </pre>
            </Show>
            <Show when={!game().rawBackendConfig}>
              <div style="color:#f43f5e; font-size:11px; text-align:center; padding:10px; border:1px dashed #f43f5e; border-radius:8px;">
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
                    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
                      <div style="display:flex; align-items:center; gap:12px;">
                        <div style="font-size:24px; width:32px; text-align:center;">{emoji}</div>
                        <div style="display:flex; flex-direction:column;">
                          <span style={`color:${color}; font-weight:900; font-size:12px; text-transform:uppercase;`}>{name}</span>
                          <span style="color:#64748b; font-size:9px; font-family:monospace;">ID: {id}</span>
                        </div>
                      </div>
                      <div style="color:#10b981; font-weight:800; font-size:11px; text-align:right; max-width:60%;">{rule}</div>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
