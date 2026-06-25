import { createMemo, Show, For } from 'solid-js';

/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'mr-booms-rocketman',
  gameCode: 'LGS-005',
  isEnabled: true,
  defaultRequestBody: {
    betAmount: 20,
    cashBet: '20',
    currencyDec: 2,
    stakes: [{ type: 'commonGame' }],
    rtpOption: 'RTP_97',
  },

  // 1. Map the crash payload to the generic shape the OS expects
  hooks: {
    extractFields: (data) => {
      return {
        fields: [
          {
            coins: data.meta?.public?.baseGameWin || '0',
            features: {
              cumulativeMultiplier: data.meta?.public?.crashPoint || 1,
            },
          },
        ],
        fieldMetadata: [{ isFreeSpin: false, playgroundIndex: 0, roundIndex: 0 }],
        playgroundStats: [{ tumbleCount: 1, cascadeCount: 1, headerText: 'Crash Flight' }],
        hasBaseSpin: true,
        hasFreeSpin: false,
        playgroundCount: 1,
      };
    },
    computeFieldWin: (field) => parseFloat(field?.coins || 0),
  },

  // 2. Inject Custom UIs to bypass the standard Grid and Audit HTML blocks
  components: {
    GameBoard: (props) => {
      const multiplier = createMemo(() => {
        return props.frameData?.features?.cumulativeMultiplier ?? 1.0;
      });

      const winCoins = createMemo(() => {
        return props.frameData?.coins ?? '0';
      });

      return (
        <div style="padding: 40px; text-align: center; background: rgba(244,63,94,0.1); border: 2px dashed #f43f5e; border-radius: 12px; width: 100%; min-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
          <h2 style="color: #f43f5e; font-size: 24px; margin-bottom: 10px; margin-top: 0; letter-spacing: 1px; font-weight: 800;">
            🚀 CRASH ENGINE
          </h2>
          <div style="font-size: 56px; font-weight: 900; color: #fff; font-family: 'JetBrains Mono', monospace; text-shadow: 0 0 20px rgba(244,63,94,0.4); margin: 20px 0;">
            {Number(multiplier()).toFixed(2)}x
          </div>
          <Show when={parseFloat(winCoins()) > 0}>
            <div style="color: #10b981; font-size: 20px; font-weight: 800; font-family: 'JetBrains Mono', monospace; background: rgba(16,185,129,0.1); display: inline-block; padding: 6px 16px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.2);">
              Payout: {winCoins()} Coins
            </div>
          </Show>
        </div>
      );
    },

    AuditTrail: (props) => {
      const bustPoint = createMemo(() => {
        return props.spin?.maxMultiplier ?? props.spin?.meta?.public?.crashPoint ?? '1.00';
      });

      return (
        <div style="margin-top: 10px; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="font-size: 9px; color: var(--text-muted); font-weight: 800; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
            Flight Audit
          </div>
          <div style="color: #ccc; font-size: 12px; font-family: 'JetBrains Mono', monospace;">
            Bust Point:{' '}
            <strong style="color: #f43f5e; font-weight: 900;">
              {Number(bustPoint()).toFixed(2)}x
            </strong>
          </div>
        </div>
      );
    },
  },
  winCap: 5000,
  betBase: 1,
};
