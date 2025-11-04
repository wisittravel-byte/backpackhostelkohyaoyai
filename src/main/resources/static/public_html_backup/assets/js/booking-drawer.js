'use strict';
(function(){
  // State: selected items (can hold multiple selections)
  const state = { items: [] };

  const $ = (sel, root)=> (root||document).querySelector(sel);
  const $$ = (sel, root)=> Array.from((root||document).querySelectorAll(sel));

  // Elements (created in HTML)
  const root = document.documentElement;
  const backdrop = $('[data-bs-backdrop]');
  const drawer = $('[data-bs-drawer]');
  const openBtn = $('[data-bs-open]');
  const closeBtn = $('[data-bs-close]');
  const listEl = $('[data-bs-list]');
  const totalEl = $('[data-bs-total]');
  const bookBtn = $('[data-bs-book]');
  const countBadges = $$('.bs-badge');

  function fmt(amount, currency){
    try{
      return new Intl.NumberFormat('th-TH', { style:'currency', currency: currency||'THB', currencyDisplay:'code', minimumFractionDigits:2}).format(amount).replace('THB','THB');
    }catch(_){
      return `${currency||'THB'} ${Number(amount||0).toFixed(2)}`;
    }
  }
  function nightsBetween(ci, co){
    try{ if(!ci || !co) return 0; const a = new Date(ci), b = new Date(co); return Math.max(0, Math.round((b-a)/(1000*60*60*24))); }catch(_){ return 0; }
  }
  function sumMinor(arr){ return (arr||[]).reduce((s,x)=> s + (Number((x&&x.price_minor)!=null? x.price_minor : x)||0), 0); }
  function fmtDateDMY(iso){
    try{
      if(!iso) return '';
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }catch(_){ return iso; }
  }

  function open(){ root.classList.add('bs-is-open'); if(backdrop) backdrop.hidden=false; drawer && drawer.setAttribute('aria-hidden','false'); }
  function close(){ root.classList.remove('bs-is-open'); if(backdrop) backdrop.hidden=true; drawer && drawer.setAttribute('aria-hidden','true'); }

  function updateBadge(){
    const n = state.items.length;
    countBadges.forEach(b=> b.textContent = String(n));
    // Toggle visibility class for floating cart icon
    if(n > 0){ root.classList.add('bs-has-items'); } else { root.classList.remove('bs-has-items'); }
  }

  function escapeHtml(s){
    try{ return String(s).replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]||m)); }catch(_){ return s; }
  }

  function render(){
    if(!listEl || !totalEl) return;
    if(state.items.length===0){ listEl.innerHTML = '<div class="bs-summaryRow"><small>ยังไม่มีการเลือกห้องพัก</small></div>'; totalEl.textContent = 'THB 0.00'; updateBadge(); return; }
    const rows = [];
    let totalMinor = 0; let currency = 'THB';
    state.items.forEach((it, idx)=>{
      const nightlyMinor = Array.isArray(it.nightly_prices_minor) ? it.nightly_prices_minor : (it.rate_plan && Array.isArray(it.rate_plan.pricing_dates)? it.rate_plan.pricing_dates.map(d=>Number(d.price_minor||0)) : []);
      const subtotalMinor = sumMinor(nightlyMinor) * Math.max(1, Number(it.rooms||1));
      totalMinor += subtotalMinor; currency = (it.rate_plan && it.rate_plan.base_currency) || 'THB';
      const nights = it.nights || nightsBetween(it.check_in, it.check_out) || nightlyMinor.length;
      const guests = it.guests || 1;
      const name = it.room_name || it.room_code || 'Room';
      const plan = it.rate_plan || {};
      const lang = (window.currentLang || document.documentElement.lang || 'th');
      // Strict rule: use rate_plans.description_th / description_en based on language; then fallbacks
      const planLine = (lang==='en'
          ? (plan.description_en || plan.description)
          : (plan.description_th || plan.description))
        || (lang==='en' ? (plan.name_en || plan.plan_name || plan.name_th) : (plan.name_th || plan.plan_name || plan.name_en))
        || '';
      const dateLine = (it.check_in && it.check_out)
        ? `${(lang==='en'?'Dates':'วันที่')} ${fmtDateDMY(it.check_in)} - ${fmtDateDMY(it.check_out)}`
        : '';
      rows.push(`
        <li class="bs-item">
          ${dateLine? `<div class=\"bs-date\">📅 ${escapeHtml(dateLine)}</div>`: ''}
          <div class="bs-item-top">
            <div>${name}</div>
            <div>${fmt(subtotalMinor/100, currency)}</div>
          </div>
          ${planLine ? `<div class=\"bs-plan\"><span class=\"tick\">✓</span><span>${escapeHtml(planLine)}</span></div>` : ''}
          <div class="bs-item-sub">
            <div>👤 ${guests} · 🛏️ ${nights} คืน</div>
            <button class="bs-remove" data-k="${idx}">ลบ</button>
          </div>
        </li>
      `);
    });
    listEl.innerHTML = rows.join('');
    totalEl.textContent = fmt(totalMinor/100, currency);
    updateBadge();
  }

  // Remove item
  if(drawer){
    drawer.addEventListener('click', (e)=>{
      const rm = e.target.closest('[data-k]');
      if(rm && rm.classList.contains('bs-remove')){
        const k = Number(rm.getAttribute('data-k'));
        if(!isNaN(k)) state.items.splice(k,1);
        render();
      }
    });
  }

  // Wire open/close
  openBtn && openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  backdrop && backdrop.addEventListener('click', close);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });

  // Intercept "เลือก" clicks BEFORE booking.js handler
  document.addEventListener('click', function(e){
    const a = e.target && e.target.closest && e.target.closest('a.select-room');
    if(!a) return;
    // Stop original handler (which navigates to checkout)
    try{ e.preventDefault(); e.stopImmediatePropagation(); }catch(_){}

    try{
      const roomCode = a.getAttribute('data-room');
      const roomName = a.getAttribute('data-room-name')||'';
      const planRaw = a.getAttribute('data-plan');
      const card = a.closest('.room-card');
      const rt = card ? (card.__rt || {}) : {};
      const roomTypeId = (rt && (rt.id!=null)) ? rt.id : null;
      const isPrivate = (rt && (rt.is_private===1 || rt.is_private===true || rt.is_private==='1')) ? 1 : 0;
      const domMode = card ? (card.getAttribute('data-room-row')||'') : '';
      let mode = isPrivate? 'PRIVATE':'DORM'; if(domMode){ mode = (domMode.toUpperCase()==='PRIVATE') ? 'PRIVATE':'DORM'; }
      const ci = $('#checkin'); const co=$('#checkout'); const g=$('#guests'); const r=$('#rooms');

      const plan = planRaw ? JSON.parse(planRaw) : {};
      const nightly = Array.isArray(plan.pricing_dates) ? plan.pricing_dates.map(d=>Number(d && d.price_minor || 0)) : [];

      const item = {
        room_code: roomCode,
        room_name: roomName,
        room_type_id: roomTypeId,
        is_private: isPrivate,
        mode: mode,
        rate_plan: plan,
        rate_plan_id: (plan && plan.plan_id != null) ? plan.plan_id : undefined,
        nightly_prices_minor: nightly,
        check_in: ci? ci.value: null,
        check_out: co? co.value: null,
        nights: plan.nights || nightsBetween(ci&&ci.value, co&&co.value) || nightly.length,
        guests: g ? Number(g.value||2):2,
        rooms: r ? Number(r.value||1):1,
        booking_timestamp: new Date().toISOString()
      };

      // De-duplicate by room_type_id + rate_plan_id
      const key = `${item.room_type_id||item.room_code}|${item.rate_plan_id||''}`;
      const existsIdx = state.items.findIndex(x => `${x.room_type_id||x.room_code}|${x.rate_plan_id||''}` === key);
      if(existsIdx >= 0){ state.items[existsIdx] = item; } else { state.items.push(item); }

      render();
      open();
    }catch(err){ console.error('Drawer: failed to capture selection', err); }
  }, true); // capture phase

  // Book button → create HOLD then go to checkout (reusing booking.js logic)
  async function proceedCheckout(){
    if(!state.items.length) return;
    const item = state.items[state.items.length-1]; // use most recent selection

    // Build payload and call HOLD API (same endpoints as booking.js)
    const apiBase = (window.location.port === '8080') ? 'https://backpackkohyao.com' : '';
    const payload = {
      room_type_id: item.room_type_id,
      mode: item.mode,
      rooms: item.rooms,
      guests: item.guests,
      check_in: item.check_in,
      check_out: item.check_out,
      session_id: (typeof window.getSessionId === 'function') ? window.getSessionId() : undefined
    };
    try{
      let res;
      try{
        res = await fetch(`${apiBase}/api/v1/inventory-hold-create.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), cache:'no-cache' });
      }catch(_e){ res = null; }
      if(!(res && res.ok)){
        try{
          res = await fetch(`${apiBase}/php-api/v1/inventory-hold-create.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), cache:'no-cache' });
        }catch(_e2){ res = null; }
      }
      if(res && res.ok){
        const json = await res.json();
        if(json && json.hold_id){
          item.hold_id = json.hold_id; item.hold_expires_at = json.expires_at; item.hold_seconds = json.seconds_to_expiry;
        }
      } else if(res && res.status === 409){
        try{ const err = await res.json(); console.warn('Sold out during booking:', err); }catch(_){ }
        alert((window.currentLang==='en')? 'Sorry, just sold out for the selected dates.' : 'ขออภัย ช่วงวันที่เลือกมีผู้จองก่อนหน้าแล้ว');
        return;
      }
    }catch(err){ console.warn('HOLD API error:', err); }

    try{
      localStorage.setItem('booking_data', JSON.stringify(item));
    }catch(err){ console.warn('Failed to persist booking_data', err); }

    window.location.href = 'checkout.html';
  }
  bookBtn && bookBtn.addEventListener('click', proceedCheckout);

  // Initial render
  render();
})();
