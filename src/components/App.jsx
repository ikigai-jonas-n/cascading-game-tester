import { onMount, onCleanup } from 'solid-js';
import LeftPanel from './layout/LeftPanel.jsx';
import CenterPanel from './layout/CenterPanel.jsx';
import RightPanel from './layout/RightPanel.jsx';
import LoadingOverlay from './modals/LoadingOverlay.jsx';
import SettingsModal from './modals/SettingsModal.jsx';
import QuickCheatModal from './modals/QuickCheatModal.jsx';
import ShortcutsModal from './modals/ShortcutsModal.jsx';
import CustomGameModal from './modals/CustomGameModal.jsx';
import PaytableModal from './modals/PaytableModal.jsx';
import ChoicePromptModal from './modals/ChoicePromptModal.jsx';
import MongoRoundImportModal from './modals/MongoRoundImportModal.jsx';
import ToastContainer from './features/ToastContainer.jsx';
import {
  navigateFrame,
  navigateRound,
  navigateSpinFiltered,
  togglePlayback,
} from '../services/spinService.js';
import { currentSpinIndex, setCurrentSpinIndex } from '../store/sessionStore.js';
import { globalHistory, rebuildSortedList } from '../store/historyStore.js';
import { game } from '../store/gameStore.js';

export default function App() {
  function onKeyDown(e) {
    const isInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const isInTablist = document.activeElement?.closest('#rawTabs');

    if (!isInput && !isInTablist) {
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) navigateRound(-1);
        else if (e.altKey || e.metaKey) navigateSpinFiltered(-1);
        else navigateFrame(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) navigateRound(1);
        else if (e.altKey || e.metaKey) navigateSpinFiltered(1);
        else navigateFrame(1);
        return;
      }
    }

    if (e.key === 'Escape' && currentSpinIndex() !== -1) {
      // Only deselect if no filter input or modal is open
      if (
        document.querySelector(
          '.filter-condition-input, .filter-inline-picker, .filter-inline-input',
        )
      )
        return;
      if (document.querySelector('dialog[open]')) return;

      setCurrentSpinIndex(-1);
      localStorage.removeItem('last_spin_index');
      rebuildSortedList();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', onKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <>
      <LoadingOverlay />
      <ToastContainer />

      <div id="appLayout" style="display:flex; height:100vh; overflow:hidden;">
        <LeftPanel />
        <CenterPanel />
        <RightPanel />
      </div>

      <SettingsModal />
      <QuickCheatModal />
      <ShortcutsModal />
      <CustomGameModal />
      <PaytableModal />
      <ChoicePromptModal />
      <MongoRoundImportModal />

      {/* Cell inspector tooltip */}
      <div
        id="inspector"
        style="display:none; position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.9); border:1px solid rgba(255,255,255,0.2); padding:8px 12px; border-radius:8px; font-size:11px; font-family:monospace; color:#fff; z-index:9999; pointer-events:none;"
      >
        <div id="inspSymbol" style="font-weight:800;"></div>
        <div id="inspPos" style="color:#888; font-size:9px; margin-top:2px;"></div>
      </div>

      {/* Description tooltip */}
      <div
        id="desc-tooltip"
        style="position:fixed; z-index:9999; background:rgba(0,0,0,0.9); color:#ccc; padding:6px 10px; border-radius:6px; font-size:10px; pointer-events:none; display:none;"
      ></div>
    </>
  );
}
