import { createSignal, Show } from 'solid-js';
import { mongoRoundImportOpen, setMongoRoundImportOpen, pushToast } from '../../store/uiStore.js';
import { convertMongoRoundToSpins } from '../../services/mongoRoundConverter.js';
import { saveAllSpins, getNextSpinNum } from '../../db.js';
import { prependSpins, rebuildSortedList } from '../../store/historyStore.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:unset;
    height:calc(100vh - 40px);
    background:#0f1318;
    border:1px solid rgba(255,255,255,0.1);
    border-radius:12px;
    display:flex; flex-direction:column;
    overflow:hidden;
    box-shadow:0 24px 80px rgba(0,0,0,0.7);
  `,
  header: `
    display:flex; align-items:center; justify-content:space-between;
    padding:18px 24px 16px;
    border-bottom:1px solid rgba(255,255,255,0.07);
    flex-shrink:0;
    background:rgba(16,185,129,0.04);
  `,
  title: `
    font-size:15px; font-weight:700; color:#e2e8f0;
    letter-spacing:0.03em; margin:0;
    display:flex; align-items:center; gap:8px;
  `,
  badge: `
    font-size:9px; font-weight:700; letter-spacing:0.08em;
    padding:3px 7px; border-radius:4px;
    background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3);
    color:#10b981; text-transform:uppercase;
  `,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `
    flex:1; display:flex; gap:0; overflow:hidden; min-height:0;
  `,
  leftCol: `
    flex:1; display:flex; flex-direction:column; padding:20px 24px;
    gap:12px; overflow:hidden; border-right:1px solid rgba(255,255,255,0.05);
  `,
  rightCol: `
    width:320px; flex-shrink:0; display:flex; flex-direction:column;
    overflow:hidden;
  `,
  colLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.1em;
    text-transform:uppercase; color:#10b981; margin:0;
    flex-shrink:0;
  `,
  textarea: `
    flex:1; min-height:0;
    background:#0d1117; border:1px solid rgba(255,255,255,0.08);
    border-radius:8px; color:#e2e8f0;
    font-size:11px; font-family:'JetBrains Mono',monospace;
    padding:12px; resize:none; outline:none;
    transition:border-color 0.15s;
    line-height:1.6;
  `,
  errorBox: `
    flex-shrink:0;
    background:rgba(244,63,94,0.07); border:1px solid rgba(244,63,94,0.25);
    border-radius:6px; padding:10px 12px;
    color:#fca5a5; font-size:11px; white-space:pre-wrap; line-height:1.5;
  `,
  btnRow: `
    display:flex; gap:8px; flex-shrink:0;
  `,
  btnPreview: `
    flex:1; padding:10px; border-radius:7px; font-size:12px; font-weight:600;
    letter-spacing:0.04em; cursor:pointer;
    background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
    color:#e2e8f0;
    transition:background 0.15s;
  `,
  btnImport: `
    flex:1; padding:10px; border-radius:7px; font-size:12px; font-weight:600;
    letter-spacing:0.04em; cursor:pointer;
    background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.35);
    color:#10b981;
    transition:background 0.15s;
  `,
  previewCard: `
    margin:20px 20px 0;
    background:rgba(16,185,129,0.05);
    border:1px solid rgba(16,185,129,0.2);
    border-radius:8px; padding:14px 16px; flex-shrink:0;
  `,
  previewLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; color:#10b981; margin:0 0 10px;
  `,
  previewRow: `
    display:flex; justify-content:space-between; align-items:center;
    font-size:11px; padding:3px 0;
    border-bottom:1px solid rgba(255,255,255,0.04);
  `,
  schemaArea: `
    flex:1; overflow-y:auto; padding:20px; min-height:0;
  `,
  schemaLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; color:#94a3b8; margin:0 0 10px;
  `,
  schemaPre: `
    font-family:'JetBrains Mono',monospace; font-size:9px;
    color:#475569; white-space:pre-wrap; margin:0; line-height:1.6;
  `,
};

export default function MongoRoundImportModal() {
  const [rawJson, setRawJson] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [importing, setImporting] = createSignal(false);
  const [preview, setPreview] = createSignal(null);

  function close() {
    setMongoRoundImportOpen(false);
    setRawJson('');
    setErrorMsg('');
    setPreview(null);
  }

  function handleParse() {
    setErrorMsg('');
    setPreview(null);
    try {
      const doc = JSON.parse(rawJson());
      const { entries, errors } = convertMongoRoundToSpins(doc, 0);
      if (errors.length) {
        setErrorMsg(errors.join('\n'));
        return;
      }
      setPreview({ doc, count: entries.length, roundId: doc.roundId, status: doc.status });
    } catch (err) {
      setErrorMsg(`Invalid JSON: ${err.message}`);
    }
  }

  async function handleImport() {
    if (!rawJson()) return;
    setErrorMsg('');
    setImporting(true);
    try {
      const doc = JSON.parse(rawJson());
      const startNum = await getNextSpinNum();
      const { entries, errors } = convertMongoRoundToSpins(doc, startNum);
      if (errors.length) {
        setErrorMsg(errors.join('\n'));
        setImporting(false);
        return;
      }
      // Persist all imported spins to IndexedDB in one bulk transaction
      await saveAllSpins(entries);
      prependSpins(entries);
      rebuildSortedList();
      pushToast({
        type: 'success',
        message: `Imported ${entries.length} spin${entries.length > 1 ? 's' : ''} from MongoDB round`,
      });
      close();
    } catch (err) {
      setErrorMsg(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Show when={mongoRoundImportOpen()}>
      <div
        style={S.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          style={S.panel}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          {/* Header */}
          <div style={S.header}>
            <h2 style={S.title}>
              🍃 Import MongoDB Round
              <span style={S.badge}>BSON-aware</span>
            </h2>
            <button
              style={S.closeBtn}
              onClick={close}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#e2e8f0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={S.body}>
            {/* Left: paste + controls */}
            <div style={S.leftCol}>
              <p style={S.colLabel}>Paste MongoDB Round JSON</p>

              <textarea
                style={S.textarea}
                placeholder={`Paste from MongoDB Compass clipboard…\n\n{\n  "_id": { "$oid": "..." },\n  "roundId": "...",\n  "roundEvents": [...]\n}`}
                value={rawJson()}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(16,185,129,0.4)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
                onInput={(e) => {
                  setRawJson(e.target.value);
                  setPreview(null);
                  setErrorMsg('');
                }}
              />

              <Show when={errorMsg()}>
                <div style={S.errorBox}>{errorMsg()}</div>
              </Show>

              <div style={S.btnRow}>
                <button
                  style={S.btnPreview}
                  disabled={!rawJson()}
                  onClick={handleParse}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled)
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                >
                  🔍 Preview
                </button>
                <button
                  style={S.btnImport}
                  disabled={importing() || !rawJson()}
                  onClick={handleImport}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled)
                      e.currentTarget.style.background = 'rgba(16,185,129,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(16,185,129,0.15)';
                  }}
                >
                  {importing() ? '⏳ Importing…' : '📥 Import'}
                </button>
              </div>
            </div>

            {/* Right: preview + schema */}
            <div style={S.rightCol}>
              <Show when={preview()}>
                <div style={S.previewCard}>
                  <p style={S.previewLabel}>Preview</p>
                  <div style={S.previewRow}>
                    <span style="color:#64748b;">Round ID</span>
                    <span style="color:#e2e8f0; font-family:monospace; font-size:10px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      {preview().roundId}
                    </span>
                  </div>
                  <div style={S.previewRow}>
                    <span style="color:#64748b;">Status</span>
                    <span style="color:#10b981; font-weight:600;">{preview().status}</span>
                  </div>
                  <div style={{ ...S.previewRow, borderBottom: 'none' }}>
                    <span style="color:#64748b;">Spins</span>
                    <span style="color:#f59e0b; font-weight:700; font-size:14px;">
                      {preview().count}
                    </span>
                  </div>
                </div>
              </Show>

              <div style={S.schemaArea}>
                <p style={S.schemaLabel}>Schema Reference</p>
                <pre style={S.schemaPre}>{SCHEMA_HINT}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}

const SCHEMA_HINT = `Round {
  roundId: string
  status: string
  gameCode: string
  roundTags?: string[]
  bet: string
  win: string
  playerId: string
  currency: string
  operator: string
  brand: string
  createdAt: Date | { $date: "..." }
  roundEvents: RoundEvent[]
}

RoundEvent {
  status: "progress" | "completed"
  playResult?: {
    step: {
      gamePhases: GamePhase[]
      summary: {
        coins: string
        hasMaxWin: boolean
      }
    }
    meta?: {
      public: {
        betAmount: string
        spinMode: string
      }
    }
    finished: boolean
    choices?: number[]
  }
}

GamePhase {
  type: "regular" | "freeSpin"
  coins: string
  playgrounds: [{
    type: string
    coins: string
    fields: [{
      coins: string
      symbols: {
        initial: number[]
        final: number[]
        payouts: Payout[]
      }
      features: {
        cumulativeMultiplier: number
        isSettle: boolean
        triggerFreeSpin?: boolean
        golden?: number[]
      }
    }]
  }]
}

BSON types auto-normalized:
  $oid → string
  $date → ISO string
  $numberDecimal → float
  $numberLong → number
  $numberInt → number
  $numberDouble → number
  $timestamp → number
  $binary → base64 string`;
