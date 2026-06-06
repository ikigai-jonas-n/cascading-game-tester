import { Show, For } from 'solid-js';
import { choicePromptOpen, setChoicePromptOpen, choicePromptChoices } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';
import { resolveChoice } from '../../services/spinService.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1100;
    background:rgba(0,0,0,0.8); backdrop-filter:blur(6px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:420px;
    background:#0f1318;
    border:1px solid rgba(255,255,255,0.12);
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
  title: `font-size:15px; font-weight:700; color:#e2e8f0; margin:0;`,
  body: `padding:20px 24px; display:flex; flex-direction:column; gap:10px;`,
};

export default function ChoicePromptModal() {
  function pickChoice(choiceId) {
    setChoicePromptOpen(false);
    resolveChoice(choiceId);
  }

  return (
    <Show when={choicePromptOpen()}>
      <div style={S.overlay} onKeyDown={(e) => { if (e.key === 'Escape') { setChoicePromptOpen(false); resolveChoice(choicePromptChoices()[0]); } }}>
        <div style={S.panel}>
          <div style={S.header}>
            <h2 style={S.title}>🎯 Select Action</h2>
          </div>
          <div id="choicePromptButtons" style={S.body}>
            <For each={choicePromptChoices()}>
              {(choiceId) => {
                const actionDef = game().actions?.find((a) => a.id === choiceId);
                const desc = actionDef ? actionDef.desc : `Action ${choiceId}`;
                return (
                  <button
                    style="width:100%; padding:14px 16px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; letter-spacing:0.04em; transition:background 0.15s;"
                    onClick={() => pickChoice(choiceId)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; }}
                  >
                    <span style="opacity:0.6; margin-right:10px; font-family:monospace;">[{choiceId}]</span>
                    {desc}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
