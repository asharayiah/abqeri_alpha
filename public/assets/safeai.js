/* Abqeri Safe-AI pane driver */

(() => {
  const $ = (id) => document.getElementById(id);
  const stream = () => $('chat-stream');

  function append(txt){ const el = stream(); el.textContent += txt; el.scrollTop = el.scrollHeight; }

  function langFromURL(){
    const q = new URLSearchParams(location.search);
    return (q.get('lang') || 'en').trim();
  }

  function updateMeta(meta){
    const model  = meta?.provenance?.model || '@cf/meta/llama-3.1-8b-instruct';
    const hybrid = !!meta?.provenance?.hybrid;
    const guards = meta?.guardrails || [];
    const mode   = guards.find(g=>g.id==='mode')?.message || 'General';
    const safety = guards.find(g=>g.id==='safety')?.message || 'Moderate';
    const lang   = guards.find(g=>g.id==='lang')?.message || langFromURL();

    const chip = $('chip-compute'), mModel=$('meta-model'), mMode=$('meta-mode'), mSafety=$('meta-safety'), mLang=$('meta-lang');
    if (chip)   chip.textContent   = hybrid ? 'Hybrid' : 'Software';
    if (mModel) mModel.textContent = model;
    if (mMode)  mMode.textContent  = mode;
    if (mSafety)mSafety.textContent= safety;
    if (mLang)  mLang.textContent  = lang;
  }

  function wire(){
    const form  = $('chat-form');
    const input = $('chat-input');
    const send  = $('chat-send');
    if(!form || !input || !send || !stream()) return;

    stream().textContent = '';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = (input.value || '').trim();
      if(!msg) return;

      append(`\nYou: ${msg}\n\nAbqeri: `);
      send.disabled = true;

      try{
        await window.callAI(msg, {
          lang: langFromURL(),
          mode: 'General',
          safety: 'Moderate',
          onMeta(meta){ updateMeta(meta); },
          onToken(tok){ if(tok) append(tok); },
          onDone(){ append('\n'); }
        });
      }catch(err){
        append(`\n[error] ${err?.message || err}`);
      }finally{
        send.disabled = false;
        input.value = '';
        input.focus();
      }
    });

    console.log('[SafeAI] wired');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
})();
