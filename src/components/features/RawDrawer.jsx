import { createMemo, For, Show } from 'solid-js';
import { rawDrawerTabs, rawDrawerActiveTab } from '../../store/uiStore.js';
import { selectDrawerTab } from '../../services/drawerService.js';
import { game } from '../../store/gameStore.js';
import { gameState } from '../../store/sessionStore.js';
import { selectTumble } from '../../services/spinService.js';

export default function RawDrawer() {
  const activeTab = createMemo(() => rawDrawerTabs[rawDrawerActiveTab()]);

  return (
    <div style="display:flex; flex-direction:column; flex:1; overflow:hidden; padding:0 16px;">
      {/* Tabs */}
      <div
        id="rawTabs"
        role="tablist"
        style="display:flex; flex-wrap:wrap; gap:4px; padding:12px 0; border-bottom:1px solid var(--border-color);"
      >
        <For each={rawDrawerTabs}>
          {(tab, i) => {
            const isActive = createMemo(() => i() === rawDrawerActiveTab());
            return (
              <button
                role="tab"
                aria-selected={isActive()}
                tabIndex={isActive() ? 0 : -1}
                style={`
                  background:${isActive() ? '#fff' : '#ffffff0a'};
                  color:${isActive() ? '#000' : '#888'};
                  border:1px solid ${isActive() ? '#fff' : '#ffffff10'};
                  padding:6px 12px; border-radius:6px;
                  cursor:pointer; font-size:10px; font-weight:800;
                  text-transform:uppercase; letter-spacing:0.5px; transition:0.2s;
                `}
                onClick={() => {
                  selectDrawerTab(i());
                  if (tab.label === 'INITIAL[]') selectTumble(gameState.currentIndex, 'initial');
                  if (tab.label === 'FINAL[]' || tab.label === 'DIFF') selectTumble(gameState.currentIndex, 'final');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    const next = (i() + 1) % rawDrawerTabs.length;
                    selectDrawerTab(next);
                  } else if (e.key === 'ArrowLeft') {
                    const prev = (i() - 1 + rawDrawerTabs.length) % rawDrawerTabs.length;
                    selectDrawerTab(prev);
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
        style="flex:1; overflow-y:auto; padding:12px 0; font-family:'JetBrains Mono',monospace; font-size:10px;"
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
        <Show when={activeTab()} fallback={<span style="color:#888;">// No data selected</span>}>
          <TabContent tab={activeTab()} />
        </Show>
      </div>
    </div>
  );
}

function TabContent({ tab }) {
  const g = game;

  // Matrix view for grid data
  if (['INITIAL[]', 'FINAL[]', 'DIFF'].includes(tab.label)) {
    const isDiff = tab.label === 'DIFF';
    let initialArr = null;
    let finalArr = null;

    if (isDiff) {
      initialArr = rawDrawerTabs.find((t) => t.label === 'INITIAL[]')?.data;
      finalArr = rawDrawerTabs.find((t) => t.label === 'FINAL[]')?.data;
    } else {
      finalArr = tab.data;
    }

    if (Array.isArray(finalArr)) {
      const { rows, cols } = g().grid;
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = c * rows + r;
          cells.push({ i, r, c, val: finalArr[i], changed: isDiff && initialArr && initialArr[i] !== finalArr[i], prevVal: isDiff && initialArr ? initialArr[i] : undefined });
        }
      }

      return (
        <div class="audit-matrix-container">
          <div class="audit-matrix" style="user-select:none; -webkit-user-select:none;">
            <For each={cells}>
              {(cell) => (
                <div class={`audit-matrix-cell ${cell.changed ? 'changed' : ''}`} title={`idx:${cell.i} r${cell.r} c${cell.c}`}>
                  <Show when={cell.changed} fallback={cell.val}>
                    <span style="font-size:7px; opacity:0.6; text-decoration:line-through;">{cell.prevVal}</span>
                    <br />
                    {cell.val}
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div style="font-size:9px; color:#888; margin-bottom:6px; user-select:none;">RAW DATA (COPY-PASTEABLE):</div>
          <pre style="margin:0; font-size:10px; white-space:pre-wrap; color:#ccc;" tabIndex={0}>
            {JSON.stringify(finalArr, null, 2)}
          </pre>
        </div>
      );
    }
  }

  // Diff view
  if (tab.label === 'DIFF' && Array.isArray(tab.data)) {
    return (
      <div>
        <div style="color:#888; margin-bottom:10px;">[</div>
        <For each={tab.data}>
          {(line, idx) => {
            const isLast = idx() === tab.data.length - 1;
            const comma = isLast ? '' : ',';
            if (line.includes('->')) {
              const parts = line.split(', ');
              return (
                <div style="padding-left:20px; white-space:pre; color:#4ade80; font-weight:bold;">
                  {parts[0]}{comma} <span style="color:#444; font-weight:normal; font-size:0.9em;">{parts[1]}</span>
                </div>
              );
            }
            return <div style="padding-left:20px; white-space:pre; color:#9cdcfe;">{line}{comma}</div>;
          }}
        </For>
        <div style="color:#888;">]</div>
      </div>
    );
  }

  // Generic JSON
  return (
    <pre style="margin:0; white-space:pre-wrap; word-break:break-all;" tabIndex={0}>
      {JSON.stringify(tab.data, null, 2)}
    </pre>
  );
}
