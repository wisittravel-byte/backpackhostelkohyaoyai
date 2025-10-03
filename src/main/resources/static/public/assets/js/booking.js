(function(){
  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function setDetailsToggleLabel(link, key){
    try{
      // Update data-i18n so future language switches stay in sync
      if(link) link.setAttribute('data-i18n', key);
      const lang = window.currentLang || (document.documentElement.lang || 'th');
      const dict = (window.I18N && window.I18N[lang]) ? window.I18N[lang] : null;
      if(dict && dict[key]){
        link.textContent = dict[key];
      } else {
        // Fallback texts
        link.textContent = (key === 'rooms.detailsHide') ? 'ซ่อนรายละเอียดห้องพัก' : 'ดูรายละเอียดห้องพัก';
      }
    }catch(_){ /* noop */ }
  }

  const ROOM_RATES = { dorm:1999, private:2999, family:3499 };

  function highlightSelectedRoom(room){
    qsa('[data-room-row]').forEach(row=>{
      if(row.getAttribute('data-room-row')===room) row.classList.add('room-selected'); else row.classList.remove('room-selected');
    });
  }

  function populateNights(){
    const nightsSel = qs('#nights');
    if(!nightsSel) return;
    if(nightsSel.options.length>0) return; // idempotent
    for(let i=1;i<=15;i++){ const o = document.createElement('option'); o.value = i; o.textContent = i; nightsSel.appendChild(o); }
  }

  function wireSameAsGuest(){
    const same = qs('#sameAsGuest');
    const guestName = qs('#guestName');
    const bookerName = qs('#bookerName');
    if(!(same && guestName && bookerName)) return;
    same.addEventListener('change', ()=>{
      if(same.checked){ bookerName.value = guestName.value; bookerName.disabled = true; } else { bookerName.disabled = false; }
    });
    guestName.addEventListener('input', ()=>{ if(same.checked) bookerName.value = guestName.value; });
  }

  function getDraftFromForm(selectedRoom){
    const selRoom = selectedRoom || (qs('input[name="roomType"]:checked')||{}).value || 'dorm';
    const roomPrice = ROOM_RATES[selRoom] || ROOM_RATES.dorm;
    const nightsEl = qs('#nights');
    const guestsEl = qs('#guestCount');
    const notesEl = qs('#notes');
    const guestNameEl = qs('#guestName');
    const bookerNameEl = qs('#bookerName');
    const nightsVal = nightsEl ? Number(nightsEl.value || 1) : 1;
    const guestsVal = guestsEl ? Number(guestsEl.value || 1) : 1;
    const guestNameVal = guestNameEl ? (guestNameEl.value || '') : '';
    const bookerNameVal = bookerNameEl ? ((bookerNameEl.value || guestNameVal) || guestNameVal) : guestNameVal;
    const notesVal = notesEl ? notesEl.value : '';
    return { nights: nightsVal, guests: guestsVal, guestName: guestNameVal, bookerName: bookerNameVal, roomType: selRoom, pricePerNight: roomPrice, notes: notesVal };
  }

  function validateForm(){
    const guestNameEl = qs('#guestName');
    if(guestNameEl && guestNameEl.hasAttribute('required') && !guestNameEl.value.trim()){
      try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.booking.guestNameRequired') : alert('Please enter guest name'); }catch(_){ }
      guestNameEl.focus();
      return false;
    }
    return true;
  }

  function wireRoomSelection(){
    qsa('input[name="roomType"]').forEach(r=> r.addEventListener('change', ()=>{
      const val = (qs('input[name="roomType"]:checked')||{}).value;
      if(val) highlightSelectedRoom(val);
    }));

    qsa('.select-room').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        if(e && typeof e.preventDefault === 'function') e.preventDefault();
        const room = btn.getAttribute('data-room');
        const radio = qs(`input[name="roomType"][value="${room}"]`);
        if(radio) radio.checked = true;
        highlightSelectedRoom(room);
        try{
          if(!validateForm()) return;
          const draft = getDraftFromForm(room);
          localStorage.setItem('booking_draft', JSON.stringify(draft));
        }catch(err){ /* ignore */ }
  const href = btn.getAttribute('href') || 'checkout.html';
        window.location.href = href;
      });
    });

    // Modal popup for room details
    const modal = qs('#roomModal');
    const modalOverlay = modal ? modal.querySelector('.modal-overlay') : null;
    const modalClose = modal ? modal.querySelector('.modal-close') : null;
    const modalGallery = modal ? modal.querySelector('.modal-gallery') : null;
    const modalTitle = modal ? modal.querySelector('#roomModalTitle') : null;
    const modalMeta = modal ? modal.querySelector('.modal-meta') : null;
    const modalAmenities = modal ? modal.querySelector('.modal-amenities') : null;
    const modalSelect = modal ? modal.querySelector('.modal-select') : null;

    function openModalFromCard(card){
      if(!modal) return;
      // Title and meta
      const title = (card.querySelector('.badge-roomname')||{}).textContent || '';
      const size = (card.querySelector('.badge-size')||{}).textContent || '';
      if(modalTitle) modalTitle.textContent = title || 'Room details';
      if(modalMeta) modalMeta.textContent = size;
      // Gallery: collect main image + possibly related gallery (reuse same image multiples for now)
      if(modalGallery){
        modalGallery.innerHTML = '';
        const img = card.querySelector('.room-media img');
        if(img){
          // Put a few repeats to simulate gallery; in future, map to real gallery sources
          for(let i=0;i<6;i++){
            const clone = img.cloneNode(true);
            clone.removeAttribute('loading');
            clone.removeAttribute('decoding');
            modalGallery.appendChild(clone);
          }
        }
      }
      // Amenities: copy the list
      if(modalAmenities){
        const details = card.querySelector('.room-details');
        if(details){
          modalAmenities.innerHTML = '';
          const list = details.querySelector('ul');
          if(list){
            const ul = document.createElement('ul');
            ul.className = 'amenities-grid';
            ul.innerHTML = list.innerHTML;
            modalAmenities.appendChild(ul);
          }
        }
      }
      // CTA: wire room select
      if(modalSelect){
        const selectBtn = card.querySelector('.select-room');
        const room = selectBtn ? selectBtn.getAttribute('data-room') : (card.getAttribute('data-room-row')||'');
        modalSelect.setAttribute('data-room', room);
        modalSelect.setAttribute('href', selectBtn ? (selectBtn.getAttribute('href')||'./checkout.html') : './checkout.html');
      }

      modal.removeAttribute('hidden');
      modal.setAttribute('aria-hidden','false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(){
      if(!modal) return;
      modal.setAttribute('hidden','');
      modal.setAttribute('aria-hidden','true');
      document.body.style.overflow = '';
    }

    if(modalOverlay) modalOverlay.addEventListener('click', closeModal);
    if(modalClose) modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (ev)=>{ if(ev.key === 'Escape') closeModal(); });

    qsa('.room-card').forEach((card)=>{
      const link = card.querySelector('.room-link');
      if(!link) return;
      // Accessible props
      link.setAttribute('role','button');
      link.setAttribute('aria-haspopup','dialog');
      link.addEventListener('click', (e)=>{ if(e && e.preventDefault) e.preventDefault(); openModalFromCard(card); });
    });

    const saveBtn = qs('#saveBtn');
    if(saveBtn){
      saveBtn.addEventListener('click', ()=>{
        if(!validateForm()) return;
        const payload = getDraftFromForm();
        payload.roomPrice = payload.pricePerNight;
        localStorage.setItem('booking_draft', JSON.stringify(payload));
  window.location.href = 'checkout.html';
      });
    }
  }

  function init(){
    populateNights();
    wireSameAsGuest();
    wireRoomSelection();

    // Wire search bar: validate, persist, navigate
    try{
      const ci = qs('#checkin');
      const co = qs('#checkout');
      const g  = qs('#guests');
      const r  = qs('#rooms');
      const box = qs('#daterange');
      // Fallback defaults for booking page if values are empty
      try{
        const now = new Date();
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const next = new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);
        const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
        if(ci && !ci.value) ci.value = fmt(base);
        if(co && (!co.value || (ci && co.value <= ci.value))) co.value = fmt(next);
        if(box && ci && co && !box.value){ box.value = `${ci.value} – ${co.value}`; }
      }catch(_){ }
      const searchBtn = document.querySelector('#searchBar a.btn');
      // Use shared constraints
      try{ if(window.wireDateConstraints) window.wireDateConstraints(ci, co); }catch(_){ }

      // Prefill from URL params if present
      try{
        const usp = new URLSearchParams(window.location.search||'');
        const ciQ = usp.get('ci');
        const coQ = usp.get('co');
        const gQ  = usp.get('g');
        const rQ  = usp.get('r');
        if(ci && ciQ) ci.value = ciQ;
        if(co && coQ) co.value = coQ;
        if(g && gQ) g.value = String(gQ);
        if(r && rQ) r.value = String(rQ);
        // Merge into draft
        const draftRaw = localStorage.getItem('booking_draft');
        const draft = draftRaw ? JSON.parse(draftRaw) : {};
        if(ciQ) draft.checkIn = ciQ;
        if(coQ) draft.checkOut = coQ;
        if(gQ)  draft.guests = Number(gQ);
        if(rQ)  draft.rooms = Number(rQ);
        localStorage.setItem('booking_draft', JSON.stringify(draft));
      }catch(_){ }

      if(searchBtn){
        searchBtn.addEventListener('click', (e)=>{
          // Save selection then navigate to rooms section (default anchor behavior)
          try{
            const draftRaw = localStorage.getItem('booking_draft');
            const draft = draftRaw ? JSON.parse(draftRaw) : {};
            draft.checkIn  = ci ? ci.value : draft.checkIn;
            draft.checkOut = co ? co.value : draft.checkOut;
            draft.guests   = g ? Number(g.value||2) : (draft.guests||2);
            draft.rooms    = r ? Number(r.value||1) : (draft.rooms||1);
            localStorage.setItem('booking_draft', JSON.stringify(draft));
          }catch(_){ }
        }, { once:false });
      }
    }catch(_){ }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
