(function(){
  function toTHB(n){ return Number(n).toFixed(2); }
  function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }
  // Resolve API base: localhost uses local endpoints via Apache; Production uses relative paths
  function getApiBase(){
    // Local-first: use override from localStorage (api_base) if set; otherwise use relative path
    try{ const v = localStorage.getItem('api_base'); return v ? v : ''; }catch(_){ return ''; }
  }

  // ---------- Helpers: Bulk Hold API (รองรับปล่อย hold_ids[] แบบ bulk) ----------
  function getHoldIdsFromBookingData() {
    try {
      const raw = localStorage.getItem('booking_data');
      if (!raw) return [];
      const bd = JSON.parse(raw) || {};
      // Priority 1: hold_ids array
      if (Array.isArray(bd.hold_ids) && bd.hold_ids.length) return bd.hold_ids.slice();
      // Priority 2: extract from holds_detail
      if (Array.isArray(bd.holds_detail) && bd.holds_detail.length) {
        return bd.holds_detail.map(h => h.hold_id).filter(Boolean);
      }
      // Priority 3: single hold_id (legacy)
      if (bd.hold_id) return [bd.hold_id];
      return [];
    } catch (_) { return []; }
  }

  async function callHoldApiBulk(endpointPath, payloadObj) {
    const apiBase = getApiBase();
    const urls = [
      `${apiBase}/api/v1/${endpointPath}`,
      `${apiBase}/php-api/v1/${endpointPath}`
    ];
    const bodies = [
      { ct: 'application/json',            body: JSON.stringify(payloadObj) },
      { ct: 'text/plain;charset=UTF-8',    body: JSON.stringify(payloadObj) }
    ];
    for (const u of urls) {
      for (const b of bodies) {
        try {
          const res = await fetch(u, {
            method: 'POST',
            headers: { 'Content-Type': b.ct },
            credentials: 'omit',
            mode: 'cors',
            cache: 'no-cache',
            body: b.body
          });
          if (res && res.ok) return true;
        } catch (_) {}
      }
    }
    return false;
  }

  function beaconHoldApiBulk(endpointPath, payloadObj) {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/v1/${endpointPath}`;
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payloadObj)], { type: 'text/plain' });
        return navigator.sendBeacon(url, blob);
      }
    } catch (_) {}
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        credentials: 'omit',
        mode: 'cors',
        keepalive: true,
        body: JSON.stringify(payloadObj)
      });
    } catch (_) {}
    return false;
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

  // ---------- Guest form helpers ----------
  function ensureGuestFormValid(){
    try{
      const other = document.getElementById('bookingForOther');
      const isOther = !!(other && other.checked);
      if(!isOther) return true; // Self booking: main fields are already required upstream on server
      const title = (document.getElementById('guestTitle')||{}).value || '';
      const first = (document.getElementById('otherGuestFirstName')||{}).value || '';
      const last  = (document.getElementById('otherGuestLastName')||{}).value || '';
      const cc    = (document.getElementById('guestPhoneCountryCode')||{}).value || '';
      const ph    = (document.getElementById('guestPhoneNumber')||{}).value || '';
      if(!title || !first.trim() || !last.trim() || !cc || !ph.trim()){
        const msg = (window.currentLang==='en')? 'Please fill in all guest details' : 'กรุณากรอกรายละเอียดผู้เข้าพักให้ครบถ้วน';
        showCustomAlert(msg);
        // focus first missing
        if(!title) (document.getElementById('guestTitle')||{}).focus?.();
        else if(!first.trim()) (document.getElementById('otherGuestFirstName')||{}).focus?.();
        else if(!last.trim()) (document.getElementById('otherGuestLastName')||{}).focus?.();
        else if(!cc) (document.getElementById('guestPhoneCountryCode')||{}).focus?.();
        else (document.getElementById('guestPhoneNumber')||{}).focus?.();
        return false;
      }
      return true;
    }catch(_){ return true; }
  }

  function collectGuestForm(){
    const selfChecked = !!(document.getElementById('bookingForSelf') && document.getElementById('bookingForSelf').checked);
    const title = (document.getElementById('title')||{}).value || '';
    const first = (document.getElementById('firstName')||{}).value || '';
    const last  = (document.getElementById('lastName')||{}).value || '';
    const cc    = (document.getElementById('countryCode')||{}).value || '';
    const ph    = (document.getElementById('mobile')||{}).value || '';
    const email = (document.getElementById('email')||{}).value || '';
    const form = {
      is_guest: selfChecked ? 1 : 0,
      title, booker_first_name:first, booker_last_name:last,
      email, phone_country_code:cc, phone_number:ph
    };
    if(!selfChecked){
      form.guest_title = (document.getElementById('guestTitle')||{}).value || '';
      form.guest_first_name = (document.getElementById('otherGuestFirstName')||{}).value || '';
      form.guest_last_name  = (document.getElementById('otherGuestLastName')||{}).value || '';
      form.guest_phone_country_code = (document.getElementById('guestPhoneCountryCode')||{}).value || '';
      form.guest_phone_number = (document.getElementById('guestPhoneNumber')||{}).value || '';
    }
    return form;
  }

  function ymd(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
  function deriveStayDates(ci, nights){
    const arr=[]; if(!ci || !Number.isFinite(nights)) return arr; const start = new Date(ci); start.setHours(0,0,0,0);
    for(let i=0;i<nights;i++){ const d = new Date(start); d.setDate(start.getDate()+i); arr.push(ymd(d)); }
    return arr;
  }

  function collectSpecialRequests(){
    try{
      const raw = localStorage.getItem('booking_requests');
      const list = raw ? JSON.parse(raw) : [];
      if(Array.isArray(list)){
        return list.map(x=>({ preset_id: x.id, preset_code: x.code, note: x.note||'', selected: 1 }));
      }
    }catch(_){ }
    // Fallback: read from DOM
    const grid = document.getElementById('request-presets-grid');
    const res=[];
    if(grid){
      grid.querySelectorAll('input[data-preset-id]').forEach(cb=>{
        if(cb.checked){
          const id = Number(cb.getAttribute('data-preset-id'));
          const code = cb.getAttribute('data-preset-code')||'';
          let note='';
          const requires = cb.getAttribute('data-requires-note')==='1';
          if(requires){ const ta = grid.querySelector(`textarea[data-note-for="${id}"]`); if(ta) note = (ta.value||'').trim(); }
          res.push({ preset_id:id, preset_code:code, note, selected:1 });
        }
      });
    }
    return res;
  }

  function collectPolicyAgreement(){
    const agreed = !!(document.getElementById('agree') && document.getElementById('agree').checked);
    return { agreed_terms: agreed, terms_version: 'v1', policy_id: null };
  }

  function sum(arr){ return (Array.isArray(arr)? arr.reduce((s,v)=> s + Number(v||0), 0):0); }
  function itemsRoomsCount(items){ return items.reduce((s,it)=> s + Number(it.quantity||0), 0); }

  function buildCartForBooking(bd){
    const nights = calculateNights(bd.check_in, bd.check_out);
    const stayDates = deriveStayDates(bd.check_in, nights);
    const items=[]; let room_total_minor=0;
    const adults = Number(bd.adults || bd.guests || 1);
    const children = Number(bd.children || 0);
    if(Array.isArray(bd.cart) && bd.cart.length){
      bd.cart.forEach(ci=>{
        const qty = Number(ci.qty||1);
        const nightly = Array.isArray(ci.nightly_prices) ? ci.nightly_prices.slice() : [];
        const lineSub = sum(nightly) * qty;
        const nightsArr = stayDates.map((d,idx)=>{
          const base = Number(nightly[idx]||0);
          return { stay_date:d, quantity: qty, base_price_minor: base, tax_minor: 0, total_minor: base*qty, rate_source:'PLAN' };
        });
        items.push({
          room_type_id: ci.room_type_id,
          rate_plan_id: ci.rate_plan_id,
          unit_type: (ci.is_private? 'ROOM':'BED'),
          quantity: qty,
          pax_adults: Number(ci.guests || adults),
          pax_children: children,
          line_subtotal_minor: lineSub,
          line_taxes_minor: 0,
          line_total_minor: lineSub,
          nights: nightsArr
        });
        room_total_minor += lineSub;
      });
    } else if(Array.isArray(bd.rooms_detail) && bd.rooms_detail.length){
      const rd = bd.rooms_detail[0];
      const qty = Number(bd.rooms || 1);
      const nightly = Array.isArray(rd.nightly_prices_minor) ? rd.nightly_prices_minor.slice() : [];
      const lineSub = sum(nightly) * qty;
      const nightsArr = stayDates.map((d,idx)=>{
        const base = Number(nightly[idx]||0);
        return { stay_date:d, quantity: qty, base_price_minor: base, tax_minor: 0, total_minor: base*qty, rate_source:'PLAN' };
      });
      items.push({
        room_type_id: rd.room_type_id,
        rate_plan_id: rd.rate_plan_id,
        unit_type: (bd.is_private? 'ROOM':'BED'),
        quantity: qty,
        pax_adults: adults,
        pax_children: children,
        line_subtotal_minor: lineSub,
        line_taxes_minor: 0,
        line_total_minor: lineSub,
        nights: nightsArr
      });
      room_total_minor += lineSub;
    }

    // Taxes and fees calculation (reuse last loaded config)
    const taxConfig = (window.__lastTaxConfig || getDefaultTaxConfig());
    const calc = calculateTaxesAndFees(room_total_minor/100, taxConfig, {
      guests: adults,
      rooms: itemsRoomsCount(items) || Number(bd.rooms||1),
      nights
    });
    const service_charge = Math.round(Number(calc.service_charge||0)*100);
    const fee = Math.round(Number(calc.booking_fee||0)*100);
    const vat = Math.round(Number(calc.vat||0)*100);
    const local_tax = Math.round(Number(calc.local_tax||0)*100);
    const grand_total_minor = Math.round(Number(calc.grand_total||0)*100);
    const taxes_total_minor = vat + local_tax;

    const summary_minor = {
      room_charge: Math.round(room_total_minor),
      service_charge, fee, vat, local_tax,
      room_total_minor: Math.round(room_total_minor + service_charge + fee),
      taxes_total_minor,
      grand_total_minor,
      pay_now_minor: grand_total_minor
    };

    const tax_breakdown = [];
    if(vat>0){ tax_breakdown.push({ scope:'BOOKING', tax_type:'VAT', base_amount_minor: Math.round((calc.vat_base_amount_minor)|| Math.round((room_total_minor+service_charge+fee))), rate_pct: Number(taxConfig.vat_pct||0), unit:'PERCENT', quantity:1, amount_minor: vat, currency:'THB', vat_base: String(taxConfig.vat_base||'ROOM_ONLY') }); }
    if(local_tax>0){ tax_breakdown.push({ scope:'BOOKING', tax_type:'LOCAL_TAX', base_amount_minor: 0, rate_pct: null, unit: String(taxConfig.local_tax_unit||'PER_BOOKING'), quantity: 1, amount_minor: local_tax, currency:'THB', local_tax_unit: String(taxConfig.local_tax_unit||'PER_BOOKING') }); }
    if(fee>0){ tax_breakdown.push({ scope:'BOOKING', tax_type:'BOOKING_FEE', base_amount_minor: 0, rate_pct: null, unit: String(taxConfig.fee_unit||'PER_BOOKING'), quantity: 1, amount_minor: fee, currency:'THB', fee_base: String(taxConfig.fee_base||'ROOM_ONLY') }); }

    return {
      check_in_date: bd.check_in || null,
      check_out_date: bd.check_out || null,
      nights,
      currency: 'THB',
      items,
      tax_breakdown,
      summary_minor
    };
  }

  // Custom alert modal (system style)
  function showCustomAlert(message){
    let modal = document.getElementById('customAlertModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'customAlertModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content compact" style="max-width:400px;" tabindex="-1">
          <div class="modal-header">
            <h3 class="color-brand">แจ้งเตือน</h3>
          </div>
          <div class="modal-body">
            <p id="customAlertMessage"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" id="customAlertOkBtn">ตรวจสอบ</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const okBtn = modal.querySelector('#customAlertOkBtn');
      okBtn.addEventListener('click', ()=> modal.classList.add('hidden'));
    }
    modal.querySelector('#customAlertMessage').textContent = message;
    modal.classList.remove('hidden');
  }

  function wireActions(){
  const agree = document.getElementById('agree');
  const bookBtn = document.getElementById('bookBtn');
  const reviewBtn = document.getElementById('reviewBtn');
  const changeDatesBtn = document.getElementById('changeDatesBtn');
  // Special Requests section removed from UI; keep variables undefined
  const toggleRequests = null;
  const requestsWrap = null;

  // Booking for self/other toggles
  const bookingForSelf = document.getElementById('bookingForSelf');
  const bookingForOther = document.getElementById('bookingForOther');
  const otherGuestDetails = document.getElementById('otherGuestDetails');
  function applyBookingFor(){
    const showOther = !!(bookingForOther && bookingForOther.checked);
    if(otherGuestDetails){
      otherGuestDetails.classList.toggle('hidden', !showOther);
      try{ otherGuestDetails.setAttribute('aria-hidden', showOther? 'false':'true'); }catch(_){ }
      try{ otherGuestDetails.querySelectorAll('.req-star').forEach(el=> el.classList.toggle('hidden', !showOther)); }catch(_){ }
    }
    // Recompute gating whenever booking-for mode changes
    try{ updateAgreeAvailability && updateAgreeAvailability(); updateBookBtnState && updateBookBtnState(); }catch(_){ }
  }
  if(bookingForSelf) bookingForSelf.addEventListener('change', applyBookingFor);
  if(bookingForOther) bookingForOther.addEventListener('change', applyBookingFor);
  // Initialize state on load
  applyBookingFor();


    // Initial state: disable Book button until contact+terms pass
    if(bookBtn){ bookBtn.setAttribute('disabled','disabled'); }

    // Helper: basic validators for contact section
    const tl = document.getElementById('title');
    const fn = document.getElementById('firstName');
    const ln = document.getElementById('lastName');
    const cc = document.getElementById('countryCode');
    const mb = document.getElementById('mobile');
    const em = document.getElementById('email');
    function nonEmpty(v){ return !!(v && String(v).trim().length>0); }
    function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim()); }
    function isContactValid(){
      return nonEmpty(tl?.value) && nonEmpty(fn?.value) && nonEmpty(ln?.value) && nonEmpty(mb?.value) && nonEmpty(cc?.value) && isEmail(em?.value);
    }
      // Validate other-guest fields only when booking for others
      function isOtherGuestValid(){
        const isOther = !!(document.getElementById('bookingForOther') && document.getElementById('bookingForOther').checked);
        if(!isOther) return true;
        const gtl = document.getElementById('guestTitle');
        const gfn = document.getElementById('otherGuestFirstName');
        const gln = document.getElementById('otherGuestLastName');
        const gcc = document.getElementById('guestPhoneCountryCode');
        const gph = document.getElementById('guestPhoneNumber');
        return nonEmpty(gtl?.value) && nonEmpty(gfn?.value) && nonEmpty(gln?.value) && nonEmpty(gcc?.value) && nonEmpty(gph?.value);
      }
    function focusFirstInvalid(){
      if(!nonEmpty(tl?.value)) { tl?.focus?.(); return; }
      if(!nonEmpty(fn?.value)) { fn?.focus?.(); return; }
      if(!nonEmpty(ln?.value)) { ln?.focus?.(); return; }
      if(!nonEmpty(cc?.value)) { cc?.focus?.(); return; }
      if(!nonEmpty(mb?.value)) { mb?.focus?.(); return; }
      if(!isEmail(em?.value)) { em?.focus?.(); return; }
    }
    function showFillContactAlert(){
      const th = 'กรุณากรอกรายละเอียดข้อมูลติดต่อในการจองให้ครบถ้วน';
      const en = 'Please fill in all contact information for booking';
      const msg = (window.currentLang||'th').toLowerCase()==='en' ? en : th;
      showCustomAlert(msg);
    }
    function updateAgreeAvailability(){ if(agree){ agree.disabled = !(isContactValid() && isOtherGuestValid()); } }
    function updateBookBtnState(){ if(bookBtn){ if(agree && agree.checked && isContactValid() && isOtherGuestValid()) bookBtn.removeAttribute('disabled'); else bookBtn.setAttribute('disabled','disabled'); } }
    // Attach listeners to contact inputs
    [fn, ln, cc, mb, em].forEach(el=>{ if(!el) return; ['input','change','blur'].forEach(ev=> el.addEventListener(ev, ()=>{ updateAgreeAvailability(); updateBookBtnState(); })); });
    // Attach listeners to other-guest fields and radio toggles to keep gating in sync
    const otherInputs = [
      document.getElementById('bookingForSelf'),
      document.getElementById('bookingForOther'),
      document.getElementById('guestTitle'),
      document.getElementById('otherGuestFirstName'),
      document.getElementById('otherGuestLastName'),
      document.getElementById('guestPhoneCountryCode'),
      document.getElementById('guestPhoneNumber')
    ];
    otherInputs.forEach(el=>{ if(!el) return; ['input','change','blur'].forEach(ev=> el.addEventListener(ev, ()=>{ updateAgreeAvailability(); updateBookBtnState(); })); });

    // Wire Terms modal
    const termsModal = document.getElementById('termsModal');
    const termsOkBtn = document.getElementById('termsOkBtn');
    const termsCloseBtn = document.getElementById('termsCloseBtn');
    function openTerms(){ if(termsModal) termsModal.classList.remove('hidden'); }
    function closeTerms(){ if(termsModal) termsModal.classList.add('hidden'); }
    // Dynamic Terms fetch & render
    async function fetchAndRenderTerms(){
      const lang = (window.currentLang || document.documentElement.lang || 'th').toLowerCase() === 'en' ? 'en' : 'th';
      const listContainer = termsModal ? termsModal.querySelector('.modal-body ul') : null;
      if(listContainer){ listContainer.innerHTML = '<li class="muted">กำลังโหลด...</li>'; }
      try{
        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        const urls = [
          `${apiBase}/api/v1/booking-terms-with-items.php?lang=${lang}`,
          `${apiBase}/php-api/v1/booking-terms-with-items.php?lang=${lang}`
        ];
        let data = null; let ok = false; let lastErr = null;
        for(const u of urls){
          try{
            const r = await fetch(u, { cache:'no-cache' });
            if(r.ok){ data = await r.json(); ok = true; break; } else { lastErr = new Error('HTTP '+r.status); }
          }catch(e){ lastErr = e; }
        }
        if(!ok || !data){ throw lastErr || new Error('NETWORK'); }
        if(!data.ok){
          if(listContainer){ listContainer.innerHTML = `<li class="text-danger">${data.error||'ไม่พบข้อกำหนด'}</li>`; }
          return;
        }
        if(listContainer){
          listContainer.innerHTML = '';
          const items = Array.isArray(data.items) ? data.items : [];
          items.forEach(it => {
            const li = document.createElement('li');
            // เลือก content ตามภาษา
            const content = (lang==='en' ? (it.content_en||'') : (it.content_th||'')) || '';
            const title = (lang==='en' ? (it.title_en||'') : (it.title_th||'')) || '';
            li.innerHTML = `<strong>${title}</strong> — <span>${content}</span>`;
            listContainer.appendChild(li);
          });
          if(!items.length){
            listContainer.innerHTML = '<li class="muted">(ไม่มีรายการข้อกำหนด)</li>';
          }
        }
      }catch(err){
        if(listContainer){ listContainer.innerHTML = `<li class="text-danger">โหลดข้อกำหนดล้มเหลว กรุณาลองอีกครั้ง (${err.message})</li>`; }
      }
    }
    function openTermsDynamic(){ openTerms(); fetchAndRenderTerms(); }
    if(agree){
      agree.addEventListener('change', ()=>{
        if(agree.checked){
          // Block until contact section is valid
          if(!isContactValid()){
            agree.checked = false;
            showFillContactAlert();
            focusFirstInvalid();
            updateAgreeAvailability();
            updateBookBtnState();
            return;
          }
          // If booking for others, ensure guest fields are valid before opening terms
          if(!isOtherGuestValid()){
            agree.checked = false;
            // Reuse existing guest validator to show message and focus
            ensureGuestFormValid();
            updateAgreeAvailability();
            updateBookBtnState();
            return;
          }
          agree.checked = false; // wait for explicit confirmation in modal
          openTermsDynamic();
        }
      });
    }
    if(termsOkBtn){ termsOkBtn.addEventListener('click', ()=>{ if(agree) agree.checked = true; closeTerms(); updateBookBtnState(); }); }
    if(termsCloseBtn){ termsCloseBtn.addEventListener('click', ()=>{ closeTerms(); }); }
    // Allow clicking heading to re-open & refresh
    const termsTitle = document.getElementById('termsTitle');
    if(termsTitle){ termsTitle.style.cursor = 'pointer'; termsTitle.addEventListener('click', openTermsDynamic); }
  const agreeLabel = document.querySelector('label[for="agree"]');
  if(agreeLabel){ agreeLabel.addEventListener('click', function(e){
    e.preventDefault();
    // Guard: require contact section before opening modal
    if(!isContactValid()){
      showFillContactAlert();
      focusFirstInvalid();
      updateAgreeAvailability();
      updateBookBtnState();
      return;
    }
    // Guard: require other-guest fields when booking for others
    if(!isOtherGuestValid()){
      ensureGuestFormValid();
      updateAgreeAvailability();
      updateBookBtnState();
      return;
    }
    if(agree) agree.checked = false; openTermsDynamic();
  }); }
    // Initialize toggle availability and button state
    updateAgreeAvailability();
    updateBookBtnState();

    // Change Dates button handler removed here - now handled after loadBookingData() to ensure hold release
    
    function mustAgree(){
      if(!agree.checked){ try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.mustAgree') : alert('Please accept the terms'); }catch(_){ } return false; }
      return true;
    }
  bookBtn.addEventListener('click', async (e)=>{
    e.preventDefault();
    if(!mustAgree()) return;
    if(!ensureGuestFormValid()) return;
    // Validate special requests notes
    try{
      const grid=document.getElementById('request-presets-grid');
      if(grid){
        let invalid=false; let firstEl=null;
        grid.querySelectorAll('input[data-requires-note="1"]').forEach(cb=>{
          if(cb.checked){
            const id=cb.getAttribute('data-preset-id');
            const ta=grid.querySelector(`textarea[data-note-for="${id}"]`);
            const noteReq=grid.querySelector(`small[data-note-required-for="${id}"]`);
            if(ta && ta.value.trim().length===0){ invalid=true; if(noteReq) noteReq.classList.remove('hidden'); if(!firstEl) firstEl=ta; }
          }
        });
        if(invalid){
          (window.Messages && window.Messages.alert)? window.Messages.alert('msg.checkout.requests.noteRequired') : alert((window.currentLang==='en')? 'Please fill the required note for selected requests':'กรุณาระบุรายละเอียดสำหรับคำขอที่เลือก');
          if(firstEl) firstEl.focus();
          return;
        }
      }
    }catch(_){ }
    // Build phase-1 booking payload and call new API
    try{
      const bdRaw = localStorage.getItem('booking_data');
      const bd = bdRaw ? JSON.parse(bdRaw) : {};
      const cart = buildCartForBooking(bd);
  const guest_form = collectGuestForm();
      const requests = collectSpecialRequests();
      const policy = collectPolicyAgreement();
      const fullPayload = { cart, guest_form, requests, policy, channel:'WEBSITE', created_by:'website' };
      console.log('📤 PENDING booking payload:', fullPayload);
      let resp=null; let apiErr=null;
      if(window.API && window.API.fetchJson){
        try{ resp = await window.API.fetchJson('/php-api/v1/bookings.php', { method:'POST', body: JSON.stringify(fullPayload) }); }catch(err){ apiErr=err; }
      }
      if(resp && resp.ok){
        console.log('✅ Booking created:', resp.booking);
        try{ localStorage.setItem('booking_result', JSON.stringify(resp)); }catch(_){ }
        try{ localStorage.setItem('booking_id', String(resp.booking.id)); }catch(_){ }
        try{ localStorage.setItem('skip_hold_release','1'); }catch(_){ }
        window.location.href = 'payment.html'; // placeholder next step
      } else {
        console.warn('❌ Booking API failed', apiErr);
        alert((window.currentLang==='en')? 'Failed to create booking' : 'สร้างใบจองไม่สำเร็จ');
      }
    }catch(err){
      console.error('❌ Unexpected booking error', err);
      alert((window.currentLang==='en')? 'Unexpected error creating booking' : 'เกิดข้อผิดพลาดระหว่างสร้างใบจอง');
    }
  });
  if(reviewBtn){
    reviewBtn.addEventListener('click', (e)=>{ e.preventDefault(); try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.reviewing') : alert('Reviewing your booking…'); }catch(_){ } });
  }
  }

  // แสดงสรุปรายการที่เลือกในรูปแบบที่ผู้ใช้ร้องขอ
  // รูปแบบ:
  // ท่านเลือกห้อง:
  // เตียง: <รายละเอียด rate plan>
  // เตียง: <รายละเอียด rate plan>
  // ... (ตามจำนวนรายการใน rooms_detail)
  // 
  // ผู้ใหญ่: <จำนวน> ท่าน  ← ส่วนนี้จะใช้บล็อค Guest Count เดิมด้านล่าง
  function displayRoomSelection(bookingData) {
    const listContainer = document.getElementById('roomSelectionList');
    console.log('📍 displayRoomSelection called, listContainer:', listContainer);
    if (!listContainer) {
      console.warn('❌ roomSelectionList element not found!');
      return;
    }
    
    // ตั้งหัวข้อเป็น "ท่านเลือกห้อง:" และป้องกัน i18n เขียนทับ
    try{
      const header = document.querySelector('#roomSelectionSummary .muted');
      if(header){ header.textContent = 'ท่านเลือกห้อง:'; header.removeAttribute('data-i18n'); }
    }catch(_){ }

    listContainer.innerHTML = ''; // Clear previous content

    // Prefer cart[] (new model); fallback to rooms_detail (legacy adapter)
    const items = (Array.isArray(bookingData.cart) && bookingData.cart.length)
      ? bookingData.cart
      : (Array.isArray(bookingData.rooms_detail) ? bookingData.rooms_detail : []);

    const totalRooms = (Array.isArray(items) ? items.reduce((s,it)=> s + Number(it.qty||1), 0) : 0) || (bookingData.rooms||0);
    const guests = Number(bookingData.adults || bookingData.guests || 0);
    // กำหนดหน่วยเป็น "ห้อง" หรือ "เตียง" ตาม room_types.is_private (รองรับค่าทั้ง 0/1 และ true/false)
    let unitWord = 'ห้อง';
    try{
      const isPrivTrue = v => (v === true || v === 1 || v === '1');
      const isPrivFalse = v => (v === false || v === 0 || v === '0');
      if(Array.isArray(items) && items.length>0){
        const allPrivate = items.every(it => isPrivTrue(it && it.is_private));
        const allDorm   = items.every(it => isPrivFalse(it && it.is_private));
        if(allPrivate) unitWord = 'ห้อง';
        else if(allDorm) unitWord = 'เตียง';
        // หากผสมกัน คงเป็นค่าเริ่มต้น
      }
    }catch(_){ }
    console.log('📊 Room data (cart preferred):', {items, totalRooms, guests});

  // แสดงบรรทัดสรุปกลับมาอีกครั้งตามคำขอ (X ห้อง/เตียง สำหรับผู้ใหญ่ Y ท่าน)
  const summaryLine = document.createElement('div');
  summaryLine.className = 'mb-2';
  summaryLine.innerHTML = `<strong>${totalRooms} ${unitWord} สำหรับผู้ใหญ่ ${guests} ท่าน</strong>`;
  listContainer.appendChild(summaryLine);

    if (Array.isArray(items) && items.length > 0) {
      const lang = (window.currentLang || document.documentElement.lang || 'th').toLowerCase();
      items.forEach((it, idx) => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'ml-0 mb-2';
        // Prefer explicit language-specific descriptions if available
        const descTh = it.rate_plan_desc_th || it.description_th || '';
        const descEn = it.rate_plan_desc_en || it.description_en || '';
        const fallback = it.rate_plan_desc || it.plan_description || it.rate_plan_name || it.plan_name || it.name_th || it.name_en || '';
        const chosenDesc = (lang==='en') ? (descEn || fallback) : (descTh || fallback);
        const qty = Number(it.qty||1);
        // Show bed icon first, then show API description verbatim (do not strip prefixes)
        const line = `🛏️ ${chosenDesc}${qty>1?` × ${qty}`:''}`;
        const descDiv = document.createElement('div');
        descDiv.className = 'muted';
        descDiv.textContent = line;
        roomDiv.appendChild(descDiv);
        listContainer.appendChild(roomDiv);
        console.log(`✅ Added cart item ${idx+1}: ${line}`);
      });
    } else {
      console.warn('⚠️ No items to display');
    }
  }

  // Display guest count
  function displayGuestCount(guests) {
    const guestCountDisplay = document.getElementById('guestCountDisplay');
    if (guestCountDisplay) {
      // ตามคำขอ: ไม่แสดงบรรทัด "ผู้ใหญ่: X ท่าน" ในกล่องสรุปด้านขวา
      try{
        const container = guestCountDisplay.closest('div');
        if(container) container.style.display = 'none';
      }catch(_){ }
      // เก็บค่าไว้ใน DOM เผื่อสคริปต์อื่นอ้างอิง แต่ไม่แสดงผล
      guestCountDisplay.textContent = guests || '0';
    }
  }

  function loadDraft(){
    // ใช้ข้อมูลใหม่จาก booking_data แทน booking_draft
    loadBookingData();
  }
  
  async function loadBookingData() {
    try {
      let raw = localStorage.getItem('booking_data');
      // Fallback: if booking_data doesn't exist yet, try to build it from booking_session (cart)
      if (!raw) {
        try {
          const sessionRaw = localStorage.getItem('booking_session');
          if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session && Array.isArray(session.cart) && session.cart.length > 0) {
              const first = session.cart[0];
              // Build minimal booking_data from session; HOLD will be created later by existing logic
              const derived = {
                check_in: session.check_in || null,
                check_out: session.check_out || null,
                nights: Number(session.nights || 0),
                adults: Number(session.adults || 2),
                children: Number(session.children || 0),
                cart: session.cart.map(it => ({
                  room_type_id: it.room_type_id,
                  is_private: it.is_private,
                  rate_plan_id: it.rate_plan_id,
                  rate_plan_name: it.rate_plan_name,
                  rate_plan_desc: it.rate_plan_desc,
                  rate_plan_desc_th: it.rate_plan_desc_th,
                  rate_plan_desc_en: it.rate_plan_desc_en,
                  qty: Number(it.qty || 1),
                  guests: Number(it.guests || session.adults || 2),
                  nightly_prices: Array.isArray(it.nightly_prices) ? it.nightly_prices.slice() : []
                })),
                // Back-compat top-level fields
                room_type_id: first.room_type_id,
                is_private: first.is_private,
                mode: first && (first.is_private ? 'PRIVATE' : 'DORM'),
                rate_plan_id: first.rate_plan_id,
                rate_plan_name: first.rate_plan_name,
                rooms: session.cart.reduce((s, it) => s + Number(it.qty || 1), 0),
                booking_timestamp: new Date().toISOString()
              };
              localStorage.setItem('booking_data', JSON.stringify(derived));
              raw = JSON.stringify(derived);
              console.log('🧩 Built booking_data from booking_session:', derived);
            }
          }
        } catch (e) {
          console.warn('Failed to build booking_data from booking_session:', e);
        }
      }
      if (!raw) {
        console.warn('⚠️ No booking_data found');
        return;
      }
      
      let bookingData = JSON.parse(raw);
      console.log('📦 Loaded booking data:', bookingData);

      // NEW MULTI-RATE-PLAN CART COMPATIBILITY LAYER
      // If cart[] exists (new format), convert to compatible structure for rest of checkout logic
      if(Array.isArray(bookingData.cart) && bookingData.cart.length > 0){
        console.log('🔄 Cart[] detected - normalizing for checkout calculations...');
        
        // Convert cart[] items to rooms_detail array format for display
        bookingData.rooms_detail = bookingData.cart.map((cartItem, idx)=> ({
          room_type_id: cartItem.room_type_id,
          is_private: cartItem.is_private,
          rate_plan_id: cartItem.rate_plan_id,
          rate_plan_name: cartItem.rate_plan_name,
          qty: cartItem.qty,
          guests: cartItem.guests,
          nightly_prices_minor: cartItem.nightly_prices || []  // Reuse nightly_prices array (already in minor units)
        }));
        
        // For top-level backward compat, use first cart item
        const primary = bookingData.cart[0];
        bookingData.room_type_id = primary.room_type_id;
        bookingData.is_private = primary.is_private;
        bookingData.mode = primary.is_private ? 'PRIVATE' : 'DORM';
        bookingData.rate_plan_id = primary.rate_plan_id;
        bookingData.rate_plan_name = primary.rate_plan_name;
        
        // Update nightly_prices_minor to sum across all cart items per night
        if(primary.nightly_prices && Array.isArray(primary.nightly_prices)){
          // Each night price array has prices in minor units
          const nightCount = primary.nightly_prices.length;
          bookingData.nightly_prices_minor = [];
          for(let night = 0; night < nightCount; night++){
            let totalForNight = 0;
            bookingData.cart.forEach(item=> {
              if(Array.isArray(item.nightly_prices) && item.nightly_prices[night]){
                totalForNight += (item.nightly_prices[night] * item.qty);
              }
            });
            bookingData.nightly_prices_minor.push(totalForNight);
          }
          console.log('📊 Summed nightly_prices_minor across cart:', bookingData.nightly_prices_minor);
        }
        
        // Set total rooms = sum of qty across cart
        bookingData.rooms = bookingData.cart.reduce((sum, item)=> sum + item.qty, 0);
      }

      // Backward/forward compatibility: when booking_data uses rooms_detail array,
      // derive top-level fields from the first room so downstream logic continues to work.
      try{
        if(Array.isArray(bookingData.rooms_detail) && bookingData.rooms_detail.length > 0){
          const primary = bookingData.rooms_detail[0] || {};
          // Only fill when missing to avoid overwriting explicit values
          if(bookingData.room_name == null && primary.room_name != null) bookingData.room_name = primary.room_name;
          if(bookingData.mode == null && primary.mode != null) bookingData.mode = primary.mode;
          if(bookingData.is_private == null && primary.is_private != null) bookingData.is_private = primary.is_private;
          if(!Array.isArray(bookingData.nightly_prices_minor) && Array.isArray(primary.nightly_prices_minor)) bookingData.nightly_prices_minor = primary.nightly_prices_minor.slice();
          if(bookingData.rate_plan == null && primary.rate_plan != null) bookingData.rate_plan = primary.rate_plan;
          if(bookingData.room_type_id == null && primary.room_type_id != null) bookingData.room_type_id = primary.room_type_id;
        }
      }catch(_){ /* non-fatal */ }
      
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
      // Prefer adults, fallback to guests; normalize to number
      const guestsForDisplay = Number((bookingData.adults != null ? bookingData.adults : bookingData.guests) || 0);
      // เอาข้อความผู้ใหญ่ในตำแหน่ง paxDetails ออกตามคำขอ (ซ่อน/เคลียร์)
      try {
        const paxDetailsEl = document.getElementById('paxDetails');
        if (paxDetailsEl) {
          paxDetailsEl.textContent = '';
          paxDetailsEl.removeAttribute('data-i18n');
          paxDetailsEl.style.display = 'none';
        }
      } catch(_) {}
      
      // 4.5 แสดงรายละเอียดห้องที่เลือก (ท่านเลือก: 3 ห้อง สำหรับผู้ใหญ่ 1 ท่าน)
      displayRoomSelection(bookingData);
      displayGuestCount(guestsForDisplay);
      
      // 5. เตรียมข้อมูลการคำนวณตาม canonical spec (exclusive)
      let rooms = Number(bookingData.rooms || 1);
      let guests = Number(bookingData.adults || bookingData.guests || 1);

      // If cart[] exists, compute total room price by summing each cart item: sum(nightly_prices) * qty
      let roomPriceInBaht = 0;
      if (Array.isArray(bookingData.cart) && bookingData.cart.length > 0){
        const totalMinor = bookingData.cart.reduce((acc, item)=>{
          const nightly = Array.isArray(item.nightly_prices) ? item.nightly_prices : [];
          const sumOne = nightly.reduce((s,v)=> s + Number(v || 0), 0);
          return acc + (sumOne * Number(item.qty||1));
        }, 0);
        roomPriceInBaht = totalMinor / 100;
        // Derive rooms as sum of qty if not set
        if(!bookingData.rooms){ rooms = bookingData.cart.reduce((s,it)=> s + Number(it.qty||1), 0); }
      } else {
        // Legacy single-plan path
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
        roomPriceInBaht = roomPriceMinor / 100;
        console.log('💰 Legacy single-plan computation used');
      }

      console.log('💰 Room price calculation (exclusive, total over cart if present):', {
        nights,
        rooms,
        guests,
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
    const ids = Array.isArray(bd.hold_ids) && bd.hold_ids.length ? bd.hold_ids : (bd.hold_id ? [bd.hold_id] : []);
    if(!ids.length) return false;

    const apiBase = getApiBase();
    console.log(`🔓 Attempting to release holds ${ids.join(',')}, reason: ${reason}`);

    try{
      const payloadObj = (Array.isArray(bd.hold_ids) && bd.hold_ids.length)
        ? { hold_ids: ids, reason: (reason||'website'), updated_by: reason||'website' }
        : { hold_id: ids[0], updated_by: reason||'website' };
      const payload = JSON.stringify(payloadObj);
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
      delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds; delete bd.hold_ids; delete bd.holds_detail;
      localStorage.setItem('booking_data', JSON.stringify(bd));
      
      if(ok){
        console.log(`✅ Released hold(s) [${ids.join(',')}] by ${reason}`);
      } else {
        console.warn(`⚠️ Release failed for hold(s) [${ids.join(',')}]`);
      }
      return ok;
    }catch(err){
      console.error('❌ Failed to release hold(s):', err);
      // Best effort cleanup locally
      delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds; delete bd.hold_ids; delete bd.holds_detail;
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
          console.log('📋 Current hold_id:', holdId);
          
          // Release hold ด้วย updated_by: "user_change_dates"
          if(holdId){
            console.log('🔓 ปล่อย HOLD โดย user_change_dates');
            await releaseHoldIfAny('user_change_dates');
          }
          
          // กัน pagehide ปล่อยซ้ำ
          localStorage.setItem('skip_hold_release', '1');
          console.log('✅ skip_hold_release = 1');

          // เตรียม redirect พร้อมพารามิเตอร์
          const ci = bd.check_in || '';
          const co = bd.check_out || '';
          const g  = bd.guests || '';
          const r  = bd.rooms || '';
          console.log('📍 Redirect params:', {ci, co, g, r});
          const q = new URLSearchParams({ ci, co, g: String(g||''), r: String(r||'') });
          window.location.href = `booking.html?${q.toString()}`;
        }catch(err){
          console.error('❌ Error in setupChangeDatesButton:', err);
          window.location.href = 'booking.html';
        }
      });
    }
  }

  // ---------- Countdown (รองรับ bulk hold_ids) ----------
  function startHoldCountdown(bookingData){
    const holdIds = (Array.isArray(bookingData.hold_ids) && bookingData.hold_ids.length)
      ? bookingData.hold_ids.slice()
      : (bookingData.hold_id ? [bookingData.hold_id] : []);
    if (!holdIds.length) return;

    const exp = bookingData.hold_expires_at;
    const holdSeconds = Number(bookingData.hold_seconds);
    let end = NaN;

    if (exp) {
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(exp)) {
        end = Date.parse(exp);
      } else {
        const norm = exp.replace(' ', 'T');
        const withTz = `${norm}+07:00`;
        let parsed = Date.parse(withTz);
        if (!isFinite(parsed)) parsed = new Date(norm).getTime();
        end = parsed;
      }
    }
    if (!isFinite(end) && Number.isFinite(holdSeconds) && holdSeconds > 0) {
      end = Date.now() + (holdSeconds * 1000);
    }
    if (!isFinite(end)) return;

    const btn = document.getElementById('bookBtn');
    const baseTitle = document.title;

    const tick = async () => {
      const now = Date.now();
      const sec = Math.max(0, Math.floor((end - now) / 1000));
      const m = Math.floor(sec / 60), s = sec % 60;
      try { document.title = `${m}:${String(s).padStart(2, '0')} • ${baseTitle}`; } catch (_) {}

      if (sec <= 0) {
        clearInterval(timer);
        if (btn) btn.setAttribute('disabled', 'disabled');

        // ⏰ หมดเวลา → หมดอายุแบบ bulk
        await callHoldApiBulk('inventory-hold-expire.php', {
          hold_ids: holdIds,
          reason: 'countdown_expired'
        });

        // เคลียร์ทุกสิ่งที่ทำให้ "ตะกร้ายังอยู่"
        try {
          localStorage.removeItem('booking_session');
          localStorage.removeItem('booking_session_timestamp');
          localStorage.setItem('RETURNED_FROM_CHECKOUT', '1');
        } catch (_) {}

        // เคลียร์ local booking_data เฉพาะคีย์ hold
        try {
          const raw = localStorage.getItem('booking_data');
          const bd = raw ? JSON.parse(raw) : {};
          delete bd.hold_id;
          delete bd.hold_ids;
          delete bd.hold_expires_at;
          delete bd.hold_seconds;
          delete bd.holds_detail;
          localStorage.setItem('booking_data', JSON.stringify(bd));
        } catch (_) {}

        showHoldExpiredModal?.();
      }
    };

    const timer = setInterval(tick, 1000);
    tick();
  }

  // Expire hold immediately (called when countdown hits 0)
  // ---------- Wrapper: expireHoldNow (รองรับ bulk) ----------
  async function expireHoldNow(reason = 'countdown_expired') {
    const ids = getHoldIdsFromBookingData();
    if (!ids.length) return false;
    return callHoldApiBulk('inventory-hold-expire.php', { hold_ids: ids, reason });
  }

  // Show custom hold expired modal
  function showHoldExpiredModal(){
    const modal = document.getElementById('holdExpiredModal');
    const backBtn = document.getElementById('holdExpiredBackBtn');
    if(!modal) return;
    modal.classList.remove('hidden');
    if(backBtn){
      backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }
  }

  // Fallback delegated handler: ensures redirect even if binding above was skipped
  document.addEventListener('click', function(e){
    if(e.target && e.target.closest('#holdExpiredBackBtn')){
      window.location.href = 'index.html';
    }
  });

  // Auto-release HOLD when user closes page/browser without booking
  (function(){
    let userConfirmedExit = false;

    // Track if user confirmed leaving via custom modal
    let userConfirmedLeave = false;

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

      // ❌ ไม่ใช้ browser default modal อีกต่อไป
      // ✅ แทนที่ด้วย custom modal
      
      // Prevent default browser modal
      e.preventDefault();
      e.returnValue = '';
      
      // Show custom modal instead
      showLeaveSiteModal();
    });

    // Custom modal handlers
    function showLeaveSiteModal() {
      const modal = document.getElementById('leaveSiteModal');
      if (modal) {
        modal.classList.remove('hidden');
        userConfirmedLeave = false;
      }
    }

    function hideLeaveSiteModal() {
      const modal = document.getElementById('leaveSiteModal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    // Modal button handlers
    const leaveSiteModalConfirm = document.getElementById('leaveSiteModalConfirm');
    const leaveSiteModalCancel = document.getElementById('leaveSiteModalCancel');
    const leaveSiteModalClose = document.getElementById('leaveSiteModalClose');

    if (leaveSiteModalConfirm) {
      leaveSiteModalConfirm.addEventListener('click', () => {
        userConfirmedLeave = true;
        hideLeaveSiteModal();
        window.location.href = 'about:blank'; // Navigate away
      });
    }

    if (leaveSiteModalCancel) {
      leaveSiteModalCancel.addEventListener('click', () => {
        hideLeaveSiteModal();
      });
    }

    if (leaveSiteModalClose) {
      leaveSiteModalClose.addEventListener('click', () => {
        hideLeaveSiteModal();
      });
    }

    // Fallback: also try when page becomes hidden (some browsers suppress beforeunload)
    // ❌ ปิดไว้เพราะมันทำให้ release hold เมื่อเข้าหน้า checkout เอง
    // document.addEventListener('visibilitychange', function(){
    //   if (document.visibilityState !== 'hidden') return;
    //   ...
    // });

    // Actually release the hold when page unloads (after user confirms or directly closes)
    // ---------- Browser close/back (pagehide - รองรับ bulk) ----------
    window.addEventListener('pagehide', function () {
      try {
        const skip = localStorage.getItem('skip_hold_release');
        if (skip === '1') { localStorage.removeItem('skip_hold_release'); return; }
      } catch (_) {}

      const ids = getHoldIdsFromBookingData();
      if (!ids.length) return;

      // ใช้ sendBeacon เพื่อให้ยิงทันก่อนหน้า unload
      beaconHoldApiBulk('inventory-hold-expire.php', {
        hold_ids: ids,
        reason: 'browser_close'
      });

      // เคลียร์ทุกสิ่งที่ทำให้ "ตะกร้ายังอยู่"
      try {
        localStorage.removeItem('booking_session');
        localStorage.removeItem('booking_session_timestamp');
        localStorage.setItem('RETURNED_FROM_CHECKOUT', '1');
      } catch (_) {}

      // เคลียร์ local booking_data เฉพาะคีย์ hold
      try {
        const raw = localStorage.getItem('booking_data');
        const bd = raw ? JSON.parse(bd) : {};
        delete bd.hold_id;
        delete bd.hold_ids;
        delete bd.hold_expires_at;
        delete bd.hold_seconds;
        delete bd.holds_detail;
        localStorage.setItem('booking_data', JSON.stringify(bd));
      } catch (_) {}
    });

    // ---------- BFCache support: กด back แล้วหน้ากลับมาจาก cache ----------
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        // หน้านี้กลับมาจาก bfcache → ไม่ควรค้างตะกร้า/hold
        console.log('🔄 BFCache detected, releasing holds and redirecting to booking...');
        const ids = getHoldIdsFromBookingData();
        if (ids.length) {
          beaconHoldApiBulk('inventory-hold-expire.php', {
            hold_ids: ids,
            reason: 'browser_close:bfcache'
          });
        }
        localStorage.removeItem('booking_session');
        localStorage.removeItem('booking_session_timestamp');
        localStorage.setItem('RETURNED_FROM_CHECKOUT', '1');
        
        // ไป booking พร้อมพารามิเตอร์เดิม (ถ้ามี)
        try {
          const bd = JSON.parse(localStorage.getItem('booking_data') || '{}');
          const q = new URLSearchParams({
            ci: bd.check_in || '',
            co: bd.check_out || '',
            g: String(bd.adults || bd.guests || ''),
            r: String(bd.rooms || '')
          });
          location.replace(`booking.html?${q.toString()}`);
        } catch (_) {
          location.replace('booking.html');
        }
      }
    });

    // ---------- Navigation menu: ปล่อย hold เมื่อคลิกเมนูอื่น ----------
    document.addEventListener('click', function(e) {
      const a = e.target.closest('a.nav-link, a[href*=".html"]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      // Skip if same page or checkout
      if (href.includes('checkout.html') || href === '#') return;
      
      // ปล่อย hold_ids แบบ bulk ก่อนออก
      const ids = getHoldIdsFromBookingData();
      if (ids.length) {
        beaconHoldApiBulk('inventory-hold-expire.php', {
          hold_ids: ids,
          reason: 'browser_close:nav'
        });
        localStorage.removeItem('booking_session');
        localStorage.removeItem('booking_session_timestamp');
        localStorage.setItem('RETURNED_FROM_CHECKOUT', '1');
      }
    }, true);
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

  async function releaseHoldIfAny(reason){
    const raw = localStorage.getItem('booking_data');
    if(!raw) return false;
    let bd = {};
    try{ bd = JSON.parse(raw)||{}; }catch(_){ return false; }
    const ids = Array.isArray(bd.hold_ids) && bd.hold_ids.length ? bd.hold_ids : (bd.hold_id ? [bd.hold_id] : []);
    if(!ids.length) return false;

    const apiBase = getApiBase();
    console.log(`🔓 Attempting to release holds ${ids.join(',')}, reason: ${reason}`);

    try{
      const payloadObj = (Array.isArray(bd.hold_ids) && bd.hold_ids.length)
        ? { hold_ids: ids, reason: (reason||'website'), updated_by: reason||'website' }
        : { hold_id: ids[0], updated_by: reason||'website' };
      const payload = JSON.stringify(payloadObj);
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
      delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds; delete bd.hold_ids; delete bd.holds_detail;
      localStorage.setItem('booking_data', JSON.stringify(bd));

      if(ok){
        console.log(`✅ Released hold(s) [${ids.join(',')}] by ${reason}`);
      } else {
        console.warn(`⚠️ Release failed for hold(s) [${ids.join(',')}]`);
      }
      return ok;
    } catch (e) {
      console.error('Release hold error:', e);
      return false;
    }
  }

  // เริ่มต้นทำงานเมื่อ DOM พร้อม
  document.addEventListener('DOMContentLoaded', function(){
    wireActions();
    setupChangeDatesButton();
    loadBookingData();
    // After booking data load kick off dynamic special requests rendering
    try{ window.__initRequestPresets && window.__initRequestPresets(); }catch(_){ }
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
      try{ const v = localStorage.getItem('api_base'); return v ? v : ''; }catch(_){ return ''; }
    }

    async function releaseHoldIfAny(reason){
      const raw = localStorage.getItem('booking_data');
      if(!raw) return false;
      let bd = {};
      try{ bd = JSON.parse(raw)||{}; }catch(_){ return false; }
      const ids = Array.isArray(bd.hold_ids) && bd.hold_ids.length ? bd.hold_ids : (bd.hold_id ? [bd.hold_id] : []);
      if(!ids.length) return false;
      const apiBase = getApiBase();
      const payload = (Array.isArray(bd.hold_ids) && bd.hold_ids.length)
        ? { hold_ids: ids, reason: (reason||'website'), updated_by: reason||'website' }
        : { hold_id: ids[0], updated_by: reason||'website' };
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
                method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body: JSON.stringify(
                  (Array.isArray(bd.hold_ids) && bd.hold_ids.length)
                    ? { hold_ids: ids, reason: (reason||'website')+':fallback_expire' }
                    : { hold_id: ids[0], updated_by: (reason||'website')+':fallback_expire' }
                ), cache:'no-cache', keepalive:true
              });
            }catch(_e3){}
          }
        }
        ok = !!(res && res.ok);
      }finally{
        // Clean local hold fields regardless of server outcome
        delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds; delete bd.hold_ids; delete bd.holds_detail;
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
        const ids = Array.isArray(bd.hold_ids) && bd.hold_ids.length ? bd.hold_ids : (bd.hold_id ? [bd.hold_id] : []);
        if(!ids.length) return;
        const url = `${getApiBase()}/api/v1/inventory-hold-release.php`;
        const data = JSON.stringify((Array.isArray(bd.hold_ids) && bd.hold_ids.length) ? { hold_ids: ids, reason:'window_unload', updated_by:'window_unload' } : { hold_id: ids[0], updated_by: 'window_unload' });
        // Prefer sendBeacon for reliability on unload
        if(navigator.sendBeacon){
          const blob = new Blob([data], { type: 'text/plain' });
          navigator.sendBeacon(url, blob);
        } else {
          // Fallback
          fetch(url, { method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, credentials:'omit', mode:'cors', body:data, keepalive:true }).catch(()=>{});
        }
        // Local cleanup
        delete bd.hold_id; delete bd.hold_expires_at; delete bd.hold_seconds; delete bd.hold_ids; delete bd.holds_detail;
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

// Dynamic Special Request Presets (request_presets) rendering
(function(){
  function getApiBase(){ try{ const v = localStorage.getItem('api_base'); return v || ''; }catch(_){ return ''; } }
  function currentLang(){ return (window.currentLang || document.documentElement.lang || 'th').toLowerCase()==='en' ? 'en':'th'; }
  function readCache(){
    try{ const raw = localStorage.getItem('request_presets'); if(!raw) return null; const obj = JSON.parse(raw); if(obj && Array.isArray(obj.presets)) return obj.presets; }catch(_){ } return null;
  }
  function persistSelections(grid){
    const selected = [];
    grid.querySelectorAll('input[data-preset-id]').forEach(cb=>{
      if(cb.checked){
        const id = Number(cb.getAttribute('data-preset-id'));
        const code = cb.getAttribute('data-preset-code')||'';
        const requiresNote = cb.getAttribute('data-requires-note')==='1';
        let note='';
        if(requiresNote){
          const ta = grid.querySelector(`textarea[data-note-for="${id}"]`);
          if(ta) note = ta.value.trim();
        }
        selected.push({ id, code, note });
      }
    });
    try{ localStorage.setItem('booking_requests', JSON.stringify(selected)); }catch(_){ }
  }
  function renderPresets(presets){
    const grid = document.getElementById('request-presets-grid');
    if(!grid) return;
    grid.removeAttribute('data-loading');
    grid.innerHTML='';
    const lang = currentLang();
    if(!Array.isArray(presets) || !presets.length){
      grid.innerHTML = `<div class="muted">${lang==='en'?'No special requests available':'ไม่มีคำขอพิเศษ'}</div>`;
      return;
    }
    // Build items
    presets.forEach(p=>{
      const wrap = document.createElement('div');
      wrap.className = 'preset-item';
      const label = (lang==='en' ? (p.label_en||p.label_th) : (p.label_th||p.label_en)) || p.code;
      wrap.innerHTML = `
        <label class="checkbox-wrapper">
          <input type="checkbox" data-preset-id="${p.id}" data-preset-code="${p.code}" data-requires-note="${p.requires_note}">
          <span>${label}</span>
        </label>
        ${p.requires_note? `<textarea class="form-control hidden mt-4" rows="2" data-note-for="${p.id}" placeholder="${lang==='en'?'Please specify':'โปรดระบุ'}"></textarea>
        <small class="text-danger hidden" data-note-required-for="${p.id}">${lang==='en'?'This field is required':'ต้องกรอกข้อมูลในช่องนี้'}</small>`:''}`;
      grid.appendChild(wrap);
    });
    // Restore previous selections
    let prev=[]; try{ const raw=localStorage.getItem('booking_requests'); prev = raw? JSON.parse(raw):[]; }catch(_){ }
    prev.forEach(sel=>{
      const cb = grid.querySelector(`input[data-preset-id="${sel.id}"]`);
      if(cb){
        cb.checked = true;
        if(cb.getAttribute('data-requires-note')==='1'){
          const ta = grid.querySelector(`textarea[data-note-for="${sel.id}"]`);
          if(ta){ ta.classList.remove('hidden'); ta.value = sel.note||''; }
        }
      }
    });
    // Events
    grid.addEventListener('change', function(e){
      const cb = e.target.closest('input[data-preset-id]');
      if(cb){
        const id = cb.getAttribute('data-preset-id');
        const requiresNote = cb.getAttribute('data-requires-note')==='1';
        const ta = grid.querySelector(`textarea[data-note-for="${id}"]`);
        const noteReq = grid.querySelector(`small[data-note-required-for="${id}"]`);
        if(requiresNote){
          if(cb.checked){ ta && ta.classList.remove('hidden'); }
          else { if(ta){ ta.classList.add('hidden'); ta.value=''; } noteReq && noteReq.classList.add('hidden'); }
        }
        persistSelections(grid);
      }
    });
    grid.addEventListener('input', function(e){
      const ta = e.target.closest('textarea[data-note-for]');
      if(ta){
        const id = ta.getAttribute('data-note-for');
        const cb = grid.querySelector(`input[data-preset-id="${id}"]`);
        const noteReq = grid.querySelector(`small[data-note-required-for="${id}"]`);
        if(cb && cb.checked){
          if(ta.value.trim().length===0){ noteReq && noteReq.classList.remove('hidden'); }
          else { noteReq && noteReq.classList.add('hidden'); }
        } else { noteReq && noteReq.classList.add('hidden'); }
        persistSelections(grid);
      }
    });
  }
  async function fetchPresets(){
    const apiBase = getApiBase();
    const urls = [ `${apiBase}/api/v1/request-presets.php`, `${apiBase}/php-api/v1/request-presets.php` ];
    for(const u of urls){
      try{
        const r = await fetch(u,{cache:'no-cache'});
        if(r.ok){
          const data = await r.json();
          if(data && data.ok && Array.isArray(data.presets)){
            try{ localStorage.setItem('request_presets', JSON.stringify({ fetched_at: Date.now(), presets: data.presets })); }catch(_){ }
            return data.presets;
          }
        }
      }catch(_){ }
    }
    return [];
  }
  function initRequestPresets(){
    const grid = document.getElementById('request-presets-grid');
    if(!grid) return;
    const cached = readCache();
    if(cached){ renderPresets(cached); }
    else { fetchPresets().then(renderPresets); }
  }
  try{ window.__initRequestPresets = initRequestPresets; }catch(_){ }
  // Clear previously selected special request checkboxes each time checkout loads
  // (Do not modify existing functions; just remove the persisted selection key before rendering presets)
  document.addEventListener('DOMContentLoaded', function(){
    try{ localStorage.removeItem('booking_requests'); }catch(_){ }
  });
  document.addEventListener('DOMContentLoaded', initRequestPresets);
})();
