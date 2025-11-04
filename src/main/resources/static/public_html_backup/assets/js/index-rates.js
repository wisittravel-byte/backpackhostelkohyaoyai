// Fetch nightly rates and update prices on the homepage
(function(){
  const propertyId = 1; // adjust if needed

  function ymd(d){
    if(typeof d === 'string') return d.slice(0,10);
    const iso = new Date(d).toISOString();
    return iso.slice(0,10);
  }

  function formatPrice(amount, currency){
    if(currency === 'THB' || !currency){
      return '฿' + Number(amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
    }
    try{
      return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(Number(amount||0));
    }catch(_){
      return Number(amount||0).toFixed(0) + ' ' + (currency||'');
    }
  }

  async function refreshPrices(){
    const rooms = Array.from(document.querySelectorAll('#roomsList .room'));
    if(!rooms.length || !window.API) return;

  const qs = new URLSearchParams(location.search);
  const dateOverride = qs.get('date'); // e.g. /index.html?date=2025-10-01
  const checkinEl = document.getElementById('checkin');
  const from = dateOverride || ymd(checkinEl && checkinEl.value ? checkinEl.value : new Date());
  const to = from; // one night for display
  const debug = qs.get('debugRates') === '1';

    let rows = [];
    try{
  const ids = qs.get('ids');
      if(ids){
        // Explicit IDs mode for demonstration/testing: /index.html?ids=1,2,3
        rows = await API.fetchJson(`/api/rates?ids=${encodeURIComponent(ids)}`);
      }else{
        // 1) Try with property + date (tightest)
        rows = await API.fetchJson(`/api/rates?propertyId=${propertyId}&from=${from}&to=${to}`);
      }
      if(!Array.isArray(rows)) rows = [];
      if(debug) console.info('Rates step1/idsOrProp+date:', rows);
      // 2) If empty, drop property filter
      if(rows.length === 0){
        rows = await API.fetchJson(`/api/rates?from=${from}&to=${to}`);
        if(!Array.isArray(rows)) rows = [];
        if(debug) console.info('Rates step2/dateOnly:', rows);
      }
      // 3) If still empty, drop date filters
      if(rows.length === 0){
        rows = await API.fetchJson(`/api/rates`);
        if(!Array.isArray(rows)) rows = [];
        if(debug) console.info('Rates step3/noFilter:', rows);
      }
    }catch(e){
      // silently fall back to hard-coded prices
      console.debug('Rates API not available, using fallback prices:', e.message);
    }

    // Map min price by roomTypeId
    const map = new Map();
    for(const r of rows){
      const rt = r.roomTypeId ?? r.room_type_id ?? r.room_type ?? r.roomtypeid;
      const price = Number(r.price ?? r.amount ?? r.nightly_price ?? r.rate);
      const currency = r.currency || 'THB';
      if(!rt || !isFinite(price)) continue;
      const cur = map.get(rt);
      if(!cur || price < cur.price){
        map.set(rt, { price, currency });
      }
    }

    for(const room of rooms){
      const rtId = Number(room.dataset.roomTypeId);
      const priceSpan = room.querySelector('.price');
      if(!priceSpan) continue;

      const found = map.get(rtId);
      if(found){
        priceSpan.textContent = formatPrice(found.price, found.currency);
        priceSpan.setAttribute('data-price', String(Math.round(found.price)));
        room.dataset.priceSource = 'api';
        if(debug) console.info('Applied rate', { rtId, price: found.price, currency: found.currency });
      }else{
        // keep existing static price
        room.dataset.priceSource = 'static';
        if(debug) console.info('No rate matched for roomTypeId', rtId);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // Update immediately and when checkin changes
    refreshPrices();
    const checkinEl = document.getElementById('checkin');
    if(checkinEl){
      checkinEl.addEventListener('change', refreshPrices);
      checkinEl.addEventListener('input', refreshPrices);
    }
  });
})();
