(function(){
  function byId(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n).toFixed(2); }
  function addDays(dateStr, n){ try{ const d = new Date(dateStr); d.setDate(d.getDate()+Number(n||0)); return d.toISOString().slice(0,10);}catch(_){ return ''; } }
  function seedAvail(dateStr, gender){
    // Simple deterministic mock: base on day + gender hash → 4..16
    if(!dateStr) return '-';
    const d = new Date(dateStr); const day = d.getUTCDate();
    const g = (gender==='female'?2:gender==='male'?3:5);
    const v = (day * g) % 13 + 4; // 4..16
    return v;
  }
  function setOut(inId, nightsId, outId){ const ci = byId(inId)?.value; const n = Number(byId(nightsId)?.value||1); const co = addDays(ci, n); const out = byId(outId); if(out) out.value = co; }
  function calcTotal(unitPrice, quantity, nights){ return Number(unitPrice||0) * Number(quantity||0) * Number(nights||1); }
  function wireStepper(){
    document.querySelectorAll('.stepper-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const target = btn.getAttribute('data-target'); const input = byId(target); if(!input) return;
        const step = Number(btn.getAttribute('data-step')||1); const min = Number(input.min||1); const max = Number(input.max||999);
        const val = Math.min(max, Math.max(min, Number(input.value||0)+step)); input.value = String(val);
        input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change'));
      });
    });
  }
  function updatePrivate(){
    setOut('prvCheckIn','prvNights','prvCheckOut');
    const total = calcTotal(byId('prvPrice').value, byId('prvRooms').value, byId('prvNights').value);
    const out = byId('prvTotal'); if(out) out.textContent = fmt(total);
  }
  function updateDorm(){
    setOut('dCheckIn','dNights','dCheckOut');
    const gender = (document.querySelector('input[name="dGender"]:checked')||{}).value||'mixed';
    const avail = seedAvail(byId('dCheckIn').value, gender); const aEl = byId('dAvail'); if(aEl) aEl.textContent = String(avail);
    const total = calcTotal(byId('dPrice').value, byId('dBeds').value, byId('dNights').value);
    const out = byId('dTotal'); if(out) out.textContent = fmt(total);
  }
  function saveAndGo(opts){
    // Prepare booking draft compatible with checkout.js
    const draft = {
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      nights: Number(opts.nights||1),
      roomType: opts.mode==='private' ? 'private' : 'dorm',
      // Trick: store unitPrice*quantity in pricePerNight so current checkout math remains correct
      pricePerNight: Number(opts.unitPrice||0) * Number(opts.quantity||1),
      guests: opts.mode==='private' ? (Number(opts.rooms||1)*2) : Number(opts.beds||1),
      rooms: opts.rooms||undefined,
      beds: opts.beds||undefined,
      chargeBasis: opts.mode==='private' ? 'per-room' : 'per-bed',
      dorm: opts.mode==='dorm' ? {
        gender: opts.gender,
        prefs: {
          lower: !!opts.prefLower,
          upper: !!opts.prefUpper,
          window: !!opts.prefWindow,
          outlet: !!opts.prefOutlet
        }
      } : undefined
    };
    try{ localStorage.setItem('booking_draft', JSON.stringify(draft)); }catch(e){}
    window.location.href = 'checkout.html';
  }
  function today(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }

  function wireTabs(){
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t=> t.addEventListener('click', ()=>{
      tabs.forEach(x=> x.classList.remove('active'));
      t.classList.add('active');
      const name = t.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach(p=> p.classList.add('hidden'));
      const panel = byId('panel-'+name); if(panel) panel.classList.remove('hidden');
    }));
  }

  function init(){
    // Defaults
    const ci = today();
    if(byId('prvCheckIn')) byId('prvCheckIn').value = ci;
    if(byId('dCheckIn')) byId('dCheckIn').value = ci;
    updatePrivate(); updateDorm();

    // Events
    wireTabs(); wireStepper();
    ['prvCheckIn','prvNights','prvRooms','prvPrice'].forEach(id=>{ const el=byId(id); if(el){ el.addEventListener('input', updatePrivate); el.addEventListener('change', updatePrivate); }});
    ['dCheckIn','dNights','dBeds','dPrice'].forEach(id=>{ const el=byId(id); if(el){ el.addEventListener('input', updateDorm); el.addEventListener('change', updateDorm); }});
    document.querySelectorAll('input[name="dGender"]').forEach(el=> el.addEventListener('change', updateDorm));
    ['prefLower','prefUpper','prefWindow','prefOutlet'].forEach(id=>{ const el=byId(id); if(el) el.addEventListener('change', updateDorm); });

    // Proceed buttons
    const prvBtn = byId('prvProceed'); if(prvBtn) prvBtn.addEventListener('click', ()=>{
      saveAndGo({
        mode:'private',
        checkIn: byId('prvCheckIn').value,
        checkOut: byId('prvCheckOut').value,
        nights: byId('prvNights').value,
        rooms: byId('prvRooms').value,
        unitPrice: byId('prvPrice').value,
        quantity: byId('prvRooms').value
      });
    });
    const dBtn = byId('dProceed'); if(dBtn) dBtn.addEventListener('click', ()=>{
      const gender = (document.querySelector('input[name="dGender"]:checked')||{}).value||'mixed';
      saveAndGo({
        mode:'dorm',
        checkIn: byId('dCheckIn').value,
        checkOut: byId('dCheckOut').value,
        nights: byId('dNights').value,
        beds: byId('dBeds').value,
        unitPrice: byId('dPrice').value,
        quantity: byId('dBeds').value,
        gender,
        prefLower: byId('prefLower').checked,
        prefUpper: byId('prefUpper').checked,
        prefWindow: byId('prefWindow').checked,
        prefOutlet: byId('prefOutlet').checked
      });
    });

    // Apply current language
    try{ if(window.applyLang) window.applyLang(window.currentLang||'th'); }catch(e){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();