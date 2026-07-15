import { createMemo, For, Show } from 'solid-js';
import { rawDrawerTabs, rawDrawerActiveTab, rightPanelFontSize } from '../../store/uiStore.js';
import { selectDrawerTab } from '../../services/drawerService.js';
import { game } from '../../store/gameStore.js';
import { gameState, currentSpinIndex } from '../../store/sessionStore.js';
import { selectTumble } from '../../services/spinService.js';
import { activeFilters, globalHistory } from '../../store/historyStore.js';
import { evalFeatureMatchPairs } from '../../filters.js';

export default function RawDrawer() {
  const activeTab = createMemo(() => rawDrawerTabs()[rawDrawerActiveTab()]);

  return (
    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
      {/* Tab Bar */}
      <div
        id="rawTabs"
        role="tablist"
        style="display:flex;align-items:stretch;gap:0;padding:0 16px;border-bottom:1px solid var(--border-color);overflow-x:auto;scrollbar-width:none;flex-shrink:0;min-height:36px;"
      >
        <For each={rawDrawerTabs()}>
          {(tab, i) => {
            const isActive = createMemo(() => i() === rawDrawerActiveTab());
            return (
              <button
                role="tab"
                aria-selected={isActive()}
                tabIndex={isActive() ? 0 : -1}
                style={`
                  background: none;
                  border: none;
                  border-bottom: 2px solid ${isActive() ? 'var(--bg-accent)' : 'transparent'};
                  color: ${isActive() ? 'var(--bg-accent)' : 'var(--text-muted)'};
                  padding: 0 10px;
                  cursor: pointer;
                  font-size: 9.5px;
                  font-weight: 700;
                  font-family: 'JetBrains Mono', monospace;
                  text-transform: uppercase;
                  letter-spacing: 0.6px;
                  transition: color 0.15s, border-color 0.15s;
                  white-space: nowrap;
                  outline: none;
                `}
                onClick={() => {
                  selectDrawerTab(i());
                  import('../../services/spinService.js').then(({ showTumble }) => {
                    if (tab.label === 'INITIAL[]') showTumble(gameState.currentIndex, 'initial');
                    if (tab.label === 'FINAL[]' || tab.label === 'INIT-FINAL DIFF')
                      showTumble(gameState.currentIndex, 'final');
                  });
                }}
                onKeyDown={(e) => {
                  const tabs = rawDrawerTabs();
                  const moveFocus = (idx) => {
                    selectDrawerTab(idx);
                    const t = tabs[idx];
                    import('../../services/spinService.js').then(({ showTumble }) => {
                      if (t.label === 'INITIAL[]') showTumble(gameState.currentIndex, 'initial');
                      if (t.label === 'FINAL[]' || t.label === 'INIT-FINAL DIFF')
                        showTumble(gameState.currentIndex, 'final');
                    });
                    const btn = e.currentTarget.parentElement.children[idx];
                    if (btn) btn.focus();
                  };
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    moveFocus((i() + 1) % tabs.length);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    moveFocus((i() - 1 + tabs.length) % tabs.length);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    document.getElementById('rawContent')?.focus();
                  }
                }}
              >
                {tab.label}
              </button>
            );
          }}
        </For>
      </div>

      {/* Content */}
      <div
        id="rawContent"
        tabIndex={0}
        style={`flex:1;overflow-y:auto;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:${rightPanelFontSize()}px;line-height:1.7;outline:none;`}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }}
      >
        <Show
          when={activeTab()}
          keyed
          fallback={
            <span style="color:var(--text-muted);font-size:10px;font-family:'JetBrains Mono',monospace;">
              // no data selected
            </span>
          }
        >
          {(tab) => <TabContent tab={tab} />}
        </Show>
      </div>
    </div>
  );
}

function TabContent(props) {
  const { tab } = props;
  const g = game;

  if (['INITIAL[]', 'FINAL[]', 'INIT-FINAL DIFF'].includes(tab.label)) {
    const isDiff = tab.label === 'INIT-FINAL DIFF';
    let initialArr = null;
    let finalArr = null;

    if (isDiff) {
      initialArr = rawDrawerTabs().find((t) => t.label === 'INITIAL[]')?.data;
      finalArr = rawDrawerTabs().find((t) => t.label === 'FINAL[]')?.data;
    } else {
      finalArr = tab.data;
    }

    if (Array.isArray(finalArr)) {
      const { rows, cols } = g().grid;
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = c * rows + r;
          cells.push({
            i,
            r,
            c,
            val: finalArr[i],
            changed: isDiff && initialArr && initialArr[i] !== finalArr[i],
            prevVal: isDiff && initialArr ? initialArr[i] : undefined,
          });
        }
      }

      return (
        <div>
          <div class="audit-matrix-container">
            <div
              class="audit-matrix"
              style={`grid-template-columns:repeat(${cols},1fr);max-width:${cols * 34}px;`}
            >
              <For each={cells}>
                {(cell) => (
                  <div
                    class={`audit-matrix-cell${cell.changed ? ' changed' : ''}`}
                    title={`idx:${cell.i} r${cell.r} c${cell.c}`}
                  >
                    <Show when={cell.changed} fallback={cell.val}>
                      <span style="font-size:7px;opacity:0.5;text-decoration:line-through;">
                        {cell.prevVal}
                      </span>
                      <br />
                      {cell.val}
                    </Show>
                  </div>
                )}
              </For>
            </div>
            <div style="font-size:8.5px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">
              raw array
            </div>
            <pre
              style="margin:0;font-size:10px;white-space:pre;overflow-x:auto;color:#ccc;line-height:1.6;"
              tabIndex={0}
            >
              {JSON.stringify(finalArr, null, 2)}
            </pre>
          </div>
        </div>
      );
    }
  }

  if (tab.label === 'INIT-FINAL DIFF' && Array.isArray(tab.data)) {
    return (
      <div style="line-height:1.7;">
        <div style="color:var(--text-muted);">[</div>
        <For each={tab.data}>
          {(line, idx) => {
            const comma = idx() === tab.data.length - 1 ? '' : ',';
            if (line.includes('->')) {
              const parts = line.split(', ');
              return (
                <div style="padding-left:20px;white-space:pre;color:#4ade80;font-weight:bold;">
                  {parts[0]}
                  {comma}{' '}
                  <span style="color:#555;font-weight:normal;font-size:0.9em;">{parts[1]}</span>
                </div>
              );
            }
            return (
              <div style="padding-left:20px;white-space:pre;color:#9cdcfe;">
                {line}
                {comma}
              </div>
            );
          }}
        </For>
        <div style="color:var(--text-muted);">]</div>
      </div>
    );
  }

  if (tab.label === 'FEATURES' || tab.label === 'FULL_JSON' || tab.label.startsWith('TUMBLE_')) {
    return <HighlightedJsonView data={tab.data} />;
  }

  return (
    <pre style="margin:0;white-space:pre;overflow-x:auto;line-height:1.7;" tabIndex={0}>
      {JSON.stringify(tab.data, null, 2)}
    </pre>
  );
}

/** Every active featureMatch condition currently satisfied, for the tumble on screen */
function getActiveFeatureMatchHits() {
  const currentSpin = globalHistory[currentSpinIndex()];
  const field = currentSpin?.fields?.[gameState.currentIndex];
  if (!field?.features) return [];
  const isFreeSpin = !!currentSpin?.fieldMetadata?.[gameState.currentIndex]?.isFreeSpin;

  const hits = [];
  for (const af of activeFilters) {
    if (af.disabled || af.id !== 'featureMatch') continue;
    const pairs = af.value?.pairs || [];
    if (!pairs.length) continue;
    const scope = af.value?.scope || 'any';
    if (scope === 'base' && isFreeSpin) continue;
    if (scope === 'free' && !isFreeSpin) continue;

    const { details } = evalFeatureMatchPairs(field.features, pairs);
    hits.push(...details.filter((d) => d.ok));
  }
  return hits;
}

const JSON_LEAF_LINE = /^(\s*)"([^"]+)":\s*(.*?)(,?)\s*$/;

/**
 * Pretty-print any JSON value as lines, highlighting leaves whose key + value
 * match an active Feature Match hit — works for FEATURES, TUMBLE_X_FIELD, and
 * FULL_JSON alike since it only inspects each printed leaf line, not a path.
 */
function HighlightedJsonView(props) {
  const hits = createMemo(() => getActiveFeatureMatchHits());

  const lines = createMemo(() => {
    const json = JSON.stringify(props.data, null, 2);
    const activeHits = hits();
    if (!activeHits.length) return json.split('\n').map((text) => ({ text, hit: null }));

    return json.split('\n').map((text) => {
      const m = text.match(JSON_LEAF_LINE);
      if (!m) return { text, hit: null };
      const [, , key, rawValue] = m;
      const hit = activeHits.find((h) => h.key === key || h.key.endsWith(`.${key}`));
      if (hit && rawValue === JSON.stringify(hit.actual)) return { text, hit };
      return { text, hit: null };
    });
  });

  return (
    <div>
      <pre
        style="margin:0;white-space:pre;overflow-x:auto;line-height:1.7;color:#ce9178;"
        tabIndex={0}
      >
        <For each={lines()}>
          {(line) => (
            <div
              style={
                line.hit
                  ? 'background:rgba(217,70,239,0.2);color:#e879f9;font-weight:800;border-radius:3px;'
                  : undefined
              }
              title={line.hit ? `🎯 Matches Feature Match filter (${line.hit.key})` : undefined}
            >
              {line.text}
            </div>
          )}
        </For>
      </pre>
      <Show when={hits().length > 0}>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:9.5px;color:#e879f9;font-weight:700;">
          🎯 Matches active Feature Match filter:{' '}
          <For each={hits()}>
            {(h, i) => (
              <span>
                {i() > 0 ? ' · ' : ''}
                {h.key} = {JSON.stringify(h.actual)}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
