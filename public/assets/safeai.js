/* Abqeri Safe-AI client — robust SSE streaming + Enter to submit
   - clears any old canned content
   - replaces old listeners
   - decodes both {response:"..."} and {response:{0:..}} (bytes) shapes
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function cloneReplace(node) {
    const neo = node.cloneNode(true);
    node.replaceWith(neo);
    return neo;
  }

  function appendText(el, text) {
    el.textContent += text;
    el.scrollTop = el.scrollHeight;
  }

  function langFromURL() {
    const q = new URLSearchParams(location.search);
    return (q.get('lang') || 'en').trim();
  }

  function updateMeta({ mode = 'General', safety = 'Moderate', lang = 'en', model = '@cf/meta/llama-3.1-8b-instruct', hybrid = false } = {}) {
    const chip = $('chip-compute');
    const mModel = $('meta-model');
    const mMode = $('meta-mode');
    const mSafety = $('meta-safety');
    const mLang = $('meta-lang');
    if (chip) chip.textContent = hybrid ? 'Hybrid' : 'Software';
    if (mModel) mModel.textContent = model;
    if (mMode) mMode.textContent = mode;
    if (mSafety) mSafety.textContent = safety;
    if (mLang) mLang.textContent = lang;
  }

  function decodeResponseChunk(obj) {
    // Server may send: { response: "text" } OR { response: {0:97,1:98,...} }
    if (typeof obj?.response === 'string') return obj.response;
    if (obj?.response && typeof obj.response === 'object') {
      try {
        const bytes = new Uint8Array(Object.values(obj.response));
        return new TextDecoder().decode(bytes);
      } catch {
        return '';
      }
    }
    return '';
  }

  async function wireSafeAI() {
    const stream = $('chat-stream');
    let form = $('chat-form');
    let input = $('chat-input');
    let send = $('chat-send');

    if (!stream || !form || !input || !send) {
      console.warn('[SafeAI] missing nodes', { stream: !!stream, form: !!form, input: !!input, send: !!send });
      return;
    }

    // Kill any canned text and any old handlers by cloning the nodes
    stream.textContent = '';
    form = cloneReplace(form);
    input = $('chat-input'); // re-grab, since replaced
    send  = $('chat-send');

    // Enter to submit (Shift+Enter = newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = (input.value || '').trim();
      if (!msg) return;

      const lang = langFromURL();
      const payload = {
        messages: [{ role: 'user', content: msg }],
        mode: 'General',
        safety: 'Moderate',
        lang
      };

      // UI
      appendText(stream, `\nYou: ${msg}\n\nAbqeri: `);
      send.disabled = true;

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok || !res.body) {
          appendText(stream, `\n[${res.status}] Service error.`);
          return;
        }

        const rdr = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';

        // Read SSE stream
        for (;;) {
          const { done, value } = await rdr.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });

          // Process complete lines
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trimEnd();
            buf = buf.slice(idx + 1);
            if (!line) continue;

            // SSE format uses "data: <json>"
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();

            if (json === '[DONE]') {
              appendText(stream, '\n');
              break;
            }

            try {
              const obj = JSON.parse(json);

              // If it’s a meta block, update header chips
              if (obj?.meta?.provenance || obj?.meta?.guardrails) {
                const model = obj?.meta?.provenance?.model || undefined;
                const hybrid = !!obj?.meta?.provenance?.hybrid;
                const guards = obj?.meta?.guardrails || [];
                const mode = guards.find(g => g.id === 'mode')?.message || 'General';
                const safety = guards.find(g => g.id === 'safety')?.message || 'Moderate';
                const langMsg = guards.find(g => g.id === 'lang')?.message || lang;
                updateMeta({ model, hybrid, mode, safety, lang: langMsg });
                continue;
              }

              // Regular token chunk
              const piece = decodeResponseChunk(obj);
              if (piece) appendText(stream, piece);
            } catch {
              // Ignore any non-JSON or keep-alive lines
            }
          }
        }
      } catch (err) {
        appendText(stream, `\n[network] ${err?.message || err}`);
      } finally {
        send.disabled = false;
        input.value = '';
        input.focus();
      }
    });

    console.log('[SafeAI] wired');
  }

  // Wait for full parse so elements exist
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireSafeAI, { once: true });
  } else {
    wireSafeAI();
  }
})();
