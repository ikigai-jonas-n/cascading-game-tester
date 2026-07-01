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
 *             running grid total (cumulative). features = { livesAfter, coins,
 *             modifier? } where `coins` is a 20-cell COLUMN-FIRST value array (-1 =
 *             empty, else the coin value; tier is derived by threshold). `modifier`
 *             is present only when one fired: { kind:'multiplier', multiplier, target,
 *             valueAfter } | { kind:'collector', multiplier:-1, target, valueAfter }.
 *             Payouts appear only on the FINAL tumble: one aggregate { oak:-1,
 *             positions:[all coin indices], coins: phase win }.
 *
 * INDEXING (both boards): flat arrays are COLUMN-FIRST. index = col * rows + row,
 * so col 0 occupies indices 0..rows-1. To map an index back to a cell:
 *   col = Math.floor(index / rows);  row = index % rows.
 * Every flat index (symbols.final, features.coins, modifier.target, payouts.positions)
 * uses this same convention.
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

// Unified symbol map: one entry per id carrying { name, emoji, color }. The store
// (gameStore.js) derives the legacy emoji/color maps from this, so games no longer
// declare separate SYMBOLS / EMOJI / colors objects.
const SYMBOLS = {
  0: { name: 'Wild', emoji: '🃏', color: '#9e9e9e' }, // unused by Olympus, kept for registry shape
  1: { name: 'Diamond', emoji: '💎', color: '#26c6da' }, // Cyan
  2: { name: 'Seven', emoji: '7️⃣', color: '#ef5350' }, // Red
  3: { name: 'Bell', emoji: '🔔', color: '#fbc02d' }, // Gold
  4: { name: 'Grape', emoji: '🍇', color: '#ab47bc' }, // Purple
  5: { name: 'Lemon', emoji: '🍋', color: '#ffeb3b' }, // Yellow
  6: { name: 'Diamond x2', emoji: '💎²', color: '#0097a7' }, // Deep Cyan
  7: { name: 'Seven x2', emoji: '7️⃣²', color: '#c62828' }, // Deep Red
  8: { name: 'Bell x2', emoji: '🔔²', color: '#f9a825' }, // Amber
  9: { name: 'Grape x2', emoji: '🍇²', color: '#6a1b9a' }, // Deep Purple
  10: { name: 'Lemon x2', emoji: '🍋²', color: '#c0ca33' }, // Lime
  11: { name: 'Scatter', emoji: '⭐', color: '#fbbf24' }, // Yellow Gold
  12: { name: 'Super Scatter', emoji: '🌟', color: '#f59e0b' }, // Orange
  50: { name: 'Multiplier', emoji: '✖️', color: '#ef5350' }, // Red
  100: { name: 'Coin', emoji: '🪙', color: '#ffd700' }, // single coin id; tier derived from value
  '-1': { name: 'Empty', emoji: '', color: '#444444' }, // Dark Grey
};

const TIER_COLOR = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
};

const TIER_EMOJI = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
};

// features.coins carries only the value; the client derives the tier by threshold
// (silver >= 10, gold >= 50, else bronze).
const EMPTY_CELL = -1;
const tierOf = (value) => (value >= 50 ? 'gold' : value >= 10 ? 'silver' : 'bronze');

// Human summary of the backend's modifier decision. Empty modifiers are omitted from
// features entirely, so `mod` is undefined when nothing fired.
function modifierSummary(mod) {
  if (!mod) return '— no modifier';
  if (mod.kind === 'multiplier') {
    return `✖️ ×${mod.multiplier} on cell ${mod.target} → ${mod.valueAfter}`;
  }
  if (mod.kind === 'collector') {
    return `🧲 Collector → cell ${mod.target} = ${mod.valueAfter}`;
  }
  return mod.kind;
}

const cellEmoji = (id) => SYMBOLS[id]?.emoji ?? String(id ?? '');

function Cell(props) {
  return (
    <div
      style={`width:64px;height:64px;display:flex;align-items:center;justify-content:center;
        font-size:26px;border-radius:12px;transition:all .15s;
        background:${props.win ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.05)'};
        border:1px solid ${props.win ? '#4ade80' : 'rgba(255,255,255,0.1)'};
        box-shadow:${props.win ? '0 0 14px rgba(34,197,94,0.4)' : 'none'};`}
      title={SYMBOLS[props.id]?.name ?? String(props.id)}
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
  // props.value: coin value or -1 (empty) ; props.isTarget: boolean
  const has = () => props.value > EMPTY_CELL;
  const tier = () => tierOf(props.value);
  const tierColor = () => (has() ? TIER_COLOR[tier()] : 'rgba(255,255,255,0.1)');
  const border = () => (props.isTarget ? '#ffffff' : has() ? tierColor() : 'rgba(255,255,255,0.1)');
  return (
    <div
      style={`width:64px;height:64px;display:flex;flex-direction:column;align-items:center;
        justify-content:center;border-radius:12px;transition:all .15s;
        background:${has() ? `${tierColor()}22` : 'rgba(255,255,255,0.04)'};
        border:2px solid ${border()};
        box-shadow:${props.isTarget ? '0 0 16px rgba(255,255,255,0.6)' : 'none'};`}
      title={has() ? `${tier()} coin: ${props.value}` : 'empty'}
    >
      <Show when={has()}>
        <span style={`font-size:18px;`}>{TIER_EMOJI[tier()]}</span>
        <span style={`font-size:13px;font-weight:900;color:${tierColor()};`}>{props.value}</span>
      </Show>
    </div>
  );
}

function BonusBoard(props) {
  const lives = createMemo(() => props.features.livesAfter ?? 0);
  const mod = createMemo(() => props.features.modifier); // undefined when empty
  // features.coins is a full 20-cell value array (column-first, -1 = empty).
  const coinValues = createMemo(() => props.features.coins || []);
  const targetIndex = createMemo(() => (mod() && 'target' in mod() ? mod().target : -1));

  return (
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
      <div style="display:flex;align-items:center;gap:18px;">
        <div style="font-size:20px;" title="Lives">
          {'❤️'.repeat(lives())}
          {'🖤'.repeat(Math.max(0, 3 - lives()))}
        </div>
        <Badge color={mod() ? '#f59e0b' : '#64748b'}>{modifierSummary(mod())}</Badge>
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
              <BonusCoinCell
                value={coinValues()[index] ?? EMPTY_CELL}
                isTarget={index === targetIndex()}
              />
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

  symbols: SYMBOLS, // unified { name, emoji, color }; store derives legacy emoji/color maps

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
    // Base line win comes from the payout (bet-scaled). The bonus aggregate payout
    // (oak === -1) carries the RAW grid total, not the bet-scaled win, so it is skipped
    // here — the headline round win comes from summary.coins.
    computeFieldWin(field) {
      const payouts = field?.symbols?.payouts || [];
      if (payouts.length === 0) return 0;
      if (payouts.some((p) => p.oak === -1)) return 0; // bonus settles via summary.coins
      return payouts.reduce((acc, p) => acc + parseFloat(p.coins ?? p.payoutCoins ?? 0), 0);
    },
  },

  components: { GameBoard },
};
