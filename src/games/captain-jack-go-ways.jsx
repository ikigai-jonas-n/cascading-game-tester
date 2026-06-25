import { createMemo, Show, For } from 'solid-js';

/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'captain-jack-go-ways',
  gameCode: 'LGS-007',
  isEnabled: true,
  defaultRequestBody: {
    betAmount: 20,
    cashBet: '20',
    currencyDec: 2,
    stakes: [{ type: 'commonGame' }],
    rtpOption: 'RTP_97',
  },
  hooks: {
    computeFieldWin(field) {
      if (!field || !field.symbols || !field.symbols.payouts) return 0;
      return field.symbols.payouts.reduce(
        (acc, p) => acc + parseFloat(p.payoutCoins || p.coins || 0),
        0,
      );
    },
  },

  // Custom GameBoard specifically for Go-Ways dynamic grids
  components: {
    GameBoard: (props) => {
      // Get the 1D array sent by OutputBuilder
      const symbols = createMemo(() =>
        props.phase === 'initial'
          ? props.frameData?.symbols?.initial || props.frameData?.symbols?.final || []
          : props.frameData?.symbols?.final || [],
      );

      const features = createMemo(() => props.frameData?.features || {});
      const payouts = createMemo(() => props.field?.symbols?.payouts || []);

      // Parse backend's `winPositions` array
      const winPositions = createMemo(() => {
        const pos = new Set();
        payouts().forEach((p) => {
          if (Array.isArray(p.winPositions)) p.winPositions.forEach((x) => pos.add(x));
          if (Array.isArray(p.positions)) p.positions.forEach((x) => pos.add(x));
        });
        return pos;
      });

      return (
        <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%;">
          {/* Custom Feature UI for Go-Ways */}
          <div style="display: flex; gap: 12px;">
            <Show when={features().wildMultiplier?.length > 0}>
              <div style="background: rgba(245,158,11,0.2); border: 1px solid #f59e0b; padding: 8px 16px; border-radius: 8px; color: #f59e0b; font-weight: bold;">
                Wild Multipliers: {features().wildMultiplier.join(', ')}x
              </div>
            </Show>
            <Show when={features().pirateEvent}>
              <div style="background: rgba(244,63,94,0.2); border: 1px solid #f43f5e; padding: 8px 16px; border-radius: 8px; color: #f43f5e; font-weight: bold;">
                🏴‍☠️ Pirate Event Triggered!
              </div>
            </Show>
          </div>

          {/* Dynamic Grid: Flex wrapping adapts automatically to changing symbol counts per reel */}
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 600px; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 0 20px rgba(0,0,0,0.5);">
            <For each={symbols()}>
              {(symId, i) => {
                const isWin = winPositions().has(i());
                return (
                  <div
                    style={`
                    width: 70px; height: 70px;
                    background: ${isWin ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.05)'};
                    border: 1px solid ${isWin ? '#4ade80' : 'rgba(255,255,255,0.1)'};
                    box-shadow: ${isWin ? '0 0 15px rgba(34,197,94,0.4)' : 'none'};
                    border-radius: 12px; display: flex; align-items: center; justify-content: center;
                    font-size: 28px; font-weight: 900; transition: all 0.2s;
                  `}
                  >
                    {symId}
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      );
    },
  },
  winCap: 10000,
};
