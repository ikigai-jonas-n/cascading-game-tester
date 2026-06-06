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
            <Show when={game().symbols && game().symbols.length > 0}>
              <div style="margin-bottom: 20px;">
                <h3 style="color:#e2e8f0; font-size:12px; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">Symbols</h3>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                  <For each={game().symbols}>
                    {(sym) => (
                      <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:4px 8px; font-size:10px;">
                        <span style="color:#94a3b8; margin-right:6px;">ID: {sym.id}</span>
                        <span style="color:#10b981; font-weight:bold;">{sym.category}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={game().paytable && game().paytable.length > 0}>
              <h3 style="color:#e2e8f0; font-size:12px; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">Payout Matrix</h3>
              <div style="display:flex; flex-direction:column; gap:4px;">
                <For each={game().paytable}>
                  {(row, rowIndex) => (
                    <div style="display:flex; align-items:center; background:rgba(255,255,255,0.03); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.07);">
                      <div style="width:40px; color:#64748b; font-size:10px; font-weight:bold;">ID: {rowIndex()}</div>
                      <div style="display:flex; gap:8px; flex:1;">
                        <For each={row}>
                          {(val, colIndex) => (
                            <div style={`flex:1; text-align:center; font-size:10px; font-family:monospace; ${val > 0 ? 'color:#10b981; font-weight:bold;' : 'color:#475569;'}`}>
                              {val}
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
