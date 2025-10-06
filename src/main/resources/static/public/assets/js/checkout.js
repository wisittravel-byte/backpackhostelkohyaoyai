(function(){
  function toTHB(n){ return Number(n).toFixed(2); }
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

    // Change Dates -> go back to booking with preserved search
    const changeBtn = document.getElementById('changeDatesBtn');
    if(changeBtn){
      changeBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        try{
          const draftRaw = localStorage.getItem('booking_draft');
          const draft = draftRaw ? JSON.parse(draftRaw) : {};
          const ci = draft.checkIn || (document.getElementById('sumCheckIn')?.textContent||'').trim();
          const co = draft.checkOut || (document.getElementById('sumCheckOut')?.textContent||'').trim();
          const g  = (draft.guests!=null) ? Number(draft.guests) : undefined;
          const r  = (draft.rooms!=null) ? Number(draft.rooms) : undefined;
          const usp = new URLSearchParams();
          if(ci) usp.set('ci', ci);
          if(co) usp.set('co', co);
          if(g)  usp.set('g', String(g));
          if(r)  usp.set('r', String(r));
          const url = 'booking.html' + (usp.toString() ? ('?' + usp.toString()) : '');
          window.location.href = url;
        }catch(_){ window.location.href = 'booking.html'; }
      });
    }

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
      if(window.API && window.API.fetchJson){
        const saved = await window.API.fetchJson('/api/bookings', { method:'POST', body: JSON.stringify(payload) });
        if(saved && saved.id){ localStorage.setItem('booking_id', String(saved.id)); }
      }
    }catch(err){ console.warn('Booking save failed:', err); }
    window.location.href = 'payment.html';
  });
  if(reviewBtn){
    reviewBtn.addEventListener('click', (e)=>{ e.preventDefault(); try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.reviewing') : alert('Reviewing your booking…'); }catch(_){ } });
  }
  }

  function loadDraft(){
    try{
      const raw = localStorage.getItem('booking_draft');
      if(!raw) return; const draft = JSON.parse(raw);
      if(draft.checkIn) document.getElementById('sumCheckIn').textContent = draft.checkIn;
      if(draft.checkOut) document.getElementById('sumCheckOut').textContent = draft.checkOut;
      if(draft.nights){
        const nightsLabel = document.querySelector('[data-i18n="checkout.nightStay"]');
        if(nightsLabel) nightsLabel.textContent = (window.I18N && window.I18N[window.currentLang] && window.I18N[window.currentLang]['checkout.nightStay']) || (draft.nights + ' Night Stay');
      }
      if(draft.roomType){
        const rp = document.querySelector('[data-i18n="checkout.rateplan"]');
        const roomKey = 'rooms.'+draft.roomType+'.name';
        const roomName = (window.I18N && window.I18N[window.currentLang] && window.I18N[window.currentLang][roomKey]) || draft.roomType;
        if(rp) rp.textContent = roomName + (draft.pricePerNight ? (' - THB ' + draft.pricePerNight) : '');
      }
      if(draft.pricePerNight){
        const sub = Number(draft.pricePerNight) * (draft.nights||1);
        const tax = sub * 0.07;
        setTotals(sub, tax);
      }
    }catch(e){ /* ignore */ }
  }

  function init(){
    setTotals(401.87, 28.13);
    wireActions();
    loadDraft();
    window.addEventListener('load', ()=>{ try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){} });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
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
