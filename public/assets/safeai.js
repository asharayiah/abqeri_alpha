<script>
/* Safe-AI chat (v2025-10-29): robust stream (SSE or NDJSON), no canned fallback, extra logs */
(function(){
  const log = (...a)=>console.log('[safeai]', ...a);

  const form = document.getElementById('chatForm');
  const textarea = document.getElementById('chatInput');
  const container = document.getElementById('chatContainer');
  const statusDot = document.getElementById('abq-statusDot');
  const statusText = document.getElementById('abq-statusText');
  const provPath = document.getElementById('abq-provPath');
  const provModel = document.getElementById('abq-provModel');
  const provGuards = document.getElementById('abq-provGuards');

  if (!form || !textarea || !container) {
    log('missing DOM nodes; abort');
    return;
  }

  function addMsg(cls, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    container.appendChild(d);
    container.scrollTop = container.scrollHeight;
    return d;
  }
  function setStatus(hybrid, model, guards) {
    if (!statusDot || !statusText) return;
    statusDot.classList.remove('abq-dot-soft','abq-dot-hw');
    if (hybrid) { statusDot.classList.add('abq-dot-hw'); statusText.textContent='Hybrid (Hardware-Backed)'; }
    else { statusDot.classList.add('abq-dot-soft'); statusText.textContent='Software Fallback'; }
    if (provPath) provPath.textContent = hybrid ? 'Hybrid (Hardware-Backed)' : 'Software fallback';
    if (provModel && model) provModel.textContent = model;
    if (provGuards) provGuards.textContent = (guards && guards.length) ? guards.join(', ') : 'None';
  }

  // Kill any legacy canned insertion
  const obs = new MutationObserver(muts=>{
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType===1 && n.classList.contains('msg') && n.classList.contains('ai')) {
        if (n.textContent && n.textContent.includes('We answer with mercy')) n.textContent = '…';
      }
    }
  });
  obs.observe(container, { childList:true });

  async function callChat(query) {
    const headers = {
      'content-type':'application/json',
      'accept': 'text/event-stream, application/x-ndjson, application/json'
    };
    const body = JSON.stringify({
      messages:[{role:'user', content:query}],
      lang: (document.documentElement.lang||'en')
    });

    log('POST /api/ai/chat …');
    const res = await fetch('/api/ai/chat', {
      method:'POST',
      headers,
      body,
      cache:'no-store',
    });

    log('POST status =', res.status, res.headers.get('content-type'));
    if (!res.ok) throw new Error('service_error');
    if (!res.body) throw new Error('no_stream');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let metaSeen = false;
    let suppressTokens = false;

    const aiDiv = addMsg('ai','…');

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream:true });

      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;

        if (line.startsWith('data:')) line = line.replace(/^data:\s*/,'').trim();
        if (line === '[DONE]') { log('DONE'); break; }

        try {
          const obj = JSON.parse(line);

          if (aiDiv.textContent.includes('We answer with mercy')) aiDiv.textContent = '…';

          if (obj.meta && !metaSeen) {
            metaSeen = true;
            const guards = obj.meta.guardrails || [];
            const prov = obj.meta.provenance || {};
            setStatus(!!prov.hybrid, prov.model || '@cf/meta/llama-3.1-8b-instruct', guards.map(g => g.message || g.id).filter(Boolean));
            if (obj.meta.action === 'restrict') {
              aiDiv.textContent = '⚠️ ' + (guards.length ? guards.map(g=>g.message||g).join(' ') : 'Request blocked for safety reasons.');
              suppressTokens = true;
            }
            continue;
          }

          let t = '';
          if (typeof obj.token === 'string') t = obj.token;          // NDJSON
          else if (typeof obj.response === 'string') t = obj.response; // SSE style you saw

          if (t && !suppressTokens) {
            if (aiDiv.textContent === '…') aiDiv.textContent = '';
            aiDiv.textContent += t;
          }
        } catch (e) {
          // Not JSON? ignore (keep streaming)
          // log('non-JSON line:', line);
        }
      }
    }
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = (textarea.value||'').trim();
    if (!q) return;
    addMsg('user', q);
    textarea.value = '';

    Array.from(container.querySelectorAll('.msg.ai')).forEach(m=>{
      if (m.textContent && m.textContent.includes('We answer with mercy')) m.textContent = '';
    });

    callChat(q).catch(err=>{
      console.error(err);
      addMsg('ai','Service error. Try again.');
    });
  });

  textarea.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  log('safeai.js loaded');
})();

  // Enter to send
  textarea.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
})();
</script>
