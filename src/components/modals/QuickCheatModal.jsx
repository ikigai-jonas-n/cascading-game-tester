import { createSignal, Show, createMemo, createEffect } from 'solid-js';
import {
  quickCheatOpen,
  setQuickCheatOpen,
  apiUrl,
  playerId,
  showLoading,
  hideLoading,
} from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';
import { allCheatTemplates, loadCheatTemplates } from '../features/cheatTemplateStore.js';

const S = {
  overlay: `
    position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center;
  `,
  panel: `
    width:calc(100vw - 40px); max-width:680px;
    height:calc(100vh - 40px); max-height:860px;
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
    background:rgba(245,158,11,0.04);
  `,
  title: `
    font-size:15px; font-weight:700; color:#e2e8f0;
    letter-spacing:0.03em; margin:0;
  `,
  closeBtn: `
    width:32px; height:32px; border-radius:6px;
    background:transparent; border:1px solid rgba(255,255,255,0.1);
    color:#94a3b8; font-size:18px; line-height:1;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.15s, color 0.15s;
  `,
  body: `
    flex:1; display:flex; flex-direction:column; overflow-y:auto; padding:0; min-height:0;
  `,
  section: `
    padding:20px 24px;
    border-bottom:1px solid rgba(255,255,255,0.05);
  `,
  sectionLabel: `
    font-size:10px; font-weight:700; letter-spacing:0.1em;
    text-transform:uppercase; color:#f59e0b; margin:0 0 12px;
  `,
  select: `
    width:100%; box-sizing:border-box;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:12px; padding:9px 12px;
    outline:none; cursor:pointer;
  `,
  textarea: `
    width:100%; box-sizing:border-box; flex:1; min-height:150px;
    background:#1a1f2e; border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:#e2e8f0;
    font-size:11px; font-family:'JetBrains Mono',monospace;
    padding:10px 12px; resize:none;
    outline:none; transition:border-color 0.15s;
  `,
  primaryBtn: `
    font-size:12px; font-weight:600; letter-spacing:0.04em;
    padding:10px 16px; border-radius:6px;
    background:rgba(245,158,11,0.15);
    border:1px solid rgba(245,158,11,0.3);
    color:#f59e0b; cursor:pointer; flex:1;
    transition:background 0.15s;
  `,
  dangerBtn: `
    font-size:12px; font-weight:600; letter-spacing:0.04em;
    padding:10px 16px; border-radius:6px;
    background:rgba(244,63,94,0.08);
    border:1px solid rgba(244,63,94,0.3);
    color:#f43f5e; cursor:pointer; flex:1;
    transition:background 0.15s;
  `
};

export default function QuickCheatModal() {
  const [cheatJson, setCheatJson] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [selectedTemplate, setSelectedTemplate] = createSignal('');
  const [templateDesc, setTemplateDesc] = createSignal('');

  const templates = createMemo(() => allCheatTemplates()[game().id] || []);

  function buildDefaultJson() {
    return JSON.stringify(
      {
        config: {
          baseSpin: {
            initialScreen: { clusterCount: 5, symbols: [{ symbol: 'WILD', count: 10 }] },
            cascadeCount: 6,
            tumbleCount: 20,
          },
        },
      },
      null,
      2,
    );
  }

  createEffect(() => {
    if (quickCheatOpen()) {
      loadCheatTemplates();
      setErrorMsg('');
      setSelectedTemplate('');
      setTemplateDesc('');
      const saved = localStorage.getItem('test_config');
      setCheatJson(saved || buildDefaultJson());
    }
  });

  function close() {
    setQuickCheatOpen(false);
  }

  function handleTemplateChange(idx) {
    setSelectedTemplate(idx);
    if (idx === '') {
      setTemplateDesc('');
      return;
    }
    const t = templates()[parseInt(idx)];
    if (!t) return;
    setTemplateDesc(t.description || '');
    try {
      const parsed = JSON.parse(t.json);
      setCheatJson(JSON.stringify(parsed, null, 2));
      setErrorMsg('');
    } catch {
      setCheatJson(t.json);
    }
  }

  async function handleSend() {
    setErrorMsg('');
    try {
      const parsed = JSON.parse(cheatJson());
      parsed.configId = playerId();
      parsed.gameCode = game().gameCode;

      setSending(true);
      const response = await fetch(`${apiUrl()}/v1/test/test-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'rgs-local-signature',
          accept: '*/*',
        },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(10000),
      });

      const text = await response.text();
      let result = {};
      try {
        result = JSON.parse(text);
      } catch {}
      setSending(false);

      if (response.ok && !result.error && !result.errors) {
        showLoading('Cheat Sent successfully! ✅');
        localStorage.setItem('test_config', cheatJson());
        setTimeout(hideLoading, 2000);
        close();
      } else {
        setErrorMsg(
          `Failed: ${result.error?.message || result.message || text || response.statusText}`,
        );
      }
    } catch (err) {
      setSending(false);
      setErrorMsg(`Invalid JSON or Request Error: ${err.message}`);
    }
  }

  async function handleClear() {
    const params = new URLSearchParams({
      gameCode: game().gameCode,
      configId: playerId(),
      playerId: playerId(),
    });
    try {
      showLoading('Clearing config...');
      const response = await fetch(`${apiUrl()}/v1/test/test-config?${params}`, {
        method: 'DELETE',
        headers: { accept: '*/*', 'x-signature': 'rgs-local-signature' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      localStorage.removeItem('test_config');
      setSelectedTemplate('');
      setTemplateDesc('');
      setErrorMsg('');
      showLoading('Config cleared ✅');
      setTimeout(hideLoading, 1500);
    } catch (err) {
      hideLoading();
      setErrorMsg(`Clear failed: ${err.message}`);
    }
  }

  return (
    <Show when={quickCheatOpen()}>
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
            <h2 style={S.title}>⚡ Quick Cheat Config</h2>
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
            <Show when={templates().length > 0}>
              <div style={S.section}>
                <p style={S.sectionLabel}>Template</p>
                <select
                  id="cheatTemplateSelect"
                  style={S.select}
                  value={selectedTemplate()}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                >
                  <option value="">-- Select a Template --</option>
                  {templates().map((t, i) => (
                    <option value={i}>{t.title}</option>
                  ))}
                </select>
                <Show when={templateDesc()}>
                  <div style="font-size:10px; color:var(--text-muted); margin-top:8px;">
                    {templateDesc()}
                  </div>
                </Show>
              </div>
            </Show>

            <div style={{...S.section, "flex": "1", "display": "flex", "flex-direction": "column", "min-height": "0", "padding-bottom": "12px"}}>
              <p style={S.sectionLabel}>Test Config JSON</p>
              <textarea
                id="quickTestConfigInput"
                style={S.textarea}
                value={cheatJson()}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
                onInput={(e) => setCheatJson(e.target.value)}
              />
            </div>

            <Show when={errorMsg()}>
              <div style="margin: 0 24px; color:var(--error); font-size:11px; padding:10px; background:rgba(244,63,94,0.1); border-radius:6px; border:1px solid rgba(244,63,94,0.3);">
                {errorMsg()}
              </div>
            </Show>

            <div style={{...S.section, "display": "flex", "gap": "12px", "border-bottom": "none", "padding-top": errorMsg() ? "12px" : "20px"}}>
              <button
                style={S.primaryBtn}
                disabled={sending()}
                onClick={handleSend}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(245,158,11,0.15)';
                }}
              >
                {sending() ? 'SENDING...' : '⚡ SEND CHEAT CONFIG'}
              </button>
              <button
                style={S.dangerBtn}
                onClick={handleClear}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(244,63,94,0.08)';
                }}
              >
                🗑️ CLEAR CONFIG
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
