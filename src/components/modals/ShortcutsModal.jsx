import { Show } from 'solid-js';
import { shortcutsOpen, setShortcutsOpen } from '../../store/uiStore.js';

const SHORTCUTS = [
  { key: 'Space', desc: 'Play / Pause tumble playback' },
  { key: '← →', desc: 'Navigate frames (initial ↔ final ↔ next tumble)' },
  { key: 'Shift + ← →', desc: 'Navigate rounds (BaseSpin ↔ FreeSpin)' },
  { key: 'Alt/⌘ + ← →', desc: 'Navigate to previous / next spin' },
  { key: 'Esc', desc: 'Deselect current spin' },
  { key: 'Arrow keys (on card)', desc: 'Navigate spin cards up/down' },
  { key: 'Arrow keys (in tumble audit)', desc: 'Navigate tumble items' },
  { key: 'Tab', desc: 'Move focus through interactive elements' },
];

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:520px;
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
  title: `font-size:15px; font-weight:700; color:#e2e8f0; letter-spacing:0.03em; margin:0;`,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `flex:1; overflow-y:auto; padding:20px 24px;`,
};

export default function ShortcutsModal() {
  const close = () => setShortcutsOpen(false);
  return (
    <Show when={shortcutsOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div style={S.panel} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
          <div style={S.header}>
            <h2 style={S.title}>⌨️ Keyboard Shortcuts</h2>
            <button
              id="closeShortcutsBtn"
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
            >×</button>
          </div>
          <div style={S.body}>
            <table style="width:100%; border-collapse:collapse;">
              {SHORTCUTS.map(({ key, desc }) => (
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                  <td style="padding:10px 12px 10px 0; font-family:monospace; font-size:11px; color:#f59e0b; font-weight:800; white-space:nowrap; width:40%;">{key}</td>
                  <td style="padding:10px 0; font-size:11px; color:#94a3b8;">{desc}</td>
                </tr>
              ))}
            </table>
          </div>
        </div>
      </div>
    </Show>
  );
}
