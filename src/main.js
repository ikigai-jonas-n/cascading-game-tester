import { getActiveGame, setActiveGame, listGames } from './game-registry.js';
import {
  saveSpin,
  loadAllSpins,
  saveAllSpins,
  clearAllSpins,
  getNextSpinNum,
  getSpinCount,
  migrateFromLocalStorage,
} from './db.js';
import { FILTER_DEFS, WIN_OPERATORS, applyFilters } from './filters.js';

// ── Active Game Config (plugin-driven) ───────────────────────────────────────
let game = getActiveGame();
let SYMBOLS = game.symbols;
let EMOJIS = game.emojis;
let SYMBOL_COLORS = game.colors;

function switchGame(id) {
  setActiveGame(id);
  game = getActiveGame();
  SYMBOLS = game.symbols;
  EMOJIS = game.emojis;
  SYMBOL_COLORS = game.colors;
  document.getElementById('gameLabel').innerText = game.name;
  renderSymbolMap();
  const totalCells = game.grid.rows * game.grid.cols;
  renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const spinBtn = document.getElementById('spinBtn');
const grid = document.getElementById('grid');
const multDisplay = document.getElementById('multDisplay');
const spinHistoryEl = document.getElementById('spinHistory');
const exportBtn = document.getElementById('exportBtn');
const importMenuBtn = document.getElementById('importMenuBtn');
const importDropdown = document.getElementById('importDropdown');
const importMergeBtn = document.getElementById('importMergeBtn');
const importReplaceBtn = document.getElementById('importReplaceBtn');

const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const requestBodyTextarea = document.getElementById('requestBody');
const disableAnimCheckbox = document.getElementById('disableAnimation');
const clearDataBtn = document.getElementById('clearDataBtn');

// Export Menu refs
const exportMenuBtn = document.getElementById('exportMenuBtn');
const exportDropdown = document.getElementById('exportDropdown');
const exportFilteredBtn = document.getElementById('exportFilteredBtn');
const exportAllBtn = document.getElementById('exportAllBtn');

if (exportMenuBtn) {
  exportMenuBtn.onclick = (e) => {
    e.stopPropagation();
    const isShowing = exportDropdown.style.display === 'block';
    exportDropdown.style.display = isShowing ? 'none' : 'block';
  };
  document.addEventListener('click', () => {
    exportDropdown.style.display = 'none';
  });
}

// Play mode controls
const playModeSelect = document.getElementById('playMode');
const playCountInput = document.getElementById('playCount');

// Restore Play Mode
if (playModeSelect) {
  const savedMode = localStorage.getItem('play_mode');
  if (savedMode) playModeSelect.value = savedMode;
  playModeSelect.addEventListener('change', (e) => {
    localStorage.setItem('play_mode', e.target.value);
  });
}

// Restore Play Until N
if (playCountInput) {
  const savedCount = localStorage.getItem('play_count');
  if (savedCount) playCountInput.value = savedCount;
  playCountInput.addEventListener('input', (e) => {
    localStorage.setItem('play_count', e.target.value);
  });
}
const stopAutoBtn = document.getElementById('stopAutoBtn');

// ── Settings Init ────────────────────────────────────────────────────────────
const savedRequestBody = localStorage.getItem('request_body');
if (savedRequestBody) {
  requestBodyTextarea.value = savedRequestBody;
} else if (!requestBodyTextarea.value || requestBodyTextarea.value.trim() === '') {
  requestBodyTextarea.value = JSON.stringify(game.defaultRequestBody, null, 2);
}

function syncSpinSettingsUI() {
  const uiSpinType = document.getElementById('uiSpinType');
  const uiBetAmount = document.getElementById('uiBetAmount');
  const uiStake = document.getElementById('uiStake');
  if (!uiSpinType || !uiBetAmount || !uiStake) return;

  try {
    const config = JSON.parse(requestBodyTextarea.value);
    
    // Update UI from config
    uiSpinType.value = config.choice === 1 ? 'free' : 'base';
    uiBetAmount.value = config.betAmount || 20;
    uiStake.value = config.spinMode || 'commonGame';

    const updateConfig = () => {
      try {
        const c = JSON.parse(requestBodyTextarea.value);
        if (uiSpinType.value === 'free') {
          c.choice = 1;
        } else {
          delete c.choice;
        }
        c.betAmount = parseFloat(uiBetAmount.value) || 20;
        c.cashBet = c.betAmount; // assuming cashBet mirrors betAmount
        c.spinMode = uiStake.value;
        const str = JSON.stringify(c, null, 2);
        requestBodyTextarea.value = str;
        localStorage.setItem('request_body', str);
      } catch (e) {
        console.error('Failed to parse request JSON', e);
      }
    };

    uiSpinType.addEventListener('change', updateConfig);
    uiBetAmount.addEventListener('input', updateConfig);
    uiStake.addEventListener('change', updateConfig);
  } catch (e) {
    console.error('Initial request body is invalid JSON', e);
  }
}
syncSpinSettingsUI();

// Sequence Animation (Default: OFF, which means bypassAnimation=true)
const savedBypass = localStorage.getItem('bypass_animation');
let bypassAnimation = savedBypass === null ? true : savedBypass === 'true';

if (disableAnimCheckbox) {
  disableAnimCheckbox.checked = bypassAnimation;
  disableAnimCheckbox.onchange = (e) => {
    bypassAnimation = e.target.checked;
    localStorage.setItem('bypass_animation', bypassAnimation);
  };
}

let lastFocusedElementBeforeModal = null;
let showDoubleGrid = localStorage.getItem('show_double_grid') === 'true';
let singleViewMode = localStorage.getItem('single_view_mode') || 'both'; // 'both' | 'final' | 'initial'

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingBar = document.getElementById('loadingBar');

function showLoading(msg, percent = -1) {
  if (loadingOverlay) {
    loadingText.innerText = msg;
    if (loadingBar && percent >= 0) {
      loadingBar.style.width = `${percent}%`;
    }
    if (loadingOverlay.style.display !== 'flex') {
      loadingOverlay.style.display = 'flex';
      // Trigger entrance animation next frame
      requestAnimationFrame(() => {
        loadingOverlay.style.transform = 'translateY(0)';
        loadingOverlay.style.opacity = '1';
      });
    }
  }
}
function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.transform = 'translateY(20px)';
    loadingOverlay.style.opacity = '0';
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
      if (loadingBar) loadingBar.style.width = '0%';
    }, 300);
  }
}

openSettingsBtn.onclick = () => {
  lastFocusedElementBeforeModal = document.activeElement;
  
  const apiUrlInput = document.getElementById('apiUrlInput');
  if (apiUrlInput) apiUrlInput.value = API_URL;

  const syncBtn = document.getElementById('syncHistoryBtn');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      if (!confirm('Re-sync default history from json_files/default_data.json? Existing data will be merged.')) return;
      localStorage.removeItem('default_data_loaded');
      await loadDefaultData(true);
    };
  }

  const doubleGridToggle = document.getElementById('showDoubleGrid');
  if (doubleGridToggle) doubleGridToggle.checked = showDoubleGrid;

  settingsModal.showModal();
  const firstInput = settingsModal.querySelector('select, input, button');
  if (firstInput) firstInput.focus();
};

const closeSettings = () => {
  settingsModal.close();
  if (lastFocusedElementBeforeModal) lastFocusedElementBeforeModal.focus();
};

closeSettingsBtn.onclick = closeSettings;
saveSettingsBtn.onclick = () => {
  const apiUrlInput = document.getElementById('apiUrlInput');
  if (apiUrlInput) {
    API_URL = apiUrlInput.value || 'http://localhost:9000';
    localStorage.setItem('api_url', API_URL);
  }
  // Persist request body so it survives reload
  if (requestBodyTextarea.value && requestBodyTextarea.value.trim() !== '') {
    localStorage.setItem('request_body', requestBodyTextarea.value);
  }
  settingsModal.close();
  location.reload(); 
};

if (clearDataBtn) {
  clearDataBtn.onclick = async () => {
    const confirmed = confirm('Are you sure you want to clear ALL data? This will reset all settings, history, and bookmarks. This action cannot be undone.');
    if (confirmed) {
      try {
        // Clear all localStorage
        localStorage.clear();
        
        // Clear IndexedDB spins
        const { clearAllSpins } = await import('./db.js');
        await clearAllSpins();
        
        alert('All local data has been cleared. The application will now reload.');
        location.reload();
      } catch (err) {
        console.error('Failed to clear data:', err);
        alert('An error occurred while clearing data. Check console for details.');
      }
    }
  };
}

// Basic Focus Trap inside settings modal
settingsModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSettings();
    return;
  }
  if (e.key === 'Tab') {
    const focusableElements = settingsModal.querySelectorAll('select, button, input');
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      /* shift + tab */
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      /* tab */
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }
});

// ── Game Selector (inside settings) ──────────────────────────────────────────
const gameSelect = document.getElementById('gameSelect');
if (gameSelect) {
  listGames().forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (g.id === game.id) opt.selected = true;
    gameSelect.appendChild(opt);
  });
  gameSelect.onchange = () => {
    switchGame(gameSelect.value);
    localStorage.removeItem('request_body');
    requestBodyTextarea.value = JSON.stringify(game.defaultRequestBody, null, 2);
  };
}

document.getElementById('gameLabel').innerText = game.name;

// ── Symbol Mapping Overlay ───────────────────────────────────────────────────
// Default: ON
const savedSymbolMap = localStorage.getItem('show_symbol_map');
let showSymbolMap = savedSymbolMap === null ? true : savedSymbolMap === 'true';

const symbolMapCheckbox = document.getElementById('showSymbolMap');
const symbolMapOverlay = document.getElementById('symbolMapOverlay');

function renderSymbolMap() {
  if (!symbolMapOverlay) return;
  if (!showSymbolMap) {
    symbolMapOverlay.style.display = 'none';
    return;
  }
  symbolMapOverlay.style.display = 'block';
  symbolMapOverlay.innerHTML = Object.entries(game.symbols)
    .map(([id, name]) => {
      const emoji = game.emojis[id] || '';
      const color = game.colors[id] || '#666';
      return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
        <span style="color:#555;font-family:monospace;min-width:18px;">${id}</span>
        <span style="color:#444;">→</span>
        <span style="color:${color};font-weight:600;">${name}</span>
        <span>${emoji}</span>
      </div>`;
    })
    .join('');
}

if (symbolMapCheckbox) {
  symbolMapCheckbox.checked = showSymbolMap;
  symbolMapCheckbox.onchange = (e) => {
    showSymbolMap = e.target.checked;
    localStorage.setItem('show_symbol_map', showSymbolMap);
    renderSymbolMap();
  };
}

const doubleGridCheckbox = document.getElementById('showDoubleGrid');
if (doubleGridCheckbox) {
  doubleGridCheckbox.checked = showDoubleGrid;
  doubleGridCheckbox.onchange = (e) => {
    showDoubleGrid = e.target.checked;
    localStorage.setItem('show_double_grid', showDoubleGrid);
    renderSpinHistory();
  };
}

const singleViewModeSelect = document.getElementById('singleViewModeSelect');
if (singleViewModeSelect) {
  singleViewModeSelect.value = singleViewMode;
  singleViewModeSelect.onchange = (e) => {
    singleViewMode = e.target.value;
    localStorage.setItem('single_view_mode', singleViewMode);
    // Re-navigate from start
    gameState.currentFramePhase = singleViewMode === 'initial' ? 'initial' : 'final';
    if (gameState.fields?.length > 0) showTumble(0, singleViewMode === 'final' ? 'final' : 'initial');
  };
}
renderSymbolMap();

// ── State ────────────────────────────────────────────────────────────────────
let globalHistory = [];
let currentSpinIndex = -1;
let autoPlayRunning = false;

let gameState = {
  fields: [],
  currentIndex: 0,
  currentFramePhase: 'final', // 'initial' | 'final'
  summary: null,
  isAnimating: false,
  accumulatedWins: [],
  goldenCandidates: [],
};

// ── Playback State ───────────────────────────────────────────────────────────
let playbackInterval = null;
let isAutoReplay = localStorage.getItem('is_auto_replay') === 'true';
let playbackSpeed = parseFloat(localStorage.getItem('playback_speed') || '1.0');
let isAutoplayOnSelect = localStorage.getItem('autoplay_on_select') !== 'false';

// ── DOM Refs for Playback ────────────────────────────────────────────────────
const playbackPlayBtn = document.getElementById('playbackPlayBtn');
const playbackBackBtn = document.getElementById('playbackBackBtn');
const playbackForwardBtn = document.getElementById('playbackForwardBtn');
const playbackReplayBtn = document.getElementById('playbackReplayBtn');
const playbackAutoBtn = document.getElementById('playbackAutoBtn');
const playbackSpeedSlider = document.getElementById('playbackSpeed');
const speedValueLabel = document.getElementById('speedValueLabel');
const currentPhaseLabel = document.getElementById('currentPhaseLabel');
const currentTumbleLabel = document.getElementById('currentTumbleLabel');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const currentSpinIdLabel = document.getElementById('currentSpinIdLabel');
const playbackAutoplayBtn = document.getElementById('playbackAutoplayBtn');

if (playbackAutoBtn && isAutoReplay) {
  playbackAutoBtn.classList.add('active-pulse');
}
if (playbackAutoplayBtn) {
  playbackAutoplayBtn.classList.toggle('active-pulse', isAutoplayOnSelect);
}
if (playbackSpeedSlider) {
  playbackSpeedSlider.value = playbackSpeed;
  if (speedValueLabel) speedValueLabel.innerText = playbackSpeed.toFixed(2) + 'x';
}

// ── Filters ──────────────────────────────────────────────────────────────────
/** @type {import('./filters.js').ActiveFilter[]} */
let activeFilters = [];
try {
  const cachedOpts = localStorage.getItem('active_filters');
  if (cachedOpts) activeFilters = JSON.parse(cachedOpts) || [];
} catch (e) {
  activeFilters = [];
}

function buildFilterBar() {
  const chips = document.getElementById('filterChips');
  const addBtn = document.getElementById('addFilterBtn');
  const dropdown = document.getElementById('filterDropdown');

  function renderChips() {
    localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    chips.innerHTML = '';
    activeFilters.forEach((af, idx) => {
      const def = FILTER_DEFS.find((d) => d.id === af.id);
      if (!def) return;
      const chip = document.createElement('div');
      chip.className = `filter-chip ${af.disabled ? 'disabled' : ''}`;
      chip.title = 'Click label to toggle, X to remove';

      let displayValue = '';
      if (def.formatValue) {
        displayValue = def.formatValue(af.value, game);
      } else if (def.type === 'select' && def.options) {
        const opt = def.options.find((o) => o.value === af.value);
        if (opt) displayValue = opt.label;
      } else if (def.type === 'select' && def.optionsFromGame) {
        const k = af.value;
        displayValue = `${game.emojis[k] || ''} ${game.symbols[k] || k}`;
      } else if (def.type === 'toggle') {
        displayValue = '';
      } else {
        displayValue = af.value;
      }

      chip.innerHTML = `
        <span class="filter-chip-label" role="button" tabindex="0">${def.label}</span>
        ${displayValue !== '' ? `<span class="filter-chip-value">${displayValue}</span>` : ''}
        <span class="filter-chip-remove" data-idx="${idx}" role="button" aria-label="Remove filter">&times;</span>
      `;

      // Toggle functionality (OpenSearch style)
      chip.querySelector('.filter-chip-label').onclick = (e) => {
        e.stopPropagation();
        af.disabled = !af.disabled;
        renderChips();
        renderSpinHistory();
      };

      chip.querySelector('.filter-chip-remove').onclick = (e) => {
        e.stopPropagation();
        activeFilters.splice(idx, 1);
        renderChips();
        renderSpinHistory();
      };
      chips.appendChild(chip);
    });

    const countEl = document.getElementById('filterCount');
    if (countEl) {
      const filtered = applyFilters(globalHistory, activeFilters, game);
      countEl.innerText = `${filtered.length} / ${globalHistory.length}`;
    }
  }

  // Sorting
  const sortField = document.getElementById('sortField');
  if (sortField) {
    const savedSort = localStorage.getItem('sort_field');
    if (savedSort) sortField.value = savedSort;
    sortField.onchange = () => {
      localStorage.setItem('sort_field', sortField.value);
      renderSpinHistory(true);
    };
  }

  addBtn.setAttribute('aria-haspopup', 'menu');

  addBtn.onclick = (e) => {
    e.stopPropagation();
    const isShowing = dropdown.style.display === 'block';
    dropdown.style.display = isShowing ? 'none' : 'block';
    addBtn.setAttribute('aria-expanded', (!isShowing).toString());

    if (isShowing) return;

    dropdown.innerHTML = '';

    FILTER_DEFS.forEach((def) => {
      // Allow stacking: winCondition, text, and hasSymbol can be added multiple times
      const stackable = def.id === 'text' || def.id === 'winCondition' || def.id === 'hasSymbol';
      if (!stackable && activeFilters.some((af) => af.id === def.id)) return;

      const item = document.createElement('div');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '-1');
      item.className = 'dropdown-item';
      item.innerText = def.label;
      item.onclick = (ev) => {
        ev.stopPropagation();
        dropdown.style.display = 'none';
        addBtn.setAttribute('aria-expanded', 'false');
        showFilterInput(def);
      };

      item.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          item.click();
        } else if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          const next = item.nextElementSibling;
          if (next) next.focus();
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          const prev = item.previousElementSibling;
          if (prev) prev.focus();
          else addBtn.focus();
        } else if (ev.key === 'Escape') {
          dropdown.style.display = 'none';
          addBtn.setAttribute('aria-expanded', 'false');
          addBtn.focus();
        }
      };

      dropdown.appendChild(item);
    });

    // Focus first item
    setTimeout(() => {
      const firstItem = dropdown.querySelector('.dropdown-item');
      if (firstItem) firstItem.focus();
    }, 0);
  };

  addBtn.onkeydown = (e) => {
    if (e.key === 'ArrowDown' && dropdown.style.display === 'block') {
      e.preventDefault();
      dropdown.querySelector('.dropdown-item')?.focus();
    }
  };

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== addBtn) {
      dropdown.style.display = 'none';
      addBtn.setAttribute('aria-expanded', 'false');
    }
  });

  /** Remove any pending inline pickers/inputs */
  function clearPendingInputs() {
    chips
      .querySelectorAll('.filter-inline-picker, .filter-inline-input, .filter-condition-input')
      .forEach((el) => el.remove());
  }

  function showFilterInput(def) {
    clearPendingInputs();

    // Toggle — instant
    if (def.type === 'toggle') {
      activeFilters.push({ id: def.id, value: true });
      renderChips();
      renderSpinHistory();
      return;
    }

    // Condition — operator + number (for Win Amount)
    if (def.type === 'condition') {
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-condition-input';

      const opSelect = document.createElement('select');
      opSelect.className = 'filter-input';
      opSelect.style.width = '55px';
      WIN_OPERATORS.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.op;
        opt.textContent = o.label;
        opSelect.appendChild(opt);
      });

      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.placeholder = def.placeholder || '0';
      numInput.className = 'filter-input';
      numInput.style.width = '80px';

      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = '✓';
      confirmBtn.className = 'filter-confirm-btn';

      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = '✕';
      cancelBtn.className = 'filter-cancel-btn';

      const commit = () => {
        if (numInput.value) {
          activeFilters.push({ id: def.id, value: { op: opSelect.value, num: numInput.value } });
          renderChips();
          renderSpinHistory();
        }
        wrapper.remove();
        addBtn.focus();
      };
      const cancel = () => {
        wrapper.remove();
        addBtn.focus();
      };

      confirmBtn.onclick = commit;
      cancelBtn.onclick = cancel;
      numInput.onkeydown = (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      };

      wrapper.appendChild(opSelect);
      wrapper.appendChild(numInput);
      wrapper.appendChild(confirmBtn);
      wrapper.appendChild(cancelBtn);
      chips.appendChild(wrapper);
      numInput.focus();
      return;
    }

    // SymbolCount — select symbol + input count
    if (def.type === 'symbolCount') {
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-condition-input';

      const symSelect = document.createElement('select');
      symSelect.className = 'filter-input';
      Object.entries(game.symbols)
        .filter(([k]) => parseInt(k) !== game.emptySymbolId)
        .forEach(([k, v]) => {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = `${v} ${game.emojis[k] || ''}`;
          symSelect.appendChild(opt);
        });

      const opLabel = document.createElement('span');
      opLabel.innerText = ' >= ';
      opLabel.style.color = '#888';
      opLabel.style.fontSize = '10px';

      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.value = '1';
      numInput.min = '1';
      numInput.className = 'filter-input';
      numInput.style.width = '50px';

      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = '✓';
      confirmBtn.className = 'filter-confirm-btn';

      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = '✕';
      cancelBtn.className = 'filter-cancel-btn';

      const commit = () => {
        if (numInput.value) {
          activeFilters.push({
            id: def.id,
            value: { symId: symSelect.value, count: parseInt(numInput.value) },
          });
          renderChips();
          renderSpinHistory();
        }
        wrapper.remove();
      };
      const cancel = () => wrapper.remove();

      confirmBtn.onclick = commit;
      cancelBtn.onclick = cancel;
      numInput.onkeydown = (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      };

      wrapper.appendChild(symSelect);
      wrapper.appendChild(opLabel);
      wrapper.appendChild(numInput);
      wrapper.appendChild(confirmBtn);
      wrapper.appendChild(cancelBtn);
      chips.appendChild(wrapper);
      symSelect.focus();
      return;
    }

    // Select — inline button picker with cancel
    if (def.type === 'select') {
      let options = def.options || [];
      if (def.optionsFromGame) {
        options = Object.entries(game.symbols)
          .filter(([k]) => parseInt(k) !== game.emptySymbolId)
          .map(([k, v]) => ({ label: `${v} ${game.emojis[k] || ''}`, value: k }));
      }
      if (def.optionsFromGames) {
        options = listGames().map((g) => ({ label: g.name, value: g.id }));
      }

      const picker = document.createElement('div');
      picker.className = 'filter-inline-picker';
      options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'filter-inline-option';
        btn.innerText = opt.label;
        btn.onclick = () => {
          activeFilters.push({ id: def.id, value: opt.value });
          renderChips();
          renderSpinHistory();
          picker.remove();
        };
        picker.appendChild(btn);
      });

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'filter-cancel-btn';
      cancelBtn.innerText = '✕ Cancel';
      cancelBtn.onclick = () => picker.remove();
      picker.appendChild(cancelBtn);

      chips.appendChild(picker);
      return;
    }

    // Date — presets + native date input defaulting to today
    if (def.type === 'date') {
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-date-picker';

      const today = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);

      const presets = document.createElement('div');
      presets.className = 'filter-date-presets';

      const presetDefs = [
        { label: 'Today', value: fmt(today) },
        { label: 'Yesterday', value: fmt(new Date(today.getTime() - 86400000)) },
        { label: 'Last 7d', value: fmt(new Date(today.getTime() - 7 * 86400000)) },
        { label: 'Last 30d', value: fmt(new Date(today.getTime() - 30 * 86400000)) },
      ];

      const commitDate = (val) => {
        if (val) {
          activeFilters.push({ id: def.id, value: val });
          renderChips();
          renderSpinHistory();
        }
        wrapper.remove();
      };

      presetDefs.forEach((p) => {
        const btn = document.createElement('button');
        btn.className = 'filter-inline-option';
        btn.innerText = p.label;
        btn.onclick = () => commitDate(p.value);
        presets.appendChild(btn);
      });

      const inputRow = document.createElement('div');
      inputRow.className = 'filter-inline-input';
      inputRow.style.marginTop = '6px';

      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'filter-input';
      input.style.width = '150px';
      input.value = fmt(today);

      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = '✓';
      confirmBtn.className = 'filter-confirm-btn';
      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = '✕';
      cancelBtn.className = 'filter-cancel-btn';

      confirmBtn.onclick = () => commitDate(input.value);
      cancelBtn.onclick = () => wrapper.remove();
      input.onkeydown = (e) => {
        if (e.key === 'Enter') commitDate(input.value);
        if (e.key === 'Escape') wrapper.remove();
      };

      inputRow.appendChild(input);
      inputRow.appendChild(confirmBtn);
      inputRow.appendChild(cancelBtn);
      wrapper.appendChild(presets);
      wrapper.appendChild(inputRow);
      chips.appendChild(wrapper);
      input.focus();
      return;
    }

    // Number / Text — input with cancel
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-inline-input';
    const input = document.createElement('input');
    input.type = def.type === 'number' ? 'number' : 'text';
    input.placeholder = def.placeholder || def.label;
    input.className = 'filter-input';
    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = '✓';
    confirmBtn.className = 'filter-confirm-btn';
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = '✕';
    cancelBtn.className = 'filter-cancel-btn';

    const commit = () => {
      if (input.value) {
        activeFilters.push({ id: def.id, value: input.value });
        renderChips();
        renderSpinHistory();
      }
      wrapper.remove();
    };
    const cancel = () => wrapper.remove();

    confirmBtn.onclick = commit;
    cancelBtn.onclick = cancel;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(confirmBtn);
    wrapper.appendChild(cancelBtn);
    chips.appendChild(wrapper);
    input.focus();
  }

  renderChips();
  window._renderFilterChips = renderChips;
}

// ── Column Resize ────────────────────────────────────────────────────────────
const col1Width = localStorage.getItem('col1_width') || '410px';
const col3Width = localStorage.getItem('col3_width') || '420px';
const col1 = document.getElementById('col1');
const col3 = document.getElementById('col3');
if (col1) col1.style.width = col1Width;
if (col3) col3.style.width = col3Width;

const rawContent = document.getElementById('rawContent');
if (rawContent) {
  rawContent.tabIndex = 0;
  rawContent.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(rawContent);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
}

document.querySelectorAll('.resizer').forEach((resizer) => {
  resizer.onmousedown = (e) => {
    const targetId = resizer.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    const startX = e.clientX;
    const startWidth = targetEl.offsetWidth;
    const isLeftResizer = targetId === 'col3';
    document.onmousemove = (moveE) => {
      const delta = isLeftResizer ? startX - moveE.clientX : moveE.clientX - startX;
      const newWidth = Math.max(200, startWidth + delta);
      targetEl.style.width = newWidth + 'px';
      localStorage.setItem(`${targetId}_width`, newWidth + 'px');
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };
});

// ── Play Spin (single) ──────────────────────────────────────────────────────
// ── Backend URL Discovery ───────────────────────────────────────────────────
let API_URL = localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:9000';

async function autoDetectBackend() {
  if (window.location.hostname === 'localhost' && !localStorage.getItem('api_url')) {
    try {
      const resp = await fetch('/api/ip');
      const { ip } = await resp.json();
      if (ip && ip !== '127.0.0.1') {
        API_URL = `http://${ip}:9000`;
        console.log('Auto-detected local Backend URL:', API_URL);
      }
    } catch (e) {
      console.warn('Auto-detection failed:', e);
    }
  }
}
autoDetectBackend();

async function fireSpinRequest(config) {
  const reqBody = {
    ...config,
    gameCode: game.gameCode,
    id: game.playerId,
  };

  const makeRequest = async (body) => {
    const response = await fetch(`${API_URL}/v1/service/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!json.data) throw new Error('Invalid API Response: ' + (json.message || 'Unknown error'));
    return json.data;
  };

  let data = await makeRequest(reqBody);

  // Auto-chain if not finished (e.g. FreeSpin was awarded)
  if (data.finished === false && data.choices && data.choices.length > 0) {
    let allPhases = [...(data.step?.gamePhases || [])];
    while (data.finished === false && data.choices && data.choices.length > 0) {
      const nextChoice = data.choices[0];
      const nextBody = { ...reqBody, choice: nextChoice };
      const nextData = await makeRequest(nextBody);
      if (nextData.step && nextData.step.gamePhases) {
        allPhases = allPhases.concat(nextData.step.gamePhases);
      }
      data = nextData; // Keep advancing to get the final summary/meta
    }
    if (data.step) {
      data.step.gamePhases = allPhases;
    }
  }

  return data;
}

function getSpinStats(fields, wildSymbolId) {
  if (!fields || !wildSymbolId) return { totalGolden: 0, maxMultiplier: 1 };
  let totalGolden = 0;
  let maxMultiplier = 1;

  fields.forEach((f) => {
    const payoutPositions = new Set();
    (f.symbols.payouts || []).forEach((p) => {
      if (Array.isArray(p.positions)) p.positions.forEach((pos) => payoutPositions.add(pos));
    });

    const goldenArray = f.features?.golden || [];
    goldenArray.forEach(pos => {
      if (payoutPositions.has(pos)) {
        totalGolden++;
      }
    });

    const m = f.features?.cumulativeMultiplier || 1;
    if (m > maxMultiplier) maxMultiplier = m;
  });

  return { totalGolden, maxMultiplier };
}

async function playSingleSpin() {
  const config = JSON.parse(requestBodyTextarea.value);
  const data = await fireSpinRequest(config);

  const fields = [];
  let spinType = 'basic';
  let playgroundCounter = 0;
  
  (data.step?.gamePhases || []).forEach((phase) => {
    if (phase.type === 'freeSpin') spinType = 'freeSpin';
    let roundCounter = 0;
    (phase.playgrounds || []).forEach(pg => {
      (pg.fields || []).forEach(f => {
        fields.push({ 
          ...f, 
          _playgroundIndex: playgroundCounter, 
          _isFreeSpin: phase.type === 'freeSpin',
          _roundIndex: roundCounter
        });
      });
      playgroundCounter++;
      roundCounter++;
    });
  });

  const summary = data.step.summary;
  const nextNum = await getNextSpinNum();

  const metaPublic = data.meta?.public || data.step?.meta?.public || {};
  const betAmount = metaPublic.betAmount || 0;
  const spinMode = metaPublic.spinMode || 'unknown';
  const roundTags = data.roundTags || data.step?.roundTags || [];
  const choices = data.choices || data.step?.choices || [];
  const hasMaxWin = !!(summary.hasMaxWin || data.hasMaxWin);

  const stats = getSpinStats(fields, game.wildSymbolId);
  const entry = {
    num: nextNum,
    timestamp: new Date().toISOString(),
    gameId: game.id,
    rawData: data,
    fields,
    summary,
    isWin: parseInt(summary.coins || 0) > 0,
    totalWin: summary.coins || 0,
    tumbleCount: fields.length,
    cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
    betAmount,
    spinMode,
    spinType,
    playgroundCount: playgroundCounter,
    roundTags,
    choices,
    hasMaxWin,
    hasGolden: stats.totalGolden > 0,
    totalGolden: stats.totalGolden,
    maxMultiplier: stats.maxMultiplier,
  };

  // Internal storage is kept detailed for UI performance,
  // but Export/Import is now barebone for transport efficiency.
  await import('./db.js').then(db => db.saveSpin(entry));
  globalHistory.unshift(entry);
  return entry;
}

/** Fire N concurrent spin requests and persist results in order. */
async function playConcurrentBatch(config, batchSize) {
  const promises = Array.from({ length: batchSize }, () => fireSpinRequest(config));
  const results = await Promise.all(promises);
  const { getNextSpinNum, saveAllSpins } = await import('./db.js');
  const baseNum = await getNextSpinNum();
  const entries = [];

  for (let i = 0; i < results.length; i++) {
    const data = results[i];
    const fields = [];
    let spinType = 'basic';
    let playgroundCounter = 0;
    
    (data.step?.gamePhases || []).forEach((phase) => {
      if (phase.type === 'freeSpin') spinType = 'freeSpin';
      let roundCounter = 0;
      (phase.playgrounds || []).forEach(pg => {
        (pg.fields || []).forEach(f => {
          fields.push({ 
            ...f, 
            _playgroundIndex: playgroundCounter, 
            _isFreeSpin: phase.type === 'freeSpin',
            _roundIndex: roundCounter
          });
        });
        playgroundCounter++;
        roundCounter++;
      });
    });

    const summary = data.step.summary;

    const metaPublic = data.meta?.public || data.step?.meta?.public || {};
    const betAmount = metaPublic.betAmount || 0;
    const spinMode = metaPublic.spinMode || 'unknown';
    const roundTags = data.roundTags || data.step?.roundTags || [];
    const choices = data.choices || data.step?.choices || [];
    const hasMaxWin = !!(summary.hasMaxWin || data.hasMaxWin);

    const stats = getSpinStats(fields, game.wildSymbolId);
    entries.push({
      num: baseNum + i,
      timestamp: new Date().toISOString(),
      gameId: game.id,
      rawData: data,
      fields,
      summary,
      isWin: parseInt(summary.coins || 0) > 0,
      totalWin: summary.coins || 0,
      tumbleCount: fields.length,
      cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
      betAmount,
      spinMode,
      spinType,
      playgroundCount: playgroundCounter,
      roundTags,
      choices,
      hasMaxWin,
      hasGolden: stats.totalGolden > 0,
      totalGolden: stats.totalGolden,
      maxMultiplier: stats.maxMultiplier,
    });
  }

  // Bulk persist
  await saveAllSpins(entries);
  // Prepend newest-first
  globalHistory.unshift(...entries.reverse());
  return entries;
}

// ── Play Modes ───────────────────────────────────────────────────────────────
const CONCURRENCY = 5; // requests in-flight per batch

async function playSpin() {
  if (gameState.isAnimating || autoPlayRunning) return;
  const mode = playModeSelect.value;

  if (mode === 'single') {
    setPlayUIBusy(true);
    try {
      await playSingleSpin();
      renderSpinHistory();
      loadSpin(0);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setPlayUIBusy(false);
    }
    return;
  }

  // Auto-play modes
  autoPlayRunning = true;
  stopAutoBtn.style.display = 'inline-block';
  setPlayUIBusy(true);

  const maxSpins = mode === 'count' ? parseInt(playCountInput.value) || 10 : 100000;
  let count = 0;
  const statusEl = document.getElementById('autoStatus');
  const config = JSON.parse(requestBodyTextarea.value);
  const startTime = performance.now();

  try {
    if (mode === 'count') {
      // Concurrent batch mode — fire CONCURRENCY requests at once
      while (autoPlayRunning && count < maxSpins) {
        const remaining = maxSpins - count;
        const batchSize = Math.min(CONCURRENCY, remaining);
        const entries = await playConcurrentBatch(config, batchSize);
        count += entries.length;

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        const rps = (count / ((performance.now() - startTime) / 1000)).toFixed(1);
        if (statusEl) statusEl.innerText = `${count}/${maxSpins} (${rps}/s)`;

        // Yield to UI every batch
        renderSpinHistory();
        await new Promise((r) => setTimeout(r, 0));
      }
    } else {
      // Sequential for untilWin / untilLoss (need to check each result)
      while (autoPlayRunning && count < maxSpins) {
        count++;
        if (statusEl) statusEl.innerText = `Auto: ${count}`;
        const entry = await playSingleSpin();

        if (mode === 'untilWin' && entry.isWin) break;
        if (mode === 'untilLoss' && !entry.isWin) break;
        if (mode === 'untilFilter' && applyFilters([entry], activeFilters, game).length > 0) break;

        if (count % 5 === 0) {
          renderSpinHistory();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  } catch (err) {
    console.error(err);
    alert('Error during auto-play: ' + err.message);
  } finally {
    autoPlayRunning = false;
    stopAutoBtn.style.display = 'none';
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    if (statusEl) statusEl.innerText = `Done: ${count} in ${elapsed}s`;
    setTimeout(() => {
      if (statusEl) statusEl.innerText = '';
    }, 6000);
    setPlayUIBusy(false);
    renderSpinHistory();
    if (globalHistory.length > 0) loadSpin(0);
  }
}

function setPlayUIBusy(busy) {
  spinBtn.disabled = busy;
  spinBtn.innerText = busy ? 'RUNNING...' : '▶ PLAY';
}

stopAutoBtn.onclick = () => {
  autoPlayRunning = false;
};

playModeSelect.onchange = () => {
  playCountInput.style.display = playModeSelect.value === 'count' ? 'inline-block' : 'none';
};

spinBtn.onclick = playSpin;

// ── Raw JSON Drawer ──────────────────────────────────────────────────────────
let rawDrawerTabs = [];
let rawDrawerActiveTab = 0;
let lastSelectedTabLabel = 'STEP_1_STATE';

function renderRawDrawer() {
  const tabsEl = document.getElementById('rawTabs');
  const contentEl = document.getElementById('rawContent');
  tabsEl.innerHTML = '';
  contentEl.innerHTML = ''; // Ensure content is cleared
  rawDrawerTabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.innerText = tab.label;
    const isActive = i === rawDrawerActiveTab;

    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive.toString());
    btn.setAttribute('tabindex', isActive ? '0' : '-1');

    btn.style.cssText = `
      background: ${isActive ? '#fff' : '#ffffff0a'};
      color: ${isActive ? '#000' : '#888'};
      border: 1px solid ${isActive ? '#fff' : '#ffffff10'};
      padding: 6px 12px; border-radius: 6px;
      cursor: pointer; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.5px; transition: 0.2s;
    `;
    btn.onclick = () => {
      rawDrawerActiveTab = i;
      lastSelectedTabLabel = tab.label.includes('TUMBLE_') ? 'TUMBLE_X_STATE' : tab.label;
      renderRawDrawer();
      if (tab.label === 'INITIAL[]') window.selectTumble(gameState.currentIndex, 'initial');
      if (tab.label === 'FINAL[]' || tab.label === 'DIFF') window.selectTumble(gameState.currentIndex, 'final');
      setTimeout(() => document.querySelector('#rawTabs button[aria-selected="true"]')?.focus(), 0);
    };

    // Keyboard Arrow Navigation for Tabs
    btn.onkeydown = (e) => {
      let targetIndex = -1;
      if (e.key === 'ArrowRight') {
        targetIndex = (i + 1) % rawDrawerTabs.length;
      } else if (e.key === 'ArrowLeft') {
        targetIndex = (i - 1 + rawDrawerTabs.length) % rawDrawerTabs.length;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        document.getElementById('rawContent')?.focus();
      }

      if (targetIndex !== -1) {
        e.preventDefault();
        const tabs = document.querySelectorAll('#rawTabs button');
        if (tabs[targetIndex]) {
          tabs[targetIndex].click();
        }
      }
    };

    tabsEl.appendChild(btn);
  });

  const active = rawDrawerTabs[rawDrawerActiveTab];
  if (!active) {
    contentEl.innerText = '// No data selected';
    return;
  }

  // 5x5 Matrix Logic for Grid Data
  if (['INITIAL[]', 'FINAL[]', 'DIFF'].includes(active.label)) {
    const isDiff = active.label === 'DIFF';
    let initialArr = null;
    let finalArr = null;

    if (isDiff) {
      initialArr = rawDrawerTabs.find(t => t.label === 'INITIAL[]')?.data;
      finalArr = rawDrawerTabs.find(t => t.label === 'FINAL[]')?.data;
    } else {
      finalArr = active.data;
    }

    if (Array.isArray(finalArr)) {
      const rows = game.grid.rows;
      const cols = game.grid.cols;
      const container = document.createElement('div');
      container.className = 'audit-matrix-container';
      
      const grid = document.createElement('div');
      grid.className = 'audit-matrix';
      // Column-major: index = col * rows + row
      // To display row by row in the DOM, we iterate r then c
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = c * rows + r;
          const val = finalArr[i];
          const cell = document.createElement('div');
          cell.className = 'audit-matrix-cell';
          cell.title = `idx:${i} r${r} c${c}`;

          if (isDiff && initialArr && initialArr[i] !== val) {
            cell.classList.add('changed');
            cell.innerHTML = `<span style="font-size:7px; opacity:0.6; text-decoration:line-through">${initialArr[i]}</span><br/>${val}`;
          } else {
            cell.innerText = val;
          }
          grid.appendChild(cell);
        }
      }
      
      container.appendChild(grid);
      
      // Prevent selection on matrix and hint
      grid.style.userSelect = 'none';
      grid.style.webkitUserSelect = 'none';

      const copyHint = document.createElement('div');
      copyHint.style.fontSize = '9px';
      copyHint.style.color = '#888';
      copyHint.style.marginBottom = '6px';
      copyHint.style.userSelect = 'none';
      copyHint.style.webkitUserSelect = 'none';
      copyHint.innerText = 'RAW DATA (COPY-PASTEABLE):';
      container.appendChild(copyHint);
      
      const pre = document.createElement('pre');
      pre.style.margin = '0';
      pre.style.fontSize = '10px';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.color = '#ccc';
      // User requested vertical 1D array: use JSON pretty-print
      pre.innerText = JSON.stringify(finalArr, null, 2);
      
      // Support selective Ctrl+A for this data
      pre.tabIndex = 0;
      pre.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });

      container.appendChild(pre);
      
      contentEl.appendChild(container);
      return;
    }
  }

  if (active.label === 'DIFF') {
    contentEl.innerHTML = '<div style="color:#888; margin-bottom:10px;">[</div>';
    active.data.forEach((line, idx) => {
      const div = document.createElement('div');
      div.style.paddingLeft = '20px';
      div.style.whiteSpace = 'pre';
      const isLast = idx === active.data.length - 1;
      const comma = isLast ? '' : ',';
      if (line.includes('->')) {
        div.style.color = '#4ade80';
        div.style.fontWeight = 'bold';
        const parts = line.split(', ');
        div.innerHTML = `${parts[0]}${comma} <span style="color:#444; font-weight:normal; font-size:0.9em">${parts[1]}</span>`;
      } else {
        div.style.color = '#9cdcfe';
        div.innerText = line + comma;
      }
      contentEl.appendChild(div);
    });
    const closing = document.createElement('div');
    closing.style.color = '#888';
    closing.innerText = ']';
    contentEl.appendChild(closing);
  } else {
    contentEl.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';
    // User requested vertical 1D array: use pretty-print
    pre.innerText = JSON.stringify(active.data, null, 2);
    
    // Support selective Ctrl+A
    pre.tabIndex = 0;
    pre.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    
    contentEl.appendChild(pre);
  }
}

function openRawDrawer(tabs) {
  rawDrawerTabs = tabs;
  let targetIndex = tabs.findIndex((t) => {
    if (lastSelectedTabLabel === 'STEP_X_STATE' || lastSelectedTabLabel === 'TUMBLE_X_STATE') {
      return t.label.includes('STEP_') || t.label.includes('TUMBLE_');
    }
    return t.label === lastSelectedTabLabel;
  });
  rawDrawerActiveTab = targetIndex >= 0 ? targetIndex : 0;
  renderRawDrawer();
}

// ── Spin History Rendering ───────────────────────────────────────────────────
function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const date = d.toLocaleDateString('en-CA');
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return `${date} ${time}`;
  } catch {
    return ts;
  }
}

// ── Infinite Scroller State ──────────────────────────────────────────────────
let currentSortedList = [];
let renderChunkSize = 30;
let currentRenderLimit = 30;
let listObserver = null;

function renderSpinHistory(preventAutoSelect = false) {
  spinHistoryEl.innerHTML = '';
  if (listObserver) {
    listObserver.disconnect();
    listObserver = null;
  }

  const filtered = applyFilters(globalHistory, activeFilters, game);
  console.log(`Render: Total=${globalHistory.length}, Filtered=${filtered.length}`);

  const sortVal = document.getElementById('sortField')?.value || 'num_desc';

  const sorted = [...filtered].sort((a, b) => {
    switch (sortVal) {
      case 'num_asc':
        return a.num - b.num;
      case 'win_desc':
        return (parseFloat(b.totalWin) || 0) - (parseFloat(a.totalWin) || 0);
      case 'cascade_desc':
        return (b.cascadeCount || 0) - (a.cascadeCount || 0);
      case 'num_desc':
      default:
        return b.num - a.num;
    }
  });

  const countEl = document.getElementById('filterCount');
  if (countEl) countEl.innerText = `${filtered.length} / ${globalHistory.length}`;

  currentSortedList = sorted;
  currentRenderLimit = renderChunkSize;

  if (currentSortedList.length === 0) {
    if (globalHistory.length > 0) {
      spinHistoryEl.innerHTML = `
        <div style="color:#444;text-align:center;font-size:0.8em;margin-top:40px;">
          <p>No spins match filters</p>
          <button id="clearFiltersBtn" style="background:none;border:none;color:var(--accent);cursor:pointer;text-decoration:underline;font-size:1em;margin-top:8px;">Clear all filters</button>
        </div>`;
      setTimeout(() => {
        const btn = document.getElementById('clearFiltersBtn');
        if (btn) btn.onclick = () => {
          activeFilters = [];
          localStorage.setItem('active_filters', '[]');
          if (window._renderFilterChips) window._renderFilterChips();
          renderSpinHistory();
        };
      }, 0);
    } else {
      spinHistoryEl.innerHTML = `<p style="color:#444;text-align:center;font-size:0.8em;margin-top:40px;">No history available</p>`;
    }
    return;
  }

  // Ensure active element is within the initial render bounds
  if (currentSpinIndex !== -1) {
    const activeSortIdx = currentSortedList.findIndex(
      (s) => globalHistory.indexOf(s) === currentSpinIndex,
    );
    if (activeSortIdx >= currentRenderLimit) {
      currentRenderLimit = activeSortIdx + 5;
    }
  }

  // If active filters exist and the current selection is not in the filtered set, auto-select the first result
  if (
    !preventAutoSelect &&
    activeFilters.length > 0 &&
    !filtered.includes(globalHistory[currentSpinIndex]) &&
    sorted.length > 0
  ) {
    const firstIdx = globalHistory.indexOf(sorted[0]);
    if (firstIdx !== -1 && firstIdx !== currentSpinIndex) {
      // Defer to avoid recursion (loadSpin calls renderSpinHistory)
      queueMicrotask(() => loadSpin(firstIdx));
    }
  }

  appendSpinHistoryCards(0, currentRenderLimit);
  setupListObserver();
}

function setupListObserver() {
  if (currentRenderLimit >= currentSortedList.length) return;

  const sentinel = document.createElement('div');
  sentinel.id = 'scrollSentinel';
  sentinel.style.height = '10px';
  spinHistoryEl.appendChild(sentinel);

  listObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        const start = currentRenderLimit;
        currentRenderLimit += renderChunkSize;

        spinHistoryEl.removeChild(sentinel);
        appendSpinHistoryCards(start, currentRenderLimit);

        if (currentRenderLimit < currentSortedList.length) {
          spinHistoryEl.appendChild(sentinel);
        } else {
          listObserver.disconnect();
        }
      }
    },
    { root: spinHistoryEl, rootMargin: '200px' },
  );

  listObserver.observe(sentinel);
}

function appendSpinHistoryCards(startIndex, endIndex) {
  const slice = currentSortedList.slice(startIndex, endIndex);
  slice.forEach((spin) => {
    const originalIdx = globalHistory.indexOf(spin);
    const isActive = originalIdx === currentSpinIndex;
    const card = document.createElement('div');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-selected', isActive.toString());
    card.className = `spin-history-card ${isActive ? 'active' : ''}`;
    card.dataset.index = originalIdx;

    const gameLabel =
      spin.gameId && spin.gameId !== game.id
        ? `<span class="card-num" style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:4px;margin-left:4px;">${spin.gameId}</span>`
        : '';

    const isBookmarked = !!spin.bookmarked;
    const bet = parseFloat(spin.betAmount || 0);
    const win = parseFloat(spin.totalWin || 0);
    const ratio = bet > 0 ? (win / bet).toFixed(2).replace(/\.?0+$/, '') : '0';
    const hasMaxWin = !!spin.hasMaxWin;

    card.innerHTML = `
      <div class="card-header-v5">
        <div class="header-left">
          <span class="status-dot ${spin.isWin ? 'winner' : 'no-win'}"></span>
          <span class="status-text">${spin.isWin ? 'WINNER' : 'NO WIN'}</span>
          <span class="card-num-v5">#${spin.num}</span>
          ${hasMaxWin ? '<span class="max-win-badge-v5">MAX</span>' : ''}
        </div>
        <div class="header-right">
          <div class="meta-time">${formatTimestamp(spin.timestamp).split(' ')[1]}</div>
          <button class="bookmark-btn-v5 ${isBookmarked ? 'active' : ''}" data-num="${spin.num}">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
          </button>
        </div>
      </div>

      <div class="card-body-v5">
        <div class="win-display ${spin.isWin ? 'winner' : ''}">
          <span class="win-val">${win}</span>
          <span class="win-lbl">COINS</span>
        </div>
        <div class="ratio-display-v5 ${parseFloat(ratio) >= 1 ? 'gold' : ''}">
          ${ratio}x TB
        </div>
      </div>

      <div class="card-footer-v5">
        <div class="meta-items">
          <span class="m-item">Bet: <b>${bet}</b></span>
          <span class="m-item">Mode: <b>${spin.spinMode || 'std'}</b></span>
          ${spin.roundTags && spin.roundTags.length > 0 ? `<span class="m-item tag">${spin.roundTags[0]}</span>` : ''}
          <span class="m-item multi">Max: <b>${spin.maxMultiplier || 1}x</b></span>
          ${spin.totalGolden > 0 ? `<span class="m-item golden">Golden: <b>${spin.totalGolden}</b></span>` : ''}
          ${spin.cascadeCount > 0 ? `<span class="m-item cascade">${spin.cascadeCount} Cascades</span>` : ''}
        </div>
      </div>
    `;

    let auditHtml = '';
    if (isActive) {
      let currentPlayground = -1;
      const tumbles = spin.fields
        .map((f, tIdx) => {
          let headerHtml = '';
          if (f._playgroundIndex !== undefined && f._playgroundIndex !== currentPlayground) {
            const isFirst = currentPlayground === -1;
            currentPlayground = f._playgroundIndex;
            const headerText = f._isFreeSpin ? `FreeSpin #${f._roundIndex + 1}` : 'BaseSpin';
            const closeDiv = isFirst ? '' : '</div>';
            
            let isActiveRound = false;
            if (spin.fields[gameState.currentIndex] && spin.fields[gameState.currentIndex]._playgroundIndex === currentPlayground) {
              isActiveRound = true;
            }
            if (!spin.fields[gameState.currentIndex] && isFirst) isActiveRound = true;

            headerHtml = `${closeDiv}
              <div class="round-header" data-round="${currentPlayground}" style="cursor:pointer; font-size:10px; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin:12px 0 4px 0; border-bottom:1px dashed rgba(255,255,255,0.1); padding-bottom:4px; letter-spacing: 0.5px; display:flex; justify-content:space-between; align-items:center; user-select:none;">
                <span>${headerText}</span>
                <span class="round-toggle-icon" style="transition: transform 0.2s; transform: ${isActiveRound ? 'rotate(180deg)' : 'rotate(0deg)'}">▼</span>
              </div>
              <div class="round-content" id="round-content-${currentPlayground}" style="display: ${isActiveRound ? 'block' : 'none'};">`;
          }

          const isTumbleActive = tIdx === gameState.currentIndex;
          const goldenPositions = f.features?.golden || [];
          const isWinStep = parseFloat(f.coins || 0) > 0;

          // cascadeNum = group this tumble belongs to WITHIN the same playground
          const payingBefore = spin.fields.slice(0, tIdx).filter(f2 => parseFloat(f2.coins || 0) > 0 && f2._playgroundIndex === f._playgroundIndex).length;
          const cascadeNum = payingBefore + 1;
          const badgeBg = isWinStep ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)';
          const badgeColor = isWinStep ? 'var(--info)' : '#444';
          const badgeBorder = isWinStep ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)';
          const badgeLabel = isWinStep ? `CASCADE #${cascadeNum} ↓` : `CASCADE #${cascadeNum}`;
          const cascadeBadge = `<span style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; padding:2px 6px; border-radius:4px; font-size:9px; margin-left:8px; font-weight:800; font-family:monospace;">${badgeLabel}</span>`;

          // Generate tallies for this tumble
          const payoutMap = new Map();
          const payoutPositions = new Set();
          (f.symbols.payouts || []).forEach(p => {
            const sid = p.symbolId !== undefined ? p.symbolId : p.symbol !== undefined ? p.symbol : p.id;
            payoutMap.set(sid, p);
            if (Array.isArray(p.positions)) {
              p.positions.forEach(pos => payoutPositions.add(pos));
            }
          });

          // 1. Identify "Winning Golden" symbols for the audit listing
          const winningGoldenTallies = new Map(); // sid -> count
          goldenPositions.forEach(pos => {
            if (payoutPositions.has(pos)) {
              const sid = f.symbols.initial[pos];
              winningGoldenTallies.set(sid, (winningGoldenTallies.get(sid) || 0) + 1);
            }
          });

          let linesHtml = '';
          
          // 1a. Golden Wins (Listed specifically)
          winningGoldenTallies.forEach((count, sid) => {
            const name = SYMBOLS[sid] || sid;
            const emoji = EMOJIS[sid] || '';
            linesHtml += `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color:#fbbf24; font-weight: 800; font-size: 10px; font-family: monospace;">${name}</span>
                  <span style="font-size: 10px;">${emoji} (GOLDEN 🟡)</span>
                </div>
                <div style="font-size: 10px; color: var(--text-muted); font-weight: 800;">x${count}</div>
              </div>
            `;
          });

          // 2. Wild Line (count Wilds in initial grid that were part of a win)
          const wildId = game.wildSymbolId;
          const winningWildCount = f.symbols.initial.filter((id, pos) => id === wildId && payoutPositions.has(pos)).length;
          if (winningWildCount > 0) {
            linesHtml += `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color:var(--bg-accent); font-weight: 800; font-size: 10px; font-family: monospace;">WILD</span>
                  <span style="font-size: 10px;">${EMOJIS[wildId]}</span>
                </div>
                <div style="font-size: 10px; color: var(--text-muted); font-weight: 800;">x${winningWildCount}</div>
              </div>
            `;
          }

          // 3. Regular Payout Lines (Total count as per photo)
          (f.symbols.payouts || []).forEach(p => {
             const sid = p.symbolId !== undefined ? p.symbolId : p.symbol !== undefined ? p.symbol : p.id;
             const name = SYMBOLS[sid] || sid;
             const emoji = EMOJIS[sid] || '';
             const color = game?.colors?.[sid] || '#fff';
             linesHtml += `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color:${color}; font-weight: 800; font-size: 10px; font-family: monospace;">${name}</span>
                  <span style="font-size: 10px;">${emoji}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="color: var(--text-muted); font-size: 10px;">x${p.oak || p.count || 0}</span>
                  <span style="color: var(--success); font-weight: 800; font-size: 10px;">+${p.coins}</span>
                </div>
              </div>
             `;
          });

          return headerHtml + `
            <div data-tumble="${tIdx}" class="glass" style="padding: 8px; border-radius: 8px; background: ${isTumbleActive ? 'rgba(255,255,255,0.05)' : 'transparent'};
                border: 1px solid ${isTumbleActive ? 'var(--bg-accent)' : 'transparent'};
                cursor: pointer; margin-top: 4px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center;">
                  <span class="step-label" style="font-weight:700; color:${isTumbleActive ? '#fff' : 'var(--text-muted)'}; font-size:10px;">TUMBLE ${tIdx + 1}</span>
                  ${cascadeBadge}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                   <span style="color:${isWinStep ? 'var(--success)' : 'var(--text-muted)'}; font-size: 10px; font-weight: 800;">+${f.coins}</span>
                   <span style="color: var(--bg-accent); font-size: 11px; font-weight: 800;">${f.features?.cumulativeMultiplier || 1}x</span>
                </div>
              </div>
              ${linesHtml ? `<div style="margin-top:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:4px;">${linesHtml}</div>` : ''}
            </div>`;
        })
        .join('');
      
      const tumblesHtml = tumbles + (spin.fields.length > 0 ? '</div>' : '');
      
      const auditContainer = document.createElement('div');
      auditContainer.style.marginTop = '10px';
      auditContainer.innerHTML = `
        <div style="font-size:9px; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin-bottom:6px;">Tumble Audit</div>
        ${tumblesHtml}
      `;
      card.appendChild(auditContainer);
      
      auditContainer.onclick = (e) => {
        const header = e.target.closest('.round-header');
        if (header) {
          const roundIdx = parseInt(header.dataset.round);
          const content = auditContainer.querySelector(`#round-content-${roundIdx}`);
          const icon = header.querySelector('.round-toggle-icon');
          const isExpanded = content.style.display === 'block';

          // Collapse all rounds
          auditContainer.querySelectorAll('.round-content').forEach(el => el.style.display = 'none');
          auditContainer.querySelectorAll('.round-toggle-icon').forEach(el => el.style.transform = 'rotate(0deg)');
          
          if (!isExpanded) {
            // Expand clicked round
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
            
            // Auto-select the first tumble of this round if not already in it
            const firstTumbleIdx = spin.fields.findIndex(f => f._playgroundIndex === roundIdx);
            if (firstTumbleIdx !== -1 && (!spin.fields[gameState.currentIndex] || spin.fields[gameState.currentIndex]._playgroundIndex !== roundIdx)) {
              window.selectTumble(firstTumbleIdx);
            }
            
            // Scroll header into view
            setTimeout(() => {
              header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
          }
        }
      };
    }

    card.onclick = (e) => {
      const bookmarkBtn = e.target.closest('.bookmark-btn-v5');
      if (bookmarkBtn) {
        e.stopPropagation();
        const num = parseInt(bookmarkBtn.dataset.num);
        const newState = !bookmarkBtn.classList.contains('active');
        import('./db.js').then(db => db.toggleBookmark(num, newState)).then(() => {
          const spin = globalHistory.find(s => s.num === num);
          if (spin) spin.bookmarked = newState;
          renderSpinHistory(true);
        });
        return;
      }

      const tumbleEl = e.target.closest('[data-tumble]');
      if (tumbleEl) {
        // Clicking a tumble step on the active card — navigate to that step
        window.selectTumble(parseInt(tumbleEl.dataset.tumble), 'initial');
        return;
      }

      // If we are already the active card, ignore clicks on the body to not reset the tumble view
      if (isActive) return;

      loadSpin(originalIdx);
    };

    // Tumble Audit specifically ArrowUp/ArrowDown navigation
    card.addEventListener('keydown', (e) => {
      const activeTumble = document.activeElement?.closest('[data-tumble]');
      if (activeTumble) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = activeTumble.nextElementSibling;
          if (next && next.hasAttribute('data-tumble')) {
            next.focus();
            window.selectTumble(parseInt(next.dataset.tumble), 'initial');
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = activeTumble.previousElementSibling;
          if (prev && prev.hasAttribute('data-tumble')) {
            prev.focus();
            window.selectTumble(parseInt(prev.dataset.tumble), 'initial');
          } else {
             // Wrap back to card focus
             card.focus();
          }
        }
      }
    });

    // Keyboard support for activating the card
    card.onkeydown = (e) => {
      // Don't intercept if focus is inside a tumble item
      if (document.activeElement.hasAttribute('data-tumble')) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = card.nextElementSibling;
        if (next && next.classList.contains('spin-history-card')) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = card.previousElementSibling;
        if (prev && prev.classList.contains('spin-history-card')) prev.focus();
      } else if (e.key === 'ArrowRight' && isActive) {
        // Spatial intuition: focus first tumble if active
        e.preventDefault();
        const firstTumble = card.querySelector('[data-tumble]');
        if (firstTumble) firstTumble.focus();
      }
    };
    spinHistoryEl.appendChild(card);
  });
}

// ── Tumble selection hook ────────────────────────────────────────────────────
window.selectTumble = (tIdx, phase) => {
  showTumble(tIdx, phase);
  const spin = globalHistory[currentSpinIndex];
  const field = spin.fields[tIdx];
  const diff = field.symbols.initial.map((val, i) => {
    const finalVal = field.symbols.final[i];
    const r = i % game.grid.rows;
    const c = Math.floor(i / game.grid.rows);
    const coord = `(c${c}, r${r})`;
    if (val !== finalVal) return `${val} -> ${finalVal}, ${coord}`;
    return `${val}`;
  });
  openRawDrawer(
    [
      { label: `TUMBLE_${tIdx + 1}_STATE`, data: field },
      { label: 'DIFF', data: diff },
      { label: 'INITIAL[]', data: field.symbols.initial },
      { label: 'FINAL[]', data: field.symbols.final },
      { label: 'PAYOUTS', data: field.symbols.payouts },
      { label: 'FEATURES', data: field.features },
      { label: 'FULL_JSON', data: spin.rawData },
    ],
    0,
  );
  updatePlaybackLabels();
};

// ── Load Spin ────────────────────────────────────────────────────────────────
function loadSpin(historyIndex) {
  currentSpinIndex = historyIndex;
  localStorage.setItem('last_spin_index', historyIndex);
  const spin = globalHistory[historyIndex];
  if (!spin) return;

  gameState.fields = spin.fields;
  gameState.summary = spin.summary;
  gameState.currentIndex = 0;
  gameState.isAnimating = false;

  let acc = 0;
  gameState.accumulatedWins = spin.fields.map((f) => {
    acc += parseInt(f.coins);
    return acc;
  });

  // Start playback automatically when selecting a card (if enabled)
  if (isAutoplayOnSelect) {
    startSpinPlayback();
  } else {
    // Manually render the first state so the grid isn't empty
    gameState.currentIndex = 0;
    gameState.currentFramePhase = 'initial';
    window.selectTumble(0, 'initial');
    updatePlaybackLabels();
    syncPlaybackUI();
  }

  // ── Golden Symbols Logic ──────────────────────────────────────────────────
  // We use the golden array from the API response to highlight golden symbols.
  const fields = spin.fields;
  const persistentGolden = fields.map(f => new Set(f.features?.golden || []));
  gameState.goldenCandidates = persistentGolden;

  // Calculate hasGolden for the spin summary
  spin.hasGolden = gameState.goldenCandidates.some(set => set.size > 0);

  renderSpinHistory();
  updateGlobalSummary();
  
  // startSpinPlayback() was added earlier in loadSpin

  window.openSpinRaw(historyIndex);

  updatePlaybackLabels();

  // Auto-scroll the newly activated card into view so it doesn't jump out of the viewport
  setTimeout(() => {
    const activeCard = document.querySelector('.spin-history-card.active');
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 60);
}

function updatePlaybackLabels() {
  const spin = globalHistory[currentSpinIndex];
  if (!spin) return;

  if (currentPhaseLabel) {
    currentPhaseLabel.innerText = gameState.currentFramePhase || 'INITIAL';
  }
  if (currentTumbleLabel) {
    const field = spin.fields[gameState.currentIndex];
    const prefix = field && field._isFreeSpin ? `FS #${(field._roundIndex || 0) + 1} · ` : '';
    currentTumbleLabel.innerText = `${prefix}Tumble ${gameState.currentIndex + 1}`;
  }
  if (currentSpinIdLabel) {
    currentSpinIdLabel.innerText = ` . #${spin.num || currentSpinIndex}`;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
function updateGlobalSummary() {
  document.getElementById('totalWin').innerText = gameState.summary.coins;
  
  const tumbleCountEl = document.getElementById('tumbleCount');
  if (tumbleCountEl) tumbleCountEl.innerText = gameState.fields.length;

  const cascadeCountEl = document.getElementById('cascadeCountTop');
  if (cascadeCountEl) {
    cascadeCountEl.innerText = gameState.fields.filter((f) => parseInt(f.coins || 0) > 0).length;
  }
}

// ── Show Tumble ──────────────────────────────────────────────────────────────
function showTumble(index, phase) {
  gameState.currentIndex = index;
  // Determine phase: explicit arg > singleViewMode default
  const resolvedPhase = showDoubleGrid
    ? 'final' // double view always renders final (initial handled separately)
    : phase ?? (singleViewMode === 'initial' ? 'initial' : 'final');
  gameState.currentFramePhase = resolvedPhase;

  const field = gameState.fields[index];
  if (!field) return;

  // Instead of fully destroying and recreating the list when only the active tumble changes,
  // we can just cleanly update the active styles if the card is already expanded!
  const updateAuditListStyles = () => {
    const tumbles = spinHistoryEl.querySelectorAll('[data-tumble]');
    if (tumbles.length > 0) {
      let activeTumbleEl = null;
      tumbles.forEach((t) => {
        const idx = parseInt(t.dataset.tumble);
        const isActive = idx === index;
        if (isActive) activeTumbleEl = t;
        t.style.background = isActive ? 'rgba(34, 197, 94, 0.12)' : 'transparent';
        t.style.border = isActive ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent';
        t.setAttribute('aria-pressed', isActive.toString());
        t.setAttribute('tabindex', isActive ? '0' : '-1');
        const stepLabel = t.querySelector('.step-label');
        if (stepLabel) {
          stepLabel.style.color = isActive ? '#fff' : 'var(--text-muted)';
          stepLabel.style.fontWeight = isActive ? '900' : '700';
        }
      });

      if (activeTumbleEl) {
        // Auto-expand round if hidden
        const roundContent = activeTumbleEl.closest('.round-content');
        if (roundContent && roundContent.style.display === 'none') {
          const roundIdx = roundContent.id.replace('round-content-', '');
          const header = spinHistoryEl.querySelector(`.round-header[data-round="${roundIdx}"]`);
          if (header) {
            spinHistoryEl.querySelectorAll('.round-content').forEach(el => el.style.display = 'none');
            spinHistoryEl.querySelectorAll('.round-toggle-icon').forEach(el => el.style.transform = 'rotate(0deg)');
            roundContent.style.display = 'block';
            const icon = header.querySelector('.round-toggle-icon');
            if (icon) icon.style.transform = 'rotate(180deg)';
          }
        }
        
        // Scroll into view
        activeTumbleEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (document.activeElement && document.activeElement.hasAttribute('data-tumble')) {
          activeTumbleEl.focus();
        }
      }
    } else {
      renderSpinHistory();
      // Try once more after render
      setTimeout(updateAuditListStyles, 0);
    }
  };

  updateAuditListStyles();

  multDisplay.innerText = (field.features?.cumulativeMultiplier || 1) + 'x';
  document.getElementById('currentTumbleWin').innerText = field.coins;
  document.getElementById('accWinDisplay').innerText = gameState.accumulatedWins[index];

  // Update navigation context header
  const totalTumbles = gameState.fields.length;
  const tumbleNavLabel = document.getElementById('tumbleNavLabel');
  const cascadeNavLabel = document.getElementById('cascadeNavLabel');
  if (tumbleNavLabel) {
    tumbleNavLabel.innerText = `TUMBLE ${index + 1} / ${totalTumbles}`;
  }
  if (cascadeNavLabel) {
    // cascadeNum = (# paying tumbles BEFORE this index) + 1
    const payingBefore = gameState.fields.slice(0, index).filter(f => parseInt(f.coins || 0) > 0).length;
    const cascadeNum = payingBefore + 1;
    const isPayingTumble = parseInt(field.coins || 0) > 0;
    cascadeNavLabel.innerText = isPayingTumble ? `· CASCADE ${cascadeNum} ↓` : `· CASCADE ${cascadeNum}`;
    cascadeNavLabel.style.display = 'inline';
    cascadeNavLabel.style.opacity = isPayingTumble ? '1' : '0.45';

    const phaseStatusText = document.getElementById('phaseStatusText');
    if (phaseStatusText) {
      const isLastTumble = (index === totalTumbles - 1);
      if (isLastTumble) {
        phaseStatusText.innerText = 'END';
        phaseStatusText.style.color = 'var(--text-muted)';
      } else {
        phaseStatusText.innerText = isPayingTumble ? 'POP' : 'HOLD & GROW';
        phaseStatusText.style.color = isPayingTumble ? '#10b981' : 'var(--bg-accent)';
      }
    }
  }

  const wrapper = document.getElementById('grid-main-wrapper');
  const initialContainer = document.getElementById('grid-container-initial');
  const finalLabel = document.getElementById('grid-final-label');
  const hasChanges = field.symbols.initial && field.symbols.final &&
    !field.symbols.initial.every((v, i) => v === field.symbols.final[i]);

  // Golden set logic:
  // - Initial phase: goldenCandidates[N] = symbols golden at the START of tumble N (from prior tumbles)
  // - Final phase:   goldenCandidates[N+1] = golden state AFTER tumble N's transformation
  //                  (winning golden positions turned into wilds, so they're no longer golden)
  const goldenInitial = gameState.goldenCandidates[index] || new Set();
  const goldenFinal   = gameState.goldenCandidates[index + 1] || new Set();

  if (showDoubleGrid && hasChanges) {
    wrapper?.classList.add('double-view');
    if (initialContainer) initialContainer.style.display = 'flex';
    if (finalLabel) finalLabel.style.display = 'block';

    // --- Initial panel: show symbols.initial WITH win lines and goldenCandidates[N] ---
    const gridInitialEl = document.getElementById('grid-initial');
    if (gridInitialEl) {
      const { rows, cols } = game.grid;
      gridInitialEl.innerHTML = '';
      gridInitialEl.style.cssText = `display:grid;grid-template-columns:repeat(${cols},76px);grid-template-rows:repeat(${rows},76px);gap:8px;`;
    }
    if (showDouble && initialContainer && gridInitialEl) {
      initialContainer.style.display = 'flex';
      renderGrid(field.symbols.initial, field.symbols.payouts, goldenInitial, 'grid-initial');
    }

    // --- Final panel: show symbols.final, NO win lines, golden AFTER transformation ---
    renderGrid(field.symbols.final, [], goldenFinal, 'grid');

  } else {
    wrapper?.classList.remove('double-view');
    if (initialContainer) initialContainer.style.display = 'none';
    if (finalLabel) finalLabel.style.display = 'none';

    if (resolvedPhase === 'initial') {
      // Initial: show initial symbols WITH payouts (win lines) and golden from this tumble start
      renderGrid(field.symbols.initial, field.symbols.payouts, goldenInitial, 'grid');
    } else {
      // Final: show final symbols, NO payouts (removed), golden AFTER transformation
      renderGrid(field.symbols.final, [], goldenFinal);
    }
  }
}

// ── Grid Rendering ───────────────────────────────────────────────────────────
function renderGrid(symbols, payouts, goldenSet, targetId = 'grid') {
  const gridEl = document.getElementById(targetId);
  if (!gridEl) return;
  gridEl.innerHTML = '';
  const { rows, cols } = game.grid;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 76px)`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, 76px)`;

  const winPos = new Set();
  (payouts || []).forEach((p) => {
    if (Array.isArray(p.positions)) {
      p.positions.forEach((pos) => winPos.add(pos));
    }
  });
  const golden = goldenSet || new Set();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      const id = symbols[idx];
      const cell = document.createElement('div');
      const isWin = winPos.has(idx);
      const isEmpty = id === game.emptySymbolId || id === null;
      const isGolden = golden.has(idx);

      let bg = isEmpty ? '#00000044' : '#ffffff05';
      let border = isEmpty ? '#ffffff05' : '#ffffff10';
      let shadow = 'none';

      if (isWin) {
        bg = 'rgba(34, 197, 94, 0.3)'; // Green background for win
        border = '#4ade80'; // Green border
      }

      if (isGolden) {
        border = '#fbbf24'; // Golden border overrides
        shadow = '0 0 15px rgba(251, 191, 36, 0.3)';
        if (!isWin) {
          bg = 'rgba(251, 191, 36, 0.15)'; 
        }
      }

      cell.className = 'grid-cell';
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute(
        'aria-label',
        `Row ${r + 1} Column ${c + 1} ${isEmpty ? 'Empty' : SYMBOLS[id] || id}${isWin ? ' Winning' : ''}${isGolden ? ' Golden' : ''}`,
      );
      cell.style.cssText = `
        width: 76px; height: 76px;
        background: ${bg};
        border: 1px solid ${border};
        box-shadow: ${shadow};
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        border-radius: 12px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: ${isEmpty ? '0.2' : '1'};
      `;

      cell.innerHTML = `
        <div style="font-size: 2.2em; line-height: 1; transform: ${isEmpty ? 'scale(0.5)' : 'scale(1)'}; transition: transform 0.3s;">
          ${EMOJIS[id] || (isEmpty ? '' : id)}
        </div>
        ${!isEmpty ? `<div style="font-size: 8px; color: ${isGolden ? '#fbbf24' : SYMBOL_COLORS[id] || '#666'}; font-weight: 800; margin-top: 4px; letter-spacing:0.5px; opacity:0.6;">${SYMBOLS[id]}</div>` : ''}
      `;

      cell.onmouseover = () => {
        const insp = document.getElementById('inspector');
        if (insp) {
          insp.style.display = 'block';
          document.getElementById('inspSymbol').innerText = isEmpty
            ? 'EMPTY'
            : `${EMOJIS[id]} ${SYMBOLS[id]} (${id})`;
          document.getElementById('inspPos').innerText =
            `ID: ${idx} | R${r} C${c}${isWin ? ' [WIN]' : ''}`;
        }
      };
      cell.onmouseout = () => {
        const insp = document.getElementById('inspector');
        if (insp) insp.style.display = 'none';
      };

      gridEl.appendChild(cell);
    }
  }
}

// ── Tumble Sequence Animation ────────────────────────────────────────────────
async function playTumbleSequence(index) {
  if (gameState.isAnimating) return;
  gameState.isAnimating = true;
  const currentField = gameState.fields[index];
  const nextField = gameState.fields[index + 1];
  showTumble(index);

  if (parseInt(currentField.coins) > 0) {
    if (!bypassAnimation) {
      await new Promise((r) => setTimeout(r, 600));
      renderGrid(currentField.symbols.final, [], gameState.goldenCandidates[index]);
      await new Promise((r) => setTimeout(r, 600));
    }
    if (nextField) {
      gameState.currentIndex = index + 1;
      multDisplay.innerText = (nextField.features?.cumulativeMultiplier || 1) + 'x';
      document.getElementById('currentTumbleWin').innerText = nextField.coins;
      document.getElementById('accWinDisplay').innerText = gameState.accumulatedWins[index + 1];
      showTumble(index + 1);
    }
  }
  gameState.isAnimating = false;
}

// ── Export / Import ──────────────────────────────────────────────────────────

/**
 * Optimized Export Barebone Format:
 * Redundant/cloned data is stripped. Only raw source and metadata remains.
 */
function getOptimizedData(history) {
  const sortField = document.getElementById('sortField');
  return {
    v: 2, // Version
    f: activeFilters, // Sync filters
    o: sortField ? sortField.value : 'num_desc', // Sync sort order
    s: {
      // Metadata
      g: game.id,
      t: new Date().toISOString(),
    },
    h: history.map((entry) => ({
      n: entry.num,
      t: entry.timestamp,
      g: entry.gameId,
      r: entry.rawData,
      w: entry.isWin,
      v: entry.totalWin,
      b: entry.bookmarked || false,
    })),
  };
}

// ── Chunked Export ──────────────────────────────────────────────────────────
async function exportDataChunked(dataList, fileName) {
  showLoading('Preparing Export...');
  const chunks = [];
  const chunkSize = 1000;
  for (let i = 0; i < dataList.length; i += chunkSize) {
    const percent = Math.round((i / dataList.length) * 100);
    showLoading(`Exporting ${Math.min(i + chunkSize, dataList.length)} / ${dataList.length}...`, percent);
    const chunk = getOptimizedData(dataList.slice(i, i + chunkSize));
    let str = JSON.stringify(chunk.h);
    chunks.push(str.slice(1, -1));
    await new Promise(r => setTimeout(r, 0));
  }
  
  const settingsExport = {
    playMode: localStorage.getItem('play_mode') || 'single',
    playCount: localStorage.getItem('play_count') || '10',
    requestBody: localStorage.getItem('request_body') || ''
  };
  
  const v2Format = {
    v: 2,
    f: activeFilters,
    o: localStorage.getItem('sort_field') || 'num_desc',
    s: settingsExport,
    h: []
  };
  const header = JSON.stringify(v2Format).split('"h":[]')[0] + '"h":[';
  const footer = ']}';
  
  const blob = new Blob([header, chunks.filter(c => c.length > 0).join(','), footer], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  hideLoading();
}

exportFilteredBtn.onclick = () => {
  const filtered = applyFilters(globalHistory, activeFilters, game);
  exportDataChunked(filtered, `slot-filtered-${game.id}-${new Date().toISOString().slice(0, 10)}.json`);
};

exportAllBtn.onclick = () => {
  exportDataChunked(globalHistory, `slot-all-${game.id}-${new Date().toISOString().slice(0, 10)}.json`);
};

// ── Import Handler ───────────────────────────────────────────────────────────
if (importMenuBtn) {
  importMenuBtn.onclick = (e) => {
    e.stopPropagation();
    const isVisible = importDropdown.style.display === 'block';
    importDropdown.style.display = isVisible ? 'none' : 'block';
  };
}

const triggerImport = (mode) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rawImport = JSON.parse(text);

      let importedRaw = [];
      if (Array.isArray(rawImport)) {
        importedRaw = rawImport; 
      } else if (rawImport.v === 2 && Array.isArray(rawImport.h)) {
        importedRaw = rawImport.h;
        if (mode === 'replace') {
          if (Array.isArray(rawImport.f) && rawImport.f.length > 0) {
            activeFilters = rawImport.f;
            localStorage.setItem('active_filters', JSON.stringify(activeFilters));
            window._renderFilterChips?.();
          }
          if (rawImport.o) {
            const sortField = document.getElementById('sortField');
            if (sortField) {
              sortField.value = rawImport.o;
              localStorage.setItem('sort_field', rawImport.o);
            }
          }
          if (rawImport.s) {
            if (rawImport.s.playMode) {
              localStorage.setItem('play_mode', rawImport.s.playMode);
              if (document.getElementById('playMode')) document.getElementById('playMode').value = rawImport.s.playMode;
            }
            if (rawImport.s.playCount) {
              localStorage.setItem('play_count', rawImport.s.playCount);
              if (document.getElementById('playCount')) document.getElementById('playCount').value = rawImport.s.playCount;
            }
            if (rawImport.s.requestBody) {
              localStorage.setItem('request_body', rawImport.s.requestBody);
              if (typeof syncSpinSettingsUI === 'function') syncSpinSettingsUI();
            }
          }
        }
      } else {
        alert('Invalid file format');
        return;
      }

      // 1. Restore Schema (Concurrent-ish via chunking to keep UI alive)
      showLoading('Parsing File...');
      const restored = [];
      const chunkSize = 1000;
      for (let i = 0; i < importedRaw.length; i += chunkSize) {
        const percent = Math.round((i / importedRaw.length) * 100);
        showLoading(`Processing ${Math.min(i + chunkSize, importedRaw.length)} / ${importedRaw.length}...`, percent);
        const chunk = importedRaw.slice(i, i + chunkSize);
        const processed = chunk.map((item) => {
          const r = item.rawData || item.r || item;
          if (!r || !r.step) return null;
          const fields = [];
          let spinType = 'basic';
          let playgroundCounter = 0;
          
          (r.step?.gamePhases || []).forEach((phase) => {
            if (phase.type === 'freeSpin') spinType = 'freeSpin';
            let roundCounter = 0;
            (phase.playgrounds || []).forEach(pg => {
              (pg.fields || []).forEach(f => {
                fields.push({ 
                  ...f, 
                  _playgroundIndex: playgroundCounter, 
                  _isFreeSpin: phase.type === 'freeSpin',
                  _roundIndex: roundCounter
                });
              });
              playgroundCounter++;
              roundCounter++;
            });
          });
          const summary = r.step.summary;
          const ts = item.timestamp || item.t || new Date().toISOString();
          const metaPublic = r.meta?.public || r.step?.meta?.public || {};

          const stats = getSpinStats(fields, game.wildSymbolId);
          return {
            finger: `${ts}_${summary.coins}_${fields.length}`,
            data: {
              num: item.num || item.n || undefined,
              timestamp: ts,
              gameId: item.gameId || item.g || game.id,
              rawData: r,
              fields,
              summary,
              isWin: parseInt(summary.coins || 0) > 0,
              totalWin: summary.coins || 0,
              tumbleCount: fields.length,
              cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
              betAmount: metaPublic.betAmount || 0,
              spinMode: metaPublic.spinMode || 'std',
              roundTags: r.roundTags || r.step?.roundTags || [],
              choices: r.choices || r.step?.choices || [],
              hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
              hasGolden: stats.totalGolden > 0,
              totalGolden: stats.totalGolden,
              maxMultiplier: stats.maxMultiplier,
              bookmarked: item.b || item.bookmarked || false,
            }
          };
        }).filter(Boolean);
        restored.push(...processed);
        await new Promise(r => setTimeout(r, 0)); 
      }

      showLoading('Saving... (Finalizing)', 100);
      let finalEntries = [];
      let skippedCount = 0;

      if (mode === 'replace') {
        await clearAllSpins();
        finalEntries = restored.map((r, i) => ({ ...r.data, num: i + 1 }));
      } else {
        // MERGE: Deduplicate using Fingerprints
        const existingFingers = new Set(globalHistory.map(s => {
          // Re-generate fingerprint for existing history
          return `${s.timestamp}_${s.summary.coins}_${s.fields.length}`;
        }));
        
        const filtered = restored.filter(r => {
          if (existingFingers.has(r.finger)) {
            skippedCount++;
            return false;
          }
          return true;
        });

        const baseNum = await getNextSpinNum();
        finalEntries = filtered.map((r, i) => ({ ...r.data, num: baseNum + i }));
      }

      if (finalEntries.length > 0) {
        await saveAllSpins(finalEntries);
        globalHistory = await loadAllSpins();
        renderSpinHistory();
        if (globalHistory.length > 0) loadSpin(0);
      }
      hideLoading();

      const msg = mode === 'replace' 
        ? `Replaced session with ${finalEntries.length} spins.` 
        : `Merged ${finalEntries.length} new spins${skippedCount > 0 ? ` (skipped ${skippedCount} duplicates)` : ''}.`;
      alert(msg);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  input.click();
};

if (importMergeBtn) importMergeBtn.onclick = () => { importDropdown.style.display = 'none'; triggerImport('merge'); };
if (importReplaceBtn) importReplaceBtn.onclick = () => { importDropdown.style.display = 'none'; triggerImport('replace'); };

// ── Prev / Next / openSpinRaw ────────────────────────────────────────────────
document.getElementById('tumbleList')?.remove();

window.openSpinRaw = (historyIndex) => {
  const spin = globalHistory[historyIndex];
  if (!spin) return;
  openRawDrawer(
    [
      { label: 'FULL_RESPONSE', data: spin.rawData },
      { label: 'SUMMARY', data: spin.summary },
      { label: 'CONFIG', data: spin.rawData?.step?.config },
    ],
    0,
  );
};

// ── Virtual Frame Navigation ─────────────────────────────────────────────────
// A "frame" = (tumbleIndex, phase) where phase is 'initial' or 'final'
// When showDoubleGrid: navigate per tumble (no phase concept)
// When singleViewMode='both': initial -> final -> next tumble initial -> ...
// When singleViewMode='final'|'initial': skip directly to that phase per tumble

function navigateFrame(direction) {
  const maxTumble = (gameState.fields?.length || 1) - 1;
  const tIdx = gameState.currentIndex;
  const phase = gameState.currentFramePhase;

  if (showDoubleGrid) {
    // Navigate per tumble
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) window.selectTumble(next);
    return;
  }

  if (singleViewMode === 'final') {
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) window.selectTumble(next, 'final');
    return;
  }

  if (singleViewMode === 'initial') {
    const next = tIdx + direction;
    if (next >= 0 && next <= maxTumble) window.selectTumble(next, 'initial');
    return;
  }

  // singleViewMode === 'both': phase-based navigation
  if (direction === 1) {
    if (phase === 'initial') {
      window.selectTumble(tIdx, 'final');
    } else {
      if (tIdx < maxTumble) window.selectTumble(tIdx + 1, 'initial');
    }
  } else {
    if (phase === 'final') {
      window.selectTumble(tIdx, 'initial');
    } else {
      if (tIdx > 0) window.selectTumble(tIdx - 1, 'final');
    }
  }
}

document.getElementById('prevBtn').onclick = () => navigateFrame(-1);
document.getElementById('nextBtn').onclick = () => navigateFrame(1);

function navigateRound(direction) {
  const spin = globalHistory[currentSpinIndex];
  if (!spin || spin.fields.length === 0 || gameState.currentIndex < 0) return;
  
  const currentField = spin.fields[gameState.currentIndex];
  const currentRound = currentField ? currentField._playgroundIndex : 0;
  
  let targetRound = currentRound + direction;
  if (targetRound < 0) targetRound = 0;
  if (targetRound >= spin.playgroundCount) targetRound = spin.playgroundCount - 1;
  
  if (targetRound !== currentRound) {
    const header = document.querySelector(`.round-header[data-round="${targetRound}"]`);
    if (header) header.click();
  }
}

function navigateSpinCard(direction) {
  const cards = Array.from(document.querySelectorAll('.spin-history-card'));
  if (cards.length === 0) return;
  const activeIdx = cards.findIndex(c => c.classList.contains('active'));
  
  if (activeIdx === -1) {
    cards[0].click();
    cards[0].focus();
    return;
  }
  
  let targetIdx = activeIdx + direction;
  if (targetIdx < 0) targetIdx = 0;
  if (targetIdx >= cards.length) targetIdx = cards.length - 1;
  
  if (targetIdx !== activeIdx) {
    cards[targetIdx].click();
    cards[targetIdx].focus();
  }
}

// ── Global Hotkeys ───────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const isInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  const isInTablist =
    document.activeElement?.getAttribute('role') === 'tab' ||
    document.activeElement?.closest('#rawTabs');
  
  if (!isInput && !isInTablist) {
    if (e.key === ' ') {
      e.preventDefault();
      const playBtn = document.getElementById('playbackPlayBtn');
      if (playBtn) playBtn.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (e.shiftKey) navigateRound(-1);
      else if (e.altKey || e.metaKey) navigateSpinCard(-1);
      else navigateFrame(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) navigateRound(1);
      else if (e.altKey || e.metaKey) navigateSpinCard(1);
      else navigateFrame(1);
    }
  }

  if (e.key === 'Escape') {
    // Focus traps & modal clearing priority
    const modal = document.getElementById('settingsModal');
    if (modal && modal.style.display !== 'none') {
      // Allow the modal's own keydown to handle Escape
      return;
    }

    if (currentSpinIndex !== -1) {
      // Check if any filter input is open (don't steal Escape from filter inputs)
      if (
        document.querySelector(
          '.filter-condition-input, .filter-inline-picker, .filter-inline-input, .filter-date-picker',
        )
      ) {
        return;
      }

      // Deselect current spin result
      currentSpinIndex = -1;
      localStorage.removeItem('last_spin_index');
      renderSpinHistory(true);

      // Clear grid and UI overlays
      const totalCells = game.grid.rows * game.grid.cols;
      renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
      const overlay = document.getElementById('resultOverlay');
      if (overlay) overlay.style.display = 'none';

      // Reset stats
      document.getElementById('totalWin').innerText = '0';
      document.getElementById('multDisplay').innerText = '1x';
      document.getElementById('cascadeCount').innerText = '0';
      document.getElementById('tumbleCount').innerText = '0';
      document.getElementById('currentTumbleWin').innerText = '0';
      document.getElementById('accWinDisplay').innerText = '0';
    }
  }
});

// ── Clear History ────────────────────────────────────────────────────────────
const clearBtn = document.getElementById('clearHistoryBtn');
if (clearBtn) {
  clearBtn.onclick = async () => {
    if (!confirm('Delete ALL spin history? This cannot be undone.')) return;
    await clearAllSpins();
    globalHistory = [];
    currentSpinIndex = -1;
    renderSpinHistory();
    const totalCells = game.grid.rows * game.grid.cols;
    renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
  };
}

async function loadDefaultData(manual = false) {
  const isLoaded = localStorage.getItem('default_data_loaded');
  if (isLoaded && !manual) return;

  if (!manual) {
    const count = await getSpinCount();
    if (count > 0) {
      localStorage.setItem('default_data_loaded', 'true');
      return;
    }
  }

  showLoading('Loading default history...', 0);
  try {
    let allHistory = [];
    const partsPrefix = '/history-parts/default-history-';
    
    // 1. Try multipart first
    const firstResp = await fetch(`${partsPrefix}1.json`);
    if (!firstResp.ok) {
      console.warn('Default history parts not found in /history-parts/');
      return; // Silently exit or handle as empty
    }

    const firstData = await firstResp.json();
    const totalParts = firstData.total_parts || 1;
    allHistory = firstData.h || [];
    
    // Load metadata from part 1
    if (firstData.f && (activeFilters.length === 0 || manual)) {
      activeFilters = firstData.f;
      localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    }
    if (firstData.o) {
      localStorage.setItem('sort_field', firstData.o);
    }

    // Load remaining parts in parallel
    if (totalParts > 1) {
      let finishedParts = 1;
      const remainingParts = Array.from({ length: totalParts - 1 }, (_, i) => i + 2);
      
      const partsData = await Promise.all(remainingParts.map(async (p) => {
        const resp = await fetch(`${partsPrefix}${p}.json`);
        finishedParts++;
        showLoading(`Loading default history (${finishedParts}/${totalParts})...`, Math.floor((finishedParts / totalParts) * 80));
        if (resp.ok) {
          const partData = await resp.json();
          return partData.h || [];
        }
        return [];
      }));
      
      partsData.forEach(chunk => {
        allHistory = allHistory.concat(chunk);
      });
    }
    
    if (allHistory.length > 0) {
      showLoading(`Importing ${allHistory.length} spins...`, 80);
      console.log(`Transforming ${allHistory.length} spins for IndexedDB...`);
      const mapped = allHistory.map((entry, idx) => {
        const r = entry.rawData || entry.r || entry; // Legacy fallback kept very brief
        if (!r || !r.step) return null;
        
        const fields = r.step.gamePhases[0].playgrounds[0].fields;
        const summary = r.step.summary;
        const metaPublic = r.meta?.public || r.step?.meta?.public || {};

        const stats = getSpinStats(fields, game.wildSymbolId);
        return {
          num: entry.num || entry.n || (idx + 1),
          timestamp: entry.timestamp || entry.t || new Date().toISOString(),
          gameId: entry.gameId || entry.g || game.id,
          rawData: r,
          fields,
          summary,
          isWin: parseInt(summary.coins || 0) > 0,
          totalWin: summary.coins || 0,
          tumbleCount: fields.length,
          cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
          betAmount: metaPublic.betAmount || 0,
          spinMode: metaPublic.spinMode || 'std',
          roundTags: r.roundTags || r.step?.roundTags || [],
          choices: r.choices || r.step?.choices || [],
          bookmarked: entry.b || entry.bookmarked || false,
          hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
          hasGolden: stats.totalGolden > 0,
          totalGolden: stats.totalGolden,
          maxMultiplier: stats.maxMultiplier,
        };
      }).filter(Boolean);

      console.log(`Importing ${mapped.length} mapped spins into IndexedDB...`);
      await saveAllSpins(mapped);
      console.log('Import complete.');
    }
    
    localStorage.setItem('default_data_loaded', 'true');
    showLoading('Default history loaded!', 100);
    setTimeout(() => {
      hideLoading();
      location.reload(); 
    }, 1000);
  } catch (err) {
    console.error('Failed to load default data:', err);
    hideLoading();
  }
}

// ── Playback Logic ───────────────────────────────────────────────────────────
function startSpinPlayback() {
  stopPlayback();
  gameState.currentIndex = 0;
  gameState.currentFramePhase = 'initial';
  window.selectTumble(0, 'initial');
  
  // Start the interval with dynamic speed
  const delay = 800 / playbackSpeed;
  playbackInterval = setInterval(() => {
    stepPlayback(1);
  }, delay);
  
  syncPlaybackUI();
}

function stopPlayback() {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  syncPlaybackUI();
}

function togglePlayback() {
  if (playbackInterval) {
    stopPlayback();
  } else {
    // If we are at the end, replay
    const isAtEnd = gameState.currentIndex >= (gameState.fields?.length || 0) - 1 && gameState.currentFramePhase === 'final';
    if (isAtEnd) {
      replaySpin();
    } else {
      const delay = 800 / playbackSpeed;
      playbackInterval = setInterval(() => {
        stepPlayback(1);
      }, delay);
    }
  }
  syncPlaybackUI();
}

function stepPlayback(direction = 1) {
  if (direction === 1) {
    // Forward logic
    if (gameState.currentFramePhase === 'initial') {
      gameState.currentFramePhase = 'final';
    } else {
      if (gameState.currentIndex < (gameState.fields?.length || 0) - 1) {
        gameState.currentIndex++;
        gameState.currentFramePhase = 'initial';
      } else {
        // End of spin
        stopPlayback();
        if (isAutoReplay) {
          setTimeout(replaySpin, 1200);
        }
        return;
      }
    }
  } else {
    // Backward logic
    if (gameState.currentFramePhase === 'final') {
      gameState.currentFramePhase = 'initial';
    } else {
      if (gameState.currentIndex > 0) {
        gameState.currentIndex--;
        gameState.currentFramePhase = 'final';
      }
    }
  }
  
  window.selectTumble(gameState.currentIndex, gameState.currentFramePhase);
  
  updatePlaybackLabels();
  syncPlaybackUI();
}

function handleSpeedChange(e) {
  playbackSpeed = parseFloat(e.target.value);
  localStorage.setItem('playback_speed', playbackSpeed);
  if (speedValueLabel) speedValueLabel.innerText = playbackSpeed.toFixed(2) + 'x';
  
  // If playing, restart interval with new speed
  if (playbackInterval) {
    stopPlayback();
    togglePlayback();
  }
}

function replaySpin() {
  startSpinPlayback();
}

function toggleAutoReplay() {
  isAutoReplay = !isAutoReplay;
  localStorage.setItem('is_auto_replay', isAutoReplay);
  if (playbackAutoBtn) {
    playbackAutoBtn.classList.toggle('active-pulse', isAutoReplay);
  }
}

function syncPlaybackUI() {
  if (!playbackPlayBtn) return;
  const isPlaying = !!playbackInterval;
  
  if (isPlaying) {
    playbackPlayBtn.classList.add('playing');
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = 'block';
  } else {
    playbackPlayBtn.classList.remove('playing');
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
  }
}

/**
 * Navigates to the previous/next spin in the CURRENT FILTERED list.
 * @param {number} direction -1 for previous, 1 for next
 */
function navigateSpinFiltered(direction) {
  if (!currentSortedList || currentSortedList.length === 0) return;

  // Find where the current spin is in the filtered list
  const currentIndexInFiltered = currentSortedList.findIndex(
    (spin) => globalHistory.indexOf(spin) === currentSpinIndex
  );

  let nextIndex = 0;
  if (currentIndexInFiltered === -1) {
    // Current spin is not in filters, jump to the first filtered item
    nextIndex = 0;
  } else {
    nextIndex = currentIndexInFiltered + direction;
  }

  if (nextIndex >= 0 && nextIndex < currentSortedList.length) {
    const nextSpin = currentSortedList[nextIndex];
    const originalIdx = globalHistory.indexOf(nextSpin);
    loadSpin(originalIdx);

    // Smooth scroll sidebar to the new active card
    setTimeout(() => {
      const activeCard = document.querySelector(`.spin-history-card[data-index="${originalIdx}"]`);
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }
}

// ── Global Listeners for Playback ───────────────────────────────────────────
if (playbackPlayBtn) playbackPlayBtn.onclick = togglePlayback;
if (playbackBackBtn) playbackBackBtn.onclick = () => stepPlayback(-1);
if (playbackForwardBtn) playbackForwardBtn.onclick = () => stepPlayback(1);
if (prevBtn) prevBtn.onclick = () => navigateSpinFiltered(-1);
if (nextBtn) nextBtn.onclick = () => navigateSpinFiltered(1);
if (playbackReplayBtn) playbackReplayBtn.onclick = replaySpin;
if (playbackAutoBtn) playbackAutoBtn.onclick = toggleAutoReplay;
if (playbackSpeedSlider) playbackSpeedSlider.oninput = handleSpeedChange;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  await migrateFromLocalStorage();
  await loadDefaultData();
  globalHistory = await loadAllSpins();
  console.log(`Boot: Loaded ${globalHistory.length} total spins from IndexedDB.`);

  const lastIdx = localStorage.getItem('last_spin_index');
  if (lastIdx !== null && globalHistory[parseInt(lastIdx)]) {
    currentSpinIndex = parseInt(lastIdx);
  }

  buildFilterBar();

  if (globalHistory.length > 0) {
    console.log('Boot: Rendering history...');
    renderSpinHistory();
    if (currentSpinIndex === -1) loadSpin(0);
    else loadSpin(currentSpinIndex);
  } else {
    console.log('Boot: No history found.');
  }

  const totalCells = game.grid.rows * game.grid.cols;
  if (globalHistory.length === 0) {
    renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
  }
}

function toggleAutoplayOnSelect() {
  isAutoplayOnSelect = !isAutoplayOnSelect;
  localStorage.setItem('autoplay_on_select', isAutoplayOnSelect);
  if (playbackAutoplayBtn) {
    playbackAutoplayBtn.classList.toggle('active-pulse', isAutoplayOnSelect);
  }
}

if (playbackAutoplayBtn) {
  playbackAutoplayBtn.onclick = toggleAutoplayOnSelect;
}

boot().catch((err) => console.error('Boot failed:', err));
