'use strict';
(function(){
  // NEW MULTI-RATE-PLAN CART MODEL
  // This drawer now syncs with booking_session (cart[]) instead of maintaining separate state
  
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
  function sumMinor(arr){ return (arr||[]).reduce((s,x)=> s + (Number((x!=null)? x : 0)||0), 0); }
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
    // Load current session to get cart length
    let sessionData;
    try {
      const raw = localStorage.getItem('booking_session');
      sessionData = raw ? JSON.parse(raw) : null;
    } catch(_) {
      sessionData = null;
    }
    const cartLen = sessionData && Array.isArray(sessionData.cart) ? sessionData.cart.length : 0;
    countBadges.forEach(b=> b.textContent = String(cartLen));
    // Toggle visibility class for floating cart icon
    if(cartLen > 0){ root.classList.add('bs-has-items'); } else { root.classList.remove('bs-has-items'); }
  }

  function escapeHtml(s){
    try{ return String(s).replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]||m)); }catch(_){ return s; }
  }

  function render(){
    if(!listEl || !totalEl) return;
    
    // Load current booking_session
    let sessionData;
    try {
      const raw = localStorage.getItem('booking_session');
      sessionData = raw ? JSON.parse(raw) : null;
    } catch(e) {
      console.error('Error loading booking_session:', e);
      sessionData = null;
    }
    
    if(!sessionData || !Array.isArray(sessionData.cart) || sessionData.cart.length === 0) {
      listEl.innerHTML = '<div class="bs-summaryRow"><small>ยังไม่มีการเลือกห้องพัก</small></div>';
      totalEl.textContent = 'THB 0.00';
      updateBadge();
      return;
    }
    
  const rows = [];
    let totalMinor = 0;
    const currency = 'THB'; // Assume all prices in same currency
    const lang = (window.currentLang || document.documentElement.lang || 'th');
    const nights = sessionData.nights || 0;
    
    sessionData.cart.forEach((cartItem, idx)=>{
      // NEW CART ITEM STRUCTURE:
      // { room_type_id, is_private, rate_plan_id, rate_plan_name, qty, guests, nightly_prices }
      
      const nightly = Array.isArray(cartItem.nightly_prices) ? cartItem.nightly_prices : [];
      const subtotalMinor = sumMinor(nightly) * cartItem.qty;
      totalMinor += subtotalMinor;
      
      const roomName = cartItem.room_name || (cartItem.is_private ? (lang==='en'?'Private Room':'ห้องพัก') : (lang==='en'?'Dorm Bed':'เตียง Dorm'));
  let planText = cartItem.rate_plan_desc || cartItem.rate_plan_name || '';
      // ลบคำว่า "เตียง:" ออกจาก planText เพื่อให้แสดงเป็น "✓ 1 เตียง..." แทน "✓ เตียง: 1 เตียง..."
      planText = planText.replace(/^เตียง:\s*/i, '').trim();
      const priceLabel = (lang==='en' ? 'Price' : 'ราคา');

      rows.push(`
        <li class="bs-item">
          <div class="bs-room">${escapeHtml(roomName)}</div>
          <div class="bs-plan inline justify-between" style="gap:8px;align-items:center;display:flex;justify-content:space-between;">
            <div class="inline" style="gap:6px;display:inline-flex;align-items:center;">
              <span class="tick">✓</span>
              <span>${escapeHtml(planText)}</span>
            </div>
            <button class="bs-remove" data-k="${idx}">ลบ</button>
          </div>
          <div class="bs-item-sub" style="margin-top:4px;display:flex;justify-content:space-between;align-items:center;">
            <span>${priceLabel}</span>
            <span>${fmt(subtotalMinor/100, currency)}</span>
          </div>
        </li>
      `);
    });
    
    // Header: date range line above items
    const dateLine = (sessionData.check_in && sessionData.check_out)
      ? `<div class="bs-room">${lang==='en'?'Dates':'วันที่'} ${fmtDateDMY(sessionData.check_in)} - ${fmtDateDMY(sessionData.check_out)}</div>`
      : '';
    listEl.innerHTML = dateLine + rows.join('');
    totalEl.textContent = fmt(totalMinor/100, currency);
    updateBadge();
  }

  // Remove item from cart
  if(drawer){
    drawer.addEventListener('click', (e)=>{
      const rm = e.target.closest('[data-k]');
      if(rm && rm.classList.contains('bs-remove')){
        const k = Number(rm.getAttribute('data-k'));
        if(!isNaN(k)){
          try {
            const raw = localStorage.getItem('booking_session');
            const sessionData = raw ? JSON.parse(raw) : null;
            if(sessionData && Array.isArray(sessionData.cart)){
              sessionData.cart.splice(k, 1);
              localStorage.setItem('booking_session', JSON.stringify(sessionData));
              render();
            }
          } catch(err) {
            console.error('Error removing cart item:', err);
          }
        }
      }
    });
  }

  // Wire open/close
  openBtn && openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  backdrop && backdrop.addEventListener('click', close);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });

  // Expose openFromBooking for booking.js to call after adding to cart
  window.BookingDrawer = {
    openFromBooking: function(sessionData){
      try {
        localStorage.setItem('booking_session', JSON.stringify(sessionData));
        render();
        open();
      } catch(err) {
        console.error('BookingDrawer.openFromBooking error:', err);
      }
    }
  };

  // Book button → create HOLD then go to checkout with new payload structure
  async function proceedCheckout(){
    // Load session
    let sessionData;
    try {
      const raw = localStorage.getItem('booking_session');
      sessionData = raw ? JSON.parse(raw) : null;
    } catch(err) {
      console.error('Error loading session:', err);
      return;
    }
    
    if(!sessionData || !Array.isArray(sessionData.cart) || sessionData.cart.length === 0) {
      alert((window.currentLang==='en')? 'No items in cart' : 'ไม่มีรายการในตะกร้า');
      return;
    }

    // GROUPED HOLD CREATION: per room_type_id for the same date range
    const apiBase = (window.location.port === '8080') ? 'https://www.backpackkohyao.com' : '';
    const checkIn = sessionData.check_in;
    const checkOut = sessionData.check_out;

    // 1) Group cart[] by room_type_id + dates
    const groups = new Map(); // key -> { room_type_id, reserved_qty }
    const keyOf = (it)=> `${it.room_type_id}|${checkIn}|${checkOut}`;
    sessionData.cart.forEach(it=>{
      const k = keyOf(it);
      const g = groups.get(k) || { room_type_id: it.room_type_id, reserved_qty: 0 };
      g.reserved_qty += Number(it.qty||1);
      groups.set(k, g);
    });

    // 2) Create holds sequentially, rollback on failure
    const createdHolds = []; // { hold_id, room_type_id, reserved_qty, expires_at, seconds_to_expiry }
    // guard: disable button during processing
    try{ if(bookBtn) { bookBtn.disabled = true; bookBtn.textContent = (window.currentLang==='en'?'Processing…':'กำลังสร้างการจอง…'); } }catch(_){ }
    for(const g of groups.values()){
      const isPrivate = !!(sessionData.cart.find(ci=>ci.room_type_id===g.room_type_id)?.is_private);
      const mode = isPrivate ? 'PRIVATE' : 'DORM';
      // IMPORTANT: server historically uses `rooms` for PRIVATE and `guests` for DORM to compute units.
      // To be unambiguous, always send reserved_qty and mirror to the legacy field that the server reads.
      const holdPayload = {
        room_type_id: g.room_type_id,
        // Keep legacy fields for compatibility
        mode,
        reserved_qty: g.reserved_qty,  // NEW primary field
        rooms: g.reserved_qty,         // legacy compatibility (used when PRIVATE)
        guests: mode === 'DORM' ? g.reserved_qty : (sessionData.adults || 2), // legacy compatibility (used when DORM)
        // Dates: send both legacy and explicit field names
        check_in: checkIn,
        check_out: checkOut,
        check_in_date: checkIn,
        check_out_date: checkOut,
        session_id: (typeof window.getSessionId === 'function') ? window.getSessionId() : undefined,
        channel: 'WEBSITE',
        user_agent: (typeof navigator!=='undefined' && navigator.userAgent) ? navigator.userAgent : undefined
      };

      let res = null;
      try{
        res = await fetch(`${apiBase}/api/v1/inventory-hold-create.php`, {
          method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-cache', body: JSON.stringify(holdPayload)
        });
      }catch(_){ res = null; }
      if(!(res && res.ok)){
        try{
          res = await fetch(`${apiBase}/php-api/v1/inventory-hold-create.php`, {
            method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-cache', body: JSON.stringify(holdPayload)
          });
        }catch(_2){ res = null; }
      }

      if(res && res.ok){
        const json = await res.json();
        console.log('🟩 HOLD created (grouped):', json);
        if(json && json.hold_id){
          createdHolds.push({
            hold_id: json.hold_id,
            room_type_id: g.room_type_id,
            reserved_qty: g.reserved_qty,
            expires_at: json.expires_at,
            seconds_to_expiry: json.seconds_to_expiry
          });
        }
      } else if(res && res.status === 409){
        try{ const err = await res.json(); console.warn('Sold out during checkout (grouped):', err); }catch(_){ }
        // rollback previously created holds
        for(const h of createdHolds){
          try{
            const payload = JSON.stringify({ hold_id: h.hold_id, updated_by: 'rollback_create' });
            await fetch(`${apiBase}/api/v1/inventory-hold-release.php`, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, body: payload }).catch(()=>{});
          }catch(_r){ }
        }
        alert((window.currentLang==='en')? 'Sorry, just sold out for the selected dates.' : 'ขออภัย ช่วงวันที่เลือกมีผู้จองก่อนหน้าแล้ว');
        try{ if(bookBtn){ bookBtn.disabled = false; bookBtn.textContent = (window.currentLang==='en'?'Book':'จอง'); } }catch(_){ }
        return;
      } else {
        console.warn('HOLD API failed or unreachable (grouped)', res && res.status);
        // rollback already created holds
        for(const h of createdHolds){
          try{
            const payload = JSON.stringify({ hold_id: h.hold_id, updated_by: 'rollback_create' });
            await fetch(`${apiBase}/api/v1/inventory-hold-release.php`, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, body: payload }).catch(()=>{});
          }catch(_r){ }
        }
        alert((window.currentLang==='en')? 'Cannot hold the selected rooms right now.' : 'ไม่สามารถทำการถือห้องพักได้ในขณะนี้');
        try{ if(bookBtn){ bookBtn.disabled = false; bookBtn.textContent = (window.currentLang==='en'?'Book':'จอง'); } }catch(_){ }
        return;
      }
    }

    // Build NEW payload for checkout with cart[] structure
    try{
      const bookingData = {
        check_in: sessionData.check_in,
        check_out: sessionData.check_out,
        nights: sessionData.nights || 0,
        adults: sessionData.adults || 2,
        children: sessionData.children || 0,
        // NEW: cart[] with full item details
        cart: sessionData.cart.map(item=> ({
          room_type_id: item.room_type_id,
          is_private: item.is_private,
          rate_plan_id: item.rate_plan_id,
          rate_plan_name: item.rate_plan_name,
          qty: item.qty,
          guests: item.guests,
          nightly_prices: item.nightly_prices
        })),
        // BACKWARD COMPAT: single rate_plan from first item (first in cart)
        rate_plan: sessionData.cart[0]?.rate_plan_id || undefined,
        rate_plan_id: sessionData.cart[0]?.rate_plan_id || undefined,
        rate_plan_name: sessionData.cart[0]?.rate_plan_name || '',
        booking_timestamp: new Date().toISOString(),
        // HOLDs: keep primary hold_id for backward compat, but store all in hold_ids
        hold_id: createdHolds[0]?.hold_id,
        hold_expires_at: createdHolds[0]?.expires_at,
        hold_seconds: createdHolds[0]?.seconds_to_expiry,
        hold_ids: createdHolds.map(h=> h.hold_id),
        holds_detail: createdHolds
      };

      const json = JSON.stringify(bookingData);
      localStorage.setItem('booking_data', json);
      localStorage.setItem('booking_data_timestamp', String(Date.now()));
      console.log('✅ Booking data saved:', bookingData);
    }catch(err){
      console.warn('Failed to persist booking_data:', err);
    }

    // ✅ ลบตะกร้าและปิด drawer ก่อน redirect ไป checkout
    try{
      localStorage.removeItem('booking_session');
      console.log('🗑️ Cleared booking_session (cart)');
    }catch(_){ }
    close();
    window.location.href = 'checkout.html';
  }
  bookBtn && bookBtn.addEventListener('click', proceedCheckout);

  // Initial render
  render();
})();
