/* Abqeri app helpers + authoritative streaming callAI override */

(function(){
  // Minimal i18n prefetch (kept as-is)
  (async () => {
    try {
      const r = await fetch('/assets/i18n.json', { cache: 'no-store' });
      if (r.ok) window.__I18N__ = await r.json();
    } catch(_) {}
  })();

  // Our authoritative streaming impl
  function makeStreamingCallAI(){
    return async function(q, opts={}){
      const mode   = opts.mode   || 'General';
      const safety = opts.safety || 'Moderate';
      const lang   = opts.lang   || (new URLSearchParams(location.search).get('lang')||'en');

      const res = await fetch('/api/ai/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ messages:[{role:'user', content:q}], mode, safety, lang })
      });
      if(!res.ok || !res.body) throw new Error('Service error '+res.status);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        buf += dec.decode(value, {stream:true});

        let idx;
        while((idx = buf.indexOf('\n')) >= 0){
          const line = buf.slice(0, idx).trimEnd();
          buf = buf.slice(idx+1);
          if(!line || !line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if(payload === '[DONE]'){ if(opts.onDone) opts.onDone(); break; }

          try{
            const obj = JSON.parse(payload);

            // meta header
            if (obj?.meta?.provenance || obj?.meta?.guardrails) {
              if (opts.onMeta) opts.onMeta(obj.meta);
              continue;
            }

            // token chunk (string or bytes-object)
            let piece = '';
            if (typeof obj?.response === 'string') piece = obj.response;
            else if (obj?.response && typeof obj.response === 'object') {
              const bytes = new Uint8Array(Object.values(obj.response));
              piece = new TextDecoder().decode(bytes);
            }
            if (piece && opts.onToken) opts.onToken(piece);
          }catch(_) { /* ignore non-JSON */ }
        }
      }
    };
  }

  // If a legacy callAI exists (with the canned fallback), detect & replace.
  const isLegacy = (fn) => {
    try {
      const src = Function.prototype.toString.call(fn || '');
      return /We answer with mercy and clarity/.test(src) || /return j\.text \|\| ''/.test(src);
    } catch(_) { return false; }
  };

  // Install authoritative callAI (non-writable to prevent re-clobbering)
  const authoritative = makeStreamingCallAI();
  Object.defineProperty(window, 'callAI', {
    value: authoritative,
    writable: false,
    configurable: false,
    enumerable: false
  });

  // If something later injects a legacy version, kill it on sight
  const guard = new MutationObserver(() => {
    if (isLegacy(window.callAI)) {
      console.warn('[Abqeri] Legacy callAI detected; overriding.');
      Object.defineProperty(window, 'callAI', {
        value: authoritative,
        writable: false,
        configurable: false
      });
    }
  });
  guard.observe(document.documentElement || document.body, { childList:true, subtree:true });

  console.log('[Abqeri] app.js loaded; authoritative callAI installed', new Date().toISOString());
})();
