import { createSignal, Show } from 'solid-js';
import { game, listGames, switchGame } from '../../store/gameStore.js';
import { apiUrl, setApiUrl, storageStats, autoStatus, setSettingsOpen, setQuickCheatOpen, setShortcutsOpen, setCustomGameOpen, setPaytableOpen } from '../../store/uiStore.js';
import { activeFilters, globalHistory, currentSortedList, sortField, setSortField, rebuildSortedList } from '../../store/historyStore.js';
import { triggerFilterUpdate, clearCurrentGame, clearAllHistory, clearFilteredHistory } from '../../services/gameService.js';
import { exportDataDirectFromDb } from '../../services/exportService.js';
import { triggerImport } from '../../services/exportService.js';
import PlayControls from '../features/PlayControls.jsx';
import FilterBar from '../features/FilterBar.jsx';
import SpinHistory from '../features/SpinHistory.jsx';

export default function LeftPanel() {
  let col1Ref;
  const [col1Width, setCol1Width] = createSignal(localStorage.getItem('col1_width') || '410px');

  function startResize(e) {
    const startX = e.clientX;
    const startWidth = col1Ref.offsetWidth;
    const onMove = (moveE) => {
      const newWidth = Math.max(200, startWidth + (moveE.clientX - startX));
      setCol1Width(newWidth + 'px');
      localStorage.setItem('col1_width', newWidth + 'px');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <aside
      id="col1"
      ref={col1Ref}
      aria-label="Game History and Controls"
      style={`width: ${col1Width()}; min-width: 250px; display: flex; flex-direction: column; overflow: hidden;`}
    >
      <header>
        {/* Title Row */}
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:center; gap:4px;">
              <h1>SLOT STUDIO</h1>
              <button class="header-btn-v5" style="min-width:unset; padding:2px 4px;" title="View Paytable" onClick={() => setPaytableOpen(true)}>
                <span class="icon">📊</span>
              </button>
              <button class="header-btn-v5" style="min-width:unset; padding:2px 4px;" title="Keyboard Shortcuts" onClick={() => setShortcutsOpen(true)}>
                <span class="icon">⌨️</span>
              </button>
              <button class="header-btn-v5" style="min-width:unset; padding:2px 4px;" title="Open Settings" onClick={() => setSettingsOpen(true)}>
                <span class="icon">⚙️</span>
              </button>
            </div>

            {/* Game + Env selectors */}
            <div style="display:flex; gap:6px; align-items:center;">
              <select
                id="headerGameSelect"
                style="background:rgba(255,255,255,0.05); color:var(--success); font-size:10px; font-weight:800; border:1px solid var(--border-color); border-radius:4px; padding:4px; max-width:120px;"
                onChange={(e) => {
                  switchGame(e.target.value);
                  localStorage.removeItem('request_body');
                  triggerFilterUpdate();
                }}
              >
                {listGames().map((g) => (
                  <option value={g.id} selected={g.id === game().id}>{g.name}</option>
                ))}
              </select>
              <button class="header-btn-v5" style="min-width:unset; padding:4px; height:100%;" title="Create Custom Sandbox Game" onClick={() => setCustomGameOpen(true)}>
                <span class="icon" style="font-size:12px;">➕</span>
              </button>
              <select
                id="headerEnvSelect"
                style="background:rgba(255,255,255,0.05); color:var(--info); font-size:10px; font-weight:800; border:1px solid var(--border-color); border-radius:4px; padding:4px;"
                value={apiUrl()}
                onChange={(e) => { setApiUrl(e.target.value); localStorage.setItem('api_url', e.target.value); }}
              >
                <option value="http://localhost:9000">LOCALHOST</option>
                <option value="https://letsgo-game-gs1.iki-cit.cc">CIT</option>
                <option value="https://letsgo-game-gs1.iki-qat.cc">QAT</option>
              </select>
            </div>
          </div>

          <span id="gameLabel" style="font-size:9px; color:var(--text-muted); font-weight:700; text-transform:uppercase;">{game().name}</span>

          {/* Action buttons */}
          <div style="display:flex; gap:4px; position:relative; align-items:center;">
            <button class="header-btn-v5" title="Quick Cheat TestConfig" onClick={() => setQuickCheatOpen(true)}>
              <span class="icon">⚡</span>
              <span class="label">Cheat</span>
            </button>
            <ExportMenu />
            <ImportMenu />
            <ClearMenu />
          </div>
        </div>

        <PlayControls />

        <span id="autoStatus" style="font-size:10px; color:var(--bg-accent);">{autoStatus()}</span>
        <div id="dbStorageStats" style="font-size:9px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; margin-top:4px;">{storageStats() || 'Storage: Calculating...'}</div>

        <FilterBar />
      </header>

      <section id="spinHistory" role="list" style="flex:1; overflow-y:auto; padding:20px;">
        <SpinHistory />
      </section>

      <div class="resizer" data-target="col1" onMouseDown={startResize} />
    </aside>
  );
}

function ExportMenu() {
  const [open, setOpen] = createSignal(false);
  const g = game;
  const date = () => new Date().toISOString().slice(0, 10);

  return (
    <div id="exportWrapper" style="display:contents; position:relative;">
      <button class="header-btn-v5" title="Export Options" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <span class="icon">📤</span>
        <span class="label">Export</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; right:0;" onClick={(e) => { setOpen(false); }}>
          <div class="dropdown-item" onClick={() => exportDataDirectFromDb(`slot-filtered-${g().id}-${date()}.json`, 'filtered', false)}>Export Filtered (Full)</div>
          <div class="dropdown-item" onClick={() => exportDataDirectFromDb(`slot-all-${g().id}-${date()}.json`, 'all', false)}>Export All (Full)</div>
          <div style="height:1px; background:var(--border-color); margin:4px 0;" />
          <div class="dropdown-item" onClick={() => exportDataDirectFromDb(`mapped-filtered-${g().id}-${date()}.json`, 'filtered', true)}>Mapped JSON (Filtered)</div>
          <div class="dropdown-item" onClick={() => exportDataDirectFromDb(`mapped-all-${g().id}-${date()}.json`, 'all', true)}>Mapped JSON (All)</div>
        </div>
      </Show>
    </div>
  );
}

function ImportMenu() {
  const [open, setOpen] = createSignal(false);
  return (
    <div id="importWrapper" style="display:contents; position:relative;">
      <button class="header-btn-v5" title="Import Options" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <span class="icon">📥</span>
        <span class="label">Import</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; right:0;" onClick={() => setOpen(false)}>
          <div class="dropdown-item" onClick={() => triggerImport('merge')}>Merge with existing</div>
          <div class="dropdown-item" onClick={() => triggerImport('replace')}>Totally replace</div>
        </div>
      </Show>
    </div>
  );
}

function ClearMenu() {
  const [open, setOpen] = createSignal(false);
  const filtered = () => currentSortedList();

  return (
    <div id="clearWrapper" style="display:contents; position:relative;">
      <button class="header-btn-v5" title="Clear Options" style="color:var(--error);" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <span class="icon">🗑️</span>
        <span class="label">Clear</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; right:0;" onClick={() => setOpen(false)}>
          <div class="dropdown-item" style="color:var(--bg-accent);" onClick={async () => {
            if (!confirm(`Delete ${filtered().length} filtered spins?`)) return;
            await clearFilteredHistory(filtered());
          }}>🗑️ Clear Filtered Results</div>
          <div class="dropdown-item" style="color:var(--bg-accent);" onClick={async () => {
            if (!confirm(`Delete ALL spin history for ${game().name}?`)) return;
            await clearCurrentGame();
          }}>🗑️ Clear Current Game</div>
          <div style="height:1px; background:var(--border-color); margin:4px 0;" />
          <div class="dropdown-item" style="color:var(--error);" onClick={async () => {
            if (!confirm('Delete ALL spin history? This cannot be undone.')) return;
            await clearAllHistory();
          }}>⚠️ Clear ALL Games (Wipe DB)</div>
        </div>
      </Show>
    </div>
  );
}
