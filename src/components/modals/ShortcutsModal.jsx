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

export default function ShortcutsModal() {
  return (
    <Show when={shortcutsOpen()}>
      <dialog
        id="shortcutsModal"
        class="modal-dialog"
        style="display:block;"
        open
        onClose={() => setShortcutsOpen(false)}
        onClick={(e) => {
          if (e.target.id === 'shortcutsModal') setShortcutsOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setShortcutsOpen(false);
        }}
      >
        <div class="modal-content" style="max-width:480px;">
          <div class="modal-header">
            <h2>⌨️ Keyboard Shortcuts</h2>
            <button
              id="closeShortcutsBtn"
              class="btn-ghost"
              onClick={() => setShortcutsOpen(false)}
            >
              ×
            </button>
          </div>
          <div class="modal-body">
            <table style="width:100%; border-collapse:collapse;">
              {SHORTCUTS.map(({ key, desc }) => (
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:8px 12px 8px 0; font-family:monospace; font-size:11px; color:var(--bg-accent); font-weight:800; white-space:nowrap; width:40%;">
                    {key}
                  </td>
                  <td style="padding:8px 0; font-size:11px; color:var(--text-muted);">{desc}</td>
                </tr>
              ))}
            </table>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
