// Robust language toggle wiring: use event delegation so clicks always call applyLang
(function(){
  // expose a convenience API used by inline onclick handlers
  window.requestLangChange = function(lang){
    if(window.applyLang){
      try{ window.applyLang(lang); console.debug('requestLangChange -> applyLang called', lang); return; }catch(e){}
    }
    // if applyLang not ready, dispatch event that will be handled when ready
    console.debug('requestLangChange -> queuing requestLangChange event', lang);
    document.dispatchEvent(new CustomEvent('requestLangChange',{detail:{lang}}));
  };

  function handleLangClick(ev){
    const btn = ev.target.closest && ev.target.closest('#thBtn, #enBtn, [data-lang]');
    if(!btn) return;
    const lang = btn.dataset && btn.dataset.lang ? btn.dataset.lang : (btn.id === 'thBtn' ? 'th' : (btn.id === 'enBtn' ? 'en' : null));
    if(lang){
      window.requestLangChange(lang);
    }
  }

  document.addEventListener('click', handleLangClick, true);

  // In case header wiring failed, try to wire buttons directly when header appears
  document.addEventListener('sharedHeaderLoaded', ()=>{
    try{ if(window.wireLangButtons) window.wireLangButtons(); }catch(e){}
  });

  // When a queued request arrives, try to call applyLang immediately (may be available later)
  document.addEventListener('requestLangChange', (e)=>{
    try{
      const lang = e.detail && e.detail.lang;
      if(window.applyLang && lang){ window.applyLang(lang); console.debug('requestLangChange handled by applyLang', lang); }
    }catch(_){ }
  });
})();
