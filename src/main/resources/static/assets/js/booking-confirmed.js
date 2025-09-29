(function(){
  function fmt(n){ return Number(n||0).toFixed(2); }
  function getLang(){ try{ return (window.currentLang||localStorage.getItem('lang')||document.documentElement.lang||'th'); }catch(_){ return 'th'; } }
  function t(key){ try{ const L=getLang(); return (window.I18N&&window.I18N[L]&&window.I18N[L][key])||key; }catch(_){ return key; } }
  function safe(v, fb='-'){ return (v===undefined||v===null||v==='')? fb : v; }

  function readDraft(){
    try{
      const raw = localStorage.getItem('booking_draft');
      if(!raw) return {};
      return JSON.parse(raw);
    }catch(_){ return {}; }
  }

  function calcTotals(d){
    const nights = Number(d.nights||1);
    const price = Number(d.pricePerNight||0);
    const sub = nights * price;
    const tax = sub * 0.07;
    const total = sub + tax;
    return { sub, tax, total };
  }

  function humanRoomName(d){
    try{
      const roomKey = 'rooms.'+(d.roomType||'dorm')+'.name';
      const L = getLang();
      return (window.I18N && window.I18N[L] && window.I18N[L][roomKey]) || (d.roomType||'dorm');
    }catch(_){ return d.roomType||'dorm'; }
  }

  function genRef(){
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2,6).toUpperCase();
    return 'BKG-'+ts+'-'+rnd;
  }

  function populate(){
    const d = readDraft();
    const tot = calcTotals(d);

    document.getElementById('cName').textContent = safe(d.guestName);
    document.getElementById('cEmail').textContent = safe(d.email);
    document.getElementById('cMobile').textContent = safe(d.mobile);
    document.getElementById('cCheckIn').textContent = safe(d.checkIn);
    document.getElementById('cCheckOut').textContent = safe(d.checkOut);
    document.getElementById('cRoom').textContent = humanRoomName(d);
    document.getElementById('cPrice').textContent = fmt(d.pricePerNight);
    document.getElementById('cNights').textContent = safe(d.nights||1);
    document.getElementById('cGuests').textContent = safe(d.guests||1);

    document.getElementById('cSub').textContent = fmt(tot.sub);
    document.getElementById('cTax').textContent = fmt(tot.tax);
    document.getElementById('cTotal').textContent = fmt(tot.total);

    // booking reference
    const ref = genRef();
    document.getElementById('cRef').textContent = ref;

    // Optionally persist reference for lookup
    try{ localStorage.setItem('booking_ref', ref); }catch(_){ }
  }

  function init(){
    populate();
    window.addEventListener('load', ()=>{ try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){} });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
