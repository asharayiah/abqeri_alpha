/* public/assets/app.js — final i18n with strict URL/localStorage/select sync */
(function(){
  const I18N_URL = '/assets/i18n.json?v=20251025b';
  const LS_KEY   = 'abqeri_lang';
  const SUPPORTED = ['en','ar','ru','zh'];
  const DEFAULT_LANG = 'en';

  // helpers
  const $$ = (s,c=document)=>Array.from(c.querySelectorAll(s));
  const $  = (s,c=document)=>c.querySelector(s);
  const setTextIf=(el,v)=>{ if(el && v!=null && v!=='') el.textContent=v; };
  const setHTMLIf=(el,v)=>{ if(el && v!=null && v!=='') el.innerHTML=v; };
  const setAttrIf=(el,a,v)=>{ if(el && v!=null && v!=='') el.setAttribute(a,v); };

  function getUrlLang(){
    try { return (new URL(location.href).searchParams.get('lang')||'').toLowerCase(); }
    catch { return ''; }
  }
  function setUrlLang(lang){
    try{
      const u = new URL(location.href);
      u.searchParams.set('lang', lang);
      history.replaceState(null,'',u.toString());
    }catch{}
  }
  function detectLang(){
    // 1) URL
    const q = getUrlLang();
    if (SUPPORTED.includes(q)) return q;
    // 2) localStorage
    const saved = (localStorage.getItem(LS_KEY)||'').toLowerCase();
    if (SUPPORTED.includes(saved)) return saved;
    // 3) browser
    const nav = (navigator.language||'en').slice(0,2).toLowerCase();
    return SUPPORTED.includes(nav) ? nav : DEFAULT_LANG;
  }

  function applyDir(lang){
    document.documentElement.lang = lang;
    document.documentElement.dir  = (lang==='ar') ? 'rtl' : 'ltr';
  }

  // header labels
  function applyHeader(dict){
    setTextIf($('#nav-about'),     dict['nav.about']);
    setTextIf($('#nav-pricing'),   dict['nav.pricing']);
    setTextIf($('#nav-ledger'),    dict['nav.ledger']);
    setTextIf($('#nav-login'),     dict['nav.login']);
    setTextIf($('#nav-register'),  dict['nav.register']);
    setTextIf($('#nav-subscribe'), dict['nav.subscribe']);
  }

  // generic translations
  function applyGeneric(dict){
    $$('[data-i18n]').forEach(el=> setTextIf(el, dict[el.getAttribute('data-i18n')]));
    $$('[data-i18n-html]').forEach(el=> setHTMLIf(el, dict[el.getAttribute('data-i18n-html')]));
    $$('[data-i18n-placeholder]').forEach(el=> setAttrIf(el,'placeholder', dict[el.getAttribute('data-i18n-placeholder')]));
    const t = $('title[data-i18n]'); if (t) setTextIf(t, dict[t.getAttribute('data-i18n')]);
  }

  // page-specific
  function applyPageMappings(dict){
    const pairs = [
      ['button.tab[data-tab="safe"]','tabs.safe'],
      ['button.tab[data-tab="music"]','tabs.music'],
      ['button.tab[data-tab="universe"]','tabs.universe'],
      ['button.tab[data-tab="qpu"]','tabs.qpc'],
      ['button.tab[data-tab="insights"]','tabs.insights'],
      ['#safe-toggle','safe.toggle'],
      ['#safe-panel h2','safe.about_title'],
      ['#safe-panel p','safe.about_p1'],
      ['#safe-panel li:nth-of-type(1)','safe.bul1'],
      ['#safe-panel li:nth-of-type(2)','safe.bul2'],
      ['#safe-panel li:nth-of-type(3)','safe.bul3'],
      ['#safe-panel li:nth-of-type(4)','safe.bul4'],
      ['#btn-send','safe.send'],
      ['#prompt|placeholder','aboutHome.cta_safe'],
      ['#music-toggle','music.toggle'],
      ['#music-panel h2','music.about_title'],
      ['#music-panel p','music.about_p1'],
      ['#music-panel li:nth-of-type(1)','music.bul1'],
      ['#music-panel li:nth-of-type(2)','music.bul2'],
      ['#btn-gen','music.generate'],
      ['#btn-play','music.play'],
      ['#music-apply','music.load'],
      ['#u-toggle','universe.toggle'],
      ['#u-panel h2','universe.about_title'],
      ['#u-panel .u-quote:first-of-type','universe.quote1'],
      ['#u-panel h3','universe.howto'],
      ['#u-panel li:nth-of-type(1)','universe.li1'],
      ['#u-panel li:nth-of-type(2)','universe.li2'],
      ['#u-panel li:nth-of-type(3)','universe.li3'],
      ['#u-panel li:nth-of-type(4)','universe.li4'],
      ['#u-panel li:nth-of-type(5)','universe.li5'],
      ['#u-apply','universe.load'],
      ['#btn-start','universe.start'],
      ['#btn-pause','universe.pause'],
      ['#btn-reset','universe.reset'],
      ['#tab-insights a.btn[href="/ledger.html"]','cta.open_ledger'],
      ['#tab-insights a.btn[href="/pricing.html"]','cta.open_pricing'],
      ['a.btn[data-i18n="about.run_safe"]','about.run_safe'],
      ['a.btn[data-i18n="about.run_music"]','about.run_music'],
      ['a.btn[data-i18n="about.run_universe"]','about.run_universe'],
      ['a.btn[data-i18n="about.run_qpu"]','about.run_qpu']
    ];
    for(const [sel,key] of pairs){
      if(sel.includes('|placeholder')){ const css=sel.split('|')[0]; setAttrIf($(css),'placeholder',dict[key]); }
      else { setTextIf($(sel), dict[key]); }
    }
  }

  // load dict once
  let CACHE=null;
  async function loadDict(){
    if(CACHE) return CACHE;
    const r = await fetch(I18N_URL, {cache:'no-store'});
    if(!r.ok) throw new Error('i18n.json HTTP '+r.status);
    CACHE = await r.json();
    return CACHE;
  }
  async function applyAll(lang){
    const all = await loadDict();
    const dict = all[lang] || all[DEFAULT_LANG] || {};
    applyDir(lang);
    applyHeader(dict);
    applyGeneric(dict);
    applyPageMappings(dict);
    window.dispatchEvent(new Event('i18n:applied'));
  }

  // ready
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(async ()=>{
    // 1) determine current language
    let lang = detectLang();
    // 2) normalize select state to this language
    const sw = $('#lang-switch');
    if (sw) {
      // coerce any uppercase values to lowercase for safety
      Array.from(sw.options).forEach(o=> o.value = (o.value||'').toLowerCase());
      sw.value = lang;
    }
    // 3) ensure URL carries the chosen language (but don't add ?lang=en if it’s already en unless URL had a different lang)
    const q = getUrlLang();
    if (!q || q !== lang) setUrlLang(lang);
    // 4) persist to localStorage
    try { localStorage.setItem(LS_KEY, lang); } catch {}
    // 5) translate
    await applyAll(lang);
    // 6) wire switcher to hard reload with exact lang (always)
    if (sw && !sw._wired) {
      sw.addEventListener('change', ()=>{
        const v = (sw.value||DEFAULT_LANG).toLowerCase();
        try { localStorage.setItem(LS_KEY, v); } catch {}
        const u = new URL(location.href);
        u.searchParams.set('lang', v);
        location.href = u.toString(); // full reload to avoid any stale state
      });
      sw._wired = true;
    }
  });
})();
