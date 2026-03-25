```typescript
import React from 'react';

/**
 * The ironclad contract between the Core OS and Game Plugins.
 * Antigravity: DO NOT let the Core OS calculate wins or render grid CSS. 
 * Everything must pass through this interface.
 */
export interface IGamePlugin {
  id: string;      // e.g., 'sexy-fruits'
  name: string;    // e.g., 'Sexy Fruits'

  // --- DATA PIPELINE ---
  /**
   * Replaces main.js `getSpinStats()`.
   * Takes raw RGS payload, returns game-specific metrics.
   */
  parseCustomStats: (rawPayload: any) => Record<string, any>;
  
  /**
   * Takes the output of parseCustomStats and generates string tags 
   * for the Core OS Fuse.js engine (e.g., ["15x Multiplier", "Golden Win"]).
   */
  getSearchableTags: (customStats: any) => string[]; 

  /**
   * Defines timeline vocabulary. Replaces hardcoded "Tumble" strings.
   */
  getStepLabel: (frameData: any) => string;

  // --- UI PIPELINE ---
  ui: {
    /** Replaces main.js createGrid/renderGrid. Full control over the DOM. */
    GameBoard: React.FC<{ frameData: any; playbackState: 'playing' | 'paused' }>;
    
    /** Injected into the Core OS SpinHistoryCard footer. */
    HistoryCardMeta: React.FC<{ customStats: any }>;
    
    /** Replaces the manual HTML string building for tumblesHtml. */
    AuditTrail: React.FC<{ frameData: any }>;

    /** Optional: Replaces default paytable/symbol mappings modal. */
    SymbolMapContent?: React.FC<{}>;

    /** RESTORED: Floating panels over the board (e.g., Captain Jack Jackpot Meter) */
    CustomHUD?: React.FC<{ frameData: any }>;

    /** RESTORED: Extra game-specific panels injected into the Sidebar layout */
    ExtraSidePanel?: React.FC<{ spinData: any }>;
  };

  // --- MOCKING PIPELINE ---
  simulator?: {
    /**
     * Local deterministic RGS generator. Unblocks frontend from backend math.
     */
    simulateSpin: (betAmount: number, overrides?: any) => any; 
  };
}
```