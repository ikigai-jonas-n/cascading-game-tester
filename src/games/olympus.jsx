import { createMemo, Show, For, Index } from 'solid-js';

/**
 * Let's Go! Olympus (LGS-020).
 *
 * Two very different boards in one round, so we use a custom GameBoard and branch
 * on the field shape (the response shape differs per phase too):
 *   - BASE  : 4 cells = reels 1-3 (single fixed line) + the modifier reel (reel 4).
 *             field.symbols.payouts holds the line win; features = { multiplier,
 *             triggerFreeSpin }.
 *   - BONUS : 20 cells = the 5x4 sticky Divine Coin Collect grid. field.coins =
 *             running grid total (cumulative); payouts list each coin (tier ordinal
 *             + value + position); features = { livesAfter, newCoins[], coins[]
 *             (per-cell {index,value,tier,isNew}), modifier } where modifier is the
 *             backend's decision { kind, target, beforeValue, afterValue, ... }.
 *
 * TWO-REQUEST flow: when the base spin triggers the bonus, the base response comes
 * back with features.triggerFreeSpin=true, finished:false, choices:[1], and the
 * seeded golden-coin count in meta.private.seedGoldenCoins. The tester's choice
 * loop then fires a SECOND /play with choice:1, echoing the prior meta.private, and
 * the backend returns the freeSpin phase. The two responses' fields are stitched
 * into one frame sequence — base field (4 cells) then each bonus field (20 cells).
 */

const BONUS_COLS = 5;
const BONUS_ROWS = 4;
const BASE_CELLS = 4; // 3 main reels + modifier reel

const SYMBOLS = {
  0: 'Wild', // unused by Olympus, kept for registry shape
  1: 'Diamond',
  2: 'Seven',
  3: 'Bell',
  4: 'Grape',
  5: 'Lemon',
  6: 'Diamond x2',
  7: 'Seven x2',
  8: 'Bell x2',
  9: 'Grape x2',
  10: 'Lemon x2',
  11: 'Scatter',
  12: 'Super Scatter',
  50: 'Multiplier',
  100: 'Bronze Coin',
  101: 'Silver Coin',
  102: 'Gold Coin',
  '-1': 'Empty',
};

const EMOJI = {
  1: '💎',
  2: '7️⃣',
  3: '🔔',
  4: '🍇',
  5: '🍋',
  6: '💎²',
  7: '7️⃣²',
  8: '🔔²',
  9: '🍇²',
  10: '🍋²',
  11: '⭐',
  12: '🌟',
  50: '✖️',
  100: '🥉',
  101: '🥈',
  102: '🥇',
  '-1': '',
};

const TIER_COLOR = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
};

// Human summary of the backend's modifier decision (target coin + before/after).
function modifierSummary(mod) {
  if (!mod || mod.kind === 'empty') return '— no modifier';
  if (mod.kind === 'multiplier') {
    return `✖️ ×${mod.value} on cell ${mod.target}: ${mod.beforeValue} → ${mod.afterValue}`;
  }
  if (mod.kind === 'collector') {
    return `🧲 Collector → cell ${mod.target}: absorbed ${mod.absorbed.length} (= ${mod.afterValue})`;
  }
  return mod.kind;
}

const cellEmoji = (id) => EMOJI[id] ?? String(id ?? '');

function Cell(props) {
  return (
    <div
      style={`width:64px;height:64px;display:flex;align-items:center;justify-content:center;
        font-size:26px;border-radius:12px;transition:all .15s;
        background:${props.win ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.05)'};
        border:1px solid ${props.win ? '#4ade80' : 'rgba(255,255,255,0.1)'};
        box-shadow:${props.win ? '0 0 14px rgba(34,197,94,0.4)' : 'none'};`}
      title={SYMBOLS[props.id] ?? String(props.id)}
    >
      {cellEmoji(props.id)}
    </div>
  );
}

function BaseBoard(props) {
  const main = createMemo(() => props.final.slice(0, 3));
  const modifier = createMemo(() => props.final[3]);
  const hasLineWin = createMemo(() => (props.frameData?.symbols?.payouts || []).length > 0);

  return (
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
      <div style="display:flex;align-items:center;gap:16px;">
        {/* Reels 1-3: the single fixed line */}
        <div style="display:flex;gap:8px;padding:14px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
          <Index each={main()}>{(id) => <Cell id={id()} win={hasLineWin()} />}</Index>
        </div>
        <div style="color:var(--text-muted);font-size:18px;">+</div>
        {/* Reel 4: the modifier reel */}
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <Cell id={modifier()} win={false} />
          <span style="font-size:10px;color:var(--text-muted);">Modifier</span>
        </div>
      </div>

      <div style="display:flex;gap:10px;min-height:24px;">
        <Show when={props.features.multiplier > 1}>
          <Badge color="#f59e0b">×{props.features.multiplier} Multiplier</Badge>
        </Show>
        <Show when={props.features.triggerFreeSpin}>
          <Badge color="#a855f7">🏛️ Bonus Triggered → Free Game</Badge>
        </Show>
      </div>
    </div>
  );
}

function BonusCoinCell(props) {
  // props.coin: { value, tier, isNew } | undefined ; props.isTarget: boolean
  const coin = () => props.coin;
  const tierColor = () => (coin() ? TIER_COLOR[coin().tier] : 'rgba(255,255,255,0.1)');
  const border = () =>
    props.isTarget
      ? '#ffffff'
      : coin()?.isNew
        ? '#4ade80'
        : coin()
          ? tierColor()
          : 'rgba(255,255,255,0.1)';
  return (
    <div
      style={`width:64px;height:64px;display:flex;flex-direction:column;align-items:center;
        justify-content:center;border-radius:12px;transition:all .15s;
        background:${coin() ? `${tierColor()}22` : 'rgba(255,255,255,0.04)'};
        border:2px solid ${border()};
        box-shadow:${props.isTarget ? '0 0 16px rgba(255,255,255,0.6)' : coin()?.isNew ? '0 0 12px rgba(34,197,94,0.5)' : 'none'};`}
      title={coin() ? `${coin().tier} coin: ${coin().value}` : 'empty'}
    >
      <Show when={coin()}>
        <span style={`font-size:18px;`}>{cellEmoji(coin().ordinal)}</span>
        <span style={`font-size:13px;font-weight:900;color:${tierColor()};`}>{coin().value}</span>
      </Show>
    </div>
  );
}

function BonusBoard(props) {
  const lives = createMemo(() => props.features.livesAfter ?? 0);
  const mod = createMemo(() => props.features.modifier || { kind: 'empty' });
  const coinByIndex = createMemo(() => {
    const m = new Map();
    (props.features.coins || []).forEach((c) => m.set(c.index, c));
    return m;
  });
  const targetIndex = createMemo(() => ('target' in mod() ? mod().target : -1));

  return (
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
      <div style="display:flex;align-items:center;gap:18px;">
        <div style="font-size:20px;" title="Lives">
          {'❤️'.repeat(lives())}
          {'🖤'.repeat(Math.max(0, 3 - lives()))}
        </div>
        <Badge color={mod().kind === 'empty' ? '#64748b' : '#f59e0b'}>
          {modifierSummary(mod())}
        </Badge>
      </div>

      <div
        style={`display:grid;grid-template-columns:repeat(${BONUS_COLS},64px);gap:8px;
          padding:16px;border-radius:16px;background:rgba(255,255,255,0.02);
          border:1px solid rgba(255,255,255,0.06);box-shadow:inset 0 0 20px rgba(0,0,0,0.5);`}
      >
        {/* Render row-major for display, indexing the column-major flat array. */}
        <For each={Array.from({ length: BONUS_ROWS * BONUS_COLS })}>
          {(_, i) => {
            const row = Math.floor(i() / BONUS_COLS);
            const col = i() % BONUS_COLS;
            const index = col * BONUS_ROWS + row;
            return (
              <BonusCoinCell coin={coinByIndex().get(index)} isTarget={index === targetIndex()} />
            );
          }}
        </For>
      </div>

      <div style="color:var(--text-muted);font-size:12px;">
        Grid total: <b style="color:var(--text-primary);">{props.frameData?.coins ?? '0'}</b>
      </div>
    </div>
  );
}

function Badge(props) {
  return (
    <div
      style={`background:${props.color}22;border:1px solid ${props.color};color:${props.color};
        padding:6px 14px;border-radius:8px;font-weight:bold;font-size:12px;`}
    >
      {props.children}
    </div>
  );
}

function GameBoard(props) {
  const final = createMemo(() => props.frameData?.symbols?.final || []);
  const features = createMemo(() => props.frameData?.features || {});
  const isBonus = createMemo(() => final().length > BASE_CELLS);

  return (
    <div style="width:100%;display:flex;justify-content:center;padding:8px;">
      <Show
        when={isBonus()}
        fallback={<BaseBoard final={final()} features={features()} frameData={props.frameData} />}
      >
        <BonusBoard final={final()} features={features()} frameData={props.frameData} />
      </Show>
    </div>
  );
}

/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'olympus',
  name: "Let's Go! Olympus",
  gameCode: 'LGS-020',
  isEnabled: true,

  grid: { rows: BONUS_ROWS, cols: BONUS_COLS }, // bonus shape; base is handled by the custom board
  emptySymbolId: -1,
  scatterSymbolId: 11,
  wildSymbolId: 0, // Olympus has no wild; kept for registry shape only

  symbols: SYMBOLS,
  emojis: EMOJI,
  colors: {
    11: '#fbbf24',
    12: '#f59e0b',
    50: '#f59e0b',
    100: '#cd7f32',
    101: '#c0c0c0',
    102: '#ffd700',
  },

  defaultRequestBody: {
    betAmount: 20,
    cashBet: '20',
    currencyDec: 2,
    stakes: [{ type: 'commonGame' }],
    rtpOption: 'RTP_97',
  },

  winCategories: {},
  winCap: 5000,

  hooks: {
    // Base line win comes from payouts. Bonus fields carry a CUMULATIVE grid total,
    // so they contribute 0 here (the headline round win uses summary.coins, which
    // already includes the bonus) — this avoids double-counting the running total.
    computeFieldWin(field) {
      const payouts = field?.symbols?.payouts || [];
      if (payouts.length === 0) return 0;
      return payouts.reduce((acc, p) => acc + parseFloat(p.coins ?? p.payoutCoins ?? 0), 0);
    },
  },

  components: { GameBoard },
};
