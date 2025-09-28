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
  const promo = document.getElementById('promo');
  const apply = document.getElementById('apply');
  // Special Requests section removed from UI; keep variables undefined
  const toggleRequests = null;
  const requestsWrap = null;

    apply.addEventListener('click', ()=>{
      const code = (promo.value||'').trim().toUpperCase();
      let baseSub = 401.87, baseTax = 28.13, sub = baseSub, tax = baseTax;
      if(code === 'KOYAO100'){
        const total = sub + tax - 100;
        if(total < 0){ alert('Discount exceeds total'); return; }
        const newSub = Math.max(0, total / 1.07);
        sub = newSub; tax = total - newSub;
      }
      if(code === 'SEA10'){
        sub = sub * 0.9; tax = sub * 0.07;
      }
      setTotals(sub, tax);
    });

    // Special Requests logic removed

    function mustAgree(){
      if(!agree.checked){ alert('กรุณายอมรับข้อกำหนดและนโยบายก่อนทำรายการ'); return false; }
      return true;
    }
  bookBtn.addEventListener('click', (e)=>{ e.preventDefault(); if(!mustAgree()) return; window.location.href = 'payment.html'; });
  reviewBtn.addEventListener('click', (e)=>{ e.preventDefault(); alert('Reviewing your booking…'); });
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
})();
