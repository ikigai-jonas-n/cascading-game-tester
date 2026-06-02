import { Show, createMemo } from 'solid-js';
import { game } from '../../store/gameStore.js';
import { updateSpin } from '../../store/historyStore.js';
import { saveSpin, deleteSpin, toggleBookmark } from '../../db.js';
import {
  loadSpin,
  stopPlayback,
  getWinCategory,
  isSettleField,
  selectTumble,
} from '../../services/spinService.js';
import { globalHistory, rebuildSortedList, setGlobalHistory } from '../../store/historyStore.js';
import { currentSpinIndex, setCurrentSpinIndex } from '../../store/sessionStore.js';
import TumbleAudit from './TumbleAudit.jsx';

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function truncateMiddle(str, maxLen = 44) {
  if (!str || str.length <= maxLen) return str;
  const front = Math.ceil((maxLen - 3) / 2);
  const end = Math.floor((maxLen - 3) / 2);
  return str.slice(0, front) + '...' + str.slice(-end);
}

export default function SpinCard(props) {
  const g = game;

  const bet = createMemo(() => parseFloat(props.spin.betAmount || 0));
  const win = createMemo(() => parseFloat(props.spin.totalWin || 0));
  const ratio = createMemo(() => {
    const b = bet();
    return b > 0 ? (win() / b).toFixed(2).replace(/\.?0+$/, '') : '0';
  });
  const winCategory = createMemo(() => getWinCategory(win(), bet()));
  const isBookmarked = createMemo(() => !!props.spin.bookmarked);
  const hasMaxWin = createMemo(() => !!props.spin.hasMaxWin);

  async function handleBookmark(e) {
    e.stopPropagation();
    const newState = !isBookmarked();
    await toggleBookmark(props.spin.num, newState);
    updateSpin(props.spin.num, { bookmarked: newState });
    rebuildSortedList();
  }

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete spin #${props.spin.num}?`)) return;
    await deleteSpin(props.spin.num);
    const idx = globalHistory.indexOf(props.spin);
    if (idx !== -1) {
      if (currentSpinIndex() === idx) setCurrentSpinIndex(-1);
    }
    setGlobalHistory((prev) => prev.filter((s) => s.num !== props.spin.num));
    rebuildSortedList();
  }

  function handleDescEdit(e) {
    e.stopPropagation();
    const titleEl = e.currentTarget;
    if (titleEl.querySelector('.title-input')) return;
    const spin = props.spin;
    const current = spin.description || '';

    while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'title-input';
    input.value = current;
    input.placeholder = 'Add title…';
    titleEl.appendChild(input);
    input.focus();
    if (current) input.select();

    const save = () => {
      const val = input.value.trim();
      updateSpin(spin.num, { description: val || null });
      saveSpin({ ...spin, description: val || null });
      rebuildSortedList();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
      if (ev.key === 'Escape') {
        input.removeEventListener('blur', save);
        input.blur();
        rebuildSortedList();
      }
    });
  }

  function handleCardClick(e) {
    const loadMoreBtn = e.target.closest('.load-more-tumbles-btn');
    if (loadMoreBtn) {
      e.stopPropagation();
      props.spin._showAllTumbles = true;
      rebuildSortedList();
      return;
    }

    const bookmarkBtn = e.target.closest('.bookmark-btn-v5');
    if (bookmarkBtn) {
      handleBookmark(e);
      return;
    }

    const deleteBtn = e.target.closest('.delete-btn-v5');
    if (deleteBtn) {
      handleDelete(e);
      return;
    }

    const tumbleEl = e.target.closest('[data-tumble]');
    if (tumbleEl) {
      selectTumble(parseInt(tumbleEl.dataset.tumble), 'initial');
      return;
    }

    if (props.isActive) return;
    stopPlayback();
    props.onClick();
  }

  function handleKeyDown(e) {
    if (document.activeElement?.hasAttribute('data-tumble')) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.currentTarget.nextElementSibling?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.currentTarget.previousElementSibling?.focus();
    }
  }

  return (
    <div
      role="listitem"
      tabindex="0"
      aria-selected={props.isActive}
      class={`spin-history-card ${props.isActive ? 'active' : ''}`}
      data-index={globalHistory.indexOf(props.spin)}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      {/* Title row */}
      <div
        class={`card-title-v5 ${props.spin.description ? '' : 'title-empty'}`}
        data-desc={props.spin.description?.replace(/"/g, '&quot;') || ''}
        data-desc-num={props.spin.num}
        onClick={handleDescEdit}
      >
        <span class="title-text">
          {props.spin.description ? truncateMiddle(props.spin.description) : '+ Add title…'}
        </span>
      </div>

      {/* Header row */}
      <div class="card-header-v5">
        <div class="header-left">
          <span class={`status-dot ${props.spin.isWin ? 'winner' : 'no-win'}`} />
          <span class="status-text">{props.spin.isWin ? 'WINNER' : 'NO WIN'}</span>
          <span class="card-num-v5">#{props.spin.num}</span>
          <Show when={hasMaxWin() && winCategory() !== 'MAX_WIN'}>
            <span class="max-win-badge-v5">MAX</span>
          </Show>
        </div>
        <div class="header-right">
          <div class="meta-time">{formatTimestamp(props.spin.timestamp)}</div>
          <button
            class={`bookmark-btn-v5 ${isBookmarked() ? 'active' : ''}`}
            data-num={props.spin.num}
            title="Bookmark"
            onClick={handleBookmark}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={isBookmarked() ? 'currentColor' : 'none'}
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
          </button>
          <button
            class="delete-btn-v5"
            data-num={props.spin.num}
            title="Delete Record"
            onClick={handleDelete}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div class="card-body-v5">
        <div class={`win-display ${props.spin.isWin ? 'winner' : ''}`}>
          <span class="win-val">{win()}</span>
          <span class="win-lbl">COINS</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <Show when={winCategory() !== 'NONE'}>
            <span class={`win-category-badge ${winCategory().toLowerCase()}`}>
              {winCategory().replace('_WIN', '')} ({g().winCategories?.[winCategory()] || 0}x)
            </span>
          </Show>
          <div class={`ratio-display-v5 ${parseFloat(ratio()) >= 1 ? 'gold' : ''}`}>
            {ratio()}x TB
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="card-footer-v5">
        <div class="meta-items">
          <span class="m-item">
            Bet: <b>{bet()}</b>
          </span>
          <span class="m-item">
            Mode: <b>{props.spin.spinMode || 'std'}</b>
          </span>
          <span class="m-item" style="color:var(--text-accent); font-weight:800;">
            {props.spin.spinType === 'freeSpin' ? 'FreeSpin' : 'BaseSpin'}
          </span>
          <span class="m-item multi">
            Max: <b>{props.spin.maxMultiplier || 1}x</b>
          </span>
          <span class="m-item tumble">
            Tumbles: <b>{props.spin.tumbleCount || 0}</b>
          </span>
          <Show when={(props.spin.goldenTransformed || 0) > 0}>
            <span class="m-item golden" title="Golden Transformed">
              G-Trans: <b>{props.spin.goldenTransformed}</b>
            </span>
          </Show>
          <Show when={props.spin.cascadeCount > 0}>
            <span class="m-item cascade">{props.spin.cascadeCount} Cascades</span>
          </Show>
        </div>
      </div>

      {/* Tumble Audit (only for active card) */}
      <Show when={props.isActive}>
        <TumbleAudit spin={props.spin} />
      </Show>
    </div>
  );
}
