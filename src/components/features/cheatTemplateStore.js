/**
 * Shared cheat template state.
 * Loaded once at app boot, shared by PlayControls + QuickCheatModal.
 */
import { createSignal } from 'solid-js';

export const [allCheatTemplates, setAllCheatTemplates] = createSignal({});
export const [cheatTemplatesLoaded, setCheatTemplatesLoaded] = createSignal(false);

export async function loadCheatTemplates() {
  if (cheatTemplatesLoaded()) return;
  try {
    const resp = await fetch('/cheat-tool-templates.json');
    if (!resp.ok) return;
    setAllCheatTemplates(await resp.json());
    setCheatTemplatesLoaded(true);
  } catch (e) {
    console.warn('Failed to load cheat templates', e);
  }
}
