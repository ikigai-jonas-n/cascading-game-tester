import { createSignal, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { FILTER_DEFS, WIN_OPERATORS } from '../../filters.js';
import {
  activeFilters,
  setActiveFilters,
  globalHistory,
  currentSortedList,
  sortField,
  setSortField,
  rebuildSortedList,
  totalDbCount,
} from '../../store/historyStore.js';
import { triggerFilterUpdate } from '../../services/gameService.js';
import { game } from '../../store/gameStore.js';

export default function FilterBar() {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [pendingFilter, setPendingFilter] = createSignal(null);
  const [pendingOp, setPendingOp] = createSignal('>');
  const [pendingNum, setPendingNum] = createSignal('');
  const [pendingText, setPendingText] = createSignal('');
  const [pendingDate, setPendingDate] = createSignal('');
  const [pendingSelect, setPendingSelect] = createSignal('');
  const [pendingSymId, setPendingSymId] = createSignal('');
  const [pendingSymCount, setPendingSymCount] = createSignal(1);
  const [pendingMulti, setPendingMulti] = createSignal([]);
  const [pendingPairs, setPendingPairs] = createStore([{ key: '', val: '' }]);
  const [pendingScope, setPendingScope] = createSignal('any');
  const [editIdx, setEditIdx] = createSignal(null);

  function resetPending() {
    setPendingFilter(null);
    setEditIdx(null);
    setPendingOp('>');
    setPendingNum('');
    setPendingText('');
    setPendingDate('');
    setPendingSelect('');
    setPendingSymId('');
    setPendingSymCount(1);
    setPendingMulti([]);
    setPendingPairs([{ key: '', val: '' }]);
    setPendingScope('any');
  }

  function updatePendingPair(i, field, value) {
    setPendingPairs(i, field, value);
  }

  function addPendingPairRow() {
    setPendingPairs(pendingPairs.length, { key: '', val: '' });
  }

  function removePendingPairRow(i) {
    if (pendingPairs.length <= 1) return;
    setPendingPairs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function openFilterInput(def, existingIdx = null) {
    setDropdownOpen(false);
    const existingValue = existingIdx !== null ? activeFilters[existingIdx]?.value : undefined;

    if (def.type === 'toggle') {
      if (existingIdx === null) commitFilter(def, true);
      return;
    }

    resetPending();
    setEditIdx(existingIdx);

    if (def.type === 'select') {
      setPendingSelect(existingValue ?? def.options?.[0]?.value ?? '');
    } else if (def.type === 'symbolCount') {
      const syms = Object.keys(game().symbols || {});
      setPendingSymId(existingValue?.symId ?? syms[0] ?? '');
      setPendingSymCount(existingValue?.count ?? 1);
    } else if (def.type === 'condition') {
      setPendingOp(existingValue?.op ?? '>');
      setPendingNum(existingValue?.num ?? '');
    } else if (def.type === 'number') {
      setPendingNum(existingValue ?? '');
    } else if (def.type === 'text') {
      setPendingText(existingValue ?? '');
    } else if (def.type === 'date') {
      setPendingDate(existingValue ?? '');
    } else if (def.type === 'multiselect') {
      setPendingMulti(existingValue ? [...existingValue] : []);
    } else if (def.type === 'featureMatch') {
      setPendingPairs(
        existingValue?.pairs?.length
          ? existingValue.pairs.map((p) => ({ ...p }))
          : [{ key: '', val: '' }],
      );
      setPendingScope(existingValue?.scope || 'any');
    }

    setPendingFilter(def);
  }

  async function commitFilter(def, value) {
    setActiveFilters((prev) => [...prev, { id: def.id, value }]);
    await triggerFilterUpdate();
  }

  async function confirmPending() {
    const def = pendingFilter();
    if (!def) return;
    let value;
    if (def.type === 'condition') value = { op: pendingOp(), num: parseFloat(pendingNum()) || 0 };
    else if (def.type === 'number') value = parseFloat(pendingNum()) || 0;
    else if (def.type === 'text') value = pendingText();
    else if (def.type === 'date') value = pendingDate();
    else if (def.type === 'select') value = pendingSelect();
    else if (def.type === 'symbolCount')
      value = { symId: pendingSymId(), count: parseInt(pendingSymCount()) || 1 };
    else if (def.type === 'multiselect') value = [...pendingMulti()];
    else if (def.type === 'featureMatch') {
      const pairs = pendingPairs
        .map((p) => ({ key: p.key.trim(), val: p.val.trim() }))
        .filter((p) => p.key);
      if (!pairs.length) return;
      value = { pairs, scope: pendingScope() };
    } else return;

    const idx = editIdx();
    if (idx !== null) {
      setActiveFilters(idx, 'value', value);
      await triggerFilterUpdate();
    } else {
      await commitFilter(def, value);
    }
    resetPending();
  }

  async function removeFilter(idx) {
    setActiveFilters((prev) => prev.filter((_, i) => i !== idx));
    await triggerFilterUpdate();
  }

  async function toggleFilter(idx) {
    setActiveFilters(idx, 'disabled', (v) => !v);
    await triggerFilterUpdate();
  }

  return (
    <section aria-labelledby="filtersHeading">
      <div style="display:flex; align-items:center; gap:8px;">
        <h2 id="filtersHeading">Active Filters</h2>
        <span
          id="filterCount"
          style="font-size:9px; color:var(--text-muted); font-family:monospace;"
        >
          {currentSortedList().length}/{totalDbCount()}
        </span>
      </div>

      <div class="filter-bar" role="toolbar" aria-label="Active Filters">
        <div id="filterChips" style="display:contents;">
          <For each={activeFilters}>
            {(af, idx) => {
              const def = FILTER_DEFS.find((d) => d.id === af.id);
              if (!def) return null;

              let displayValue = '';
              if (def.formatValue) displayValue = def.formatValue(af.value, game());
              else if (def.type === 'select' && def.options) {
                const opt = def.options.find((o) => o.value === af.value);
                if (opt) displayValue = opt.label;
              } else if (def.type === 'select' && def.optionsFromGame) {
                const k = af.value;
                const entry = game().symbols?.[k];
                const emoji = typeof entry === 'object' ? entry.emoji : '';
                const name = typeof entry === 'object' ? entry.name : entry || k;
                displayValue = `${emoji} ${name}`;
              } else if (def.type === 'condition') {
                displayValue = `${af.value?.op} ${af.value?.num}`;
              } else if (def.type === 'symbolCount') {
                const symEntry = game().symbols?.[af.value?.symId];
                const emoji =
                  typeof symEntry === 'object' ? symEntry.emoji : symEntry || af.value?.symId;
                displayValue = `${emoji} ×${af.value?.count}`;
              } else if (def.type === 'multiselect') {
                displayValue = Array.isArray(af.value) ? af.value.join(', ') : af.value;
              } else if (def.type !== 'toggle') {
                displayValue = af.value;
              }

              return (
                <div
                  class={`filter-chip ${af.disabled ? 'disabled' : ''}`}
                  title="Click label to toggle, X to remove"
                >
                  <span
                    class="filter-chip-label"
                    role="button"
                    tabindex="0"
                    onClick={() => toggleFilter(idx())}
                  >
                    {def.label}
                  </span>
                  <Show when={displayValue !== ''}>
                    <span
                      class="filter-chip-value editable"
                      role="button"
                      tabindex="0"
                      title="Click to edit"
                      onClick={() => openFilterInput(def, idx())}
                    >
                      {displayValue}
                    </span>
                  </Show>
                  <span
                    class="filter-chip-remove"
                    role="button"
                    aria-label="Remove filter"
                    onClick={() => removeFilter(idx())}
                  >
                    ×
                  </span>
                </div>
              );
            }}
          </For>
        </div>

        <div style="position:relative;">
          <button
            id="addFilterBtn"
            class="btn-ghost"
            style="border-radius:20px; border-style:dashed;"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen((v) => !v);
              resetPending();
            }}
          >
            + Add Filter
          </button>
          <Show when={dropdownOpen()}>
            <div
              id="filterDropdown"
              class="dropdown-menu"
              style="display:block; top:100%; left:0; z-index:1000;"
              onClick={(e) => e.stopPropagation()}
            >
              <For each={FILTER_DEFS}>
                {(def) => {
                  const stackable =
                    def.id === 'text' ||
                    def.id === 'winCondition' ||
                    def.id === 'hasSymbol' ||
                    def.id === 'featureMatch';
                  if (!stackable && activeFilters.some((af) => af.id === def.id)) return null;
                  return (
                    <div class="dropdown-item" onClick={() => openFilterInput(def)}>
                      {def.label}
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Inline pending filter form */}
      <Show when={pendingFilter()}>
        <div
          style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px; padding:8px; background:var(--bg-card); border-radius:6px; border:1px solid var(--border-color);"
          onClick={(e) => e.stopPropagation()}
        >
          <span style="font-size:10px; color:var(--text-muted);">{pendingFilter().label}:</span>

          {/* condition: op selector + number */}
          <Show when={pendingFilter().type === 'condition'}>
            <select
              style="padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              value={pendingOp()}
              onChange={(e) => setPendingOp(e.target.value)}
            >
              <For each={WIN_OPERATORS}>{(o) => <option value={o.op}>{o.label}</option>}</For>
            </select>
            <input
              type="number"
              placeholder="value"
              value={pendingNum()}
              style="width:80px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingNum(e.target.value)}
            />
          </Show>

          {/* number */}
          <Show when={pendingFilter().type === 'number'}>
            <input
              type="number"
              placeholder="value"
              value={pendingNum()}
              style="width:80px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingNum(e.target.value)}
            />
          </Show>

          {/* text */}
          <Show when={pendingFilter().type === 'text'}>
            <input
              type="text"
              placeholder="search text"
              value={pendingText()}
              style="width:120px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingText(e.target.value)}
            />
          </Show>

          {/* date */}
          <Show when={pendingFilter().type === 'date'}>
            <input
              type="date"
              value={pendingDate()}
              style="padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingDate(e.target.value)}
            />
          </Show>

          {/* select with static options */}
          <Show when={pendingFilter().type === 'select' && pendingFilter().options}>
            <select
              style="padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              value={pendingSelect()}
              onChange={(e) => setPendingSelect(e.target.value)}
            >
              <For each={pendingFilter().options}>
                {(o) => <option value={o.value}>{o.label}</option>}
              </For>
            </select>
          </Show>

          {/* select with optionsFromGame — text fallback */}
          <Show when={pendingFilter().type === 'select' && pendingFilter().optionsFromGame}>
            <input
              type="text"
              placeholder="value"
              value={pendingSelect()}
              style="width:100px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingSelect(e.target.value)}
            />
          </Show>

          {/* symbolCount */}
          <Show when={pendingFilter().type === 'symbolCount'}>
            <select
              style="padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              value={pendingSymId()}
              onChange={(e) => setPendingSymId(e.target.value)}
            >
              <For each={Object.entries(game().symbols || {})}>
                {([id, entry]) => {
                  const emoji = typeof entry === 'object' ? entry.emoji : '';
                  const name = typeof entry === 'object' ? entry.name : entry;
                  return (
                    <option value={id}>
                      {emoji} {name}
                    </option>
                  );
                }}
              </For>
            </select>
            <span style="font-size:10px; color:var(--text-muted);">×</span>
            <input
              type="number"
              min="1"
              value={pendingSymCount()}
              style="width:50px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
              onInput={(e) => setPendingSymCount(e.target.value)}
            />
          </Show>

          {/* multiselect */}
          <Show when={pendingFilter().type === 'multiselect'}>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
              <For each={Object.keys(game().winCategories || {})}>
                {(cat) => (
                  <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:var(--text-primary); cursor:pointer;">
                    <input
                      type="checkbox"
                      checked={pendingMulti().includes(cat)}
                      onChange={(e) => {
                        setPendingMulti((prev) =>
                          e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                        );
                      }}
                    />
                    {cat.replace('_WIN', '')}
                  </label>
                )}
              </For>
            </div>
          </Show>

          {/* featureMatch: stackable key/value conditions, AND'd on the same field */}
          <Show when={pendingFilter().type === 'featureMatch'}>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <For each={pendingPairs}>
                {(pair, i) => (
                  <div style="display:flex; gap:6px; align-items:center;">
                    <input
                      type="text"
                      placeholder="Key (e.g. modifier.multiplier)"
                      value={pair.key}
                      style="width:160px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
                      onInput={(e) => updatePendingPair(i(), 'key', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Value (true, 123, [0-2, 3], *)"
                      value={pair.val}
                      style="width:160px; padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
                      onInput={(e) => updatePendingPair(i(), 'val', e.target.value)}
                    />
                    <span
                      role="button"
                      aria-label="Remove condition"
                      style="cursor:pointer; color:var(--text-muted); font-size:14px; padding:0 4px;"
                      onClick={() => removePendingPairRow(i())}
                    >
                      ×
                    </span>
                  </div>
                )}
              </For>
              <button
                class="btn-ghost"
                style="padding:4px 8px; font-size:10px; align-self:flex-start;"
                onClick={addPendingPairRow}
              >
                + Add Condition
              </button>

              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:10px; color:var(--text-muted);">Spin phase:</span>
                <select
                  style="padding:4px; font-size:11px; background:var(--bg-main); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;"
                  value={pendingScope()}
                  onChange={(e) => setPendingScope(e.target.value)}
                >
                  <option value="any">Any</option>
                  <option value="base">BaseSpin</option>
                  <option value="free">FreeSpin</option>
                </select>
              </div>
            </div>
          </Show>

          <button
            class="btn-primary"
            style="padding:4px 10px; font-size:11px;"
            onClick={confirmPending}
          >
            Add
          </button>
          <button class="btn-ghost" style="padding:4px 8px; font-size:11px;" onClick={resetPending}>
            ✕
          </button>
        </div>
      </Show>

      {/* Sort Bar */}
      <div
        class="sort-bar"
        style="display:flex; align-items:center; gap:8px; margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;"
      >
        <span class="sort-label" style="font-size:9px;">
          SORT:
        </span>
        <select
          id="sortField"
          style="background:transparent; border:none; color:var(--text-muted); padding:0;"
          value={sortField()}
          onChange={(e) => {
            setSortField(e.target.value);
            localStorage.setItem('sort_field', e.target.value);
            rebuildSortedList();
          }}
        >
          <option value="num_desc">Newest</option>
          <option value="num_asc">Oldest</option>
          <option value="win_desc">Largest Win</option>
          <option value="cascade_desc">Cascades</option>
        </select>
      </div>
    </section>
  );
}
