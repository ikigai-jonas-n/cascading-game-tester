/**
 * GameGrid + GridCell
 *
 * THE performance-critical component.
 * Fine-grained reactivity: when a single cell's win/golden state changes,
 * only that <GridCell> re-renders — no full-grid teardown.
 */
import { createMemo, For, Show } from 'solid-js';
import { game, symbols, emojis, symbolColors } from '../../store/gameStore.js';
import { gameState, showDoubleGrid } from '../../store/sessionStore.js';

function computeCells(symbolList, payouts, goldenSet, g) {
  let { rows, cols } = g?.grid || {};
  const len = symbolList && symbolList.length > 0 ? symbolList.length : 0;
  if (!rows && !cols) {
    rows = 1; cols = 1;
  } else if (!rows) {
    rows = len > 0 ? Math.ceil(len / cols) : 1;
  } else if (!cols) {
    cols = len > 0 ? Math.ceil(len / rows) : 1;
  }
  const winPos = new Set();
  (payouts || []).forEach((p) => {
    if (Array.isArray(p.positions)) p.positions.forEach((pos) => winPos.add(pos));
  });
  const golden = goldenSet || new Set();

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r;
      const id = symbolList[idx];
      cells.push({
        id,
        idx,
        r,
        c,
        isWin: winPos.has(idx),
        isEmpty: id === g.emptySymbolId || id === null,
        isGolden: golden.has(idx),
      });
    }
  }
  return cells;
}

function GridSubPanel({ symbolList, payouts, goldenSet, label, labelId }) {
  const g = game;
  const cells = createMemo(() => computeCells(symbolList(), payouts(), goldenSet(), g()));
  const gridStyle = createMemo(() => {
    let { rows, cols } = g().grid || {};
    const len = symbolList().length;
    if (!rows && !cols) {
      cols = 1;
    } else if (!cols) {
      cols = len > 0 ? Math.ceil(len / rows) : 1;
    }
    return `display:grid; grid-template-columns:repeat(${cols},76px); gap:8px;`;
  });

  return (
    <div class="grid-sub-container" id={labelId}>
      <Show when={label}>
        <div id="grid-final-label" class="grid-sub-label">
          {label}
        </div>
      </Show>
      <div class="grid-inner" style={gridStyle()}>
        <For each={cells()}>{(cell) => <GridCell {...cell} />}</For>
      </div>
    </div>
  );
}

export default function GameGrid() {
  const g = game;
  const idx = () => gameState.currentIndex;
  const phase = () => gameState.currentFramePhase;
  const fields = () => gameState.fields;

  const field = createMemo(() => fields()[idx()]);
  const goldenInitial = createMemo(() => gameState.goldenCandidates[idx()] || new Set());
  const goldenFinal = createMemo(() => gameState.goldenCandidates[idx() + 1] || new Set());

  const showDouble = showDoubleGrid;

  const initialSymbols = createMemo(() => {
    const f = field();
    return f?.symbols?.initial || f?.symbols?.final || [];
  });
  const finalSymbols = createMemo(() => field()?.symbols?.final || []);
  const payouts = createMemo(() => field()?.symbols?.payouts || []);
  const emptyGrid = createMemo(() => {
    let { rows, cols } = g().grid || {};
    const len = initialSymbols().length || finalSymbols().length;
    if (!rows && !cols) {
      rows = 1; cols = 1;
    } else if (!rows) {
      rows = len > 0 ? Math.ceil(len / cols) : 1;
    } else if (!cols) {
      cols = len > 0 ? Math.ceil(len / rows) : 1;
    }
    return new Array(rows * cols).fill(g().emptySymbolId);
  });


  return (
    <div class="grid-area">
      <Show
        when={field()}
        fallback={
          <GridSubPanel
            symbolList={emptyGrid}
            payouts={() => []}
            goldenSet={() => new Set()}
            label={null}
            labelId="grid-container-final"
          />
        }
      >
        <Show
          when={
            showDouble() &&
            initialSymbols().length &&
            finalSymbols().length &&
            !initialSymbols().every((v, i) => v === finalSymbols()[i])
          }
          fallback={
            <GridSubPanel
              symbolList={() => (phase() === 'initial' ? initialSymbols() : finalSymbols())}
              payouts={() => (phase() === 'initial' ? payouts() : [])}
              goldenSet={() => (phase() === 'initial' ? goldenInitial() : goldenFinal())}
              label={null}
              labelId="grid-container-final"
            />
          }
        >
          {/* Double-grid: initial left, final right */}
          <>
            <GridSubPanel
              symbolList={initialSymbols}
              payouts={payouts}
              goldenSet={goldenInitial}
              label="INITIAL"
              labelId="grid-container-initial"
            />
            <GridSubPanel
              symbolList={finalSymbols}
              payouts={() => []}
              goldenSet={goldenFinal}
              label="FINAL"
              labelId="grid-container-final"
            />
          </>
        </Show>
      </Show>

    </div>
  );
}

function GridCell(props) {
  const sym = symbols;
  const emo = emojis;
  const colors = symbolColors;
  const g = game;

  const bg = () => {
    if (props.isWin) return 'rgba(34, 197, 94, 0.3)';
    if (props.isGolden && !props.isWin) return 'rgba(251, 191, 36, 0.15)';
    return props.isEmpty ? '#00000044' : '#ffffff05';
  };

  const border = () => {
    if (props.isGolden) return '#fbbf24';
    if (props.isWin) return '#4ade80';
    return props.isEmpty ? '#ffffff05' : '#ffffff10';
  };

  const shadow = () => (props.isGolden ? '0 0 15px rgba(251, 191, 36, 0.3)' : 'none');

  const nameStr = () => {
    const s = sym();
    return s[props.id] !== undefined ? s[props.id] : props.id;
  };
  const emojiStr = () => emo()[props.id] || '';
  const colorStr = () => colors()[props.id] || '#666';

  function onMouseOver() {
    const insp = document.getElementById('inspector');
    if (!insp) return;
    insp.style.display = 'block';
    document.getElementById('inspSymbol').innerText = props.isEmpty
      ? 'EMPTY'
      : `${emojiStr()} ${nameStr()} (${props.id})`;
    document.getElementById('inspPos').innerText =
      `ID: ${props.idx} | R${props.r} C${props.c}${props.isWin ? ' [WIN]' : ''}`;
  }

  function onMouseOut() {
    const insp = document.getElementById('inspector');
    if (insp) insp.style.display = 'none';
  }

  return (
    <div
      class="grid-cell"
      role="gridcell"
      aria-label={`Row ${props.r + 1} Column ${props.c + 1} ${props.isEmpty ? 'Empty' : nameStr()}${props.isWin ? ' Winning' : ''}${props.isGolden ? ' Golden' : ''}`}
      style={`
        width:76px; height:76px;
        background:${bg()};
        border:1px solid ${border()};
        box-shadow:${shadow()};
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        border-radius:12px; transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
        opacity:${props.isEmpty ? '0.2' : '1'};
      `}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
    >
      <div
        style={`font-size:2.2em; line-height:1; transform:${props.isEmpty ? 'scale(0.5)' : 'scale(1)'}; transition:transform 0.3s;`}
      >
        {emojiStr() || (props.isEmpty ? '' : props.id)}
      </div>
      <Show when={!props.isEmpty}>
        <div
          style={`font-size:8px; color:${props.isGolden ? '#fbbf24' : colorStr()}; font-weight:800; margin-top:4px; letter-spacing:0.5px; opacity:0.6;`}
        >
          {nameStr()}
        </div>
      </Show>
    </div>
  );
}


function isSettleField(field) {
  if (field?.features && 'isSettle' in field.features) return field.features.isSettle === true;
  return true;
}
