import { createSignal, Show, createMemo } from 'solid-js';
import { quickCheatOpen, setQuickCheatOpen, apiUrl, playerId, showLoading, hideLoading } from '../../store/uiStore.js';
import { game } from '../../store/gameStore.js';
import { allCheatTemplates } from '../features/cheatTemplateStore.js';

export default function QuickCheatModal() {
  const [cheatJson, setCheatJson] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [selectedTemplate, setSelectedTemplate] = createSignal('');
  const [templateDesc, setTemplateDesc] = createSignal('');

  const templates = createMemo(() => allCheatTemplates()[game().id] || []);

  function buildDefaultJson() {
    return JSON.stringify({
      configId: playerId(),
      gameCode: game().gameCode,
      config: {
        baseSpin: {
          initialScreen: { clusterCount: 5, symbols: [{ symbol: 'WILD', count: 10 }] },
          cascadeCount: 6,
          tumbleCount: 20,
        },
      },
    }, null, 2);
  }

  function openModal() {
    setErrorMsg('');
    setSelectedTemplate('');
    setTemplateDesc('');
    const saved = localStorage.getItem('test_config');
    setCheatJson(saved || buildDefaultJson());
  }

  function close() {
    setQuickCheatOpen(false);
  }

  function handleTemplateChange(idx) {
    setSelectedTemplate(idx);
    if (idx === '') { setTemplateDesc(''); return; }
    const t = templates()[parseInt(idx)];
    if (!t) return;
    setTemplateDesc(t.description || '');
    try {
      const parsed = JSON.parse(t.json);
      parsed.configId = playerId();
      parsed.gameCode = game().gameCode;
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
        headers: { 'Content-Type': 'application/json', 'x-signature': 'rgs-local-signature', accept: '*/*' },
        body: JSON.stringify(parsed),
      });

      const text = await response.text();
      let result = {};
      try { result = JSON.parse(text); } catch {}
      setSending(false);

      if (response.ok && !result.error && !result.errors) {
        showLoading('Cheat Sent successfully! ✅');
        localStorage.setItem('test_config', cheatJson());
        setTimeout(hideLoading, 2000);
        close();
      } else {
        setErrorMsg(`Failed: ${result.error?.message || result.message || text || response.statusText}`);
      }
    } catch (err) {
      setSending(false);
      setErrorMsg(`Invalid JSON or Request Error: ${err.message}`);
    }
  }

  async function handleClear() {
    const params = new URLSearchParams({ gameCode: game().gameCode, configId: playerId(), playerId: playerId() });
    try {
      showLoading('Clearing config...');
      const response = await fetch(`${apiUrl()}/v1/test/test-config?${params}`, {
        method: 'DELETE',
        headers: { accept: '*/*', 'x-signature': 'rgs-local-signature' },
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
    <Show when={quickCheatOpen()} keyed>
      {(() => { openModal(); return null; })()}
      <dialog
        id="quickCheatModal"
        class="modal-dialog"
        style="display:block;"
        open
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      >
        <div class="modal-content" style="max-width:560px;">
          <div class="modal-header">
            <h2>⚡ Quick Cheat Config</h2>
            <button id="closeQuickCheatBtn" class="btn-ghost" onClick={close}>×</button>
          </div>

          <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
            {/* Template selector */}
            <Show when={templates().length > 0}>
              <div class="settings-group">
                <label class="settings-label">Template</label>
                <select
                  id="cheatTemplateSelect"
                  class="settings-input"
                  value={selectedTemplate()}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                >
                  <option value="">-- Select a Template --</option>
                  {templates().map((t, i) => <option value={i}>{t.title}</option>)}
                </select>
                <Show when={templateDesc()}>
                  <div id="cheatTemplateDesc" style="font-size:10px; color:var(--text-muted); margin-top:4px;">{templateDesc()}</div>
                </Show>
              </div>
            </Show>

            {/* JSON input */}
            <div class="settings-group">
              <label class="settings-label">Test Config JSON</label>
              <textarea
                id="quickTestConfigInput"
                class="settings-textarea"
                style="height:200px; font-family:monospace; font-size:11px;"
                value={cheatJson()}
                onInput={(e) => setCheatJson(e.target.value)}
              />
            </div>

            <Show when={errorMsg()}>
              <div id="quickCheatError" style="color:var(--error); font-size:11px; padding:8px; background:rgba(244,63,94,0.1); border-radius:6px; border:1px solid rgba(244,63,94,0.3);">
                {errorMsg()}
              </div>
            </Show>

            <div style="display:flex; gap:8px;">
              <button
                id="sendQuickCheatBtn"
                class="btn-primary"
                style="flex:1;"
                disabled={sending()}
                onClick={handleSend}
              >
                {sending() ? 'SENDING...' : '⚡ SEND CHEAT CONFIG'}
              </button>
              <button
                id="clearCheatConfigBtn"
                class="btn-ghost"
                style="flex:1;"
                onClick={handleClear}
              >
                🗑️ CLEAR CONFIG
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </Show>
  );
}
