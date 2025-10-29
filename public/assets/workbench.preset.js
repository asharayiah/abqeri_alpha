<script>
(function(){
  // If URL has #tab=universe&preset=retro|entangle|eraser|harmony|nbody
  function get(k){ const m=location.hash.match(new RegExp("[#&]"+k+"=([^&]+)")); return m?decodeURIComponent(m[1]):null; }
  const tab = (location.hash.match(/tab=([^&]+)/)||[])[1];
  const preset = get("preset");
  if (tab === "universe" && preset) {
    window.addEventListener('tab:shown', (e)=>{
      if(e.detail && e.detail.tab==='universe'){
        const sel = document.getElementById('u-preset');
        if (sel) { sel.value = preset; document.getElementById('u-apply')?.click(); }
      }
    });
  }
})();
</script>
