import { createMemo, For, Show, createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import { game, symbols } from '../../store/gameStore.js';
import { gameState } from '../../store/sessionStore.js';
import { selectTumble, computeFieldWin, isPayingField } from '../../services/spinService.js';
import { updateSpin } from '../../store/historyStore.js';

const RENDER_LIMIT = 50;

export default function TumbleAudit(props) {
  const spin = () => props.spin;
  const currentIdx = () => gameState.currentIndex;

  const fieldsToRender = createMemo(() => {
    const all = spin().fields || [];
    return spin()._showAllTumbles ? all : all.slice(0, RENDER_LIMIT);
  });

  const hasMore = createMemo(
    () => (spin().fields?.length || 0) > RENDER_LIMIT && !spin()._showAllTumbles,
  );

  const rounds = createMemo(() => {
    const fields = fieldsToRender();
    const metas = spin().fieldMetadata || [];
    const stats = spin().playgroundStats || [];
    const groups = [];
    let currentGroup = null;

    fields.forEach((f, tIdx) => {
      const meta = metas[tIdx] || {};
      const pgIdx = meta.playgroundIndex ?? 0;

      if (!currentGroup || currentGroup.pgIdx !== pgIdx) {
        if (currentGroup) groups.push(currentGroup);
        const s = stats[pgIdx];
        currentGroup = {
          pgIdx,
          headerText: s
            ? s.headerText
            : meta.isFreeSpin
              ? `FreeSpin #${(meta.roundIndex || 0) + 1}`
              : 'BaseSpin',
          statsText: s ? `(${s.tumbleCount} Tumbles, ${s.cascadeCount} Cascades)` : '',
          tumbles: [],
        };
      }
      currentGroup.tumbles.push({ f, tIdx, localIdx: currentGroup.tumbles.length + 1 });
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  });

  function isExpanded(pgIdx) {
    const meta = spin().fieldMetadata?.[currentIdx()];
    return (meta?.playgroundIndex ?? 0) === pgIdx;
  }

  function toggleRound(pgIdx, firstTumbleIdx) {
    if (!isExpanded(pgIdx) && firstTumbleIdx !== -1) {
      selectTumble(firstTumbleIdx, 'initial');
    }
  }

  return (
    <div style="margin-top:10px;">
      <div style="font-size:9px; color:var(--text-muted); font-weight:800; text-transform:uppercase; margin-bottom:6px;">
        Tumble Audit
      </div>

      <For each={rounds()}>
        {(round) => {
          const firstTumbleIdx = (spin().fieldMetadata || []).findIndex(
            (m) => m.playgroundIndex === round.pgIdx,
          );
          const hasCurrent = createMemo(() => round.tumbles.some((t) => t.tIdx === currentIdx()));
          return (
            <div>
              <div
                class="round-header"
                data-round={round.pgIdx}
                style={`cursor:pointer; font-size:10px; color:${hasCurrent() ? '#fff' : 'var(--text-muted)'}; font-weight:800; text-transform:uppercase; margin:12px 0 4px; border-bottom:1px ${hasCurrent() ? 'solid rgba(34,197,94,0.4)' : 'dashed rgba(255,255,255,0.1)'}; padding-bottom:4px; letter-spacing:0.5px; display:flex; align-items:center; user-select:none;`}
                onClick={() => toggleRound(round.pgIdx, firstTumbleIdx)}
              >
                <span>{round.headerText}</span>
                <Show when={round.statsText}>
                  <span style="font-size:9px; opacity:0.7; font-weight:normal; margin-left:auto; margin-right:12px;">
                    {round.statsText}
                  </span>
                </Show>
                <span
                  class="round-toggle-icon"
                  style={`transition:transform 0.2s; transform:${isExpanded(round.pgIdx) ? 'rotate(180deg)' : 'rotate(0deg)'}`}
                >
                  ▼
                </span>
              </div>

              <Show when={isExpanded(round.pgIdx)}>
                <div class="round-content">
                  <For each={round.tumbles}>
                    {({ f, tIdx, localIdx }) => (
                      <TumbleRow
                        f={f}
                        tIdx={tIdx}
                        localIdx={localIdx}
                        isCurrent={tIdx === currentIdx()}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          );
        }}
      </For>

      <Show when={hasMore()}>
        <AutoLoadMoreButton
          count={(spin().fields?.length || 0) - RENDER_LIMIT}
          onLoad={() => updateSpin(spin().num, { _showAllTumbles: true })}
        />
      </Show>
    </div>
  );
}

export function TumbleRow(props) {
  const sym = symbols;
  const g = game;

  function getSymEntry(sid) {
    const entry = sym()[sid];
    if (entry === undefined || entry === null) return { name: sid, emoji: '', color: '#fff' };
    if (typeof entry === 'object') return entry;
    return { name: entry, emoji: '', color: '#fff' };
  }

  const isWinStep = createMemo(() => isPayingField(props.f, g()));
  const hasWinStats = createMemo(() => isWinStep() || (Array.isArray(props.f.symbols?.payouts) && props.f.symbols.payouts.length > 0));
  const effectiveWin = createMemo(() => computeFieldWin(props.f, g()));

  const goldenPositions = createMemo(() => props.f.features?.golden || []);
  const payoutPositions = createMemo(() => {
    const pos = new Set();
    (props.f.symbols.payouts || []).forEach((p) => {
      if (Array.isArray(p.positions)) p.positions.forEach((x) => pos.add(x));
    });
    return pos;
  });

  const wildId = createMemo(() => g().wildSymbolId);
  const initialSyms = createMemo(() => props.f.symbols.initial || props.f.symbols.final || []);

  const winningGolden = createMemo(() => {
    const tally = new Map();
    goldenPositions().forEach((pos) => {
      if (payoutPositions().has(pos)) {
        const sid = initialSyms()[pos];
        tally.set(sid, (tally.get(sid) || 0) + 1);
      }
    });
    return tally;
  });

  const winningWildCount = createMemo(
    () => initialSyms().filter((id, pos) => id === wildId() && payoutPositions().has(pos)).length,
  );

  let rowRef;
  createEffect(() => {
    if (props.isCurrent) {
      const isInitial = !window.hasDoneInitialScroll;
      // const delay = isInitial ? 1 : 1;

      setTimeout(() => {
        if (rowRef) rowRef.scrollIntoView({ behavior: isInitial ? 'auto' : 'smooth', block: 'nearest' });
        window.hasDoneInitialScroll = true;
      }, 1);
    }
  });

  return (
    <div
      ref={rowRef}
      data-tumble={props.tIdx}
      class={`glass ${props.isCurrent ? 'active-tumble-item' : ''}`}
      style={`padding:8px; border-radius:8px; background:${props.isCurrent ? 'rgba(34,197,94,0.12)' : 'transparent'}; border:1px solid ${props.isCurrent ? 'rgba(34,197,94,0.4)' : 'transparent'}; cursor:pointer; margin-top:4px;`}
      aria-pressed={props.isCurrent}
      onClick={(e) => {
        e.stopPropagation();
        selectTumble(props.tIdx, 'initial');
      }}
    >
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span
          class="step-label"
          style={`font-weight:${props.isCurrent ? '900' : '700'}; color:${props.isCurrent ? '#fff' : 'var(--text-muted)'}; font-size:10px;`}
        >
          TUMBLE {props.localIdx}
        </span>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.1;">
            <span
              style={`color:${isWinStep() ? 'var(--success)' : 'var(--text-muted)'}; font-size:10px; font-weight:800;`}
            >
              +{effectiveWin()}
            </span>
          </div>
          <span style="color:var(--bg-accent); font-size:11px; font-weight:800;">
            {props.f.features?.cumulativeMultiplier || 1}x
          </span>
        </div>
      </div>

      {/* Win breakdown */}
      <Show when={hasWinStats()}>
        <div style="margin-top:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:4px;">
          <For each={[...winningGolden().entries()]}>
            {([sid, count]) => (
              <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <span style="color:#fbbf24; font-weight:800; font-size:10px; font-family:monospace;">
                    {getSymEntry(sid).name}
                  </span>
                  <span style="font-size:10px;">{getSymEntry(sid).emoji} 🟡</span>
                </div>
                <div style="font-size:10px; color:var(--text-muted); font-weight:800;">
                  x{count}
                </div>
              </div>
            )}
          </For>

          <Show when={winningWildCount() > 0}>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="color:var(--bg-accent); font-weight:800; font-size:10px; font-family:monospace;">
                  WILD
                </span>
                <span style="font-size:10px;">{getSymEntry(wildId()).emoji}</span>
              </div>
              <div style="font-size:10px; color:var(--text-muted); font-weight:800;">
                x{winningWildCount()}
              </div>
            </div>
          </Show>

          <For each={props.f.symbols.payouts || []}>
            {(p) => {
              const sid =
                p.symbolId !== undefined ? p.symbolId : p.symbol !== undefined ? p.symbol : p.id;
              const { name, emoji, color } = getSymEntry(sid);
              const coins = computeFieldWin(
                { ...props.f, coins: p.coins },
                g(),
              );
              return (
                <div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span
                      style={`color:${color}; font-weight:800; font-size:10px; font-family:monospace;`}
                    >
                      {name}
                    </span>
                    <span style="font-size:10px;">{emoji}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--text-muted); font-size:10px;">
                      x{p.oak || p.count || 0}
                    </span>
                    <span style="color:var(--success); font-weight:800; font-size:10px;">
                      +{parseFloat(coins.toFixed(2))}
                    </span>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function AutoLoadMoreButton(props) {
  let btnRef;

  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        props.onLoad();
      }
    }, { rootMargin: '150px' });
    if (btnRef) observer.observe(btnRef);
    onCleanup(() => observer.disconnect());
  });

  return (
    <button
      ref={btnRef}
      class="btn-ghost load-more-tumbles-btn"
      style="width:100%; margin-top:8px; padding:8px; font-size:10px; border:1px dashed var(--border-color); color:var(--text-muted);"
      onClick={(e) => {
        e.stopPropagation();
        props.onLoad();
      }}
    >
      ⚠️ {props.count} More Tumbles Hidden. Scrolling to load all (May lag UI)
    </button>
  );
}