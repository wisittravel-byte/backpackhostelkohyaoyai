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
    // Determine page context and target form/button
    const indexForm = document.getElementById('searchForm');
    const bookingForm = document.getElementById('searchBar');
    const form = indexForm || bookingForm || null;
    const btn = form ? form.querySelector('.actions a.btn') : qs('#searchForm .actions a.btn, #searchBar .actions a.btn');

  // Only clear values on the index page (requirement: F5 clears on index)
    if(indexForm && typeof indexForm.reset === 'function'){
      indexForm.reset();
      const {ci, co} = getVals();
      if(ci) ci.value = '';
      if(co) co.value = '';
      // set fresh defaults: today & tomorrow
      try{
        const now = new Date();
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const next = new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);
        const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
        if(ci) ci.value = fmt(base);
        if(co) co.value = fmt(next);
        // If using single visible input (#daterange), prefill it immediately
        try{
          const box = document.getElementById('daterange');
          if(box) box.value = `${ci ? ci.value : fmt(base)} – ${co ? co.value : fmt(next)}`;
        }catch(_){ }
        if(ci) ci.dispatchEvent(new Event('change', { bubbles:true }));
        if(co) co.dispatchEvent(new Event('change', { bubbles:true }));
      }catch(_){ }
    }

    const {ci, co} = getVals();
    // Booking page: if fields are blank (no query string / no draft), set defaults once
    if(!indexForm && bookingForm){
      try{
        const emptyCi = !ci || !ci.value;
        const emptyCo = !co || !co.value;
        if(emptyCi || emptyCo){
          const now = new Date();
          const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const next = new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);
          const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
          if(emptyCi && ci) ci.value = fmt(base);
          if((emptyCo || co.value <= ci.value) && co) co.value = fmt(next);
        }
      }catch(_){ }
    }
    try{ if(window.wireDateConstraints) window.wireDateConstraints(ci, co); }catch(_){ }

    // Do not prefill from localStorage on index page; Booking prefill is handled by booking.js
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
          const url = `booking.html?ci=${encodeURIComponent(v.ciVal)}&co=${encodeURIComponent(v.coVal)}&g=${encodeURIComponent(v.gVal)}&r=${encodeURIComponent(v.rVal)}`;
          ev.preventDefault();
          window.location.href = url;
        }catch(_){ /* navigate anyway */ }
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
