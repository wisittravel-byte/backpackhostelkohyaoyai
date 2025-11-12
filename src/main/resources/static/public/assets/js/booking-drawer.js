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

    // Fetch with timeout: just check HTTP 200, don't parse body
  // Some servers send 200 but empty or malformed body - we trust the status code
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return true; // Success if we got 200
    } finally {
      clearTimeout(t);
    }
  }

  // ===== Button State Management for Rate Plan Selection =====
  // Generate unique key for cart item
  function makeCartKey(item){ 
    return `${item.room_type_id}::${item.rate_plan_id}`; 
  }

  // Enable/disable rate plan button(s) by room_type_id and rate_plan_id
  function setRatePlanButtonState(room_type_id, rate_plan_id, disabled){
    // Precise match by BOTH room_type_id and rate_plan_id (plan_id can repeat across room types)
    const selector = `.select-room[data-plan*='"plan_id":${rate_plan_id}'][data-plan*='"room_type_id":${room_type_id}']`;
    console.log('🔍 setRatePlanButtonState called:', {room_type_id, rate_plan_id, disabled, selector});
    const buttons = document.querySelectorAll(selector);
    console.log('🔍 Found buttons:', buttons.length, buttons);
    
    if(buttons.length === 0){
      console.warn('⚠️ No buttons found with selector:', selector);
    }
    
    const lang = window.currentLang || document.documentElement.lang || 'th';
    const selectText = (lang==='en') ? 'Select' : 'เลือก';
    const inCartText = (lang==='en') ? 'In Cart' : 'อยู่ในตะกร้า';
    
    buttons.forEach(btn=>{
      console.log('🔧 Processing button:', btn, 'tagName:', btn.tagName, 'current text:', btn.textContent);
      // For <a> tags, use pointer-events and visual styling instead of disabled
      if(btn.tagName === 'A'){
        if(disabled){
          // Capture original label only once
          const existing = btn.getAttribute('data-original-text');
          const orig = (existing && existing.trim()) ? existing : btn.textContent;
          if(!existing || !existing.trim()) btn.setAttribute('data-original-text', orig);
          btn.textContent = inCartText;
          btn.classList.add('is-disabled');
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.6';
          btn.setAttribute('aria-disabled', 'true');
          console.log('✅ Disabled <a> button, text changed from:', orig, '→', btn.textContent);
        } else {
          const orig = btn.getAttribute('data-original-text');
          // ✅ FIX: ตรวจสอบว่า data-original-text มีค่าจริง ๆ ก่อน
          const restore = (orig && orig.trim() && orig.trim() !== inCartText && orig.trim() !== '...')
            ? orig : selectText;
          btn.textContent = restore;
          // Clear stored original to avoid drift
          btn.removeAttribute('data-original-text');
          console.log('✅ Enabled <a> button, text set to:', restore);
          btn.classList.remove('is-disabled');
          btn.style.pointerEvents = '';
          btn.style.opacity = '';
          btn.setAttribute('aria-disabled', 'false');
        }
      } else {
        // For <button> tags
        btn.disabled = !!disabled;
        btn.classList.toggle('is-disabled', !!disabled);
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        if(disabled){
          const existing = btn.getAttribute('data-original-text');
          const orig = (existing && existing.trim()) ? existing : btn.textContent;
          if(!existing || !existing.trim()) btn.setAttribute('data-original-text', orig);
          btn.textContent = inCartText;
          console.log('✅ Disabled <button>, text changed from:', orig, '→', btn.textContent);
        } else {
          const orig = btn.getAttribute('data-original-text');
          const restore = (orig && orig.trim() && orig.trim() !== inCartText && orig.trim() !== '...')
            ? orig : selectText;
          btn.textContent = restore;
          btn.removeAttribute('data-original-text');
          console.log('✅ Enabled <button>, text set to:', restore);
        }
      }
    });
  }

  // Sync all button states with current cart
  function syncDisabledButtonsWithCart(cart){
    const lang = window.currentLang || document.documentElement.lang || 'th';
    const selectText = (lang==='en') ? 'Select' : 'เลือก';
    
    // Reset all buttons to enabled
    document.querySelectorAll('.select-room[data-plan]')
      .forEach(btn=>{
        if(btn.tagName === 'A'){
          btn.classList.remove('is-disabled');
          btn.style.pointerEvents = '';
          btn.style.opacity = '';
          btn.setAttribute('aria-disabled', 'false');
          const orig = btn.getAttribute('data-original-text');
          // ✅ FIX: ตรวจสอบว่า data-original-text มีค่าจริง ๆ ก่อน
          if(orig && orig.trim()) btn.textContent = orig;
          else btn.textContent = selectText;
        } else {
          btn.disabled = false;
          btn.classList.remove('is-disabled');
          btn.setAttribute('aria-disabled', 'false');
          const orig = btn.getAttribute('data-original-text');
          // ✅ FIX: ตรวจสอบว่า data-original-text มีค่าจริง ๆ ก่อน
          if(orig && orig.trim()) btn.textContent = orig;
          else btn.textContent = selectText;
        }
      });
    // Disable buttons for items in cart
    (cart||[]).forEach(it=> {
      if(it.room_type_id && it.rate_plan_id){
        setRatePlanButtonState(it.room_type_id, it.rate_plan_id, true);
      }
    });
  }
  // ===== End Button State Management =====

  // Robust fetch helper with enforced timeout and JSON validation
  // - Aborts after timeoutMs
  // - Verifies content-type is JSON or text/plain (some servers reply text/plain)
  // - Throws when body isn't valid JSON
  async function fetchJsonWithTimeout(url, opts = {}, timeoutMs = 7000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('json') && !ct.includes('text/plain')) {
        throw new Error(`Unexpected content-type: ${ct}`);
      }
      let json;
      try { json = await res.json(); }
      catch (e) { throw new Error('Invalid JSON body'); }
      return json;
    } finally {
      clearTimeout(t);
    }
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
      // แสดงข้อความจาก API ตามจริง ไม่แก้ไข/ตัดคำใดๆ
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
    
    // Sync button states with cart
    syncDisabledButtonsWithCart(sessionData.cart);
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
              const removedItem = sessionData.cart[k];
              sessionData.cart.splice(k, 1);
              localStorage.setItem('booking_session', JSON.stringify(sessionData));
              
              // Re-enable the button for removed rate plan
              if(removedItem && removedItem.room_type_id && removedItem.rate_plan_id){
                setRatePlanButtonState(removedItem.room_type_id, removedItem.rate_plan_id, false);
              }
              
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
        // Sync button states with cart after render
        if(sessionData && Array.isArray(sessionData.cart)){
          syncDisabledButtonsWithCart(sessionData.cart);
        }
        open();
      } catch(err) {
        console.error('BookingDrawer.openFromBooking error:', err);
      }
    }
  };
  
  // Expose button state helpers for cross-file access
  window.setRatePlanButtonState = setRatePlanButtonState;
  window.syncDisabledButtonsWithCart = syncDisabledButtonsWithCart;

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
      try{
        const m = (window.currentLang==='en')? 'No items in cart' : 'ไม่มีรายการในตะกร้า';
        (window.Messages && window.Messages.alert) ? window.Messages.alert(m) : (window.showSystemAlert? window.showSystemAlert(m): alert(m));
      }catch(_){ }
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

    // ✅ Validation: สำหรับ Dorm Bed ต้องเช็คว่าจำนวนเตียง = จำนวนผู้เข้าพัก
    const dormBeds = sessionData.cart
      .filter(ci => !ci.is_private)
      .reduce((sum, ci) => sum + Number(ci.qty || 0), 0);
    
    if (dormBeds > 0 && dormBeds !== sessionData.adults) {
      const lang = window.currentLang || 'th';
      const msg = (lang === 'en')
        ? `Invalid booking: You selected ${sessionData.adults} guest(s) but have ${dormBeds} dorm bed(s) in cart. For dorm beds, number of beds must equal number of guests.`
        : `ไม่สามารถจองได้: คุณเลือก ${sessionData.adults} คน แต่มี ${dormBeds} เตียงในตะกร้า สำหรับเตียง Dorm จำนวนเตียงต้องเท่ากับจำนวนคน`;
      try{ (window.Messages && window.Messages.alert) ? window.Messages.alert(msg) : (window.showSystemAlert? window.showSystemAlert(msg): alert(msg)); }catch(_){ }
      return;
    }
    
    // 2) Create holds sequentially, rollback on failure, ensure button restored on error
    const createdHolds = []; // { hold_id, room_type_id, reserved_qty, expires_at, seconds_to_expiry }
    let navigating = false;
    try {
      // guard: disable button during processing
      if (bookBtn) { bookBtn.disabled = true; bookBtn.textContent = (window.currentLang==='en'?'Processing…':'กำลังสร้างการจอง…'); }

      for (const g of groups.values()) {
        const isPrivate = !!(sessionData.cart.find(ci => ci.room_type_id === g.room_type_id)?.is_private);
        const mode = isPrivate ? 'PRIVATE' : 'DORM';
        const holdPayload = {
          room_type_id: g.room_type_id,
          mode,
          reserved_qty: g.reserved_qty,
          // legacy mirrors for safety with older handlers
          rooms: g.reserved_qty,
          guests: mode === 'DORM' ? g.reserved_qty : (sessionData.adults || 2),
          // send both modern and legacy date keys
          check_in: checkIn, check_out: checkOut,
          check_in_date: checkIn, check_out_date: checkOut,
          session_id: (typeof window.getSessionId === 'function') ? window.getSessionId() : undefined,
          channel: 'WEBSITE',
          user_agent: (typeof navigator!=='undefined' && navigator.userAgent) ? navigator.userAgent : undefined
        };

        let json = null;
        try {
          // primary
          json = await fetchJsonWithTimeout(`${apiBase}/api/v1/inventory-hold-create.php`, {
            method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-cache', body: JSON.stringify(holdPayload)
          }, 8000);
        } catch (_) {
          // fallback path
          json = await fetchJsonWithTimeout(`${apiBase}/php-api/v1/inventory-hold-create.php`, {
            method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-cache', body: JSON.stringify(holdPayload)
          }, 8000);
        }

        if (!json || !json.hold_id) throw new Error('HOLD API returned no hold_id');
        createdHolds.push({
          hold_id: json.hold_id,
          room_type_id: g.room_type_id,
          reserved_qty: g.reserved_qty,
          expires_at: json.expires_at,
          seconds_to_expiry: json.seconds_to_expiry
        });
      }

      // ---- Persist booking_data and navigate ----
  const bookingData = {
        check_in: sessionData.check_in,
        check_out: sessionData.check_out,
        nights: sessionData.nights || 0,
        adults: sessionData.adults || 2,
        children: sessionData.children || 0,
        cart: sessionData.cart.map(item => ({
          room_type_id: item.room_type_id,
          is_private: item.is_private,
          rate_plan_id: item.rate_plan_id,
          rate_plan_name: item.rate_plan_name,
          // pass through plan descriptions for dynamic language rendering on checkout
          rate_plan_desc: item.rate_plan_desc,
          rate_plan_desc_th: item.rate_plan_desc_th,
          rate_plan_desc_en: item.rate_plan_desc_en,
          qty: item.qty,
          guests: item.guests,
          nightly_prices: item.nightly_prices
        })),
        rate_plan: sessionData.cart[0]?.rate_plan_id,
        rate_plan_id: sessionData.cart[0]?.rate_plan_id,
        rate_plan_name: sessionData.cart[0]?.rate_plan_name || '',
        booking_timestamp: new Date().toISOString(),
        hold_id: createdHolds[0]?.hold_id,
        hold_expires_at: createdHolds[0]?.expires_at,
        hold_seconds: createdHolds[0]?.seconds_to_expiry,
        hold_ids: createdHolds.map(h => h.hold_id),
        holds_detail: createdHolds
      };
      localStorage.setItem('booking_data', JSON.stringify(bookingData));
      localStorage.removeItem('booking_session');
      close();
      navigating = true;
      window.location.href = 'checkout.html';

    } catch (err) {
      console.warn('HOLD create failed:', err);
      // rollback any created holds
      for (const h of createdHolds) {
        try {
          const payload = JSON.stringify({ hold_id: h.hold_id, updated_by: 'rollback_create' });
          await fetch(`${apiBase}/api/v1/inventory-hold-release.php`, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, body: payload }).catch(()=>{});
        } catch(_) {}
      }
      try{
        const m = (window.currentLang==='en') ? 'Cannot hold the selected rooms right now.' : 'ไม่สามารถทำการถือห้องพักได้ในขณะนี้';
        (window.Messages && window.Messages.alert) ? window.Messages.alert(m) : (window.showSystemAlert? window.showSystemAlert(m): alert(m));
      }catch(_){ }
    } finally {
      if (!navigating && bookBtn) {
        bookBtn.disabled = false;
        bookBtn.textContent = (window.currentLang==='en'?'Book':'จอง');
      }
    }
  }
  bookBtn && bookBtn.addEventListener('click', proceedCheckout);

  // Initial render
  render();
})();
