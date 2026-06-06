import { createSignal, Show, onMount, For } from 'solid-js';
import { game, listGames, switchGame } from '../../store/gameStore.js';
import {
  apiUrl,
  setApiUrl,
  autoStatus,
  setSettingsOpen,
  setQuickCheatOpen,
  setShortcutsOpen,
  setPaytableOpen,
  setMongoRoundImportOpen,
  leftPanelFontSize,
} from '../../store/uiStore.js';
import {
  currentSortedList,
  rebuildSortedList,
  setActiveFilters,
} from '../../store/historyStore.js';
import {
  triggerFilterUpdate,
  clearCurrentGame,
  clearAllHistory,
  clearFilteredHistory,
} from '../../services/gameService.js';
import { exportDataDirectFromDb, triggerImport } from '../../services/exportService.js';
import PlayControls from '../features/PlayControls.jsx';
import FilterBar from '../features/FilterBar.jsx';
import SpinHistory from '../features/SpinHistory.jsx';

export default function LeftPanel() {
  let col1Ref;
  const savedW = localStorage.getItem('col1_width') || '410px';
  const [col1Width, setCol1Width] = createSignal(savedW);

  function startResize(e) {
    e.preventDefault(); // FIX: Prevent text selection glitch
    const startX = e.clientX;
    const startWidth = col1Ref.offsetWidth;
    col1Ref.style.transition = 'none'; // FIX: Remove lag during drag

    const onMove = (ev) => {
      const w = Math.max(200, startWidth + (ev.clientX - startX));
      setCol1Width(w + 'px');
    };
    const onUp = () => {
      col1Ref.style.transition = '';
      localStorage.setItem('col1_width', col1Width());
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
      style={`width:${col1Width()}; min-width:250px; flex-shrink:0; display:flex; flex-direction:column; overflow:hidden; position:relative; font-size:${leftPanelFontSize()}px;`}
    >
      <header>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div style="display:flex; flex-direction:column; gap:6px; min-width:180px;">
            <div style="display:flex; align-items:center; gap:4px;">
              <h1>SLOT STUDIO</h1>
              <button
                class="header-btn-v5"
                style="min-width:unset; padding:2px 4px;"
                title="View Paytable"
                onClick={() => setPaytableOpen(true)}
              >
                <span class="icon">📊</span>
              </button>
              <button
                class="header-btn-v5"
                style="min-width:unset; padding:2px 4px;"
                title="Keyboard Shortcuts"
                onClick={() => setShortcutsOpen(true)}
              >
                <span class="icon">⌨️</span>
              </button>
              <button
                class="header-btn-v5"
                style="min-width:unset; padding:2px 4px;"
                title="Open Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <span class="icon">⚙️</span>
              </button>
            </div>

            <div style="display:flex; gap:6px; align-items:center;">
              <select
                id="headerGameSelect"
                style="background:rgba(255,255,255,0.05); color:var(--success); font-size:10px; font-weight:800; border:1px solid var(--border-color); border-radius:4px; padding:4px; max-width:120px;"
                value={game().id}
                onChange={(e) => {
                  switchGame(e.target.value);
                  localStorage.removeItem('request_body');
                  triggerFilterUpdate();
                }}
              >
                <For each={listGames()}>{(g) => <option value={g.id}>{g.gameCode || g.id}: {g.name || 'Unnamed'}</option>}</For>
              </select>

              <select
                id="headerEnvSelect"
                style="background:rgba(255,255,255,0.05); color:var(--info); font-size:10px; font-weight:800; border:1px solid var(--border-color); border-radius:4px; padding:4px;"
                value={apiUrl()}
                onChange={(e) => {
                  setApiUrl(e.target.value);
                  localStorage.setItem('api_url', e.target.value);
                }}
              >
                <option value="http://localhost:9000">LOCALHOST</option>
                <option value="https://letsgo-game-gs1.iki-cit.cc">CIT</option>
                <option value="https://letsgo-game-gs1.iki-qat.cc">QAT</option>
              </select>
            </div>
          </div>

          <span
            id="gameLabel"
            style="font-size:9px; color:var(--text-muted); font-weight:700; text-transform:uppercase;"
          >
            {game().name}
          </span>

          <div style="display:flex; gap:4px; position:relative; align-items:center;">
            <button
              class="header-btn-v5"
              id="quickCheatBtn"
              title="Quick Cheat TestConfig"
              onClick={() => setQuickCheatOpen(true)}
            >
              <span class="icon">⚡</span>
              <span class="label">CHEAT</span>
            </button>

            <ExportMenu />
            <ImportMenu />
            <ClearMenu />
          </div>
        </div>

        <PlayControls />

        <Show when={autoStatus()}>
          <span id="autoStatus" style="font-size:10px; color:var(--bg-accent);">
            {autoStatus()}
          </span>
        </Show>
        <FilterBar />
      </header>

      <section id="spinHistory" role="list" style="flex:1; overflow-y:auto; padding:20px;">
        <SpinHistory />
      </section>

      <div class="resizer" data-target="col1" onMouseDown={startResize} />
    </aside>
  );
}

/* ── Dropdown menus (FIXED CLICK ISOLATION) ──────────────────────────────── */

function ExportMenu() {
  const [open, setOpen] = createSignal(false);
  let containerRef;
  const date = () => new Date().toISOString().slice(0, 10);

  onMount(() => {
    const close = (e) => {
      if (containerRef && !containerRef.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });

  return (
    <div style="position:relative;" ref={containerRef}>
      <button
        id="exportMenuBtn"
        class="header-btn-v5"
        title="Export Options"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="icon">📤</span>
        <span class="label">EXPORT</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; left:0; z-index:1000;">
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              exportDataDirectFromDb(
                `slot-filtered-${game().id}-${date()}.json`,
                'filtered',
                false,
              );
            }}
          >
            Export Filtered (Full)
          </div>
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              exportDataDirectFromDb(`slot-all-${game().id}-${date()}.json`, 'all', false);
            }}
          >
            Export All (Full)
          </div>
          <div style="height:1px; background:var(--border-color); margin:4px 0;" />
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              exportDataDirectFromDb(
                `mapped-filtered-${game().id}-${date()}.json`,
                'filtered',
                true,
              );
            }}
          >
            Mapped JSON (Filtered)
          </div>
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              exportDataDirectFromDb(`mapped-all-${game().id}-${date()}.json`, 'all', true);
            }}
          >
            Mapped JSON (All)
          </div>
        </div>
      </Show>
    </div>
  );
}

function ImportMenu() {
  const [open, setOpen] = createSignal(false);
  let containerRef;

  onMount(() => {
    const close = (e) => {
      if (containerRef && !containerRef.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });

  return (
    <div style="position:relative;" ref={containerRef}>
      <button
        id="importMenuBtn"
        class="header-btn-v5"
        title="Import Options"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="icon">📥</span>
        <span class="label">IMPORT</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; right:0; z-index:1000;">
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              triggerImport('merge');
            }}
          >
            Merge with existing
          </div>
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              triggerImport('replace');
            }}
          >
            Totally replace
          </div>
          <div style="height:1px; background:var(--border-color); margin:4px 0;" />
          <div
            class="dropdown-item"
            onClick={() => {
              setOpen(false);
              setMongoRoundImportOpen(true);
            }}
          >
            🍃 Import Mongo Round
          </div>
        </div>
      </Show>
    </div>
  );
}

function ClearMenu() {
  const [open, setOpen] = createSignal(false);
  let containerRef;
  const filtered = () => currentSortedList();

  onMount(() => {
    const close = (e) => {
      if (containerRef && !containerRef.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  });

  return (
    <div style="position:relative;" ref={containerRef}>
      <button
        id="clearMenuBtn"
        class="header-btn-v5"
        title="Clear Options"
        style="color:var(--error);"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="icon">🗑️</span>
        <span class="label">CLEAR</span>
      </button>
      <Show when={open()}>
        <div class="dropdown-menu" style="display:block; top:100%; right:0; z-index:1000;">
          <div
            class="dropdown-item"
            style="color:var(--bg-accent);"
            onClick={async () => {
              setOpen(false);
              if (filtered().length === 0) {
                alert('No filtered results to clear.');
                return;
              }
              if (!confirm(`Delete ${filtered().length} filtered spins? This cannot be undone.`))
                return;
              await clearFilteredHistory(filtered());
            }}
          >
            🗑️ Clear Filtered Results
          </div>
          <div
            class="dropdown-item"
            style="color:var(--bg-accent);"
            onClick={async () => {
              setOpen(false);
              if (!confirm(`Delete ALL spin history for ${game().name}?`)) return;
              await clearCurrentGame();
            }}
          >
            🗑️ Clear Current Game
          </div>
          <div style="height:1px; background:var(--border-color); margin:4px 0;" />
          <div
            class="dropdown-item"
            style="color:var(--error);"
            onClick={async () => {
              setOpen(false);
              if (!confirm('Delete ALL spin history? This cannot be undone.')) return;
              await clearAllHistory();
            }}
          >
            ⚠️ Clear ALL Games (Wipe DB)
          </div>
        </div>
      </Show>
    </div>
  );
}
