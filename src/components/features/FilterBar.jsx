import { createSignal, For, Show } from 'solid-js';
import { FILTER_DEFS, WIN_OPERATORS } from '../../filters.js';
import { activeFilters, setActiveFilters } from '../../store/historyStore.js';
import { sortField, setSortField, rebuildSortedList } from '../../store/historyStore.js';
import { triggerFilterUpdate } from '../../services/gameService.js';
import { game } from '../../store/gameStore.js';

export default function FilterBar() {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const filterCount = () => activeFilters.length;
  const totalCount = () => {
    // Shown via globalHistory length in the store
    return '';
  };

  async function addFilter(def) {
    setDropdownOpen(false);
    if (def.type === 'toggle') {
      setActiveFilters((prev) => [...prev, { id: def.id, value: true }]);
      await triggerFilterUpdate();
    }
    // other types handled via inline input below
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
        <span id="filterCount" style="font-size:9px; color:var(--text-muted); font-family:monospace;">
          {activeFilters.length > 0 ? `${activeFilters.length} active` : ''}
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
                displayValue = `${game().emojis?.[k] || ''} ${game().symbols?.[k] || k}`;
              } else if (def.type !== 'toggle') {
                displayValue = af.value;
              }

              return (
                <div class={`filter-chip ${af.disabled ? 'disabled' : ''}`} title="Click label to toggle, X to remove">
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
                      title="Click to edit"
                      onClick={() => {/* TODO: inline edit */}}
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
            onClick={(e) => { e.stopPropagation(); setDropdownOpen((v) => !v); }}
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
                  const stackable = def.id === 'text' || def.id === 'winCondition' || def.id === 'hasSymbol';
                  if (!stackable && activeFilters.some((af) => af.id === def.id)) return null;
                  return (
                    <div
                      class="dropdown-item"
                      onClick={() => addFilter(def)}
                    >
                      {def.label}
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Sort Bar */}
      <div class="sort-bar" style="display:flex; align-items:center; gap:8px; margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;">
        <span class="sort-label" style="font-size:9px;">SORT:</span>
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
