(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const streamEl = $('#chat-stream');
  const form = $('#chat-form');
  const input = $('#chat-input');
  const btn = $('#chat-send');
  const modeSel = $('#modeSel'), safetySel = $('#safetySel'), langSel = $('#langSel');
  const provChip = $('#provenanceChip'), kvPath=$('#kv-path'), kvModel=$('#kv-model'), modelLabel=$('#modelLabel');

  function append(t){ if(!streamEl) return; streamEl.textContent += t; streamEl.scrollTop = streamEl.scrollHeight; }
  function nl(){ append('\n'); }

  async function streamChat(payload){
    const msg = input.value.trim();
    if (msg){ append(`\nYou: ${msg}\n\nAbqeri: `); }

    const res = await fetch('/api/ai/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ nl(); append(`[error ${res.status}] Service error. Try again.`); nl(); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buf += dec.decode(value, {stream:true});

      let i;
      while ((i = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0,i).trimEnd();
        buf = buf.slice(i+1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue;

        const json = line.slice(5).trim();
        if (json === '[DONE]'){ nl(); return; }

        try {
          const obj = JSON.parse(json);
          if (obj.meta?.provenance){
            const p = obj.meta.provenance;
            const path = p.hybrid ? 'Hybrid' : 'Software';
            if (provChip) provChip.textContent = path;
            if (kvPath) kvPath.textContent = path;
            if (p.model){ if (kvModel) kvModel.textContent = p.model; if (modelLabel) modelLabel.textContent = p.model; }
            continue;
          }
          if (typeof obj.response === 'string'){ append(obj.response); }
          // If backend ever sends bytes again by mistake, try to decode here too:
          else if (obj.response && typeof obj.response === 'object'){
            const bytes = Object.values(obj.response);
            append(new TextDecoder().decode(new Uint8Array(bytes)));
          }
        } catch(e) {
          // ignore parse errors
        }
      }
    }
    nl();
  }

  if (form && input){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const msg = input.value.trim(); if (!msg) return;
      btn.disabled = true;
      const payload = {
        messages:[{role:'user', content: msg}],
        mode: (modeSel?.value || 'General'),
        safety: (safetySel?.value || 'Moderate'),
        lang: (langSel?.value || 'en')
      };
      try { await streamChat(payload); }
      catch(err){ append(`\n[network] ${err?.message||err}\n`); }
      finally { btn.disabled=false; input.value=''; input.focus(); }
    });
  }
})();
