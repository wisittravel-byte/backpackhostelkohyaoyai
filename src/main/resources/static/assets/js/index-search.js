(function(){
  function qs(sel){ return document.querySelector(sel); }

  function getVals(){
    const ci = qs('#checkin');
    const co = qs('#checkout');
    const g  = qs('#guests');
    const r  = qs('#rooms');
    return {
      ci, co, g, r,
      ciVal: ci && ci.value || '',
      coVal: co && co.value || '',
      gVal: g && g.value || '',
      rVal: r && r.value || ''
    };
  }

  function isValid(){
    const {ciVal, coVal, gVal, rVal} = getVals();
    if(!ciVal || !coVal) return false;
    if(coVal < ciVal) return false;
    if(!gVal || Number(gVal) < 1) return false;
    if(!rVal || Number(rVal) < 1) return false;
    return true;
  }

  function updateBtnState(btn){
    if(!btn) return;
    const ok = isValid();
    btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  function prefillFromDraft(){
    // Intentionally disabled: index page must NOT prefill from localStorage.
    // Requirement: On F5 (reload), the page should clear previously entered values.
    return;
  }

  function init(){
    const btn = qs('#searchForm .actions a.btn');
    const form = document.getElementById('searchForm');
    // Always reset form to clear any preserved values on reload (F5)
    if(form && typeof form.reset === 'function') form.reset();
    // Explicitly clear date fields to override browser form restoration
    const {ci, co} = getVals();
    if(ci) ci.value = '';
    if(co) co.value = '';
    try{ if(window.wireDateConstraints) window.wireDateConstraints(ci, co); }catch(_){ }

    // Do not prefill from localStorage on index page (see requirement)
    updateBtnState(btn);

    ['#checkin','#checkout','#guests','#rooms'].forEach(sel=>{
      const el = qs(sel); if(!el) return;
      el.addEventListener('change', ()=> updateBtnState(btn));
      el.addEventListener('input', ()=> updateBtnState(btn));
    });

    if(btn){
      btn.addEventListener('click', function(ev){
        if(!isValid()){
          ev.preventDefault();
          try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.search.required') : alert('Please fill required fields'); }catch(_){ }
          return;
        }
        // Save to localStorage and navigate with query params
        try{
          const v = getVals();
          const draftRaw = localStorage.getItem('booking_draft');
          const draft = draftRaw ? JSON.parse(draftRaw) : {};
          draft.checkIn  = v.ciVal;
          draft.checkOut = v.coVal;
          draft.guests   = Number(v.gVal||2);
          draft.rooms    = Number(v.rVal||1);
          localStorage.setItem('booking_draft', JSON.stringify(draft));
          const url = `Booking.html?ci=${encodeURIComponent(v.ciVal)}&co=${encodeURIComponent(v.coVal)}&g=${encodeURIComponent(v.gVal)}&r=${encodeURIComponent(v.rVal)}`;
          ev.preventDefault();
          window.location.href = url;
        }catch(_){ /* navigate anyway */ }
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
