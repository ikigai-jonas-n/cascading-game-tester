# Sexy Fruits Test Config Design

This document details the payload structure for the `/v1/test/test-config` API for Sexy Fruits (LGS-008). 
The game screen is 5x5, so exactly 25 symbols are expected when providing exact screen arrays.

```text
Test Config
│
├─ gameCode: string (LGS-008)           ← REQUIRED: Game Code for Test Config
│
├─ configId: string                     ← REQUIRED: Test Config ID
│
└─ config: {                            ← REQUIRED: Test configuration content
    ├─ baseSpin?: SpinConfig            ← Optional: Base game spin
    │  ├─ screens?: Screen[]            ← Optional: Array of exact 5x5 screens for tumbling sequence
    │  ├─ initialScreen?: {
    │  │  ├─ screen?: Screen            ← Optional: Exact 5x5 screen placement
    │  │  ├─ symbols?: SymbolConfig[]   ← Optional: Loose symbol placement by count
    │  │  └─ clusterCount?: number      ← Optional: Cluster count constraint
    │  │  }
    │  ├─ tumbleCount?: number          ← Optional: Force N tumbles (multiplier growths)
    │  └─ cascadeCount?: number         ← Optional: Force N cascades (complete winning cycles)
    │
    └─ freeSpin?: {                     ← Optional: Free spin configuration
        ├─ freeSpinNumber?: number      ← Optional: Force total free spins (incl retriggers)
        └─ freeSpinConfigs?: SpinConfig[] ← Optional: SpinConfig for each free spin index
    }
}

Screen = GameSymbolStringEnum[25]
SymbolConfig = { symbol: GameSymbolStringEnum, count: number }
```

## JSON Payload Cases

Below are the JSON payloads covering all supported cheat tool cases. You can use these directly with the API.

### 1. Rigid Screen (Exact Placement)
Replicates a perfect 25-symbol screen with 3 Scatters at the beginning.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "initialScreen": {
        "screen": [
          "SCATTER", "SCATTER", "SCATTER", "H1_Watermelon", "H1_Watermelon",
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon",
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon",
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon",
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon"
        ]
      }
    }
  }
}
```

### 2. Loose Symbols (Count-based Placement)
Ensures exactly 3 Scatters are present in the initial screen, placed randomly.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "initialScreen": {
        "symbols": [
          { "symbol": "SCATTER", "count": 3 }
        ]
      }
    }
  }
}
```

### 3. Tumble / Cascade Control (Multiplier 2)
Forces exactly 2 Tumbles (Initial + 1 Growth = Multiplier 2) within a single Cascade.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "tumbleCount": 2,
      "cascadeCount": 1
    }
  }
}
```

### 4. Cascade Force (2 winning cycles)
Forces exactly 2 Cascades (two complete winning cycles from start to finish).
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "cascadeCount": 2
    }
  }
}
```

### 5. Multiplier Verification (Multiplier 3)
Forces 3 Tumbles (Initial + 2 Growths) to reach Multiplier 3 in a single Cascade.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "tumbleCount": 3,
      "cascadeCount": 1
    }
  }
}
```

### 6. Golden Symbol Transformation
Forces a rigid screen with 5 Golden J symbols to verify they transform into Wilds upon popping.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "initialScreen": {
        "screen": [
          "L4_J*", "L4_J*", "L4_J*", "L4_J*", "L4_J*",
          "L4_J", "L4_J", "L4_J", "L4_J", "L4_J",
          "L4_J", "L4_J", "L4_J", "L4_J", "L4_J",
          "L4_J", "L4_J", "L4_J", "L4_J", "L4_J",
          "L4_J", "L4_J", "L4_J", "L4_J", "L4_J"
        ]
      },
      "cascadeCount": 1
    }
  }
}
```

### 7. Free Spin Sequence & Retriggers (Total 15 Spins)
Forces the total number of Free Spins to be 15 (e.g. Initial 10 + 1 Retrigger of 5).
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "freeSpin": {
      "freeSpinNumber": 15
    }
  }
}
```

### 8. Free Spin Specific Outcomes (Force Multiplier 3 on Spin 1)
Forces a specific outcome (Multiplier 3) for the first Free Spin, letting subsequent spins fall back to normal probability.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "freeSpin": {
      "freeSpinConfigs": [
        { "tumbleCount": 3, "cascadeCount": 1 }
      ]
    }
  }
}
```

### 9. Screens Array (Exact Cascade Sequence)
Forces an exact sequence of screens. The game will play out these screens exactly as provided for the tumbling sequence.
```json
{
  "gameCode": "LGS-008",
  "configId": "QARealGameOperator:QARealGameBrand:jonas0n",
  "config": {
    "baseSpin": {
      "screens": [
        [
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon",
          "L1_A", "L2_K", "L3_Q", "L4_J", "H2_Grapes",
          "L2_K", "L3_Q", "L4_J", "H2_Grapes", "L1_A",
          "L3_Q", "L4_J", "H2_Grapes", "L1_A", "L2_K",
          "L4_J", "H2_Grapes", "L1_A", "L2_K", "L3_Q"
        ],
        [
          "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon", "H1_Watermelon",
          "H2_Grapes", "L1_A", "L2_K", "L3_Q", "L4_J",
          "L1_A", "L2_K", "L3_Q", "L4_J", "H2_Grapes",
          "L2_K", "L3_Q", "L4_J", "H2_Grapes", "L1_A",
          "L3_Q", "L4_J", "H2_Grapes", "L1_A", "L2_K"
        ],
        [
          "H3_Banana", "H3_Banana", "H3_Banana", "H3_Banana", "H3_Banana",
          "H2_Grapes", "L1_A", "L2_K", "L3_Q", "L4_J",
          "L1_A", "L2_K", "L3_Q", "L4_J", "H2_Grapes",
          "L2_K", "L3_Q", "L4_J", "H2_Grapes", "L1_A",
          "L3_Q", "L4_J", "H2_Grapes", "L1_A", "L2_K"
        ]
      ]
    }
  }
}
```
