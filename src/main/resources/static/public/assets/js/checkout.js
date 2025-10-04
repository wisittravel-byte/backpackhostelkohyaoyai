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


    // Special Requests logic removed

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
  reviewBtn.addEventListener('click', (e)=>{ e.preventDefault(); try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.checkout.reviewing') : alert('Reviewing your booking…'); }catch(_){ } });
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
  document.addEventListener('DOMContentLoaded', function() {
    // New logic for "booking for self" checkbox
    const isBookingForSelfCheckbox = document.getElementById('isBookingForSelf');
    const otherGuestDetailsSection = document.getElementById('otherGuestDetails');

    if (isBookingForSelfCheckbox && otherGuestDetailsSection) {
      isBookingForSelfCheckbox.addEventListener('change', function() {
        if (this.checked) {
          otherGuestDetailsSection.classList.add('hidden');
        } else {
          otherGuestDetailsSection.classList.remove('hidden');
        }
      });
    }
  });
})();
