(function(){
  function toTHB(n){ return Number(n).toFixed(2); }
  function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
  // Resolve API base: localhost uses local endpoints via Apache; Production uses relative paths
  function getApiBase(){
    try{ return (/localhost|127\.0\.0\.1/.test(location.hostname)) ? '' : ''; }catch(_){ return ''; }
  }
  
  // คำนวณจำนวนคืนจากวันที่
  function calculateNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    // Reset time to midnight for accurate day calculation
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const diffTime = end - start;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
  
  // แสดงวันที่แบบไทย
  function formatThaiDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  }
  
  function setTotals(sub, tax){
    const total = sub + tax;
    document.getElementById('sumRoomCharge').textContent = toTHB(sub);
    document.getElementById('sumTax').textContent = toTHB(tax);
    document.getElementById('sumSub').textContent = toTHB(sub);
    document.getElementById('sumTax2').textContent = toTHB(tax);
    document.getElementById('sumTotal').textContent = toTHB(total);
    document.getElementById('sumPayNow').textContent = toTHB(total);
    const payNowRight = document.getElementById('payNowRight'); if(payNowRight) payNowRight.textContent = toTHB(total);
  }

  function wireActions(){
  const agree = document.getElementById('agree');
  const bookBtn = document.getElementById('bookBtn');
  const reviewBtn = document.getElementById('reviewBtn');
  const changeDatesBtn = document.getElementById('changeDatesBtn');
  // Special Requests section removed from UI; keep variables undefined
  const toggleRequests = null;
  const requestsWrap = null;


    // Wire Terms modal
    const termsModal = document.getElementById('termsModal');
    const termsOkBtn = document.getElementById('termsOkBtn');
    const termsCloseBtn = document.getElementById('termsCloseBtn');
    function openTerms(){ if(termsModal) termsModal.classList.remove('hidden'); }
    function closeTerms(){ if(termsModal) termsModal.classList.add('hidden'); }
    if(agree){
      agree.addEventListener('change', (e)=>{
        // Only open when user is trying to check it
        if(agree.checked){
          // pause and show modal; uncheck until confirmed
          agree.checked = false;
          openTerms();
        }
      });
    }
    if(termsOkBtn){ termsOkBtn.addEventListener('click', ()=>{ if(agree) agree.checked = true; closeTerms(); }); }
    if(termsCloseBtn){ termsCloseBtn.addEventListener('click', ()=>{ closeTerms(); }); }

    // Change Dates button handler removed here - now handled after loadBookingData() to ensure hold release
    
    function mustAgree(){
      if(!agree.checked){ try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.mustAgree') : alert('Please accept the terms'); }catch(_){ } return false; }
      return true;
    }
  bookBtn.addEventListener('click', async (e)=>{ 
    e.preventDefault(); 
    if(!mustAgree()) return; 
    try{
      const draftRaw = localStorage.getItem('booking_draft');
      const draft = draftRaw ? JSON.parse(draftRaw) : {};
      const payload = {
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guests: Number(draft.guests||2),
        rooms: Number(draft.rooms||1),
        roomType: draft.roomType||'dorm',
        email: document.getElementById('email')?.value||'',
        firstName: document.getElementById('firstName')?.value||'',
        lastName: document.getElementById('lastName')?.value||''
      };
      let saved = null;
      if(window.API && window.API.fetchJson){
        try{ saved = await window.API.fetchJson('/api/bookings', { method:'POST', body: JSON.stringify(payload) }); }catch(_){ saved = null; }
        if(saved && saved.id){ localStorage.setItem('booking_id', String(saved.id)); }
      }
      // Attempt to CONFIRM hold if present (idempotent on server)
      try{
        const bdRaw = localStorage.getItem('booking_data');
        const bd = bdRaw ? JSON.parse(bdRaw) : null;
        if(bd && bd.hold_id){
          try{ localStorage.setItem('skip_hold_release','1'); }catch(_){ }
          const apiBase = getApiBase();
          await fetch(`${apiBase}/api/v1/inventory-hold-confirm.php`, {
            method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify({
              hold_id: bd.hold_id,
              booking_id: saved && saved.id ? saved.id : null,
              updated_by: 'website'
            })
          }).catch(()=>{});
        }
      }catch(_){ }
    }catch(err){ console.warn('Booking save failed:', err); }
    window.location.href = 'payment.html';
  });
  if(reviewBtn){
    reviewBtn.addEventListener('click', (e)=>{ e.preventDefault(); try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.reviewing') : alert('Reviewing your booking…'); }catch(_){ } });
  }
  }

  function loadDraft(){
    // ใช้ข้อมูลใหม่จาก booking_data แทน booking_draft
    loadBookingData();
  }
  
  async function loadBookingData() {
    try {
      const raw = localStorage.getItem('booking_data');
      if (!raw) {
        console.warn('⚠️ No booking_data found');
        return;
      }
      
      const bookingData = JSON.parse(raw);
      console.log('📦 Loaded booking data:', bookingData);
      
      // 1. แสดงวันที่เช็คอิน/เช็คเอ้าท์
      const checkIn = bookingData.check_in;
      const checkOut = bookingData.check_out;
      const nights = calculateNights(checkIn, checkOut);
      
      if (checkIn) {
        const el = document.getElementById('sumCheckIn');
        if (el) el.textContent = formatThaiDate(checkIn);
      }
      if (checkOut) {
        const el = document.getElementById('sumCheckOut');
        if (el) el.textContent = formatThaiDate(checkOut);
      }
      
      // 2. แสดงจำนวนคืน
      if (nights > 0) {
        const nightsEl = document.querySelector('[data-i18n="checkout.nightStay"]');
        if (nightsEl) {
          nightsEl.textContent = `${nights} คืน`;
          // ป้องกันไม่ให้ระบบ i18n เขียนทับค่าที่คำนวณแบบไดนามิก
          nightsEl.removeAttribute('data-i18n');
        }
      }
      
      // 3. แสดงชื่อห้องและรายละเอียด rate plan
      const roomName = bookingData.room_name || '';
      const ratePlan = bookingData.rate_plan || {};
      const ratePlanEl = document.getElementById('roomRatePlanName');
      if (ratePlanEl && roomName) {
        ratePlanEl.textContent = roomName;
        // ลบ data-i18n เพื่อไม่ให้ i18n system มาทับ
        ratePlanEl.removeAttribute('data-i18n');
      }
      
      // 4. แสดงจำนวนผู้เข้าพัก
      const guestsForDisplay = bookingData.guests || 0;
      const paxDetailsEl = document.getElementById('paxDetails');
      if (paxDetailsEl) {
        paxDetailsEl.textContent = `ผู้ใหญ่ ${guestsForDisplay} คน`;
        // ลบ data-i18n เพื่อไม่ให้ i18n system มาทับ
        paxDetailsEl.removeAttribute('data-i18n');
      }
      
      // 5. เตรียมข้อมูลการคำนวณตาม canonical spec (exclusive)
      const rooms = Number(bookingData.rooms || 1);
      const guests = Number(bookingData.guests || 1);
      // Mode: derive from booking_data.mode; if empty, reconstruct from is_private when available
      let mode = String(bookingData.mode||'').toUpperCase();
      if(!mode){
        const ip = bookingData.is_private;
        if(ip===1 || ip==='1' || ip===true){ mode = 'PRIVATE'; }
        else if(ip===0 || ip==='0' || ip===false){ mode = 'DORM'; }
      }
      const units = (mode === 'DORM') ? guests : rooms; // PRIVATE default

      // nightly_prices_minor (per unit, per night, exclusive); fallback to plan.pricing_dates
      let nightly = Array.isArray(bookingData.nightly_prices_minor) ? bookingData.nightly_prices_minor.slice() : null;
      if(!nightly){
        const pricingDates = Array.isArray(ratePlan.pricing_dates) ? ratePlan.pricing_dates : [];
        nightly = pricingDates.map(d=> Number(d && d.price_minor || 0));
      }
      // Sum nightly for ONE UNIT, then multiply with units
      const sumOneUnitMinor = nightly.reduce((s,v)=> s + Number(v||0), 0);
      const roomPriceMinor = sumOneUnitMinor * (Number.isFinite(units)? units : 1);
      const roomPriceInBaht = roomPriceMinor / 100;

      console.log('💰 Room price calculation (exclusive):', {
        mode, units, nights,
        nightly_prices_minor: nightly,
        sum_one_unit_minor: sumOneUnitMinor,
        room_price_minor: roomPriceMinor,
        room_price_baht: roomPriceInBaht
      });
      
      // 6. เรียก API เพื่อดึงค่า tax config
  const taxConfig = await fetchTaxConfig();
      
      // 7. คำนวณภาษีและค่าธรรมเนียม
      const calculations = calculateTaxesAndFees(roomPriceInBaht, taxConfig, {
        guests: guests,
        rooms: rooms,
        nights: nights
      });
      
      console.log('📊 Tax calculations:', calculations);
      
      // 8. แสดงผลในส่วนสรุป
      displaySummary(roomPriceInBaht, calculations);

      // 9. Ensure HOLD exists: if missing (e.g., user opened checkout directly or network race), attempt to create it here
      try{
        if(!bookingData.hold_id && bookingData.room_type_id && checkIn && checkOut){
          const payload = {
            room_type_id: bookingData.room_type_id,
            mode: String(bookingData.mode||'').toUpperCase() || (bookingData.is_private? 'PRIVATE':'DORM'),
            rooms: rooms,
            guests: guests,
            check_in: checkIn,
            check_out: checkOut,
            session_id: (function(){ try{ return localStorage.getItem('session_id') || undefined; }catch(_){ return undefined; } })()
          };
          const apiBase = getApiBase();
          const primaryUrl = `${apiBase}/api/v1/inventory-hold-create.php`;
          const fallbackUrl = `${apiBase}/php-api/v1/inventory-hold-create.php`;
          let res;
          try{ res = await fetch(primaryUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache' }); }catch(_){ res = null; }
          if(!(res && res.ok)){
            if(!(res && res.status===409)){
              try{ res = await fetch(fallbackUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache' }); }catch(_e){ res = null; }
            }
          }
          if(res && res.ok){
            const j = await res.json();
            bookingData.hold_id = j.hold_id;
            bookingData.hold_expires_at = j.expires_at;
            bookingData.hold_seconds = j.seconds_to_expiry;
            try{ localStorage.setItem('booking_data', JSON.stringify(bookingData)); }catch(_){ }
          } else if(res && res.status===409){
            console.warn('Hold could not be created (sold out after selection).');
          } else {
            console.warn('Hold creation skipped or failed on checkout.');
          }
        }
      }catch(_){ }

      // 10. Start HOLD countdown if present (no layout change)
      try{ startHoldCountdown(bookingData); }catch(_){ }
      
    } catch (e) {
      console.error('❌ Error loading booking data:', e);
    }
  }

  // Change dates: release hold then navigate back to booking with params
  // Define helper to release hold
  async function releaseHoldIfAny(reason){
    const raw = localStorage.getItem('booking_data');
    if(!raw) return false;
    let bd = {};
    try{ bd = JSON.parse(raw)||{}; }catch(_){ return false; }
    const holdId = bd.hold_id;
    if(!holdId) return false;
    
    const apiBase = getApiBase();
    console.log(`🔓 Attempting to release hold ${holdId}, reason: ${reason}`);
    
    try{
      const payload = JSON.stringify({ hold_id: holdId, updated_by: reason||'website' });
      // Try application/json first (standard), then text/plain as fallback
      const contentTypes = ['application/json', 'text/plain;charset=UTF-8'];
      const urls = [
        `${apiBase}/api/v1/inventory-hold-release.php`,
        `${apiBase}/php-api/v1/inventory-hold-release.php`
      ];
      
      let res = null; let ok = false;
      
      // Try each URL with each content type
      for(const u of urls){
        for(const ct of contentTypes){
          try{ 
            console.log(`  → Trying ${u} with ${ct}`);
            const opts = { 
              method:'POST', 
              headers:{'Content-Type': ct}, 
              credentials:'omit', 
              mode:'cors', 
              body: payload, 
              cache:'no-cache'
            };
            res = await fetch(u, opts);
            console.log(`  ← Response: ${res.status} ${res.statusText}`);
            ok = !!(res && res.ok);
            if(ok) {
              console.log(`✅ Released via ${u}`);
              break;
            }
          }catch(_e){ 
            console.log(`  ✗ Error: ${_e.message}`);
            ok = false; 
          }
        }
        if(ok) break;
      }
      
      // Clean local hold fields regardless of server outcome
      delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
      localStorage.setItem('booking_data', JSON.stringify(bd));
      
      if(ok){
        console.log(`✅ Hold ${holdId} released successfully by ${reason}`);
      } else {
        console.warn(`⚠️ Hold ${holdId} release failed, inventory may need manual cleanup`);
      }
      return ok;
    }catch(err){
      console.error('❌ Failed to release hold:', err);
      // Best effort cleanup locally
      delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
      try{ localStorage.setItem('booking_data', JSON.stringify(bd)); }catch(_2){}
      return false;
    }
  }
  
  function setupChangeDatesButton(){
    const changeDatesBtn = document.getElementById('changeDatesBtn');
    if(changeDatesBtn){
      changeDatesBtn.addEventListener('click', async (e)=>{
        e.preventDefault();
        console.log('🔄 Change dates button clicked');
        
        try{
          const raw = localStorage.getItem('booking_data');
          const bd = raw ? JSON.parse(raw) : {};
          const holdId = bd.hold_id;
          
          if(holdId){
            console.log('📤 Releasing hold with updated_by: user_change_dates');
            // เรียก API release hold ด้วย updated_by: "user_change_dates"
            try{
              const payload = { hold_id: holdId, updated_by: 'user_change_dates' };
              const apiBase = getApiBase();
              const url = `${apiBase}/api/v1/inventory-hold-release.php`;
              const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                credentials: 'omit',
                mode: 'cors',
                body: JSON.stringify(payload),
                cache: 'no-cache',
                keepalive: true
              });
              console.log('✅ Hold released via user_change_dates, status:', res.status);
            }catch(err){
              console.warn('⚠️ Failed to release hold:', err);
              // Continue anyway - redirect to booking.html
            }
          }
          
          // ลบ hold ออก localStorage ให้ pagehide ไม่ release ซ้ำ
          delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
          localStorage.setItem('booking_data', JSON.stringify(bd));
          localStorage.setItem('skip_hold_release', '1'); // Signal pagehide to not release again
          
          const ci = bd.check_in || '';
          const co = bd.check_out || '';
          const g  = bd.guests || '';
          const r  = bd.rooms || '';
          const q = new URLSearchParams({ ci, co, g: String(g||''), r: String(r||'') });
          window.location.href = `booking.html?${q.toString()}`;
        }catch(_){ 
          window.location.href = 'booking.html'; 
        }
      });
    }
  }

  function startHoldCountdown(bookingData){
    const exp = bookingData && bookingData.hold_expires_at;
    const holdId = bookingData && bookingData.hold_id;
    const holdSeconds = Number(bookingData && bookingData.hold_seconds);
    if(!holdId) return;
    // Parse expiry robustly:
    // Priority: expires_at (authoritative), fallback to hold_seconds if parsing fails.
    // If expires_at has no timezone, interpret as Asia/Bangkok (+07:00) to match server.
    let end = NaN;
    if(exp){
      if(/Z$|[+-]\d{2}:?\d{2}$/.test(exp)){
        end = Date.parse(exp);
      } else {
        const norm = exp.replace(' ', 'T');
        // Treat server-provided tz-less string as Asia/Bangkok to avoid client TZ drift
        const withTz = `${norm}+07:00`;
        let parsed = Date.parse(withTz);
        if(!isFinite(parsed)){
          // Fallback: local interpretation (less reliable across timezones)
          parsed = new Date(norm).getTime();
        }
        end = parsed;
      }
    }
    if(!isFinite(end) && Number.isFinite(holdSeconds) && holdSeconds > 0){
      end = Date.now() + (holdSeconds * 1000);
    }
    if(!isFinite(end)) return;
    const btn = document.getElementById('bookBtn');
    const baseTitle = document.title;
    const tick = ()=>{
      const now = Date.now();
      let sec = Math.max(0, Math.floor((end - now)/1000));
      const m = Math.floor(sec/60); const s = sec%60;
      // Update title if available
      try{ document.title = `${m}:${String(s).padStart(2,'0')} • ${baseTitle}`; }catch(_){ }
      if(sec <= 0){
        clearInterval(timer);
        if(btn){ btn.setAttribute('disabled','disabled'); }
        // Auto-expire the hold immediately when countdown reaches 0
        expireHoldNow(holdId);
        // Show custom modal instead of alert
        showHoldExpiredModal();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  // Expire hold immediately (called when countdown hits 0)
  async function expireHoldNow(holdId){
    if(!holdId) return;
  const apiBase = getApiBase();
    const primaryUrl = `${apiBase}/api/v1/inventory-hold-expire.php`;
    const fallbackUrl = `${apiBase}/php-api/v1/inventory-hold-expire.php`;
    try{
      const payload = { hold_id: holdId };
      let res;
      try{ res = await fetch(primaryUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache' }); }catch(_){ res = null; }
      if(!(res && res.ok)){
        try{ await fetch(fallbackUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache' }); }catch(_e){}
      }
      // Clean local storage
      try{
        const raw = localStorage.getItem('booking_data');
        const bd = raw ? JSON.parse(raw) : {};
        delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
        localStorage.setItem('booking_data', JSON.stringify(bd));
      }catch(_){}
    }catch(err){ console.warn('Failed to expire hold:', err); }
  }

  // Show custom hold expired modal
  function showHoldExpiredModal(){
    const modal = document.getElementById('holdExpiredModal');
    const backBtn = document.getElementById('holdExpiredBackBtn');
    if(!modal) return;
    modal.classList.remove('hidden');
    if(backBtn){
      backBtn.addEventListener('click', ()=>{
        // Navigate back to booking page
        try{
          const raw = localStorage.getItem('booking_data');
          const bd = raw ? JSON.parse(raw) : {};
          const ci = bd.check_in || '';
          const co = bd.check_out || '';
          const g  = bd.guests || '';
          const r  = bd.rooms || '';
          const q = new URLSearchParams({ ci, co, g: String(g||''), r: String(r||'') });
          window.location.href = `booking.html?${q.toString()}`;
        }catch(_){ window.location.href = 'booking.html'; }
      }, { once: true });
    }
  }

  // Auto-release HOLD when user closes page/browser without booking
  (function(){
    let userConfirmedExit = false;

    window.addEventListener('beforeunload', function(e) {
      // Skip if user already confirmed booking (skip_hold_release flag set during booking flow)
      try{
        const skipFlag = localStorage.getItem('skip_hold_release');
        if(skipFlag === '1') return; // User is completing booking, don't warn or release
      }catch(_){}

      const raw = localStorage.getItem('booking_data');
      if(!raw) return;
      
      let bd = {};
      try{ bd = JSON.parse(raw); }catch(_){ return; }
      
      const holdId = bd.hold_id;
      if(!holdId) return; // No active hold

      // Show confirmation dialog (browser will display its own message)
      const lang = (window.currentLang || document.documentElement.lang || 'th');
      const msg = (lang === 'en') 
        ? 'Your room hold will be released. Continue leaving?'
        : 'ห้องพักที่คุณเลือกจะถูกปล่อยคืน ต้องการออกจากหน้านี้หรือไม่?';
      
      e.preventDefault();
      e.returnValue = msg; // Standard for modern browsers
      
      // Note: User clicking "Stay on page" will cancel the unload
      // We'll handle the actual release in 'pagehide' event which fires when page truly unloads
      return msg;
    });

    // Fallback: also try when page becomes hidden (some browsers suppress beforeunload)
    // ❌ ปิดไว้เพราะมันทำให้ release hold เมื่อเข้าหน้า checkout เอง
    // document.addEventListener('visibilitychange', function(){
    //   if (document.visibilityState !== 'hidden') return;
    //   ...
    // });

    // Actually release the hold when page unloads (after user confirms or directly closes)
    window.addEventListener('pagehide', function(e) {
      console.log('🚨 pagehide event fired');
      
      try{
        const skipFlag = localStorage.getItem('skip_hold_release');
        console.log('skip_hold_release flag:', skipFlag);
        if(skipFlag === '1'){
          // Clear the flag for future visits
          localStorage.removeItem('skip_hold_release');
          console.log('⏭️ Skipping hold release (booking completed)');
          return;
        }
      }catch(_){}

      const raw = localStorage.getItem('booking_data');
      if(!raw){
        console.log('⚠️ No booking_data found');
        return;
      }
      
      let bd = {};
      try{ bd = JSON.parse(raw); }catch(_){ 
        console.log('❌ Failed to parse booking_data');
        return; 
      }
      
      const holdId = bd.hold_id;
      console.log('Hold ID to release:', holdId);
      if(!holdId){
        console.log('⚠️ No hold_id in booking_data');
        return;
      }

      // Call inventory-hold-expire.php to release and mark as EXPIRED
  const apiBase = getApiBase();
      const url = `${apiBase}/api/v1/inventory-hold-expire.php`;
      
      console.log('📡 Attempting to release hold via:', url);
      
      // Use sendBeacon for reliable delivery (POST with JSON)
      try{
  const payload = JSON.stringify({ hold_id: holdId, updated_by: 'browser_close' });
  const blob = new Blob([payload], { type: 'text/plain' });
        const sent = navigator.sendBeacon(url, blob);
        
        if(sent){
          console.log('✅ Hold released via sendBeacon on page exit');
        } else {
          console.log('⚠️ sendBeacon failed, trying sync XHR...');
          // Fallback to synchronous XHR if sendBeacon fails
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, false); // synchronous
          xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
          xhr.send(payload);
          console.log('✅ Hold released via sync XHR on page exit, status:', xhr.status);
          if(!(xhr.status>=200 && xhr.status<300)){
            // Last resort: fetch with keepalive (non-blocking)
            try{ fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: payload, keepalive:true, cache:'no-cache'}); }catch(_f){}
          }
        }
      }catch(err){
        console.warn('❌ Failed to release hold on page exit:', err);
      }

      // Clear booking_data from localStorage
      try{
        localStorage.removeItem('booking_data');
        console.log('🗑️ Cleared booking_data from localStorage');
      }catch(_){}
    });
  })();
  
  // ดึงค่า tax config จาก API
  async function fetchTaxConfig() {
    try {
  const apiBase = getApiBase();
      const url = `${apiBase}/api/v1/property-tax-config.php`;
      
      console.log('🌐 Fetching tax config from:', url);
      
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) {
        console.error('❌ Tax config API error:', res.status);
        return getDefaultTaxConfig();
      }
      
      const data = await res.json();
      console.log('✅ Tax config loaded:', data);
      // Normalize defaults for new fields
      const cfg = Object.assign({
        service_charge_pct: 0,
        vat_pct: 0,
        vat_base: 'ROOM_ONLY',
        local_tax_amount: 0,
        local_tax_unit: 'PER_BOOKING',
        fee_type: 'FIXED',
        fee_value: 0,
        fee_base: 'ROOM_ONLY',
        fee_unit: 'PER_BOOKING'
      }, data || {});
      try{ window.__lastTaxConfig = cfg; }catch(_){ }
      return cfg;
      
    } catch (err) {
      console.error('❌ Tax config fetch error:', err);
      return getDefaultTaxConfig();
    }
  }
  
  // Default tax config ถ้า API ไม่ทำงาน
  function getDefaultTaxConfig() {
    return {
      service_charge_pct: 10,
      vat_pct: 7,
      vat_base: 'ROOM_PLUS_SERVICE',
      local_tax_amount: 50,
      local_tax_unit: 'PER_PERSON_PER_NIGHT',
      fee_type: 'FIXED',
      fee_value: 0,
      fee_base: 'ROOM_ONLY',
      fee_unit: 'PER_BOOKING'
    };
  }
  
  // คำนวณภาษีและค่าธรรมเนียม
  function calculateTaxesAndFees(roomPrice, taxConfig, bookingInfo) {
    const { guests, rooms, nights } = bookingInfo;

    // 1) Service charge
    const serviceCharge = roomPrice * (Number(taxConfig.service_charge_pct||0)/100);

    // 2) Booking fee
    const feeBaseAmount = (String(taxConfig.fee_base||'ROOM_ONLY') === 'ROOM_ONLY')
      ? roomPrice
      : (roomPrice + serviceCharge);
    let feeQty = 1;
    switch(String(taxConfig.fee_unit||'PER_BOOKING')){
      case 'PER_ROOM_PER_NIGHT': feeQty = rooms * nights; break;
      case 'PER_PERSON_PER_NIGHT': feeQty = guests * nights; break;
      case 'PER_PERSON_PER_STAY': feeQty = guests; break;
      case 'PER_ROOM_PER_STAY': feeQty = rooms; break;
      default: feeQty = 1; // PER_BOOKING
    }
    const bookingFee = (String(taxConfig.fee_type||'FIXED') === 'FIXED')
      ? Number(taxConfig.fee_value||0) * feeQty
      : (feeBaseAmount * (Number(taxConfig.fee_value||0)/100) * feeQty);

    // 3) VAT
    const vatBaseAmount = (function(){
      const vb = String(taxConfig.vat_base||'ROOM_ONLY');
      if(vb === 'ROOM_PLUS_SERVICE') return roomPrice + serviceCharge;
      if(vb === 'ROOM_PLUS_SERVICE_FEE') return roomPrice + serviceCharge + bookingFee;
      return roomPrice; // ROOM_ONLY
    })();
    const vat = vatBaseAmount * (Number(taxConfig.vat_pct||0)/100);

    // 4) Local tax
    let localQty = 1;
    switch(String(taxConfig.local_tax_unit||'PER_BOOKING')){
      case 'PER_ROOM_PER_NIGHT': localQty = rooms * nights; break;
      case 'PER_PERSON_PER_NIGHT': localQty = guests * nights; break;
      case 'PER_PERSON_PER_STAY': localQty = guests; break;
      default: localQty = 1; // PER_BOOKING
    }
    const localTax = Number(taxConfig.local_tax_amount||0) * localQty;

    // 5) Totals
    const subtotalRoomAndService = roomPrice + serviceCharge;
    const subtotalBeforeVat = roomPrice + serviceCharge + bookingFee;
    const totalTaxOnly = vat + localTax;
    const totalTaxAndFees = bookingFee + vat + localTax;
    const grandTotal = roomPrice + serviceCharge + bookingFee + vat + localTax;

    return {
      room_price: roomPrice,
      service_charge: serviceCharge,
      booking_fee: bookingFee,
      vat: vat,
      local_tax: localTax,
      subtotal_room_and_service: subtotalRoomAndService,
      subtotal_before_vat: subtotalBeforeVat,
      total_tax: totalTaxOnly,
      total_tax_and_fees: totalTaxAndFees,
      grand_total: grandTotal
    };
  }
  
  // แสดงผลในส่วนสรุป
  function displaySummary(roomPrice, calc) {
    // ราคาห้องพัก
    const roomChargeEl = document.getElementById('sumRoomCharge');
    if (roomChargeEl) roomChargeEl.textContent = toTHB(round2(roomPrice));

    // ค่าบริการ
    const serviceChargeEl = document.getElementById('sumServiceCharge');
    if (serviceChargeEl) serviceChargeEl.textContent = toTHB(round2(calc.service_charge));

    // ค่าธรรมเนียมการจอง (แสดงเฉพาะเมื่อ > 0)
    const bf = Number(calc.booking_fee||0);
    const feeRow = document.getElementById('bookingFeeRow');
    const feeVal = document.getElementById('sumBookingFee');
    if (feeRow && feeVal){
      if(bf > 0){ feeRow.removeAttribute('hidden'); feeRow.removeAttribute('aria-hidden'); feeVal.textContent = toTHB(round2(bf)); }
      else { feeRow.setAttribute('hidden',''); feeRow.setAttribute('aria-hidden','true'); feeVal.textContent = toTHB(0); }
    }

    // VAT + label (show percent and base as tooltip)
    const vatEl = document.getElementById('sumVAT');
    if (vatEl) vatEl.textContent = toTHB(round2(calc.vat));
    try{
      const vatLabel = document.getElementById('vatLabel');
      if(vatLabel){
        // Read config from last fetched (kept outside), else try to infer from calc by presence of booking fee
        const tcRaw = window.__lastTaxConfig || null;
        const vatPct = tcRaw && tcRaw.vat_pct!=null ? Number(tcRaw.vat_pct) : undefined;
        const vatBase = tcRaw && tcRaw.vat_base ? String(tcRaw.vat_base) : undefined;
        const lang = window.currentLang || (document.documentElement.lang || 'th');
        const baseTextMap = {
          th: {
            ROOM_ONLY: 'ค่านห้องอย่างเดียว',
            ROOM_PLUS_SERVICE: 'ค่าห้อง+ค่าบริการ',
            ROOM_PLUS_SERVICE_FEE: 'ค่าห้อง+ค่าบริการ+ค่าธรรมเนียม'
          },
          en: {
            ROOM_ONLY: 'room only',
            ROOM_PLUS_SERVICE: 'room + service',
            ROOM_PLUS_SERVICE_FEE: 'room + service + booking fee'
          }
        };
        const pctText = (typeof vatPct==='number' && !isNaN(vatPct)) ? ` (${vatPct}%)` : '';
        vatLabel.textContent = (lang==='en' ? 'VAT' : 'VAT') + pctText;
        if(vatBase){
          const m = (lang==='en'? baseTextMap.en: baseTextMap.th);
          vatLabel.title = m[vatBase] || vatBase;
        }
      }
    }catch(_){ }

    // ภาษีท้องถิ่น
    const localTaxEl = document.getElementById('sumLocalTax');
    if (localTaxEl) localTaxEl.textContent = toTHB(round2(calc.local_tax));

    // รวมค่าห้อง (subtotal)
    const subEl = document.getElementById('sumSub');
    if (subEl) subEl.textContent = toTHB(round2(calc.subtotal_before_vat || (calc.room_price + calc.service_charge + (calc.booking_fee||0))));

    // รวมภาษี = VAT + ภาษีท้องถิ่น (ไม่รวมค่าบริการ)
    const taxOnly = (calc.total_tax != null)
      ? calc.total_tax
      : ((calc.vat || 0) + (calc.local_tax || 0));
    const taxEl = document.getElementById('sumTax');
    if (taxEl) taxEl.textContent = toTHB(round2(taxOnly));
    const tax2El = document.getElementById('sumTax2');
    if (tax2El) tax2El.textContent = toTHB(round2(taxOnly));

    // รวมทั้งหมด (ยังคงใช้ grand_total เดิม)
    const totalEl = document.getElementById('sumTotal');
    if (totalEl) totalEl.textContent = toTHB(round2(calc.grand_total));

    const payNowEl = document.getElementById('sumPayNow');
    if (payNowEl) payNowEl.textContent = toTHB(round2(calc.grand_total));

    const payNowRightEl = document.getElementById('payNowRight');
    if (payNowRightEl) payNowRightEl.textContent = toTHB(round2(calc.grand_total));

    // อัปเดตแคปชั่นให้เป็น "รวมภาษี" หากมี label แยกไว้
    const taxLabel = document.getElementById('sumTaxLabel');
    if (taxLabel){ taxLabel.textContent = 'รวมภาษี'; taxLabel.removeAttribute('data-i18n'); }
    const taxLabel2 = document.getElementById('sumTaxLabel2');
    if (taxLabel2){ taxLabel2.textContent = 'รวมภาษี'; taxLabel2.removeAttribute('data-i18n'); }
  }

  async function init(){
    wireActions();
    await loadDraft(); // รอให้โหลดข้อมูลเสร็จก่อน
    window.addEventListener('load', ()=>{ try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){} });

    // Release hold automatically when page is closed or navigated away
    try{
      try{ localStorage.removeItem('skip_hold_release'); }catch(_){ }
      const onUnload = ()=>{ try{ releaseHoldOnUnload(); }catch(_){ } };
      window.addEventListener('pagehide', onUnload);
      window.addEventListener('beforeunload', onUnload);
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'hidden') { try{ releaseHoldOnUnload(); }catch(_){ } }
      });
    }catch(_){ }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
  
  // Setup change dates button (needs access to releaseHoldIfAny)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', setupChangeDatesButton); else setupChangeDatesButton();
  
  // Toggle visibility and star based on radio selection (self vs other)
  document.addEventListener('DOMContentLoaded', function(){
    const selfRadio = document.getElementById('bookingForSelf');
    const otherRadio = document.getElementById('bookingForOther');
  const otherLabel = document.querySelector('label[for="bookingForOther"]');
  const otherWrap = document.getElementById('bookingForOtherWrap');
    const otherDetails = document.getElementById('otherGuestDetails');
    const stars = document.querySelectorAll('#otherGuestDetails .req-star');
    if(!selfRadio || !otherRadio || !otherDetails) return;

    // Initial state per requirement:
    // - Default select self
    // - Hide other guest details
    // - Disable the "other" option initially
  // Disable "other" at first render to match requested flow
  try{ otherRadio.disabled = true; }catch(_){}

    const apply = ()=>{
      const isOther = otherRadio.checked;
      otherDetails.classList.toggle('hidden', !isOther);
      stars.forEach(s=> s.classList.toggle('hidden', !isOther));
    };
    apply();

    // When user clicks the other option, enable it and show the section
    otherRadio.addEventListener('click', ()=>{ 
      if(otherRadio.disabled){ otherRadio.disabled = false; otherRadio.checked = true; }
      apply();
    });
    const activateOther = (e)=>{
      if(otherRadio.disabled){ if(e) e.preventDefault(); otherRadio.disabled = false; otherRadio.checked = true; apply(); }
    };
    if(otherLabel){ otherLabel.addEventListener('click', activateOther); }
    if(otherWrap){ otherWrap.addEventListener('click', (e)=>{
      // If click originated on the input itself, let its handler run; else activate
      if(e.target !== otherRadio) activateOther(e);
    }); }
    selfRadio.addEventListener('click', ()=>{ apply(); });
  });
  // Guest details are always visible now; removed checkbox toggle logic.
})();

// Add Special Requests toggles
(function(){
  function byId(id){ return document.getElementById(id); }
  function show(el, yes){ if(!el) return; el.classList.toggle('hidden', !yes); }
  document.addEventListener('DOMContentLoaded', function(){
    const ckIn = byId('reqCheckinTime');
    const ckInInput = byId('reqCheckinInput');
    const ckOut = byId('reqCheckoutTime');
    const ckOutInput = byId('reqCheckoutInput');
    const other = byId('reqOther');
    const otherText = byId('reqOtherText');
    const otherNote = byId('reqOtherNote');
    const inWrap = byId('reqCheckinWrap');
    const outWrap = byId('reqCheckoutWrap');
    const otherWrap = byId('reqOtherWrap');

    function apply(){
      show(ckInInput, !!ckIn && ckIn.checked);
      show(ckOutInput, !!ckOut && ckOut.checked);
      const o = !!other && other.checked;
      show(otherText, o);
      show(otherNote, o);
    }

    // --- HOLD helpers ---
    function getApiBase(){
      try{ return (/localhost|127\.0\.0\.1/.test(location.hostname)) ? 'https://www.backpackkohyao.com' : ''; }catch(_){ return ''; }
    }

    async function releaseHoldIfAny(reason){
      const raw = localStorage.getItem('booking_data');
      if(!raw) return false;
      let bd = {};
      try{ bd = JSON.parse(raw)||{}; }catch(_){ return false; }
      const holdId = bd.hold_id;
      if(!holdId) return false;
      const apiBase = getApiBase();
      const payload = { hold_id: holdId, updated_by: reason||'website' };
      let ok = false;
      try{
        let res = null;
        try{
          res = await fetch(`${apiBase}/api/v1/inventory-hold-release.php`, {
            method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache', keepalive:true
          });
        }catch(_e){ res = null; }
        if(!(res && res.ok)){
          try{
            res = await fetch(`${apiBase}/api/v1/inventory-hold-release.php`, {
              method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(payload), cache:'no-cache', keepalive:true
            });
          }catch(_e2){ res = null; }
          // If still not OK and first response was 404, fall back to expire endpoint on the same host
          if(!(res && res.ok)){
            try{
              await fetch(`${apiBase}/api/v1/inventory-hold-expire.php`, {
                method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify({ hold_id: holdId, updated_by: (reason||'website')+':fallback_expire' }), cache:'no-cache', keepalive:true
              });
            }catch(_e3){}
          }
        }
        ok = !!(res && res.ok);
      }finally{
        // Clean local hold fields regardless of server outcome
        delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
        try{ localStorage.setItem('booking_data', JSON.stringify(bd)); }catch(_2){}
      }
      return ok;
    }

    function releaseHoldOnUnload(){
      try{
        // Skip release if we're intentionally navigating to payment/confirmation
        try{ if(localStorage.getItem('skip_hold_release')==='1') return; }catch(_){ }
        const raw = localStorage.getItem('booking_data');
        if(!raw) return;
        const bd = JSON.parse(raw)||{};
        if(!bd.hold_id) return;
        const url = `${getApiBase()}/api/v1/inventory-hold-release.php`;
        const data = JSON.stringify({ hold_id: bd.hold_id, updated_by: 'window_unload' });
        // Prefer sendBeacon for reliability on unload
        if(navigator.sendBeacon){
          const blob = new Blob([data], { type: 'text/plain' });
          navigator.sendBeacon(url, blob);
        } else {
          // Fallback
          fetch(url, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body:data, keepalive:true }).catch(()=>{});
        }
        // Local cleanup
        delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds;
        localStorage.setItem('booking_data', JSON.stringify(bd));
      }catch(_){ }
    }

    // default: all unchecked/hidden
    apply();

    if(ckIn) ckIn.addEventListener('change', apply);
    if(ckOut) ckOut.addEventListener('change', apply);
    if(other) other.addEventListener('change', apply);

    // Clicking the label/wrapper should toggle like the checkbox
    function wireWrapToggle(wrapEl, inputEl){
      if(!wrapEl || !inputEl) return;
      wrapEl.addEventListener('click', function(e){
        // Avoid double toggling if the click is on the input itself
        if(e.target === inputEl) return;
        inputEl.checked = !inputEl.checked;
        inputEl.dispatchEvent(new Event('change'));
      });
    }
    wireWrapToggle(inWrap, ckIn);
    wireWrapToggle(outWrap, ckOut);
    wireWrapToggle(otherWrap, other);
  });
})();

// Debug helpers removed (panel deleted intentionally)

// Enhance Special Requests toggles: bed type and time boxes positioning
(function(){
  function byId(id){ return document.getElementById(id); }
  function show(el, yes){ if(!el) return; el.classList.toggle('hidden', !yes); }
  document.addEventListener('DOMContentLoaded', function(){
    const bedToggle = byId('reqBedToggle');
    const bedOpts = byId('reqBedOptions');
    const bedWrap = byId('reqBedWrap');
    function applyBed(){ show(bedOpts, !!bedToggle && bedToggle.checked); }
    applyBed();
    if(bedToggle) bedToggle.addEventListener('change', applyBed);
    if(bedWrap) bedWrap.addEventListener('click', function(e){
      // If the click is on any of the radio inputs, do not toggle the checkbox (keeps it open)
      if(e.target && (e.target.id === 'reqBedTwin' || e.target.id === 'reqBedKing')){
        return;
      }
      if(e.target === bedToggle) return;
      if(!bedToggle) return;
      bedToggle.checked = !bedToggle.checked;
      bedToggle.dispatchEvent(new Event('change'));
    });

    // Times
    const inCk = byId('reqCheckinTime');
    const inBox = byId('reqCheckinBox');
    const outCk = byId('reqCheckoutTime');
    const outBox = byId('reqCheckoutBox');
    function applyTimes(){
      show(inBox, !!inCk && inCk.checked);
      show(outBox, !!outCk && outCk.checked);
    }
    applyTimes();
    if(inCk) inCk.addEventListener('change', applyTimes);
    if(outCk) outCk.addEventListener('change', applyTimes);
  });
})();
