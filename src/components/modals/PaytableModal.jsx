import { Show, For, createSignal, createEffect } from 'solid-js';
import { paytableOpen, setPaytableOpen } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:680px;
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
    flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:16px;
  `,
};

export default function PaytableModal() {
  const close = () => setPaytableOpen(false);

  const symbolEntries = () => Object.entries(game().symbols || {});

  const paytable = () => game().paytable || [];

  const [currentBetAmount, setCurrentBetAmount] = createSignal(game().betBase || 20);

  createEffect(() => {
    if (paytableOpen()) {
      try {
        const stored = localStorage.getItem('request_body');
        if (stored) {
          const rb = JSON.parse(stored);
          if (rb.betAmount) setCurrentBetAmount(rb.betAmount);
        }
      } catch (e) {
        // ignore parse error
      }
    }
  });

  return (
    <Show when={paytableOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div style={S.panel} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          <div style={S.header}>
            <h2 id="paytableTitle" style={S.title}>📊 PAYTABLE — {game().name?.toUpperCase()}</h2>
            <button
              id="closePaytableBtn"
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            >×</button>
          </div>

          <div id="paytableContent" style={S.body}>

            {/* Symbol Glossary */}
            <Show when={symbolEntries().length > 0}>
              <div>
                <h3 style="color:#e2e8f0; font-size:12px; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid rgba(255,255,255,0.07); padding-bottom:6px;">
                  Symbol Glossary
                </h3>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  <For each={symbolEntries()}>
                    {([id, entry]) => {
                      const name  = typeof entry === 'object' ? entry.name  : entry;
                      const emoji = typeof entry === 'object' ? entry.emoji : '';
                      const color = typeof entry === 'object' ? entry.color : '#94a3b8';
                      return (
                        <div style={`display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:5px 10px;`}>
                          <span style="color:#475569; font-size:10px; font-family:monospace; min-width:16px;">{id}</span>
                          <span style="font-size:14px; line-height:1;">{emoji}</span>
                          <span style={`color:${color}; font-size:10px; font-weight:700; letter-spacing:0.03em;`}>{name}</span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* Game Details */}
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px; display:flex; flex-wrap:wrap; gap:16px;">
              <Show when={game().betBase}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Bet Base</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().betBase}</span>
                </div>
              </Show>
              <Show when={game().winCap || game().winCapCoins}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Win Cap</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().winCap || game().winCapCoins} coins</span>
                </div>
              </Show>
              <Show when={game().minClusterSize}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Min Cluster</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().minClusterSize}</span>
                </div>
              </Show>
              <Show when={game().scatterPayoutCoins}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Scatter Payout</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().scatterPayoutCoins} coins</span>
                </div>
              </Show>
              <Show when={game().anteBetMultiplier}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Ante Bet Mult</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().anteBetMultiplier}x</span>
                </div>
              </Show>
              <Show when={game().buyFeatureMultiplier}>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-size:9px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Buy Feature Mult</span>
                  <span style="font-size:12px; color:#e2e8f0; font-weight:700; font-family:monospace;">{game().buyFeatureMultiplier}x</span>
                </div>
              </Show>
            </div>

            {/* Payout Matrix */}
            <Show when={paytable().length > 0}>
              <div>
                <h3 style="display:flex; justify-content:space-between; align-items:flex-end; color:#e2e8f0; font-size:12px; font-weight:700; margin:0 0 10px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid rgba(255,255,255,0.07); padding-bottom:6px;">
                  <span>Payout Matrix <span style="color:#94a3b8; font-weight:400; text-transform:none;">(Dynamic)</span></span>
                  <span style="font-size:10px; color:#fbbf24;">Current Bet: {currentBetAmount()}</span>
                </h3>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <For each={paytable()}>
                    {(row, rowIndex) => {
                      const entry = game().symbols?.[rowIndex()];
                      const name  = typeof entry === 'object' ? entry.name  : (entry || `ID: ${rowIndex()}`);
                      const emoji = typeof entry === 'object' ? entry.emoji : '';
                      const color = typeof entry === 'object' ? entry.color : '#64748b';
                      return (
                        <div style="display:flex; align-items:center; background:rgba(255,255,255,0.03); padding:7px 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.07); gap:8px;">
                          <div style="display:flex; align-items:center; gap:6px; min-width:110px;">
                            <span style="font-size:13px; line-height:1;">{emoji}</span>
                            <span style={`color:${color}; font-size:10px; font-weight:700;`}>{name}</span>
                          </div>
                          <div style="display:flex; gap:6px; flex:1;">
                            <For each={row}>
                              {(val) => {
                                let scaledVal = val;
                                const base = game().betBase;
                                if (base && val > 0) {
                                  scaledVal = parseFloat(((val / base) * currentBetAmount()).toFixed(2));
                                }
                                return (
                                  <div style={`flex:1; text-align:center; font-size:10px; font-family:monospace; ${val > 0 ? `color:${color}; font-weight:800;` : 'color:#2d3748;'}`}>
                                    {val > 0 ? scaledVal : '–'}
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* Fallback: no data at all */}
            <Show when={symbolEntries().length === 0 && paytable().length === 0}>
              <div style="color:#f43f5e; font-size:11px; text-align:center; padding:16px; border:1px dashed #f43f5e; border-radius:8px;">
                ⚠️ No symbol or paytable data found. Run the backend extractor (bun run dev).
              </div>
            </Show>

          </div>
        </div>
      </div>
    </Show>
  );
}
