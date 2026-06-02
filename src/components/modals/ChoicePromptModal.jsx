import { Show, For } from 'solid-js';
import { choicePromptOpen, setChoicePromptOpen, choicePromptChoices } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';
import { resolveChoice } from '../../services/spinService.js';

export default function ChoicePromptModal() {
  function pickChoice(choiceId) {
    setChoicePromptOpen(false);
    resolveChoice(choiceId);
  }

  return (
    <Show when={choicePromptOpen()}>
      <dialog
        id="choicePromptModal"
        class="modal-dialog"
        style="display:block;"
        open
        onKeyDown={(e) => { if (e.key === 'Escape') { setChoicePromptOpen(false); resolveChoice(choicePromptChoices()[0]); } }}
      >
        <div class="modal-content" style="max-width:400px;">
          <div class="modal-header">
            <h2>Select Action</h2>
          </div>
          <div id="choicePromptButtons" class="modal-body" style="display:flex; flex-direction:column; gap:8px;">
            <For each={choicePromptChoices()}>
              {(choiceId) => {
                const actionDef = game().actions?.find((a) => a.id === choiceId);
                const desc = actionDef ? actionDef.desc : `Action ${choiceId}`;
                return (
                  <button
                    class="btn-primary"
                    style="padding:12px; font-size:12px;"
                    onClick={() => pickChoice(choiceId)}
                  >
                    <span style="opacity:0.6; margin-right:8px;">[{choiceId}]</span>
                    {desc}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
