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
let SYMBOLS = game.symbols || {};
let EMOJIS = game.emojis || {};
let SYMBOL_COLORS = game.colors || {};

function renderWinCategoryCheckboxes() {
  const container = document.getElementById('targetConditionsCheckboxes');
  if (!container) return;
  container.innerHTML = '';

  const cats = game.winCategories || {};
  Object.keys(cats).forEach((cat) => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex; align-items:center; gap:4px; cursor:pointer; color:#ccc;';
    // Turns "MEGA_WIN" into "MEGA (50x)"
    const displayName = cat.replace('_WIN', '') + ` (${cats[cat]}x)`;
    label.innerHTML = `<input type="checkbox" class="target-cond-cb" value="${cat}"> ${displayName}`;
    container.appendChild(label);
  });
}

function switchGame(id) {
  setActiveGame(id);
  game = getActiveGame();
  SYMBOLS = game.symbols || {};
  EMOJIS = game.emojis || {};
  SYMBOL_COLORS = game.colors || {};
  document.getElementById('gameLabel').innerText = game.name;
  renderSymbolMap();

  renderWinCategoryCheckboxes();
  if (typeof renderCheatTemplates === 'function') renderCheatTemplates();

  const totalCells = game.grid.rows * game.grid.cols;
  renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());

  // --- STRICT UI ISOLATION ---
  // Instantly purge the old game's data from RAM
  globalHistory = [];
  currentSpinIndex = -1;
  localStorage.removeItem('last_spin_index');

  // Re-fetch only this specific game's history from IndexedDB
  triggerFilterUpdate();
}

// ── Globals ──────────────────────────────────────────────────────────────────
let API_URL =
  localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || 'http://localhost:9000';
let PLAYER_ID = localStorage.getItem('player_id') || 'cascading-game-tester';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const spinBtn = document.getElementById('spinBtn');
const grid = document.getElementById('grid');
const multDisplay = document.getElementById('multDisplay');
const currentTumbleWinEl = document.getElementById('currentTumbleWin');
const accWinDisplayEl = document.getElementById('accWinDisplay');
const totalWinEl = document.getElementById('totalWin');
const spinHistoryEl = document.getElementById('spinHistory');

// Description hover tooltip
const _descTooltip = (() => {
  const el = document.createElement('div');
  el.id = 'desc-tooltip';
  document.body.appendChild(el);

  spinHistoryEl.addEventListener('mouseover', (e) => {
    const titleEl = e.target.closest('.card-title-v5[data-desc]');
    if (titleEl && titleEl.dataset.desc) {
      el.textContent = titleEl.dataset.desc;
      el.classList.add('visible');
    }
  });
  spinHistoryEl.addEventListener('mousemove', (e) => {
    if (el.classList.contains('visible')) {
      const x = e.clientX + 14;
      const y = e.clientY + 14;
      const vw = window.innerWidth;
      const tw = el.offsetWidth;
      el.style.left = (x + tw > vw - 8 ? vw - tw - 8 : x) + 'px';
      el.style.top = y + 'px';
    }
  });
  spinHistoryEl.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget?.closest?.('.card-title-v5')) {
      el.classList.remove('visible');
    }
  });
})();

function parseSmartNumber(val) {
  if (!val) return 0;
  const match = String(val)
    .toLowerCase()
    .trim()
    .match(/^(\d+\.?\d*)([km]?)$/);
  if (!match) return parseInt(val) || 0;
  const num = parseFloat(match[1]);
  if (match[2] === 'k') return Math.floor(num * 1000);
  if (match[2] === 'm') return Math.floor(num * 1000000);
  return Math.floor(num);
}

function getWinCategory(win, bet) {
  if (bet <= 0 || !game.winCategories) return 'NONE';
  const tb = win / bet;

  // Sort categories by highest threshold first (e.g., 5000 -> 150 -> 50 -> 20)
  const sortedCats = Object.entries(game.winCategories).sort((a, b) => b[1] - a[1]);

  for (const [catName, threshold] of sortedCats) {
    if (tb >= threshold) return catName;
  }
  return 'NONE';
}

function setHudValue(el, val, baseEm = 1.6) {
  if (!el) return;
  el.innerText = val;
  const len = String(val).length;
  let scale = 1;
  if (len > 9) scale = 0.55;
  else if (len > 7) scale = 0.7;
  else if (len > 5) scale = 0.85;
  el.style.fontSize = baseEm * scale + 'em';
}
const exportBtn = document.getElementById('exportBtn');
const importMenuBtn = document.getElementById('importMenuBtn');
const importDropdown = document.getElementById('importDropdown');
const importMergeBtn = document.getElementById('importMergeBtn');
const importReplaceBtn = document.getElementById('importReplaceBtn');

const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const requestBodyTextarea = document.getElementById('requestBody');
const disableAnimCheckbox = document.getElementById('disableAnimation');
const clearDataBtn = document.getElementById('clearDataBtn');

// Export Menu refs
const exportMenuBtn = document.getElementById('exportMenuBtn');
const exportDropdown = document.getElementById('exportDropdown');
const exportFilteredBtn = document.getElementById('exportFilteredBtn');
const exportAllBtn = document.getElementById('exportAllBtn');
const exportMappedFilteredBtn = document.getElementById('exportMappedFilteredBtn');
const exportMappedAllBtn = document.getElementById('exportMappedAllBtn');

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
        // REMOVED: c.choice = 1 injection logic. The request body is now the source of truth.
        c.betAmount = parseFloat(uiBetAmount.value) || 20;
        c.cashBet = c.betAmount;
        c.spinMode = uiStake.value;
        if (Array.isArray(c.stakes) && c.stakes.length > 0) {
          c.stakes[0].type = uiStake.value;
        }
        const str = JSON.stringify(c, null, 2);
        requestBodyTextarea.value = str;
        localStorage.setItem('request_body', str);
      } catch (e) {
        console.error('Failed to parse request JSON', e);
      }
    };

    // Ensure we don't attach identical event listeners multiple times
    if (!window._syncSpinBound) {
      uiSpinType.addEventListener('change', updateConfig);
      uiBetAmount.addEventListener('input', updateConfig);
      uiStake.addEventListener('change', updateConfig);
      window._syncSpinBound = true;
    }
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
    if (!loadingOverlay.classList.contains('show')) {
      loadingOverlay.style.display = 'flex';
      // Trigger entrance animation next frame
      requestAnimationFrame(() => {
        loadingOverlay.classList.add('show');
      });
    }
  }
}
function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove('show');
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
      if (loadingBar) loadingBar.style.width = '0%';
    }, 300);
  }
}

function promptUserForChoice(availableChoices) {
  return new Promise((resolve) => {
    const modal = document.getElementById('choicePromptModal');
    const container = document.getElementById('choicePromptButtons');
    container.innerHTML = '';

    availableChoices.forEach((choiceId) => {
      const actionDef = game.actions?.find((a) => a.id === choiceId);
      const desc = actionDef ? actionDef.desc : `Action ${choiceId}`;

      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.style.padding = '12px';
      btn.style.fontSize = '12px';
      btn.innerHTML = `<span style="opacity:0.6; margin-right:8px;">[${choiceId}]</span> ${desc}`;
      btn.onclick = () => {
        modal.close();
        resolve(choiceId);
      };
      container.appendChild(btn);
    });

    modal.showModal();
  });
}

async function clearAllDataAndReload(skipConfirm = false) {
  if (!skipConfirm) {
    const confirmed = confirm(
      'Are you sure you want to clear ALL data? This will reset all settings, history, and bookmarks. This action cannot be undone.',
    );
    if (!confirmed) return;
  }

  try {
    showLoading('Clearing data and updating...');
    // Clear all localStorage
    localStorage.clear();

    // Clear IndexedDB spins
    const { clearAllSpins } = await import('./db.js');
    await clearAllSpins();

    // app_version will be re-stored on next load from CF header

    location.reload(true);
  } catch (err) {
    console.error('Failed to clear data:', err);
    alert('An error occurred while clearing data. Check console for details.');
    hideLoading();
  }
}

// ── Version Detection ────────────────────────────────────────────────────────
async function getDeployVersion() {
  try {
    const res = await fetch('/?t=' + Date.now(), { method: 'HEAD' });
    return res.headers.get('X-Worker-Version-Id');
  } catch {
    return null;
  }
}

async function checkVersionOnLoad() {
  const serverVersion = await getDeployVersion();
  if (!serverVersion) return; // local dev or no CF header

  const storedVersion = localStorage.getItem('app_version');
  if (!storedVersion) {
    localStorage.setItem('app_version', serverVersion);
    return;
  }
  if (storedVersion !== serverVersion) {
    if (localStorage.getItem('skip_update') === serverVersion) {
      localStorage.setItem('app_version', serverVersion);
      return;
    }
    showUpdateNotification(`New version deployed`, serverVersion);
  }
}

async function checkVersionPeriodic() {
  const serverVersion = await getDeployVersion();
  if (!serverVersion) return;

  const storedVersion = localStorage.getItem('app_version');
  if (storedVersion && serverVersion !== storedVersion) {
    if (localStorage.getItem('skip_update') === serverVersion) return;
    showUpdateNotification(`Update available`, serverVersion);
  }
}

function showUpdateNotification(msg, serverVersion) {
  // Remove any existing one
  const existing = document.querySelector('.update-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:2px;">
      <div style="font-size:11px; font-weight:900; color:var(--bg-accent); text-transform:uppercase; letter-spacing:1px;">New Version Available</div>
      <div style="font-size:10px; color:#fff; opacity:0.8;">${msg}</div>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button id="refreshAppBtn" class="btn-primary" style="padding:6px 12px; border-radius:8px; font-weight:800; font-size:10px;">UPDATE</button>
      <button id="closeUpdateBtn" class="btn-ghost" style="padding:4px; border:none; background:transparent; color:#fff; opacity:0.4; font-size:14px; cursor:pointer;" title="Skip for now">&times;</button>
    </div>
  `;
  document.body.appendChild(toast);

  document.getElementById('refreshAppBtn').onclick = () => {
    clearAllDataAndReload(true);
  };

  document.getElementById('closeUpdateBtn').onclick = () => {
    localStorage.setItem('skip_update', serverVersion);
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  };
}

// Check on load (compare bundled version vs last seen version — no network needed)
checkVersionOnLoad();
// Periodic: detect new deploy while tab is open
setInterval(checkVersionPeriodic, 10 * 60 * 1000);

async function checkBackendHealth(url, label = 'custom') {
  const statusEl = document.getElementById('backendHealthStatus');
  if (!statusEl) return;
  if (!url) {
    statusEl.textContent = '';
    return;
  }
  statusEl.style.color = '#888';
  statusEl.textContent = 'Checking...';
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/service/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
      body: JSON.stringify({
        gameCode: game?.gameCode || 'LGS-008',
        id: 'cascading-game-tester',
        cashBet: '80',
        currencyDec: 2,
        stakes: [{ type: 'commonGame' }],
        rtpOption: 'RTP_97',
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      statusEl.style.color = '#22c55e';
      statusEl.textContent = '✓ Reachable';
    } else {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = `✗ Error ${res.status}`;
    }
  } catch {
    statusEl.style.color = '#ef4444';
    statusEl.textContent = '✗ Unreachable';
  }
}

openSettingsBtn.onclick = () => {
  lastFocusedElementBeforeModal = document.activeElement;

  const apiUrlInput = document.getElementById('apiUrlInput');
  if (apiUrlInput) {
    apiUrlInput.value = API_URL;

    let healthDebounce;
    apiUrlInput.oninput = () => {
      clearTimeout(healthDebounce);
      const statusEl = document.getElementById('backendHealthStatus');
      if (statusEl) {
        statusEl.style.color = '#888';
        statusEl.textContent = 'Waiting...';
      }
      healthDebounce = setTimeout(() => checkBackendHealth(apiUrlInput.value.trim()), 300);
    };

    document.querySelectorAll('.backend-preset-btn').forEach((btn) => {
      btn.onclick = () => {
        apiUrlInput.value = btn.dataset.url;
        checkBackendHealth(btn.dataset.url, btn.textContent.trim());
      };
    });

    checkBackendHealth(API_URL, 'current');
  }

  const playerIdInput = document.getElementById('playerIdInput');
  if (playerIdInput) playerIdInput.value = PLAYER_ID;

  const syncBtn = document.getElementById('syncHistoryBtn');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      if (
        !confirm(
          'Re-sync default history from json_files/default_data.json? Existing data will be merged.',
        )
      )
        return;
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

// ── Shortcuts Modal ──────────────────────────────────────────────────────────
const shortcutsBtn = document.getElementById('shortcutsBtn');
const shortcutsModal = document.getElementById('shortcutsModal');
const closeShortcutsBtn = document.getElementById('closeShortcutsBtn');

if (shortcutsBtn && shortcutsModal) {
  shortcutsBtn.onclick = () => shortcutsModal.showModal();
  closeShortcutsBtn.onclick = () => shortcutsModal.close();
  shortcutsModal.onclick = (e) => {
    if (e.target === shortcutsModal) shortcutsModal.close();
  };
}

// ── Quick Cheat Modal ────────────────────────────────────────────────────────
const quickCheatBtn = document.getElementById('quickCheatBtn');
const quickCheatModal = document.getElementById('quickCheatModal');
const closeQuickCheatBtn = document.getElementById('closeQuickCheatBtn');
const sendQuickCheatBtn = document.getElementById('sendQuickCheatBtn');
const clearCheatConfigBtn = document.getElementById('clearCheatConfigBtn');
const quickTestConfigInput = document.getElementById('quickTestConfigInput');
const quickCheatError = document.getElementById('quickCheatError');
const cheatTemplateSelect = document.getElementById('cheatTemplateSelect');
const cheatTemplateDesc = document.getElementById('cheatTemplateDesc');

let allCheatTemplates = {};
let cheatTemplates = [];

async function loadCheatTemplates() {
  if (!cheatTemplateSelect) return;
  try {
    const resp = await fetch('/cheat-tool-templates.json');
    if (!resp.ok) return;
    allCheatTemplates = await resp.json();
    renderCheatTemplates();
  } catch (e) {
    console.warn('Failed to load cheat templates', e);
  }
}

function renderCheatTemplates() {
  if (!cheatTemplateSelect) return;

  cheatTemplateSelect.innerHTML = '<option value="">-- Select a Template --</option>';
  if (cheatTemplateDesc) cheatTemplateDesc.style.display = 'none';

  // Extract templates for the active game (fallback to empty array if none exist)
  cheatTemplates = allCheatTemplates[game.id] || [];

  cheatTemplates.forEach((template, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = template.title;
    cheatTemplateSelect.appendChild(option);
  });

  cheatTemplateSelect.onchange = (e) => {
    const index = e.target.value;
    if (index !== '') {
      const template = cheatTemplates[index];
      if (template.description) {
        cheatTemplateDesc.textContent = template.description;
        cheatTemplateDesc.style.display = 'block';
      } else {
        cheatTemplateDesc.style.display = 'none';
      }

      try {
        const parsed = JSON.parse(template.json);
        // Auto-inject current IDs to the template
        if (typeof PLAYER_ID !== 'undefined') parsed.configId = PLAYER_ID;
        parsed.gameCode = game.gameCode;

        quickTestConfigInput.value = JSON.stringify(parsed, null, 2);
        quickCheatError.style.display = 'none';
      } catch (err) {
        quickTestConfigInput.value = template.json;
      }
    } else {
      cheatTemplateDesc.style.display = 'none';
    }
  };
}

loadCheatTemplates();

if (quickCheatBtn && quickCheatModal) {
  quickCheatBtn.onclick = () => {
    quickCheatError.style.display = 'none';
    if (cheatTemplateSelect) cheatTemplateSelect.value = '';
    if (cheatTemplateDesc) cheatTemplateDesc.style.display = 'none';
    let savedTestConfig = localStorage.getItem('test_config');
    if (!savedTestConfig && quickTestConfigInput.value) {
      savedTestConfig = quickTestConfigInput.value;
    }

    if (savedTestConfig) {
      quickTestConfigInput.value = savedTestConfig;
    } else {
      const defaultTestConfig = {
        configId: typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : game.playerId,
        gameCode: game.gameCode,
        config: {
          baseSpin: {
            initialScreen: {
              clusterCount: 5,
              symbols: [{ symbol: 'WILD', count: 10 }],
            },
            cascadeCount: 6,
            tumbleCount: 20,
          },
        },
      };
      quickTestConfigInput.value = JSON.stringify(defaultTestConfig, null, 2);
    }
    quickCheatModal.showModal();
  };

  closeQuickCheatBtn.onclick = () => quickCheatModal.close();

  sendQuickCheatBtn.onclick = async () => {
    quickCheatError.style.display = 'none';
    const jsonStr = quickTestConfigInput.value;
    const originalText = sendQuickCheatBtn.innerText;

    try {
      const parsed = JSON.parse(jsonStr);
      // Automatically inject current IDs if PLAYER_ID exists
      if (typeof PLAYER_ID !== 'undefined') parsed.configId = PLAYER_ID;
      parsed.gameCode = game.gameCode;

      sendQuickCheatBtn.innerText = 'SENDING...';
      const response = await fetch(`${API_URL}/v1/test/test-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'rgs-local-signature',
          accept: '*/*',
        },
        body: JSON.stringify(parsed),
      });

      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch (e) {
          // Handle cases where response text is not JSON
        }
      }

      sendQuickCheatBtn.innerText = originalText;

      // The backend may return 200 OK but with an error object inside
      if (response.ok && !result.error && !result.errors) {
        showLoading('Cheat Sent successfully! ✅');
        localStorage.setItem('test_config', jsonStr);
        setTimeout(hideLoading, 2000);
        quickCheatModal.close();
      } else {
        const errorMsg = result.error?.message || result.message || text || response.statusText;
        quickCheatError.style.display = 'block';
        quickCheatError.innerText = `Failed: ${errorMsg}`;
      }
    } catch (err) {
      sendQuickCheatBtn.innerText = originalText;
      quickCheatError.style.display = 'block';
      quickCheatError.innerText = `Invalid JSON or Request Error: ${err.message}`;
    }
  };

  if (clearCheatConfigBtn) {
    clearCheatConfigBtn.onclick = async () => {
      const configId = PLAYER_ID;
      const gameCode = game.gameCode;
      const params = new URLSearchParams({ gameCode, configId, playerId: configId });
      try {
        showLoading('Clearing config...');
        console.log(`Clearing cheat config for game=${gameCode}, id=${configId}`);
        const response = await fetch(`${API_URL}/v1/test/test-config?${params}`, {
          method: 'DELETE',
          headers: { accept: '*/*', 'x-signature': 'rgs-local-signature' },
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        localStorage.removeItem('test_config');
        if (cheatTemplateSelect) cheatTemplateSelect.value = '';
        if (cheatTemplateDesc) cheatTemplateDesc.style.display = 'none';
        quickCheatError.style.display = 'none';
        showLoading('Config cleared ✅');
        setTimeout(hideLoading, 1500);
      } catch (err) {
        hideLoading();
        quickCheatError.textContent = `Clear failed: ${err.message}`;
        quickCheatError.style.display = 'block';
      }
    };
  }

  // Basic Focus Trap inside cheat modal
  quickCheatModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') quickCheatModal.close();
  });
}

closeSettingsBtn.onclick = closeSettings;

// Click outside to close
settingsModal.addEventListener('click', (e) => {
  // If the user clicks directly on the dialog background (not the modal-content inside it)
  if (e.target === settingsModal) {
    closeSettings();
  }
});

if (clearDataBtn) {
  clearDataBtn.onclick = () => clearAllDataAndReload();
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
  symbolMapOverlay.innerHTML = Object.entries(game.symbols || {})
    .map(([id, name]) => {
      const emoji = (game.emojis || {})[id] || '';
      const color = (game.colors || {})[id] || '#666';
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
    if (gameState.fields?.length > 0)
      showTumble(0, singleViewMode === 'final' ? 'final' : 'initial');
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
let isAutoplayOnSelect = localStorage.getItem('autoplay_on_select') === 'true'; // Default to false (old strings were 'false' or null)

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
const prevRoundBtn = document.getElementById('prevRoundBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

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

let _searchAbortMainJs = null;

async function triggerFilterUpdate() {
  // Cancel any running search immediately
  if (_searchAbortMainJs) {
    _searchAbortMainJs.abort();
  }
  _searchAbortMainJs = new AbortController();
  const { signal } = _searchAbortMainJs;

  showLoading('Searching database...', -1);
  try {
    localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    const { loadAllSpins, searchEntireDb } = await import('./db.js');

    const hasActiveFilters = activeFilters.some((f) => !f.disabled);

    if (!hasActiveFilters) {
      globalHistory = await loadAllSpins(game.id, MAX_RAM_HISTORY);
    } else {
      globalHistory = await searchEntireDb(activeFilters, game, 5000, signal);
    }

    if (signal.aborted) return; // a newer search took over

    // FIX: Use the globally attached function instead of the local scoped one
    if (window._renderFilterChips) {
      window._renderFilterChips();
    }

    renderSpinHistory(true); // Paint the results
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error('Filter search error:', err);
    alert('Search failed: ' + err.message);
  } finally {
    if (!signal.aborted) {
      hideLoading();
      _searchAbortMainJs = null;
    }
  }
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

      chip.querySelector('.filter-chip-label').onclick = async (e) => {
        e.stopPropagation();
        af.disabled = !af.disabled;
        await triggerFilterUpdate();
      };

      chip.querySelector('.filter-chip-remove').onclick = async (e) => {
        e.stopPropagation();
        activeFilters.splice(idx, 1);
        await triggerFilterUpdate();
      };

      const valueEl = chip.querySelector('.filter-chip-value');
      if (valueEl && def.type !== 'toggle') {
        valueEl.classList.add('editable');
        valueEl.title = 'Click to edit';
        valueEl.onclick = (e) => {
          e.stopPropagation();
          showFilterInput(def, af); // Open editor
        };
      }

      chips.appendChild(chip);
    });

    const countEl = document.getElementById('filterCount');
    if (countEl) {
      countEl.innerText = `${globalHistory.length} Results`;
    }
  }

  const sortField = document.getElementById('sortField');
  if (sortField) {
    const savedSort = localStorage.getItem('sort_field');
    if (savedSort) sortField.value = savedSort;
    sortField.onchange = () => {
      localStorage.setItem('sort_field', sortField.value);
      renderSpinHistory(true);
    };
  }

  addBtn.onclick = (e) => {
    e.stopPropagation();
    const isShowing = dropdown.style.display === 'block';
    dropdown.style.display = isShowing ? 'none' : 'block';

    if (isShowing) return;
    dropdown.innerHTML = '';

    FILTER_DEFS.forEach((def) => {
      const stackable = def.id === 'text' || def.id === 'winCondition' || def.id === 'hasSymbol';
      if (!stackable && activeFilters.some((af) => af.id === def.id)) return;

      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerText = def.label;
      item.onclick = (ev) => {
        ev.stopPropagation();
        dropdown.style.display = 'none';
        showFilterInput(def);
      };
      dropdown.appendChild(item);
    });
  };

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== addBtn) {
      dropdown.style.display = 'none';
    }
  });

  function clearPendingInputs() {
    chips
      .querySelectorAll(
        '.filter-inline-picker, .filter-inline-input, .filter-condition-input, .filter-date-picker',
      )
      .forEach((el) => el.remove());
  }

  function showFilterInput(def, existingFilter = null) {
    clearPendingInputs();

    // Toggle
    if (def.type === 'toggle') {
      if (!existingFilter) activeFilters.push({ id: def.id, value: true });
      triggerFilterUpdate();
      return;
    }

    // MULTI-SELECT (For Win Categories)
    if (def.type === 'multiselect') {
      const picker = document.createElement('div');
      picker.className = 'filter-inline-picker';
      picker.style.flexDirection = 'column';
      picker.style.alignItems = 'flex-start';
      picker.style.minWidth = '140px';

      const selected = new Set(existingFilter ? existingFilter.value : []);

      let options = [];
      if (def.id === 'winCategory') {
        const cats = game.winCategories || {};
        options = Object.entries(cats)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => ({ label: `${k.replace('_WIN', '')} (${v}x)`, value: k }));
      }

      options.forEach((opt) => {
        const lbl = document.createElement('label');
        lbl.style.cssText =
          'display:flex; align-items:center; gap:6px; cursor:pointer; font-size:10px; padding:4px; color:#ccc; width:100%;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt.value;
        cb.style.accentColor = 'var(--bg-accent)';
        if (selected.has(opt.value)) cb.checked = true;

        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(opt.label));
        picker.appendChild(lbl);
      });

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px; width:100%;';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'filter-confirm-btn';
      confirmBtn.style.flex = '1';
      confirmBtn.innerText = 'Apply';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'filter-cancel-btn';
      cancelBtn.style.flex = '1';
      cancelBtn.innerText = 'Cancel';

      confirmBtn.onclick = async () => {
        const checked = Array.from(picker.querySelectorAll('input:checked')).map((cb) => cb.value);
        if (checked.length > 0) {
          if (existingFilter) existingFilter.value = checked;
          else activeFilters.push({ id: def.id, value: checked });
          picker.remove();
          await triggerFilterUpdate();
        } else {
          picker.remove();
        }
      };

      cancelBtn.onclick = () => picker.remove();
      btnRow.appendChild(confirmBtn);
      btnRow.appendChild(cancelBtn);
      picker.appendChild(btnRow);
      chips.appendChild(picker);
      return;
    }

    // Standard Select
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
        btn.className = `filter-inline-option ${existingFilter && existingFilter.value === opt.value ? 'active' : ''}`;
        btn.innerText = opt.label;
        btn.onclick = async () => {
          if (existingFilter) existingFilter.value = opt.value;
          else activeFilters.push({ id: def.id, value: opt.value });
          picker.remove();
          await triggerFilterUpdate();
        };
        picker.appendChild(btn);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'filter-cancel-btn';
      cancelBtn.innerText = '✕ Cancel';
      cancelBtn.onclick = () => picker.remove();
      picker.appendChild(cancelBtn);
      chips.appendChild(picker);
      return;
    }

    // Condition (Operator + Number)
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
        if (existingFilter && existingFilter.value.op === o.op) opt.selected = true;
        opSelect.appendChild(opt);
      });

      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.className = 'filter-input';
      numInput.style.width = '80px';
      if (existingFilter) numInput.value = existingFilter.value.num;

      const confirmBtn = document.createElement('button');
      confirmBtn.innerText = '✓';
      confirmBtn.className = 'filter-confirm-btn';

      const doCommit = async () => {
        if (numInput.value) {
          const val = { op: opSelect.value, num: numInput.value };
          if (existingFilter) existingFilter.value = val;
          else activeFilters.push({ id: def.id, value: val });
          wrapper.remove();
          await triggerFilterUpdate();
        } else {
          wrapper.remove();
        }
      };

      confirmBtn.onclick = doCommit;
      numInput.onkeydown = (e) => {
        if (e.key === 'Enter') doCommit();
      };

      wrapper.appendChild(opSelect);
      wrapper.appendChild(numInput);
      wrapper.appendChild(confirmBtn);
      chips.appendChild(wrapper);
      numInput.focus();
      return;
    }

    // Default Fallback (Number / Text input)
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-inline-input';
    const input = document.createElement('input');
    input.type = def.type === 'number' ? 'number' : 'text';
    input.className = 'filter-input';
    if (existingFilter) input.value = existingFilter.value;

    const confirmBtn = document.createElement('button');
    confirmBtn.innerText = '✓';
    confirmBtn.className = 'filter-confirm-btn';

    const doCommit = async () => {
      if (input.value) {
        if (existingFilter) existingFilter.value = input.value;
        else activeFilters.push({ id: def.id, value: input.value });
        wrapper.remove();
        await triggerFilterUpdate();
      } else {
        wrapper.remove();
      }
    };

    confirmBtn.onclick = doCommit;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') doCommit();
    };

    wrapper.appendChild(input);
    wrapper.appendChild(confirmBtn);
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

// Add isInteractive parameter
async function fireSpinRequest(config, isInteractive = false) {
  const reqBody = { ...config };
  if (!reqBody.gameCode) reqBody.gameCode = game.gameCode;
  if (!reqBody.id) reqBody.id = PLAYER_ID;

  const makeRequest = async (body) => {
    const response = await fetch(`${API_URL}/v1/service/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature' },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    // ERROR HANDLING: Super intuitive error toast
    if (!response.ok || json.error) {
      const errorMsg =
        json.error?.message || json.message || response.statusText || 'Unknown Server Error';
      showErrorToast(`API Error [${response.status}]: ${errorMsg}`);
      throw new Error(`API Error: ${errorMsg}`);
    }

    if (!json.data) throw new Error('Invalid API Response: Missing data object');
    return json.data;
  };

  let data = await makeRequest(reqBody);

  // Auto-chain if not finished
  if (data.finished === false && data.choices && data.choices.length > 0) {
    let allPhases = [...(data.step?.gamePhases || [])];

    const baseSpinPhases =
      data.step?.gamePhases ?? data.roundEvents?.playResult?.step?.gamePhases ?? [];
    const hasTriggerFreeSpin = baseSpinPhases.some((phase) =>
      (phase.playgrounds ?? []).some((pg) =>
        (pg.fields ?? []).some((field) => field.features?.triggerFreeSpin === true),
      ),
    );
    const baseGameWin = hasTriggerFreeSpin
      ? (data.step?.summary?.coins ?? data.roundEvents?.playResult?.step?.summary?.coins ?? 0)
      : null;

    let isFirstChain = true;

    while (data.finished === false && data.choices && data.choices.length > 0) {
      let nextChoice;

      // NEW: Dynamic Choice Selection
      if (data.choices.length === 1) {
        nextChoice = data.choices[0]; // Auto-hit if only 1 option
      } else {
        if (isInteractive) {
          nextChoice = await promptUserForChoice(data.choices);
        } else {
          nextChoice = data.choices[0]; // Auto-play fallback
        }
      }

      let nextBody = { ...reqBody, choice: nextChoice };

      if (isFirstChain && baseGameWin !== null) {
        nextBody = {
          ...nextBody,
          meta: { ...nextBody.meta, private: { ...nextBody.meta?.private, baseGameWin } },
        };
      }
      isFirstChain = false;

      const nextData = await makeRequest(nextBody);
      if (nextData.step && nextData.step.gamePhases) {
        allPhases = allPhases.concat(nextData.step.gamePhases);
      }
      data = nextData;
    }

    if (data.step) data.step.gamePhases = allPhases;
  }

  return data;
}

function truncateMiddle(str, maxLen = 32) {
  if (!str || str.length <= maxLen) return str;
  const front = Math.ceil((maxLen - 3) / 2);
  const end = Math.floor((maxLen - 3) / 2);
  return str.slice(0, front) + '...' + str.slice(-end);
}

window.startDescEdit = (num, rowEl) => {
  if (rowEl.querySelector('.title-input')) return;
  const spin = globalHistory.find((s) => s.num === num);
  const current = spin?.description || '';
  while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-input';
  input.value = current;
  input.placeholder = 'Add title…';
  rowEl.appendChild(input);
  input.focus();
  if (current) input.select();

  const save = () => {
    const val = input.value.trim();
    if (spin) {
      spin.description = val || null;
      // --- THE FIX: Save the manual edit to IndexedDB immediately ---
      import('./db.js').then((db) => db.saveSpin(spin));
    }
    renderSpinHistory(true);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.removeEventListener('blur', save);
      input.blur();
      renderSpinHistory(true);
    }
  });
};

function isSettleField(field) {
  // If the game explicitly provides isSettle (like sexy-fruits), respect it.
  if (field.features && 'isSettle' in field.features) {
    return field.features.isSettle === true;
  }
  // Backward compatibility fallback
  return true;
}
function getFieldEffectiveWin(field) {
  const raw = parseFloat(field.coins || 0);
  if (!raw) return 0;
  const val = isSettleField(field) ? raw * (field.features?.cumulativeMultiplier || 1) : raw;
  return parseFloat(val.toFixed(2));
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
    goldenArray.forEach((pos) => {
      if (payoutPositions.has(pos)) {
        totalGolden++;
      }
    });

    const m = f.features?.cumulativeMultiplier || 1;
    if (m > maxMultiplier) maxMultiplier = m;
  });

  return { goldenTransformed: totalGolden, maxMultiplier };
}

function getMappedRequest(config) {
  const playReq = {
    ...config,
    gameCode: game.gameCode,
    id: PLAYER_ID,
  };
  const cheatRaw = localStorage.getItem('test_config');
  let testConfig = null;
  if (cheatRaw) {
    try {
      testConfig = JSON.parse(cheatRaw);
    } catch (e) {}
  }
  return {
    play: playReq,
    testConfig: testConfig,
  };
}

// Ensure playSingleSpin passes true for interactivity
async function playSingleSpin(overrideConfig = null, description = null) {
  const config = overrideConfig || JSON.parse(requestBodyTextarea.value);
  const data = await fireSpinRequest(config, true); // <-- Pass true here

  const fields = [];
  const fieldMetadata = [];
  const playgroundStats = [];
  let hasBaseSpin = false;
  let hasFreeSpin = false;
  let playgroundCounter = 0;

  (data.step?.gamePhases || []).forEach((phase) => {
    if (phase.type === 'baseSpin') hasBaseSpin = true;
    if (phase.type === 'freeSpin') hasFreeSpin = true;
    let roundCounter = 0;
    (phase.playgrounds || []).forEach((pg) => {
      let pgTumbles = 0;
      let pgCascades = 0;
      (pg.fields || []).forEach((f) => {
        fields.push(f);
        fieldMetadata.push({
          playgroundIndex: playgroundCounter,
          isFreeSpin: phase.type === 'freeSpin',
          roundIndex: roundCounter,
        });
        pgTumbles++;
        if (parseFloat(f.coins || 0) > 0 && isSettleField(f)) pgCascades++;
      });
      playgroundStats.push({
        tumbleCount: pgTumbles,
        cascadeCount: pgCascades,
        headerText: phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
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
    isCheatTriggered: data.meta?.private?.isCheatTriggered === true, // <--- ADD THIS HERE
    fields,
    summary,
    isWin: parseInt(summary.coins || 0) > 0,
    totalWin: summary.coins || 0,
    tumbleCount: fields.length,
    cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0 && isSettleField(f)).length,
    betAmount,
    spinMode,
    spinType: hasFreeSpin ? 'freeSpin' : 'baseSpin',
    hasBaseSpin,
    hasFreeSpin,
    playgroundCount: playgroundCounter,
    roundTags,
    choices,
    hasMaxWin,
    goldenTransformed: stats.goldenTransformed,
    maxMultiplier: stats.maxMultiplier,
    fieldMetadata,
    playgroundStats,
    description: description || null,
    requestBody: getMappedRequest(config),
  };

  // Internal storage is kept detailed for UI performance,
  // but Export/Import is now barebone for transport efficiency.
  await import('./db.js').then((db) => db.saveSpin(entry));
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
    const fieldMetadata = [];
    const playgroundStats = [];
    let hasBaseSpin = false;
    let hasFreeSpin = false;
    let playgroundCounter = 0;

    (data.step?.gamePhases || []).forEach((phase) => {
      if (phase.type === 'baseSpin') hasBaseSpin = true;
      if (phase.type === 'freeSpin') hasFreeSpin = true;
      let roundCounter = 0;
      (phase.playgrounds || []).forEach((pg) => {
        let pgTumbles = 0;
        let pgCascades = 0;
        (pg.fields || []).forEach((f) => {
          fields.push(f);
          fieldMetadata.push({
            playgroundIndex: playgroundCounter,
            isFreeSpin: phase.type === 'freeSpin',
            roundIndex: roundCounter,
          });
          pgTumbles++;
          if (parseFloat(f.coins || 0) > 0 && isSettleField(f)) pgCascades++;
        });
        playgroundStats.push({
          tumbleCount: pgTumbles,
          cascadeCount: pgCascades,
          headerText: phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
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
      isCheatTriggered: data.meta?.private?.isCheatTriggered === true,
      fields,
      summary,
      isWin: parseInt(summary.coins || 0) > 0,
      totalWin: summary.coins || 0,
      tumbleCount: fields.length,
      cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0 && isSettleField(f)).length,
      betAmount,
      spinMode,
      spinType: hasFreeSpin ? 'freeSpin' : 'baseSpin',
      hasBaseSpin,
      hasFreeSpin,
      playgroundCount: playgroundCounter,
      roundTags,
      choices,
      hasMaxWin,
      goldenTransformed: stats.goldenTransformed,
      maxMultiplier: stats.maxMultiplier,
      fieldMetadata,
      playgroundStats,
      requestBody: getMappedRequest(config),
    });
  }

  // Bulk persist
  await saveAllSpins(entries);
  // Prepend newest-first
  globalHistory.unshift(...entries.reverse());
  return entries;
}

async function sendCheatConfig(jsonStr) {
  const parsed = JSON.parse(jsonStr);
  if (typeof PLAYER_ID !== 'undefined') parsed.configId = PLAYER_ID;
  parsed.gameCode = game.gameCode;
  const response = await fetch(`${API_URL}/v1/test/test-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': 'rgs-local-signature',
      accept: '*/*',
    },
    body: JSON.stringify(parsed),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cheat config failed (${response.status}): ${text}`);
  }
  localStorage.setItem('test_config', JSON.stringify(parsed));
}

// ── Play Modes ───────────────────────────────────────────────────────────────
const MAX_RAM_HISTORY = 10000; // Protects browser from crashing

async function playSpin() {
  if (gameState.isAnimating || autoPlayRunning) return;
  const mode = playModeSelect.value;
  const config = JSON.parse(requestBodyTextarea.value);

  if (mode === 'single') {
    setPlayUIBusy(true);
    try {
      await playSingleSpin(config);
      renderSpinHistory();
      loadSpin(0);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setPlayUIBusy(false);
    }
    return;
  }

  // --- PLAY ALL CHEAT TEMPLATES ---
  if (mode === 'allCheatTemplates') {
    if (!cheatTemplates || cheatTemplates.length === 0) {
      alert('Cheat templates not loaded yet!');
      return;
    }
    setPlayUIBusy(true);
    const statusEl = document.getElementById('autoStatus');
    const originalTestConfig = localStorage.getItem('test_config');

    try {
      for (let i = 0; i < cheatTemplates.length; i++) {
        const t = cheatTemplates[i];
        if (statusEl)
          statusEl.innerText = `Running cheat ${i + 1}/${cheatTemplates.length}: ${t.title}`;

        let parsed;
        try {
          parsed = JSON.parse(t.json);
        } catch (e) {
          continue;
        }

        // Auto-inject current IDs
        if (typeof PLAYER_ID !== 'undefined') parsed.configId = PLAYER_ID;
        parsed.gameCode = game.gameCode;

        // 1. Arm the backend via the test-config endpoint
        const cheatRes = await fetch(`${API_URL}/v1/test/test-config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-signature': 'rgs-local-signature',
            accept: '*/*',
          },
          body: JSON.stringify(parsed),
        });

        if (!cheatRes.ok) {
          console.error(`Skipping ${t.title} - Failed to set cheat config`);
          continue;
        }

        // 2. Set local storage so the Audit Drawer saves the correct testConfig metadata
        localStorage.setItem('test_config', JSON.stringify(parsed));

        // 3. Fire the normal spin! (The backend will intercept and apply the cheat)
        await playSingleSpin(config, t.title);
      }
      if (statusEl) statusEl.innerText = `Done: ${cheatTemplates.length} cheat templates`;
    } catch (err) {
      alert('Error running templates: ' + err.message);
    } finally {
      // 4. Cleanup: Delete the cheat config from the server so normal spins aren't affected
      const params = new URLSearchParams({
        gameCode: game.gameCode,
        configId: PLAYER_ID,
        playerId: PLAYER_ID,
      });
      fetch(`${API_URL}/v1/test/test-config?${params}`, {
        method: 'DELETE',
        headers: { 'x-signature': 'rgs-local-signature' },
      }).catch((e) => console.warn(e));

      // Restore user's previous cheat config state (or clear it)
      if (originalTestConfig) {
        localStorage.setItem('test_config', originalTestConfig);
      } else {
        localStorage.removeItem('test_config');
      }

      setPlayUIBusy(false);
      renderSpinHistory();
      loadSpin(0);
      updateStorageStats();
    }
    return;
  }

  // --- LIGHTNING SPEED WORKER PIPELINE ---
  autoPlayRunning = true;
  stopAutoBtn.style.display = 'inline-block';
  setPlayUIBusy(true);

  // FIX: Single declaration using the smart parser
  const maxSpins = mode === 'count' ? parseSmartNumber(playCountInput.value) : 100000000;

  // Setup for "Until Target N Times"
  const targetConditions = Array.from(document.querySelectorAll('.target-cond-cb:checked')).map(
    (cb) => cb.value,
  );
  const targetConditionLogic = document.getElementById('targetConditionLogic')?.value || 'OR';
  const targetCountLimit = parseInt(document.getElementById('targetConditionCount')?.value) || 1;

  let targetHitCount = 0; // Tracks OR
  let targetHitMap = {}; // Tracks AND
  targetConditions.forEach((c) => (targetHitMap[c] = 0));

  let count = 0;
  const statusEl = document.getElementById('autoStatus');
  const startTime = performance.now();

  try {
    const { getNextSpinNum, saveAllSpins } = await import('./db.js');
    let baseNum = await getNextSpinNum();

    // Utilize all CPU Cores
    const coreCount = navigator.hardwareConcurrency || 4;
    const workers = Array.from(
      { length: coreCount },
      () => new Worker(new URL('./spin-worker.js', import.meta.url), { type: 'module' }),
    );

    let activeWorkers = 0;
    let lastRenderTime = performance.now();
    let limitReached = false; // Safe stop flag

    await new Promise((resolve) => {
      const dispatchWork = () => {
        if (!autoPlayRunning || count >= maxSpins || limitReached) {
          if (activeWorkers === 0) resolve();
          return;
        }

        while (activeWorkers < coreCount && count < maxSpins && autoPlayRunning && !limitReached) {
          const worker = workers[activeWorkers % coreCount];
          const remaining = maxSpins - count;
          const currentBatchSize = Math.min(remaining, 50); // Balance payload size vs thread locking

          worker.postMessage({
            apiUrl: API_URL,
            config: config,
            gameCode: game.gameCode,
            playerId: PLAYER_ID,
            gameId: game.id,
            wildSymbolId: game.wildSymbolId,
            startNum: baseNum,
            batchSize: currentBatchSize,
          });

          baseNum += currentBatchSize;
          count += currentBatchSize;
          activeWorkers++;
        }
      };

      // Handle worker responses
      workers.forEach((worker) => {
        worker.onmessage = async (e) => {
          activeWorkers--;
          const { results } = e.data;

          if (results && results.length > 0) {
            await saveAllSpins(results);

            // --- AND / OR Win Category Logic ---
            if (mode === 'untilConditionN' && targetConditions.length > 0) {
              for (const entry of results) {
                const category = getWinCategory(entry.totalWin, entry.betAmount);
                if (targetConditions.includes(category)) {
                  if (targetConditionLogic === 'OR') {
                    targetHitCount++;
                    if (targetHitCount >= targetCountLimit) {
                      limitReached = true;
                      autoPlayRunning = false;
                      break;
                    }
                  } else {
                    targetHitMap[category]++;
                    const allMet = targetConditions.every(
                      (c) => targetHitMap[c] >= targetCountLimit,
                    );
                    if (allMet) {
                      limitReached = true;
                      autoPlayRunning = false;
                      break;
                    }
                  }
                }
              }
            }

            // --- NEW: Until Filter Logic ---
            if (mode === 'untilFilter' && activeFilters.some((f) => !f.disabled)) {
              for (const entry of results) {
                const isMatch = activeFilters.every((af) => {
                  if (af.disabled) return true;
                  const def = FILTER_DEFS.find((d) => d.id === af.id);
                  if (!def) return true;
                  return def.apply(entry, af.value, game);
                });

                if (isMatch) {
                  limitReached = true;
                  autoPlayRunning = false;
                  break;
                }
              }
            }

            // --- NEW: Until Win / Loss Logic ---
            if (mode === 'untilWin') {
              if (results.some((entry) => entry.isWin)) {
                limitReached = true;
                autoPlayRunning = false;
              }
            }
            if (mode === 'untilLoss') {
              if (results.some((entry) => !entry.isWin)) {
                limitReached = true;
                autoPlayRunning = false;
              }
            }

            // OOM Protection
            globalHistory.unshift(...results.reverse());
            if (globalHistory.length > MAX_RAM_HISTORY) {
              globalHistory.length = MAX_RAM_HISTORY;
            }
          }

          // Throttle UI Paints
          const now = performance.now();
          const rps = (count / ((now - startTime) / 1000)).toFixed(1);

          if (mode === 'untilConditionN') {
            const activeLabels = targetConditions
              .map((c) => c.split('_')[0])
              .join(targetConditionLogic === 'OR' ? '|' : '&');
            if (targetConditionLogic === 'OR') {
              if (statusEl)
                statusEl.innerText = `Processing: ${count} / ${maxSpins} | Found ${targetHitCount}/${targetCountLimit} [${activeLabels}] (${rps} spins/sec)`;
            } else {
              const minHit = targetConditions.length ? Math.min(...Object.values(targetHitMap)) : 0;
              if (statusEl)
                statusEl.innerText = `Processing: ${count} / ${maxSpins} | Found ${minHit}/${targetCountLimit} [${activeLabels}] (${rps} spins/sec)`;
            }
          } else {
            // FIX: Shows accurate X / 1000 tracker
            if (statusEl)
              statusEl.innerText = `Processing: ${count} / ${maxSpins} (${rps} spins/sec)`;
          }

          // FIX: Only render the massive DOM history every 1.5 seconds during auto-play
          if (now - lastRenderTime > 1500) {
            renderSpinHistory();
            lastRenderTime = now;
          }

          dispatchWork();
        };
      });

      dispatchWork(); // Kickoff
    });

    // Cleanup Workers
    workers.forEach((w) => w.terminate());
  } catch (err) {
    console.error(err);
    alert('Error during auto-play: ' + err.message);
  } finally {
    autoPlayRunning = false;
    stopAutoBtn.style.display = 'none';
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    if (statusEl) statusEl.innerText = `Done: ${count} in ${elapsed}s`;

    setPlayUIBusy(false);
    renderSpinHistory();
    if (globalHistory.length > 0) loadSpin(0);

    updateStorageStats(); // <--- ADD THIS LINE
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
  const mode = playModeSelect.value;
  if (playCountInput) playCountInput.style.display = mode === 'count' ? 'inline-block' : 'none';

  const tgGroup = document.getElementById('targetConditionsGroup');
  if (tgGroup) tgGroup.style.display = mode === 'untilConditionN' ? 'flex' : 'none';

  const tgCount = document.getElementById('targetConditionCount');
  if (tgCount) tgCount.style.display = mode === 'untilConditionN' ? 'inline-block' : 'none';
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
      lastSelectedTabLabel = tab.label.includes('TUMBLE_') ? 'TUMBLE_X_FIELD' : tab.label;
      renderRawDrawer();
      if (tab.label === 'INITIAL[]') window.selectTumble(gameState.currentIndex, 'initial');
      if (tab.label === 'FINAL[]' || tab.label === 'DIFF')
        window.selectTumble(gameState.currentIndex, 'final');
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
      initialArr = rawDrawerTabs.find((t) => t.label === 'INITIAL[]')?.data;
      finalArr = rawDrawerTabs.find((t) => t.label === 'FINAL[]')?.data;
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

    // Pure JSON display without recursive filtering bottleneck
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
    if (lastSelectedTabLabel === 'STEP_X_STATE' || lastSelectedTabLabel === 'TUMBLE_X_FIELD') {
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
        if (btn)
          btn.onclick = async () => {
            activeFilters = [];
            localStorage.setItem('active_filters', '[]');
            if (window._renderFilterChips) window._renderFilterChips();
            await triggerFilterUpdate(); // <--- This runs the global reset
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
        const nextLimit = Math.min(currentRenderLimit + renderChunkSize, currentSortedList.length);

        spinHistoryEl.removeChild(sentinel);
        appendSpinHistoryCards(currentRenderLimit, nextLimit);

        currentRenderLimit = nextLimit;
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

    const winCategory = getWinCategory(win, bet);

    card.innerHTML = `
      <div class="card-title-v5 ${spin.description ? '' : 'title-empty'}" data-desc="${spin.description ? spin.description.replace(/"/g, '&quot;') : ''}" data-desc-num="${spin.num}">
        <span class="title-text">${spin.description ? truncateMiddle(spin.description, 44) : '+ Add title…'}</span>
      </div>

      <div class="card-header-v5">
        <div class="header-left">
          <span class="status-dot ${spin.isWin ? 'winner' : 'no-win'}"></span>
          <span class="status-text">${spin.isWin ? 'WINNER' : 'NO WIN'}</span>
          <span class="card-num-v5">#${spin.num}</span>
          ${hasMaxWin && winCategory !== 'MAX_WIN' ? '<span class="max-win-badge-v5">MAX</span>' : ''}
        </div>
        <div class="header-right">
          <div class="meta-time">${formatTimestamp(spin.timestamp).split(' ')[1]}</div>
          <button class="bookmark-btn-v5 ${isBookmarked ? 'active' : ''}" data-num="${spin.num}" title="Bookmark">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
          </button>
          <button class="delete-btn-v5" data-num="${spin.num}" title="Delete Record">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div class="card-body-v5">
        <div class="win-display ${spin.isWin ? 'winner' : ''}">
          <span class="win-val">${win}</span>
          <span class="win-lbl">COINS</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          ${winCategory !== 'NONE' ? `<span class="win-category-badge ${winCategory.toLowerCase()}">${winCategory.replace('_WIN', '')} (${game.winCategories?.[winCategory] || 0}x)</span>` : ''}
          <div class="ratio-display-v5 ${parseFloat(ratio) >= 1 ? 'gold' : ''}">
            ${ratio}x TB
          </div>
        </div>
      </div>

      <div class="card-footer-v5">
        <div class="meta-items">
          <span class="m-item">Bet: <b>${bet}</b></span>
          <span class="m-item">Mode: <b>${spin.spinMode || 'std'}</b></span>
          <span class="m-item" style="color:var(--text-accent); font-weight:800;">${spin.spinType === 'freeSpin' ? 'FreeSpin' : 'BaseSpin'}</span>
          <span class="m-item multi">Max: <b>${spin.maxMultiplier || 1}x</b></span>
          <span class="m-item tumble">Tumbles: <b>${spin.tumbleCount || 0}</b></span>
          ${(spin.goldenTransformed || 0) > 0 ? `<span class="m-item golden" title="Golden Transformed">G-Trans: <b>${spin.goldenTransformed}</b></span>` : ''}
          ${spin.cascadeCount > 0 ? `<span class="m-item cascade">${spin.cascadeCount} Cascades</span>` : ''}
        </div>
      </div>
    `;

    let auditHtml = '';
    if (isActive) {
      let currentPlayground = -1;
      let localTumbleIdx = 0;
      let accumulatedWin = 0; // Tracks running total

      // Cap initial render to prevent UI freezes
      const RENDER_LIMIT = spin._showAllTumbles ? spin.fields.length : 50;
      const fieldsToRender = spin.fields.slice(0, RENDER_LIMIT);
      const hasMore = spin.fields.length > RENDER_LIMIT;

      const tumbles = fieldsToRender
        .map((f, tIdx) => {
          const meta = spin.fieldMetadata ? spin.fieldMetadata[tIdx] : {};
          let headerHtml = '';
          if (meta.playgroundIndex !== undefined && meta.playgroundIndex !== currentPlayground) {
            const isFirst = currentPlayground === -1;
            const prevStats =
              currentPlayground !== -1 && spin.playgroundStats
                ? spin.playgroundStats[currentPlayground]
                : null;
            const summaryHtml = prevStats
              ? `
              <div class="round-summary-v5" style="margin:8px 0; padding:6px 10px; background:rgba(34,197,94,0.05); border-radius:6px; border:1px solid rgba(34,197,94,0.1); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:9px; color:#4ade80; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Round Summary</span>
                <span style="font-size:10px; color:#fff; font-weight:800; font-family:monospace;">${prevStats.tumbleCount} Tumbles · ${prevStats.cascadeCount} Cascades</span>
              </div>`
              : '';

            currentPlayground = meta.playgroundIndex;
            localTumbleIdx = 1;

            const stats = spin.playgroundStats ? spin.playgroundStats[currentPlayground] : null;
            const headerText = stats
              ? stats.headerText
              : meta.isFreeSpin
                ? `FreeSpin #${meta.roundIndex + 1}`
                : 'BaseSpin';
            const statsHtml = stats
              ? `<span style="font-size: 9px; opacity: 0.7; font-weight: normal; margin-left: auto; margin-right: 12px;">(${stats.tumbleCount} Tumbles, ${stats.cascadeCount} Cascades)</span>`
              : '';

            const closeDiv = isFirst ? '' : `${summaryHtml}</div>`;

            let isActiveRound = false;
            const currentMeta = spin.fieldMetadata
              ? spin.fieldMetadata[gameState.currentIndex]
              : null;
            if (currentMeta && currentMeta.playgroundIndex === currentPlayground) {
              isActiveRound = true;
            }
            if (!currentMeta && isFirst) isActiveRound = true;

            headerHtml = `${closeDiv}
              <div class="round-header" data-round="${currentPlayground}" style="cursor:pointer; font-size:10px; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin:12px 0 4px 0; border-bottom:1px dashed rgba(255,255,255,0.1); padding-bottom:4px; letter-spacing: 0.5px; display:flex; align-items:center; user-select:none;">
                <span>${headerText}</span>
                ${statsHtml}
                <span class="round-toggle-icon" style="transition: transform 0.2s; transform: ${isActiveRound ? 'rotate(180deg)' : 'rotate(0deg)'}">▼</span>
              </div>
              <div class="round-content" id="round-content-${currentPlayground}" style="display: ${isActiveRound ? 'block' : 'none'};">`;
          } else {
            localTumbleIdx++;
          }

          const isTumbleActive = tIdx === gameState.currentIndex;
          const goldenPositions = f.features?.golden || [];
          const isWinStep = parseFloat(f.coins || 0) > 0 && isSettleField(f);

          // Calculate effective win & add to accumulated total
          const effectiveWin = getFieldEffectiveWin(f);
          if (isWinStep && effectiveWin > 0) {
            accumulatedWin += effectiveWin;
          }

          const payoutPositions = new Set();
          (f.symbols.payouts || []).forEach((p) => {
            if (Array.isArray(p.positions)) {
              p.positions.forEach((pos) => payoutPositions.add(pos));
            }
          });

          const winningGoldenTallies = new Map();
          const initialSyms = f.symbols.initial || f.symbols.final || [];
          goldenPositions.forEach((pos) => {
            if (payoutPositions.has(pos)) {
              const sid = initialSyms[pos];
              winningGoldenTallies.set(sid, (winningGoldenTallies.get(sid) || 0) + 1);
            }
          });

          const wildId = game.wildSymbolId;
          const winningWildCount = initialSyms.filter(
            (id, pos) => id === wildId && payoutPositions.has(pos),
          ).length;

          let linesHtml = '';

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

          (f.symbols.payouts || []).forEach((p) => {
            const sid =
              p.symbolId !== undefined ? p.symbolId : p.symbol !== undefined ? p.symbol : p.id;
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
                  <span style="color: var(--success); font-weight: 800; font-size: 10px;">+${parseFloat((isSettleField(f) ? parseFloat(p.coins || 0) * (f.features?.cumulativeMultiplier || 1) : parseFloat(p.coins || 0)).toFixed(2))}</span>
                </div>
              </div>
             `;
          });

          return (
            headerHtml +
            `
            <div data-tumble="${tIdx}" class="glass ${isTumbleActive ? 'active-tumble-item' : ''}" style="padding: 8px; border-radius: 8px; background: ${isTumbleActive ? 'rgba(34, 197, 94, 0.12)' : 'transparent'};
                border: 1px solid ${isTumbleActive ? 'rgba(34, 197, 94, 0.4)' : 'transparent'}; cursor: pointer; margin-top: 4px;" aria-pressed="${isTumbleActive}">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center;">
                  <span class="step-label" style="font-weight:${isTumbleActive ? '900' : '700'}; color:${isTumbleActive ? '#fff' : 'var(--text-muted)'}; font-size:10px;">TUMBLE ${localTumbleIdx}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                   <div style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1;">
                       <span style="color:${isWinStep ? 'var(--success)' : 'var(--text-muted)'}; font-size: 10px; font-weight: 800;">+${parseFloat(effectiveWin.toFixed(2))}</span>
                       ${isWinStep ? `<span style="font-size: 8px; color: var(--text-muted); font-weight: 700;">Acc: ${parseFloat(accumulatedWin.toFixed(2))}</span>` : ''}
                   </div>
                   <span style="color: var(--bg-accent); font-size: 11px; font-weight: 800;">${f.features?.cumulativeMultiplier || 1}x</span>
                </div>
              </div>
              ${linesHtml ? `<div style="margin-top:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:4px;">${linesHtml}</div>` : ''}
            </div>`
          );
        })
        .join('');

      const lastStats =
        currentPlayground !== -1 && spin.playgroundStats
          ? spin.playgroundStats[currentPlayground]
          : null;
      const lastSummaryHtml = lastStats ? `...</div>` : ''; // Closes the round div

      let loadMoreHtml = '';
      if (hasMore) {
        loadMoreHtml = `
          <button class="btn-ghost load-more-tumbles-btn" style="width: 100%; margin-top: 8px; padding: 8px; font-size: 10px; border: 1px dashed var(--border-color); color: var(--text-muted);">
              ⚠️ ${spin.fields.length - RENDER_LIMIT} More Tumbles Hidden. Click to load all (May lag UI)
          </button>`;
      }

      const tumblesHtml = tumbles + (fieldsToRender.length > 0 ? (lastStats ? '</div>' : '') : '');

      const auditContainer = document.createElement('div');
      auditContainer.style.marginTop = '10px';
      auditContainer.innerHTML = `
        <div style="font-size:9px; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin-bottom:6px;">Tumble Audit</div>
        ${tumblesHtml}
        ${loadMoreHtml}
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
          auditContainer
            .querySelectorAll('.round-content')
            .forEach((el) => (el.style.display = 'none'));
          auditContainer
            .querySelectorAll('.round-toggle-icon')
            .forEach((el) => (el.style.transform = 'rotate(0deg)'));

          if (!isExpanded) {
            // Expand clicked round
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';

            // Auto-select the first tumble of this round if not already in it
            const firstTumbleIdx = (spin.fieldMetadata || []).findIndex(
              (m) => m.playgroundIndex === roundIdx,
            );
            if (firstTumbleIdx !== -1) {
              const currentMeta = spin.fieldMetadata
                ? spin.fieldMetadata[gameState.currentIndex]
                : null;
              if (!currentMeta || currentMeta.playgroundIndex !== roundIdx) {
                window.selectTumble(firstTumbleIdx);
              }
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
      // Add this new block right at the top of the onclick handler
      const loadMoreBtn = e.target.closest('.load-more-tumbles-btn');
      if (loadMoreBtn) {
        e.stopPropagation();
        spin._showAllTumbles = true; // Flag this specific spin to bypass limits
        renderSpinHistory(true);
        return;
      }
      const bookmarkBtn = e.target.closest('.bookmark-btn-v5');
      if (bookmarkBtn) {
        e.stopPropagation();
        const num = parseInt(bookmarkBtn.dataset.num);
        const newState = !bookmarkBtn.classList.contains('active');
        import('./db.js')
          .then((db) => db.toggleBookmark(num, newState))
          .then(() => {
            const spin = globalHistory.find((s) => s.num === num);
            if (spin) spin.bookmarked = newState;
            renderSpinHistory(true);
          });
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn-v5');
      if (deleteBtn) {
        e.stopPropagation();
        const num = parseInt(deleteBtn.dataset.num);
        if (!confirm(`Are you sure you want to delete spin #${num}?`)) return;

        import('./db.js')
          .then((db) => db.deleteSpin(num))
          .then(() => {
            const idx = globalHistory.findIndex((s) => s.num === num);
            if (idx !== -1) {
              globalHistory.splice(idx, 1);
              if (currentSpinIndex === idx) {
                currentSpinIndex = -1;
              } else if (currentSpinIndex > idx) {
                currentSpinIndex--;
              }
            }
            renderSpinHistory();
          });
        return;
      }

      const descRow = e.target.closest('.card-title-v5');
      if (descRow) {
        e.stopPropagation();
        window.startDescEdit(parseInt(descRow.dataset.descNum), descRow);
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

      stopPlayback();
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
      // Don't intercept if focus is inside a tumble item or text input
      if (document.activeElement.hasAttribute('data-tumble')) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

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

  // Safe Fallback
  const initialArr = field.symbols.initial || field.symbols.final || [];
  const finalArr = field.symbols.final || [];

  const diff = initialArr.map((val, i) => {
    const finalVal = finalArr[i];
    const r = i % game.grid.rows;
    const c = Math.floor(i / game.grid.rows);
    const coord = `(c${c}, r${r})`;
    if (val !== finalVal) return `${val} -> ${finalVal}, ${coord}`;
    return `${val}`;
  });

  // 1. Build tabs dynamically following the strict order
  const tabs = [{ label: `TUMBLE_${tIdx + 1}_FIELD`, data: field }];

  // 2. Insert TESTCONFIG only if cheat is triggered
  if (spin.isCheatTriggered === true) {
    tabs.push({ label: 'TESTCONFIG', data: spin.requestBody?.testConfig || {} });
  }

  // 3. Append the rest in exact order
  tabs.push(
    { label: 'FULL_JSON', data: spin.rawData },
    { label: 'FEATURES', data: field.features || {} },
    { label: 'PAYOUTS', data: field.symbols.payouts || [] },
    { label: 'INIT-FINAL DIFF', data: diff },
    { label: 'INITIAL[]', data: initialArr },
    { label: 'FINAL[]', data: finalArr },
  );

  openRawDrawer(tabs, 0);
  updatePlaybackLabels();
};
// ── Load Spin ────────────────────────────────────────────────────────────────
async function loadSpin(historyIndex) {
  currentSpinIndex = historyIndex;
  localStorage.setItem('last_spin_index', historyIndex);
  const spin = globalHistory[historyIndex];
  if (!spin) return;

  // --- THE FIX: Unzip the massive payload ONCE and store it in RAM ---
  if (spin._isCompressed && spin.rawData instanceof ArrayBuffer) {
    const { decompressData } = await import('./db.js');
    spin.rawData = await decompressData(spin.rawData);
    spin._isCompressed = false;
  }

  gameState.fields = spin.fields;
  gameState.summary = spin.summary;
  gameState.currentIndex = 0;
  gameState.isAnimating = false;

  let acc = 0;
  gameState.accumulatedWins = spin.fields.map((f) => {
    acc += isSettleField(f) ? getFieldEffectiveWin(f) : 0;
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
  const persistentGolden = fields.map((f) => new Set(f.features?.golden || []));
  gameState.goldenCandidates = persistentGolden;

  // Calculate hasGolden for the spin summary
  spin.hasGolden = gameState.goldenCandidates.some((set) => set.size > 0);

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
  setHudValue(totalWinEl, gameState.summary.coins, 1.0); // Uses base size since its parent is tiny font

  const tumbleCountEl = document.getElementById('tumbleCount');
  if (tumbleCountEl) tumbleCountEl.innerText = gameState.fields.length;

  const cascadeCountEl = document.getElementById('cascadeCountTop');
  if (cascadeCountEl) {
    cascadeCountEl.innerText = gameState.fields.filter(
      (f) => parseFloat(f.coins || 0) > 0 && isSettleField(f),
    ).length;
  }
}

// ── Show Tumble ──────────────────────────────────────────────────────────────
function showTumble(index, phase) {
  gameState.currentIndex = index;
  const resolvedPhase = showDoubleGrid
    ? 'final'
    : (phase ?? (singleViewMode === 'initial' ? 'initial' : 'final'));
  gameState.currentFramePhase = resolvedPhase;

  const field = gameState.fields[index];
  if (!field) return;

  // NEW: Smart Runtime Grid Deduction for Sandbox & Custom Games
  if ((game.id === 'sandbox' || game.id.startsWith('custom-sandbox')) && field.symbols) {
    const syms = field.symbols.final || field.symbols.initial || [];
    const len = syms.length;
    if (len > 0) {
      const definedCols = game.grid.cols;
      const definedRows = game.grid.rows;

      if (definedCols && !definedRows) {
        // Only cols defined (e.g. MrBooms)
        game.grid.rows = Math.ceil(len / definedCols);
      } else if (definedRows && !definedCols) {
        // Only rows defined
        game.grid.cols = Math.ceil(len / definedRows);
      } else if (!definedRows && !definedCols) {
        // Neither defined
        game.grid.cols = Math.min(len, 5); // Fallback to max 5 columns
        game.grid.rows = Math.ceil(len / game.grid.cols);
      } else if (definedRows * definedCols !== len) {
        // Both defined but don't match the payload length (override rows to fit)
        game.grid.rows = Math.ceil(len / definedCols);
      }
    }
  }

  // Instead of fully destroying and recreating the list when only the active tumble changes,
  // we can just cleanly update the active styles if the card is already expanded!
  const updateAuditListStyles = () => {
    // 1. Instantly turn off the old active tumble (O(1) lookup)
    const prevActive = spinHistoryEl.querySelector('.active-tumble-item');
    if (prevActive) {
      prevActive.style.background = 'transparent';
      prevActive.style.border = '1px solid transparent';
      prevActive.setAttribute('aria-pressed', 'false');
      prevActive.classList.remove('active-tumble-item');
      const sl = prevActive.querySelector('.step-label');
      if (sl) {
        sl.style.color = 'var(--text-muted)';
        sl.style.fontWeight = '700';
      }
    }

    // 2. Turn on the new active tumble
    const newActive = spinHistoryEl.querySelector(`[data-tumble="${index}"]`);
    if (newActive) {
      newActive.style.background = 'rgba(34, 197, 94, 0.12)';
      newActive.style.border = '1px solid rgba(34, 197, 94, 0.4)';
      newActive.setAttribute('aria-pressed', 'true');
      newActive.classList.add('active-tumble-item');
      const sl = newActive.querySelector('.step-label');
      if (sl) {
        sl.style.color = '#fff';
        sl.style.fontWeight = '900';
      }

      // Auto-expand round if hidden
      const roundContent = newActive.closest('.round-content');
      if (roundContent && roundContent.style.display === 'none') {
        const roundIdx = roundContent.id.replace('round-content-', '');
        const header = spinHistoryEl.querySelector(`.round-header[data-round="${roundIdx}"]`);
        if (header) {
          spinHistoryEl
            .querySelectorAll('.round-content')
            .forEach((el) => (el.style.display = 'none'));
          spinHistoryEl
            .querySelectorAll('.round-toggle-icon')
            .forEach((el) => (el.style.transform = 'rotate(0deg)'));
          roundContent.style.display = 'block';
          const icon = header.querySelector('.round-toggle-icon');
          if (icon) icon.style.transform = 'rotate(180deg)';
        }
      }

      newActive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      // If it's not in the DOM yet, wait 50ms and try again
      setTimeout(() => {
        const fallback = spinHistoryEl.querySelector(`[data-tumble="${index}"]`);
        if (fallback && !fallback.classList.contains('active-tumble-item')) {
          updateAuditListStyles();
        }
      }, 50);
    }
  };

  updateAuditListStyles();

  const isInitialPhase = resolvedPhase === 'initial';
  const prevAccWin = index > 0 ? gameState.accumulatedWins[index - 1] : 0;

  const displayCoins = isInitialPhase || !isSettleField(field) ? 0 : getFieldEffectiveWin(field);
  const displayAccWin =
    isInitialPhase || !isSettleField(field) ? prevAccWin : gameState.accumulatedWins[index];

  setHudValue(multDisplay, (field.features?.cumulativeMultiplier || 1) + 'x');
  setHudValue(currentTumbleWinEl, displayCoins);
  setHudValue(accWinDisplayEl, displayAccWin);

  // Update navigation context header
  const totalTumbles = gameState.fields.length;
  const tumbleNavLabel = document.getElementById('tumbleNavLabel');
  const cascadeNavLabel = document.getElementById('cascadeNavLabel');

  const spin = globalHistory[currentSpinIndex];
  const meta = spin && spin.fieldMetadata ? spin.fieldMetadata[index] : null;

  if (tumbleNavLabel) {
    if (meta && meta.playgroundIndex !== undefined) {
      // Find local index
      const localIdx = spin.fieldMetadata
        .slice(0, index + 1)
        .filter((m) => m.playgroundIndex === meta.playgroundIndex).length;
      const stats = spin.playgroundStats ? spin.playgroundStats[meta.playgroundIndex] : null;
      const totalLocal = stats ? stats.tumbleCount : '?';
      tumbleNavLabel.innerText = `TUMBLE ${localIdx} / ${totalLocal}`;
    } else {
      tumbleNavLabel.innerText = `TUMBLE ${index + 1} / ${totalTumbles}`;
    }
  }
  if (cascadeNavLabel) {
    const payingBefore = gameState.fields
      .slice(0, index)
      .filter((f) => parseInt(f.coins || 0) > 0 && isSettleField(f)).length;
    const cascadeNum = payingBefore + 1;
    const isPayingTumble = parseInt(field.coins || 0) > 0 && isSettleField(field);
    cascadeNavLabel.innerText = isPayingTumble
      ? `· CASCADE ${cascadeNum} ↓`
      : `· CASCADE ${cascadeNum}`;
    cascadeNavLabel.style.display = 'inline';
    cascadeNavLabel.style.opacity = isPayingTumble ? '1' : '0.45';

    const phaseStatusText = document.getElementById('phaseStatusText');
    if (phaseStatusText) {
      const isLastTumble = index === totalTumbles - 1;

      if (isInitialPhase) {
        phaseStatusText.innerText = 'GROW';
        phaseStatusText.style.color = 'var(--bg-accent)';
      } else if (isLastTumble) {
        phaseStatusText.innerText = 'END';
        phaseStatusText.style.color = 'var(--text-muted)';
      } else {
        phaseStatusText.innerText = isPayingTumble ? 'POP' : 'GROW';
        phaseStatusText.style.color = isPayingTumble ? '#10b981' : 'var(--bg-accent)';
      }
    }
  }

  const wrapper = document.getElementById('grid-main-wrapper');
  const initialContainer = document.getElementById('grid-container-initial');
  const finalLabel = document.getElementById('grid-final-label');
  const hasChanges =
    field.symbols.initial &&
    field.symbols.final &&
    !field.symbols.initial.every((v, i) => v === field.symbols.final[i]);

  // Golden set logic:
  // - Initial phase: goldenCandidates[N] = symbols golden at the START of tumble N (from prior tumbles)
  // - Final phase:   goldenCandidates[N+1] = golden state AFTER tumble N's transformation
  //                  (winning golden positions turned into wilds, so they're no longer golden)
  const goldenInitial = gameState.goldenCandidates[index] || new Set();
  const goldenFinal = gameState.goldenCandidates[index + 1] || new Set();

  // Grow phase cluster payout overlay
  const growOverlay = document.getElementById('growPayoutOverlay');
  if (growOverlay) {
    const payouts = field.symbols?.payouts || [];
    const isGrow = !isInitialPhase && !isSettleField(field) && payouts.length > 0;
    growOverlay.style.display = isGrow ? 'block' : 'none';
    growOverlay.textContent = '';
    if (isGrow) {
      // Grow-phase payouts have coins=0; look ahead to the next settle field for actual coins
      const nextField = gameState.fields[index + 1];
      const settlePayouts =
        nextField && isSettleField(nextField) ? nextField.symbols?.payouts || [] : [];
      payouts.forEach((p) => {
        const sid =
          p.symbolId !== undefined ? p.symbolId : p.symbol !== undefined ? p.symbol : p.id;
        const name = SYMBOLS[sid] || String(sid);
        const emoji = EMOJIS[sid] || '';
        const count = p.oak || p.count || 0;
        const settleP = settlePayouts.find((sp) => {
          const spid =
            sp.symbolId !== undefined ? sp.symbolId : sp.symbol !== undefined ? sp.symbol : sp.id;
          return spid === sid;
        });
        const rawWin = parseFloat((settleP || p).coins || 0);
        const row = document.createElement('div');
        row.style.cssText =
          'display:flex; justify-content:space-between; align-items:center; gap:12px;';
        const leftSpan = document.createElement('span');
        leftSpan.style.cssText = 'display:flex; align-items:center; gap:4px; white-space:nowrap;';
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        const nameB = document.createElement('b');
        nameB.textContent = name;
        leftSpan.append(emojiSpan, nameB);
        const rightSpan = document.createElement('span');
        rightSpan.style.cssText = 'white-space:nowrap; text-align:right;';
        const countSpan = document.createElement('span');
        countSpan.style.color = '#aaa';
        countSpan.textContent = '×' + count + ' → ';
        const winSpan = document.createElement('span');
        winSpan.style.color = '#4ade80';
        winSpan.textContent = rawWin;
        rightSpan.append(countSpan, winSpan);
        row.append(leftSpan, rightSpan);
        growOverlay.appendChild(row);
      });
    }
  }

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
    if (showDoubleGrid && initialContainer && gridInitialEl) {
      initialContainer.style.display = 'flex';
      renderGrid(
        field.symbols.initial || field.symbols.final || [],
        field.symbols.payouts,
        goldenInitial,
        'grid-initial',
      );
    }

    // --- Final panel: show symbols.final, NO win lines, golden AFTER transformation ---
    renderGrid(field.symbols.final || [], [], goldenFinal, 'grid');
  } else {
    wrapper?.classList.remove('double-view');
    if (initialContainer) initialContainer.style.display = 'none';
    if (finalLabel) finalLabel.style.display = 'none';

    if (resolvedPhase === 'initial') {
      // Initial: show initial symbols WITH payouts (win lines) and golden from this tumble start
      renderGrid(
        field.symbols.initial || field.symbols.final || [],
        field.symbols.payouts,
        goldenInitial,
        'grid',
      );
    } else {
      // Final: show final symbols, NO payouts (removed), golden AFTER transformation
      renderGrid(field.symbols.final || [], [], goldenFinal);
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
        `Row ${r + 1} Column ${c + 1} ${isEmpty ? 'Empty' : SYMBOLS && SYMBOLS[id] ? SYMBOLS[id] : id}${isWin ? ' Winning' : ''}${isGolden ? ' Golden' : ''}`,
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
          ${EMOJIS && EMOJIS[id] ? EMOJIS[id] : isEmpty ? '' : id}
        </div>
        ${!isEmpty ? `<div style="font-size: 8px; color: ${isGolden ? '#fbbf24' : SYMBOL_COLORS && SYMBOL_COLORS[id] ? SYMBOL_COLORS[id] : '#666'}; font-weight: 800; margin-top: 4px; letter-spacing:0.5px; opacity:0.6;">${SYMBOLS && SYMBOLS[id] !== undefined ? SYMBOLS[id] : id}</div>` : ''}
      `;

      cell.onmouseover = () => {
        const insp = document.getElementById('inspector');
        if (insp) {
          insp.style.display = 'block';
          const emojiStr = EMOJIS && EMOJIS[id] ? EMOJIS[id] + ' ' : '';
          const nameStr = SYMBOLS && SYMBOLS[id] !== undefined ? SYMBOLS[id] : id;
          document.getElementById('inspSymbol').innerText = isEmpty
            ? 'EMPTY'
            : `${emojiStr}${nameStr} (${id})`;
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
      setHudValue(multDisplay, (nextField.features?.cumulativeMultiplier || 1) + 'x');
      setHudValue(currentTumbleWinEl, nextField.coins);
      setHudValue(accWinDisplayEl, gameState.accumulatedWins[index + 1]);
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
      desc: entry.description || null,
      hg: entry.hasGolden || false,
      hbs: entry.hasBaseSpin || false,
      hfs: entry.hasFreeSpin || false,
    })),
  };
}

// --- SSD Direct Streaming Exporter ---
async function exportDataDirectFromDb(defaultFileName, exportMode, isMapped = false) {
  showLoading(`Preparing Export...`, 0);
  try {
    const { decompressData, iterateDb } = await import('./db.js');
    let processedCount = 0;

    let header, footer;
    if (isMapped) {
      header = '[';
      footer = ']';
    } else {
      const settingsExport = {
        playMode: localStorage.getItem('play_mode') || 'single',
        playCount: localStorage.getItem('play_count') || '10',
        requestBody: localStorage.getItem('request_body') || '',
        activeGame: game.id,
        uiSpinType: document.getElementById('uiSpinType')?.value || 'base',
        uiStake: document.getElementById('uiStake')?.value || 'commonGame',
      };
      const v2Format = {
        v: 2,
        f: activeFilters, // <--- FIX: ALWAYS export filters to preserve UI state!
        o: localStorage.getItem('sort_field') || 'num_desc',
        s: settingsExport,
        h: [],
      };
      header = JSON.stringify(v2Format).split('"h":[]')[0] + '"h":[';
      footer = ']}';
    }

    let writable = null;
    let blobParts = [];
    // Use modern FileSystem API if available (streams direct to disk)
    let useFileSystem = !!window.showSaveFilePicker;

    try {
      if (useFileSystem) {
        const handle = await window.showSaveFilePicker({ suggestedName: defaultFileName });
        writable = await handle.createWritable();
        await writable.write(header);
      } else {
        blobParts.push(header); // Fallback for Firefox/Safari
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        hideLoading();
        return;
      } // User cancelled save dialog
      useFileSystem = false;
      blobParts.push(header);
    }

    let hasData = false;

    // Scan the DB using the new isolated iterateDb logic
    await iterateDb(exportMode, activeFilters, game, async (chunkData) => {
      processedCount += chunkData.length;
      showLoading(`Exporting ${processedCount} records...`, 50);

      const decompressedSlice = await Promise.all(
        chunkData.map(async (spin) => {
          if (spin._isCompressed && spin.rawData instanceof ArrayBuffer) {
            return { ...spin, rawData: await decompressData(spin.rawData), _isCompressed: false };
          }
          return spin;
        }),
      );

      let chunkStr = '';
      if (isMapped) {
        const mapped = decompressedSlice.map((s) => ({
          request: s.requestBody || {},
          response: s.rawData || {},
        }));
        chunkStr = JSON.stringify(mapped).slice(1, -1);
      } else {
        const optChunk = getOptimizedData(decompressedSlice);
        chunkStr = JSON.stringify(optChunk.h).slice(1, -1);
      }

      if (chunkStr.length > 0) {
        if (hasData) {
          if (useFileSystem) await writable.write(',');
          else blobParts.push(',');
        }
        if (useFileSystem) await writable.write(chunkStr);
        else blobParts.push(chunkStr);
        hasData = true;
      }
    });

    if (useFileSystem) {
      await writable.write(footer);
      await writable.close();
    } else {
      blobParts.push(footer);
      const blob = new Blob(blobParts, { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFileName;
      a.click();
      URL.revokeObjectURL(url);
    }

    showLoading('Export Complete! ✅', 100);
    setTimeout(hideLoading, 1500);
  } catch (e) {
    console.error('Export failed', e);
    alert('Export failed: ' + e.message);
    hideLoading();
  }
}

// Bind all 4 buttons to the unified DB Exporter
exportFilteredBtn.onclick = () =>
  exportDataDirectFromDb(
    `slot-filtered-${game.id}-${new Date().toISOString().slice(0, 10)}.json`,
    'filtered',
    false,
  );
exportAllBtn.onclick = () =>
  exportDataDirectFromDb(
    `slot-all-${game.id}-${new Date().toISOString().slice(0, 10)}.json`,
    'all',
    false,
  );
exportMappedFilteredBtn.onclick = () =>
  exportDataDirectFromDb(
    `mapped-filtered-${game.id}-${new Date().toISOString().slice(0, 10)}.json`,
    'filtered',
    true,
  );
exportMappedAllBtn.onclick = () =>
  exportDataDirectFromDb(
    `mapped-all-${game.id}-${new Date().toISOString().slice(0, 10)}.json`,
    'all',
    true,
  );

// ── Import Handler ───────────────────────────────────────────────────────────
if (importMenuBtn) {
  importMenuBtn.onclick = (e) => {
    e.stopPropagation();
    const isVisible = importDropdown.style.display === 'block';
    importDropdown.style.display = isVisible ? 'none' : 'block';
  };
}

// --- UNIFIED IMPORT RESTORER ---
function restoreSettingsFromImport(settings, filters) {
  // 1. Restore Filters (Mutate array to preserve global references for the UI!)
  if (Array.isArray(filters)) {
    activeFilters.splice(0, activeFilters.length, ...filters);
    localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    if (window._renderFilterChips) window._renderFilterChips();
  }

  if (!settings) return;

  // 2. Restore Game Environment (Without triggering duplicate DB searches)
  const importGameId = settings.activeGame || localStorage.getItem('active_game_id');
  if (importGameId) {
    const gameSelect = document.getElementById('gameSelect');
    if (gameSelect && gameSelect.value !== importGameId) {
      gameSelect.value = importGameId;
      setActiveGame(importGameId);
      game = getActiveGame();
      SYMBOLS = game.symbols;
      EMOJIS = game.emojis;
      SYMBOL_COLORS = game.colors;
      const gameLabel = document.getElementById('gameLabel');
      if (gameLabel) gameLabel.innerText = game.name;
    }
  }

  // 3. Restore Request Body JSON
  if (settings.requestBody) {
    localStorage.setItem('request_body', settings.requestBody);
    const reqText = document.getElementById('requestBody');
    if (reqText) reqText.value = settings.requestBody;
  }

  // Sync internal state to UI listeners
  if (typeof syncSpinSettingsUI === 'function') syncSpinSettingsUI();

  // 4. Force Dropdowns to match exported settings and trigger change events
  if (settings.uiSpinType) {
    const el = document.getElementById('uiSpinType');
    if (el) {
      el.value = settings.uiSpinType;
      el.dispatchEvent(new Event('change'));
    }
  }
  if (settings.uiStake) {
    const el = document.getElementById('uiStake');
    if (el) {
      el.value = settings.uiStake;
      el.dispatchEvent(new Event('change'));
    }
  }

  // 5. Restore Play Mode
  if (settings.playMode) {
    localStorage.setItem('play_mode', settings.playMode);
    const pm = document.getElementById('playMode');
    if (pm) {
      pm.value = settings.playMode;
      pm.dispatchEvent(new Event('change'));
    }
  }
  if (settings.playCount) {
    localStorage.setItem('play_count', settings.playCount);
    const pc = document.getElementById('playCount');
    if (pc) pc.value = settings.playCount;
  }
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
          // --- THE FIX: Use unified restorer ---
          restoreSettingsFromImport(rawImport.s, rawImport.f);
          if (rawImport.o) {
            const sortField = document.getElementById('sortField');
            if (sortField) {
              sortField.value = rawImport.o;
              localStorage.setItem('sort_field', rawImport.o);
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
        showLoading(
          `Processing ${Math.min(i + chunkSize, importedRaw.length)} / ${importedRaw.length}...`,
          percent,
        );
        const chunk = importedRaw.slice(i, i + chunkSize);
        const processed = chunk
          .map((item) => {
            const r = item.response || item.rawData || item.r || item;
            if (!r || !r.step) return null;

            const fields = [];
            const fieldMetadata = [];
            const playgroundStats = [];
            let spinType = 'basic';
            let playgroundCounter = 0;

            (r.step?.gamePhases || []).forEach((phase) => {
              if (phase.type === 'freeSpin') spinType = 'freeSpin';
              let roundCounter = 0;
              (phase.playgrounds || []).forEach((pg) => {
                let pgTumbles = 0;
                let pgCascades = 0;
                (pg.fields || []).forEach((f) => {
                  fields.push(f);
                  fieldMetadata.push({
                    playgroundIndex: playgroundCounter,
                    isFreeSpin: phase.type === 'freeSpin',
                    roundIndex: roundCounter,
                  });
                  pgTumbles++;
                  if (parseFloat(f.coins || 0) > 0) pgCascades++;
                });
                playgroundStats.push({
                  tumbleCount: pgTumbles,
                  cascadeCount: pgCascades,
                  headerText:
                    phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
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
                isCheatTriggered: r.meta?.private?.isCheatTriggered === true,
                fields,
                summary,
                isWin: item.isWin !== undefined ? item.isWin : parseInt(summary.coins || 0) > 0,
                totalWin: item.totalWin !== undefined ? item.totalWin : summary.coins || 0,
                tumbleCount: fields.length,
                cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
                betAmount: metaPublic.betAmount || 0,
                spinMode: metaPublic.spinMode || 'std',
                spinType,
                playgroundCount: playgroundCounter,
                roundTags: r.roundTags || r.step?.roundTags || [],
                choices: r.choices || r.step?.choices || [],
                hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
                goldenTransformed: stats.goldenTransformed,
                maxMultiplier: stats.maxMultiplier,
                fieldMetadata,
                playgroundStats,
                bookmarked: item.b || item.bookmarked || false,
                description: item.desc || item.description || null,
                hasGolden: item.hg || item.hasGolden || false,
                hasBaseSpin: item.hbs || item.hasBaseSpin || false,
                hasFreeSpin: item.hfs || item.hasFreeSpin || false,
              },
            };
          })
          .filter(Boolean);
        restored.push(...processed);
        await new Promise((r) => setTimeout(r, 0));
      }

      showLoading('Saving... (Finalizing)', 100);
      let finalEntries = [];
      let skippedCount = 0;

      if (mode === 'replace') {
        await clearAllSpins();
        finalEntries = restored.map((r, i) => ({ ...r.data, num: i + 1 }));
      } else {
        const existingFingers = new Set(
          globalHistory.map((s) => `${s.timestamp}_${s.summary.coins}_${s.fields.length}`),
        );
        const filtered = restored.filter((r) => {
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
      }

      // Force the DB search to update memory using the newly imported filters
      await triggerFilterUpdate();

      if (globalHistory.length > 0 && currentSpinIndex === -1) {
        loadSpin(globalHistory[0].num);
      }
      hideLoading();

      const msg =
        mode === 'replace'
          ? `Replaced session with ${finalEntries.length} spins.`
          : `Merged ${finalEntries.length} new spins${skippedCount > 0 ? ` (skipped ${skippedCount} duplicates)` : ''}.`;
      alert(msg);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  input.click();
};

if (importMergeBtn)
  importMergeBtn.onclick = () => {
    importDropdown.style.display = 'none';
    triggerImport('merge');
  };
if (importReplaceBtn)
  importReplaceBtn.onclick = () => {
    importDropdown.style.display = 'none';
    triggerImport('replace');
  };

// ── Prev / Next / openSpinRaw ────────────────────────────────────────────────
document.getElementById('tumbleList')?.remove();

window.openSpinRaw = async (historyIndex) => {
  const spin = globalHistory[historyIndex];
  if (!spin) return;

  // Decompress rawData if it was gzipped
  let displayRawData = spin.rawData;
  if (spin._isCompressed && displayRawData instanceof ArrayBuffer) {
    const { decompressData } = await import('./db.js');
    displayRawData = await decompressData(displayRawData);
  }

  openRawDrawer(
    [
      { label: 'FULL_RESPONSE', data: displayRawData },
      { label: 'SUMMARY', data: spin.summary },
      { label: 'TESTCONFIG', data: spin.requestBody?.testConfig || {} },
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

  const meta = spin.fieldMetadata ? spin.fieldMetadata[gameState.currentIndex] : null;
  const currentRound = meta ? meta.playgroundIndex : 0;
  const playgroundCount = spin.playgroundStats ? spin.playgroundStats.length : 1;

  let targetRound = currentRound + direction;
  if (targetRound < 0) targetRound = 0;
  if (targetRound >= playgroundCount) targetRound = playgroundCount - 1;

  if (targetRound !== currentRound) {
    const firstTumbleIdx = (spin.fieldMetadata || []).findIndex(
      (m) => m.playgroundIndex === targetRound,
    );
    if (firstTumbleIdx !== -1) {
      window.selectTumble(firstTumbleIdx);
    }
  }
}

function navigateSpinCard(direction) {
  const cards = Array.from(document.querySelectorAll('.spin-history-card'));
  if (cards.length === 0) return;
  const activeIdx = cards.findIndex((c) => c.classList.contains('active'));

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
      setHudValue(totalWinEl, '0', 1.0);
      setHudValue(multDisplay, '1x');
      document.getElementById('cascadeCount').innerText = '0';
      document.getElementById('tumbleCount').innerText = '0';
      setHudValue(currentTumbleWinEl, '0');
      setHudValue(accWinDisplayEl, '0');
    }
  }
});

// ── Clear History ────────────────────────────────────────────────────────────
const clearMenuBtn = document.getElementById('clearMenuBtn');
const clearDropdown = document.getElementById('clearDropdown');
const clearAllBtnUI = document.getElementById('clearAllBtn');
const clearFilteredBtnUI = document.getElementById('clearFilteredBtn');
const clearCurrentGameBtnUI = document.getElementById('clearCurrentGameBtn');

// New logic to clear only the active game (e.g. only Sexy Fruits)
if (clearCurrentGameBtnUI) {
  clearCurrentGameBtnUI.onclick = async () => {
    if (!confirm(`Delete ALL spin history for ${game.name}?`)) return;

    showLoading(`Clearing ${game.name}...`, 50);
    try {
      const { deleteSpinsBatch } = await import('./db.js');
      // Find all spin numbers that belong to the active game
      const numsToDelete = globalHistory.filter((s) => s.gameId === game.id).map((s) => s.num);

      await deleteSpinsBatch(numsToDelete);

      // Remove them from RAM
      globalHistory = globalHistory.filter((s) => s.gameId !== game.id);
      currentSpinIndex = -1;

      renderSpinHistory(true);
      const totalCells = game.grid.rows * game.grid.cols;
      renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
      await updateStorageStats();
    } catch (err) {
      console.error(err);
      alert('Failed to clear current game history: ' + err.message);
    } finally {
      hideLoading();
      clearDropdown.style.display = 'none'; // Close menu
    }
  };
}

if (clearMenuBtn) {
  clearMenuBtn.onclick = (e) => {
    e.stopPropagation();
    const isVisible = clearDropdown.style.display === 'block';
    clearDropdown.style.display = isVisible ? 'none' : 'block';
  };
  document.addEventListener('click', () => {
    if (clearDropdown) clearDropdown.style.display = 'none';
  });
}

if (clearAllBtnUI) {
  clearAllBtnUI.onclick = async () => {
    if (!confirm('Delete ALL spin history? This cannot be undone.')) return;

    showLoading('Nuking entire database...', 50);
    try {
      const { clearAllSpins } = await import('./db.js');
      await clearAllSpins();
      globalHistory = [];
      currentSpinIndex = -1;

      renderSpinHistory();
      const totalCells = game.grid.rows * game.grid.cols;
      renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());

      await updateStorageStats();
    } catch (err) {
      console.error(err);
      alert('Failed to clear history: ' + err.message);
    } finally {
      hideLoading();
    }
  };
}

if (clearFilteredBtnUI) {
  clearFilteredBtnUI.onclick = async () => {
    // 1. Get the items currently visible in the UI
    const filtered = applyFilters(globalHistory, activeFilters, game);

    if (filtered.length === 0) {
      alert('No filtered results to clear.');
      return;
    }

    if (!confirm(`Delete ${filtered.length} filtered spins? This cannot be undone.`)) return;

    showLoading(`Deleting ${filtered.length} spins...`, 50);
    try {
      const { deleteSpinsBatch } = await import('./db.js');
      const numsToDelete = filtered.map((s) => s.num);

      // 2. Erase them from the IndexedDB hard drive
      await deleteSpinsBatch(numsToDelete);

      // 3. Purge them from the RAM array
      const numsSet = new Set(numsToDelete);
      globalHistory = globalHistory.filter((s) => !numsSet.has(s.num));

      // 4. Safely deselect if the current spin was part of the purge
      if (currentSpinIndex !== -1) {
        const currentSpin = globalHistory.find((s) => s.num === currentSpinIndex);
        if (!currentSpin || numsSet.has(currentSpinIndex)) {
          currentSpinIndex = -1;
        }
      }

      renderSpinHistory(true);

      // If we wiped everything we were looking at, clear the center grid
      if (currentSpinIndex === -1) {
        const totalCells = game.grid.rows * game.grid.cols;
        renderGrid(new Array(totalCells).fill(game.emptySymbolId), [], new Set());
      }

      await updateStorageStats();
    } catch (err) {
      console.error(err);
      alert('Failed to clear filtered history: ' + err.message);
    } finally {
      hideLoading();
    }
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
    const resp = await fetch('/json_files/default_data.json');
    if (!resp.ok) {
      console.warn('Default data not found.');
      hideLoading();
      return;
    }

    const firstData = await resp.json();
    const allHistory = firstData.h || [];

    if (firstData.f && (activeFilters.length === 0 || manual)) {
      activeFilters = firstData.f;
      localStorage.setItem('active_filters', JSON.stringify(activeFilters));
    }
    if (firstData.o) {
      localStorage.setItem('sort_field', firstData.o);
    }

    if (allHistory.length > 0) {
      showLoading(`Importing ${allHistory.length} spins...`, 80);
      console.log(`Transforming ${allHistory.length} spins for IndexedDB...`);
      const mapped = allHistory
        .map((entry, idx) => {
          const r = entry.rawData || entry.r || entry;
          if (!r || !r.step) return null;

          let spinType = 'basic';
          const fields = [];
          const fieldMetadata = [];
          const playgroundStats = [];
          let playgroundCounter = 0;

          (r.step.gamePhases || []).forEach((phase) => {
            if (phase.type === 'freeSpin') spinType = 'freeSpin';
            let roundCounter = 0;
            (phase.playgrounds || []).forEach((pg) => {
              let pgTumbles = 0;
              let pgCascades = 0;
              (pg.fields || []).forEach((f) => {
                fields.push(f);
                fieldMetadata.push({
                  playgroundIndex: playgroundCounter,
                  isFreeSpin: phase.type === 'freeSpin',
                  roundIndex: roundCounter,
                });
                pgTumbles++;
                if (parseInt(f.coins || 0) > 0) pgCascades++;
              });
              playgroundStats.push({
                tumbleCount: pgTumbles,
                cascadeCount: pgCascades,
                headerText:
                  phase.type === 'freeSpin' ? `FreeSpin #${roundCounter + 1}` : 'BaseSpin',
              });
              playgroundCounter++;
              roundCounter++;
            });
          });

          const summary = r.step.summary;
          const metaPublic = r.meta?.public || r.step?.meta?.public || {};
          const stats = getSpinStats(fields, game.wildSymbolId);

          return {
            num: entry.num || entry.n || idx + 1,
            timestamp: entry.timestamp || entry.t || new Date().toISOString(),
            gameId: entry.gameId || entry.g || game.id,
            rawData: r,
            isCheatTriggered: r.meta?.private?.isCheatTriggered === true,
            fields,
            summary,
            isWin: parseInt(summary.coins || 0) > 0,
            totalWin: summary.coins || 0,
            tumbleCount: fields.length,
            cascadeCount: fields.filter((f) => parseInt(f.coins || 0) > 0).length,
            betAmount: metaPublic.betAmount || 0,
            spinMode: metaPublic.spinMode || 'std',
            spinType,
            playgroundCount: playgroundCounter,
            roundTags: r.roundTags || r.step?.roundTags || [],
            choices: r.choices || r.step?.choices || [],
            bookmarked: entry.b || entry.bookmarked || false,
            description: entry.desc || entry.description || null,
            hasGolden: entry.hg || entry.hasGolden || false,
            hasBaseSpin: entry.hbs || entry.hasBaseSpin || false,
            hasFreeSpin: entry.hfs || entry.hasFreeSpin || false,
            hasMaxWin: !!(summary.hasMaxWin || r.hasMaxWin),
            goldenTransformed: stats.goldenTransformed,
            maxMultiplier: stats.maxMultiplier,
            fieldMetadata,
            playgroundStats,
          };
        })
        .filter(Boolean);

      await saveAllSpins(mapped);
      console.log('Import complete.');
    }

    // --- THE FIX: Smart Fallback & Race-Condition Prevention ---
    const storedGame = localStorage.getItem('active_game_id');
    const defaultGameId =
      firstData.s?.activeGame ||
      storedGame ||
      (allHistory[0] && (allHistory[0].gameId || allHistory[0].g));

    // Consolidate settings object
    const s = firstData.s || {};
    if (!s.activeGame) s.activeGame = defaultGameId;

    // Use the unified function to restore EVERYTHING including Dropdowns and Filters
    restoreSettingsFromImport(s, firstData.f);

    if (firstData.o) {
      localStorage.setItem('sort_field', firstData.o);
    }

    localStorage.setItem('default_data_loaded', 'true');
    showLoading('Default history loaded!', 100);

    setTimeout(() => {
      hideLoading();
      // If the user manually triggered "Clear All Data" or "Import", reload to sync cleanly.
      // If this was an automatic boot, just let boot() finish its job.
      if (manual) {
        location.reload();
      }
    }, 800);
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
    const isAtEnd =
      gameState.currentIndex >= (gameState.fields?.length || 0) - 1 &&
      gameState.currentFramePhase === 'final';
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
    (spin) => globalHistory.indexOf(spin) === currentSpinIndex,
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
if (prevRoundBtn) prevRoundBtn.onclick = () => navigateRound(-1);
if (nextRoundBtn) nextRoundBtn.onclick = () => navigateRound(1);
if (prevBtn) prevBtn.onclick = () => navigateSpinFiltered(-1);
if (nextBtn) nextBtn.onclick = () => navigateSpinFiltered(1);
if (playbackReplayBtn) playbackReplayBtn.onclick = replaySpin;
if (playbackAutoBtn) playbackAutoBtn.onclick = toggleAutoReplay;
if (playbackSpeedSlider) playbackSpeedSlider.oninput = handleSpeedChange;

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  await migrateFromLocalStorage();
  await loadDefaultData();
  globalHistory = await loadAllSpins(game.id, MAX_RAM_HISTORY);
  console.log(`Boot: Loaded ${globalHistory.length} total spins from IndexedDB.`);

  renderWinCategoryCheckboxes(); // <--- ADD THIS LINE
  updateStorageStats(); // <--- ADD THIS LINE

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

async function updateStorageStats() {
  try {
    const { getStorageEstimate, getSpinCount } = await import('./db.js');
    const count = await getSpinCount();
    const est = await getStorageEstimate();
    const el = document.getElementById('dbStorageStats');
    if (el && est) {
      el.innerText = `DB: ${count.toLocaleString()} records | Disk: ${est.usageMb}MB used / ${est.quotaMb}MB limit (${est.percent}%)`;
    }
  } catch (e) {}
}

function toggleAutoplayOnSelect() {
  isAutoplayOnSelect = !isAutoplayOnSelect;
  localStorage.setItem('autoplay_on_select', isAutoplayOnSelect);
  if (playbackAutoplayBtn) {
    playbackAutoplayBtn.classList.toggle('active-pulse', isAutoplayOnSelect);
  }
}

// Add this global helper
function showErrorToast(msg) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'error-toast update-toast'; // Reusing your existing toast animation
  toast.style.borderColor = 'var(--error)';
  toast.style.background = 'rgba(244, 63, 94, 0.15)';
  toast.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:4px;">
      <div style="font-size:12px; font-weight:900; color:var(--error); text-transform:uppercase;">🚨 Request Failed</div>
      <div style="font-size:11px; color:#fff; font-family:monospace;">${msg}</div>
    </div>
    <button onclick="this.parentElement.remove()" style="background:transparent; color:#fff; border:none; font-size:16px; cursor:pointer;">&times;</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 8000);
}

// Initialize Header Selectors
const headerGameSelect = document.getElementById('headerGameSelect');
const headerEnvSelect = document.getElementById('headerEnvSelect');

if (headerGameSelect) {
  listGames().forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (g.id === game.id) opt.selected = true;
    headerGameSelect.appendChild(opt);
  });

  headerGameSelect.onchange = () => {
    switchGame(headerGameSelect.value);
    localStorage.removeItem('request_body');
    requestBodyTextarea.value = JSON.stringify(game.defaultRequestBody, null, 2);
  };
}

if (headerEnvSelect) {
  // 1. Restore from local storage on load
  const savedEnv = localStorage.getItem('api_url');
  if (savedEnv) {
    headerEnvSelect.value = savedEnv;
    API_URL = savedEnv;
  } else {
    headerEnvSelect.value = API_URL;
  }

  // 2. Save choice on change
  headerEnvSelect.onchange = () => {
    API_URL = headerEnvSelect.value;
    localStorage.setItem('api_url', API_URL);
    checkBackendHealth(API_URL, 'current');
  };
}

// Auto-Save inside the Settings Modal (Instant trigger on 'input')
document.querySelectorAll('#settingsModal input, #settingsModal textarea').forEach((el) => {
  el.addEventListener('input', () => {
    const playerIdInput = document.getElementById('playerIdInput');
    if (playerIdInput && el.id === 'playerIdInput') {
      PLAYER_ID = playerIdInput.value || 'cascading-game-tester';
      localStorage.setItem('player_id', PLAYER_ID);
    }
    if (requestBodyTextarea && el.id === 'requestBody') {
      localStorage.setItem('request_body', requestBodyTextarea.value);
    }
  });
});

if (playbackAutoplayBtn) {
  playbackAutoplayBtn.onclick = toggleAutoplayOnSelect;
}

// ── Custom Game Modal Handler ──────────────────────────────────────────────
const addCustomGameBtn = document.getElementById('addCustomGameBtn');
const customGameModal = document.getElementById('customGameModal');
const closeCustomGameBtn = document.getElementById('closeCustomGameBtn');
const saveCustomGameBtn = document.getElementById('saveCustomGameBtn');
const customGameJson = document.getElementById('customGameJson');
const customGameError = document.getElementById('customGameError');

if (addCustomGameBtn && customGameModal) {
  addCustomGameBtn.onclick = () => {
    customGameError.style.display = 'none';
    const defaultTemplate = {
      id: 'custom-sandbox-' + Date.now(),
      name: 'New Sandbox',
      gameCode: 'LGS-004',
      grid: { rows: 5, cols: 5 },
      emptySymbolId: -1,
      scatterSymbolId: 99,
      wildSymbolId: 98,
      symbols: { 1: 'H1', 2: 'H2', 99: 'SCAT' },
      emojis: { 1: '🍒', 2: '🍉', 99: '⭐' },
      colors: { 1: '#ff5252', 2: '#66bb6a', 99: '#ffeb3b' },
      winCategories: {
        BIG_WIN: 20,
        MEGA_WIN: 50,
        HUGE_WIN: 150,
        MAX_WIN: 5000,
      },
      defaultRequestBody: {
        betAmount: 20,
        cashBet: '20',
        currencyDec: 2,
        stakes: [{ type: 'commonGame' }],
        rtpOption: 'RTP_97',
      },
      playerId: PLAYER_ID,
    };
    customGameJson.value = JSON.stringify(defaultTemplate, null, 2);
    customGameModal.showModal();
  };

  if (closeCustomGameBtn) closeCustomGameBtn.onclick = () => customGameModal.close();

  if (saveCustomGameBtn) {
    saveCustomGameBtn.onclick = async () => {
      try {
        const config = JSON.parse(customGameJson.value);
        if (!config.id || !config.name || !config.gameCode) {
          throw new Error('Missing required fields: id, name, gameCode');
        }

        const { saveCustomGame } = await import('./game-registry.js');
        saveCustomGame(config);

        // Inject option into header dropdown dynamically
        const headerGameSelect = document.getElementById('headerGameSelect');
        if (headerGameSelect) {
          const opt = document.createElement('option');
          opt.value = config.id;
          opt.textContent = config.name;
          headerGameSelect.appendChild(opt);
          headerGameSelect.value = config.id;

          // Force UI switch
          headerGameSelect.dispatchEvent(new Event('change'));
        }

        customGameModal.close();
        showLoading('Custom Game Loaded! ✅');
        setTimeout(hideLoading, 1500);
      } catch (e) {
        customGameError.textContent = 'Invalid JSON: ' + e.message;
        customGameError.style.display = 'block';
      }
    };
  }

  customGameModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') customGameModal.close();
  });
}

// ── Paytable Modal Logic ──────────────────────────────────────────────────
const openPaytableBtn = document.getElementById('openPaytableBtn');
const paytableModal = document.getElementById('paytableModal');
const closePaytableBtn = document.getElementById('closePaytableBtn');
const paytableContent = document.getElementById('paytableContent');
const paytableTitle = document.getElementById('paytableTitle');

if (openPaytableBtn && paytableModal) {
  openPaytableBtn.onclick = () => {
    // 1. Fetch latest active game config with attached backend data
    const currentGame = getActiveGame();
    paytableTitle.innerText = `📊 PAYTABLE - ${currentGame.name}`;
    paytableContent.innerHTML = '';

    // 2. Render Raw Backend Config (If extraction script was run)
    if (currentGame.rawBackendConfig) {
      const rawContainer = document.createElement('div');
      rawContainer.style.cssText =
        'background: #000; color: #10b981; padding: 16px; border-radius: 8px; font-family: "JetBrains Mono", monospace; font-size: 10px; white-space: pre-wrap; overflow-x: auto; margin-bottom: 12px; border: 1px solid var(--border-color); box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);';
      rawContainer.innerText = currentGame.rawBackendConfig;
      paytableContent.appendChild(rawContainer);
    } else {
      paytableContent.innerHTML += `<div style="color: var(--error); font-size: 11px; text-align: center; padding: 10px; border: 1px dashed var(--error); border-radius: 8px; margin-bottom: 12px;">⚠️ No backend data found. Run the node extraction script.</div>`;
    }

    // 3. Render any manual formatting (If you manually added to the game config)
    if (currentGame.paytable && Object.keys(currentGame.paytable).length > 0) {
      Object.entries(currentGame.paytable).forEach(([id, rule]) => {
        const emojiStr = EMOJIS[id] || '';
        const nameStr = SYMBOLS[id] !== undefined ? SYMBOLS[id] : `Symbol ${id}`;
        const color = SYMBOL_COLORS[id] || '#666';

        const row = document.createElement('div');
        row.style.cssText =
          'display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 8px;';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 24px; width: 32px; text-align: center;">${emojiStr}</div>
            <div style="display: flex; flex-direction: column;">
              <span style="color: ${color}; font-weight: 900; font-size: 12px; text-transform: uppercase;">${nameStr}</span>
              <span style="color: var(--text-muted); font-size: 9px; font-family: monospace;">ID: ${id}</span>
            </div>
          </div>
          <div style="color: var(--success); font-weight: 800; font-size: 11px; text-align: right; max-width: 60%;">
            ${rule}
          </div>
        `;
        paytableContent.appendChild(row);
      });
    }

    paytableModal.showModal();
  };

  closePaytableBtn.onclick = () => paytableModal.close();

  paytableModal.addEventListener('click', (e) => {
    if (e.target === paytableModal) paytableModal.close();
  });
}

boot().catch((err) => console.error('Boot failed:', err));
