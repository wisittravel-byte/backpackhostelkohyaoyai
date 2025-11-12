(function forceFreshBookingPage(){
  try {
    const hasCart = localStorage.getItem('booking_session') || localStorage.getItem('booking_session_timestamp');
    const onceFlag = sessionStorage.getItem('__bk_reload_once');
    if (hasCart && !onceFlag) {
      // ล้างตะกร้าก่อนรีโหลด
      localStorage.removeItem('booking_session');
      localStorage.removeItem('booking_session_timestamp');
      // ป้องกันรีโหลดซ้ำ
      sessionStorage.setItem('__bk_reload_once','1');
      // รีโหลดหน้า booking (ตัด hash ทิ้ง)
      location.replace(location.pathname + location.search);
      return;
    }
    // หลังรีโหลด: รีเซ็ต badge แล้วปลด flag สำหรับรอบถัดไป
    if (onceFlag) {
      const badge = document.querySelector('.bs-badge');
      if (badge) badge.textContent = '0';
      sessionStorage.removeItem('__bk_reload_once');
    }
  } catch(_){}
})();

(function(){
  // --- Handle browser Back/Forward: redirect user to index (no other side effects) ---
  try{
    // pageshow fires even when returning from bfcache; detect BF navigation robustly
    window.addEventListener('pageshow', function(ev){
      let isBF = false;
      try{
        const nav = (performance && performance.getEntriesByType) ? performance.getEntriesByType('navigation')[0] : null;
        isBF = (ev && ev.persisted === true) || (nav && nav.type === 'back_forward');
      }catch(_){ /* noop */ }
      if(isBF){
        // Do not touch any other logic; just send user to the start page
        try{ location.replace('./index.html'); }catch(__){ location.href = './index.html'; }
      }
    });
  }catch(_){ /* noop */ }

  // --- Lightweight slider helpers (room cards + modal) ---
  function initSliderContainer(container){
    if(!container) return;
    const slidesWrap = container.querySelector('.slides');
    if(!slidesWrap) return;
    const total = slidesWrap.children.length || 0;
    let idx = 0;
    function set(i){
      if(total<=0) return;
      idx = (i%total+total)%total;
      slidesWrap.style.transform = `translateX(-${idx*100}%)`;
      const dots = container.querySelectorAll('.dot');
      dots.forEach((d,k)=> d.classList.toggle('active', k===idx));
      try{ container.dispatchEvent(new CustomEvent('slidechange', { detail:{ index: idx, total } })); }catch(_){ }
    }
    const prev = container.querySelector('.nav.prev');
    const next = container.querySelector('.nav.next');
    if(prev) prev.addEventListener('click', e=>{ e.preventDefault(); set(idx-1); });
    if(next) next.addEventListener('click', e=>{ e.preventDefault(); set(idx+1); });
    container.querySelectorAll('.dot').forEach(d=>{
      d.addEventListener('click', ()=>{ const k = Number(d.getAttribute('data-k')||0); set(k); });
    });
    // Swipe support
    let sx=0, dx=0;
    container.addEventListener('touchstart', e=>{ sx = (e.touches&&e.touches[0]? e.touches[0].clientX:0); }, {passive:true});
    container.addEventListener('touchmove', e=>{ dx = (e.touches&&e.touches[0]? e.touches[0].clientX:0) - sx; }, {passive:true});
    container.addEventListener('touchend', ()=>{ if(Math.abs(dx)>40) set(idx + (dx<0?1:-1)); sx=0; dx=0; });
    container.__setIndex = set;
    set(0);
  }
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
      btn.addEventListener('click', async (e)=>{
        if(e && typeof e.preventDefault === 'function') e.preventDefault();
        
        // ป้องกันการคลิกซ้ำทันที
        if(btn.classList.contains('is-disabled') || btn.disabled || btn.style.pointerEvents === 'none'){
          console.log('� Button already disabled, preventing duplicate click');
          return;
        }
        
        console.log('�🔵 Select button clicked - Adding to cart (not immediate checkout)');
        
        // Disable ปุ่มทันทีเพื่อป้องกันการคลิกซ้ำ
        const originalText = btn.textContent;
        if(btn.tagName === 'A'){
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.6';
          btn.classList.add('is-disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        }
        btn.textContent = '...';
        
        // ดึงข้อมูลจาก data attributes
        const roomCode = btn.getAttribute('data-room');
        const roomName = btn.getAttribute('data-room-name') || '';
        const planData = btn.getAttribute('data-plan');
        
        console.log('🔵 Room code:', roomCode);
        console.log('🔵 Room name:', roomName);
        console.log('🔵 Plan data (raw):', planData);
        
        try {
          const plan = planData ? JSON.parse(planData) : {};
          console.log('🔵 Plan data (parsed):', plan);
          // หา room_type จากการ์ดเพื่อให้ได้ id และโหมด
          const card = btn.closest('.room-card');
          console.log('🔵 Card element:', card);
          const rt = card ? (card.__rt || {}) : {};
          console.log('🔵 Room type (rt):', rt);
          const roomTypeId = rt && typeof rt.id !== 'undefined' ? rt.id : null;
          console.log('🔵 Room type ID:', roomTypeId);
          const isPrivate = (rt && (rt.is_private===1 || rt.is_private===true || rt.is_private==='1')) ? 1 : 0;
          console.log('🔵 Is private:', isPrivate);
          // Derive mode robustly with DOM fallback and safe default
          const domMode = card ? (card.getAttribute('data-room-row') || '') : '';
          let mode = isPrivate ? 'PRIVATE' : 'DORM';
          if(domMode){ mode = (domMode.toUpperCase()==='PRIVATE') ? 'PRIVATE' : 'DORM'; }
          // nightly_prices array: prices in minor units per night
          const nightlyPrices = Array.isArray(plan.pricing_dates)
            ? plan.pricing_dates.map(d => Number(d && d.price_minor || 0))
            : [];
          
          // ดึงข้อมูลวันที่และจำนวนผู้เข้าพักจาก search form
          const ci = qs('#checkin');
          const co = qs('#checkout');
          const g = qs('#guests');
          // ✅ Removed 'rooms' field reference
          
          const checkInValue = ci ? ci.value : null;
          const checkOutValue = co ? co.value : null;
          const guestsValue = g ? Number(g.value || 2) : 2;
          
          console.log('🔵 Check dates:', {checkInValue, checkOutValue});
          console.log('🔵 Guests value:', guestsValue);
          
          // NEW MULTI-RATE-PLAN CART MODEL
          // Initialize or get existing session cart
          let sessionData;
          try {
            const existingData = localStorage.getItem('booking_session');
            console.log('🔵 Existing session (raw):', existingData);
            sessionData = existingData ? JSON.parse(existingData) : null;
            console.log('🔵 Existing session (parsed):', sessionData);
          } catch(e) {
            console.error('🔴 Error parsing session:', e);
            sessionData = null;
          }
          
          // If session doesn't exist or dates differ, create new session
          if (!sessionData || sessionData.check_in !== checkInValue || sessionData.check_out !== checkOutValue) {
            console.log('🔵 Creating NEW booking session');
            sessionData = {
              check_in: checkInValue,
              check_out: checkOutValue,
              nights: Math.max(1, nightlyPrices.length),
              adults: guestsValue,
              children: 0,
              cart: [],
              session_timestamp: new Date().toISOString()
            };
            console.log('🔵 New session created:', sessionData);
          } else {
            console.log('🔵 Using existing session, adding to cart');
            // Update guest count in case it changed
            sessionData.adults = guestsValue;
          }
          
          // ✅ Validation: สำหรับ Dorm Bed ต้องเช็คว่าจำนวนเตียงในตะกร้า + 1 ไม่เกินจำนวนผู้เข้าพัก
          if (!isPrivate) {
            const currentDormBeds = sessionData.cart
              .filter(ci => !ci.is_private)
              .reduce((sum, ci) => sum + Number(ci.qty || 0), 0);
            
            if (currentDormBeds + 1 > guestsValue) {
              const lang = window.currentLang || 'th';
              const msg = (lang === 'en')
                ? `Cannot add more beds. You selected ${guestsValue} guest(s), so you need exactly ${guestsValue} bed(s). Currently ${currentDormBeds} bed(s) in cart.`
                : `ไม่สามารถเพิ่มเตียงได้ คุณเลือก ${guestsValue} คน ต้องเลือกเตียง ${guestsValue} เตียง ปัจจุบันมี ${currentDormBeds} เตียงในตะกร้า`;
              try{ (window.Messages && window.Messages.alert) ? window.Messages.alert(msg) : (window.showSystemAlert? window.showSystemAlert(msg): alert(msg)); }catch(_){ }
              
              // Enable ปุ่มคืน
              if(btn.tagName === 'A'){
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
                btn.classList.remove('is-disabled');
              } else {
                btn.disabled = false;
                btn.classList.remove('is-disabled');
              }
              btn.textContent = originalText;
              return;
            }
          }
          
          // Create new cart item with NEW schema
          const cartItem = {
            room_type_id: roomTypeId,
            is_private: isPrivate,
            room_name: roomName || '',
            rate_plan_id: (plan && plan.plan_id != null) ? plan.plan_id : undefined,
            // Prefer explicit plan_name (often contains bed number like "1/101/200"), then fall back to localized names
            rate_plan_name: (plan && plan.plan_name)
              ? plan.plan_name
              : (plan && plan.name_th)
                ? plan.name_th
                : (plan && plan.name_en)
                  ? plan.name_en
                  : '',
            // Keep description (Thai/EN) for display in drawer as requested
            // Use API text verbatim (do not strip prefixes like "เตียง:" or "Bed:")
            rate_plan_desc: (plan && (plan.description_th || plan.description_en || plan.description))
              ? (plan.description_th || plan.description_en || plan.description)
              : '',
            // Keep both languages for dynamic rendering later (checkout page)
            rate_plan_desc_th: (plan && plan.description_th) ? plan.description_th : '',
            rate_plan_desc_en: (plan && plan.description_en) ? plan.description_en : '',
            qty: 1,  // NEW: quantity
            guests: guestsValue,  // NEW: guests per item
            nightly_prices: nightlyPrices  // NEW: array format (already in minor units)
          };
          console.log('🔵 New cart item:', cartItem);
          
          // Deduplication: check if room_type_id + rate_plan_id already in cart
          const dedupeKey = `${cartItem.room_type_id}|${cartItem.rate_plan_id}`;
          const existingIdx = sessionData.cart.findIndex(ci => `${ci.room_type_id}|${ci.rate_plan_id}` === dedupeKey);
          
          if (existingIdx >= 0) {
            console.log('🔵 Found duplicate at index', existingIdx, '- incrementing qty');
            sessionData.cart[existingIdx].qty += 1;
          } else {
            console.log('🔵 New item - pushing to cart');
            sessionData.cart.push(cartItem);
          }
          
          console.log('🔵 Updated cart length:', sessionData.cart.length);
          console.log('🔵 Updated cart:', sessionData.cart);
          
          // Save to localStorage
          localStorage.setItem('booking_session', JSON.stringify(sessionData));
          localStorage.setItem('booking_session_timestamp', Date.now().toString());
          console.log('✅ Session saved successfully');
          
          // Disable the "Select" button for this rate plan permanently
          console.log('🔵 Calling setRatePlanButtonState to disable button:', cartItem.room_type_id, cartItem.rate_plan_id);
          try {
            if(window.setRatePlanButtonState && typeof window.setRatePlanButtonState === 'function'){
              window.setRatePlanButtonState(cartItem.room_type_id, cartItem.rate_plan_id, true);
              console.log('✅ Button state updated successfully');
            } else {
              console.log('⚠️ setRatePlanButtonState not available');
            }
          } catch(err){
            console.error('🔴 Error calling setRatePlanButtonState:', err);
          }
          
          // Open booking-drawer to show cart
          if (window.BookingDrawer && typeof window.BookingDrawer.openFromBooking === 'function') {
            console.log('🔵 Opening booking drawer');
            window.BookingDrawer.openFromBooking(sessionData);
          } else {
            console.log('⚠️ BookingDrawer not available, fallback to opening drawer manually');
            const backdrop = document.querySelector('[data-bs-backdrop]');
            const root = document.documentElement;
            root.classList.add('bs-is-open');
            if(backdrop) backdrop.hidden = false;
          }
        } catch(err) {
          console.error('Error adding to cart:', err);
          try{
            const m = (window.currentLang==='en')? 'Failed to add room to cart' : 'ไม่สามารถเพิ่มห้องไปยังตะกร้าได้';
            (window.Messages && window.Messages.alert) ? window.Messages.alert(m) : (window.showSystemAlert? window.showSystemAlert(m): alert(m));
          }catch(_){ }
          
          // Enable ปุ่มคืนเมื่อเกิด error
          if(btn.tagName === 'A'){
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
            btn.classList.remove('is-disabled');
          } else {
            btn.disabled = false;
            btn.classList.remove('is-disabled');
          }
          btn.textContent = originalText;
        }
      });
    });

    // Modal popup for room details
    const modal = qs('#roomModal');
              // Availability tips (content only, no layout change)
              try{
                const av = it.availability || {};
                const isPriv = (rt.is_private===1 || rt.is_private==='1' || rt.is_private===true);
                const minAvail = Number(av.min_available!=null? av.min_available : NaN);
                const unitsReq = Number(av.units_required!=null? av.units_required : NaN);
                const capOk = (av.capacity_ok!==false);
                if(!isNaN(minAvail) && !isNaN(unitsReq)){
                  const left = minAvail - unitsReq;
                  const lang = window.currentLang || (document.documentElement.lang||'th');
                  if(capOk){
                    // Show low-stock hints
                    if(left===0){
                      leftLines.push(`<div class="rate-desc text-orange">${lang==='en'?'Exactly enough availability for your selection':'จำนวนว่างพอดีกับที่เลือก'}</div>`);
                    } else if(left>0 && left<=2){
                      const unitName = isPriv ? (lang==='en'?'room(s)':'ห้อง') : (lang==='en'?'bed(s)':'เตียง');
                      leftLines.push(`<div class="rate-desc text-orange">${lang==='en'?`Only ${left} ${unitName} left for the selected dates`:`เหลืออีกเพียง ${left} ${unitName} ในช่วงวันที่เลือก`}</div>`);
                    }
                  } else if(isPriv){
                    // Capacity not enough (should rarely appear due to server filter)
                    const maxA = (rt.max_adults!=null? Number(rt.max_adults):0);
                    const needRooms = maxA>0? Math.ceil((qs('#guests')? Number(qs('#guests').value||2):2)/maxA) : unitsReq;
                    leftLines.push(`<div class="rate-desc text-red">${lang==='en'?`Guests exceed room capacity. Try at least ${needRooms} rooms.`:`จำนวนผู้เข้าพักมากกว่าความจุต่อห้อง แนะนำอย่างน้อย ${needRooms} ห้อง`}</div>`);
                  }
                }
              }catch(_){ }
    const modalOverlay = modal ? modal.querySelector('.modal-overlay') : null;
    const modalClose = modal ? modal.querySelector('.modal-close') : null;
  const modalGallery = modal ? modal.querySelector('.modal-gallery') : null;
  const modalTitle = modal ? modal.querySelector('#roomModalTitle') : null;
  const modalMeta = modal ? modal.querySelector('.modal-meta') : null;
    const modalAmenities = modal ? modal.querySelector('.modal-amenities') : null;
    const modalSelect = modal ? modal.querySelector('.modal-select') : null;

    function openModalFromCard(card){
      if(!modal) return;
      const title = (card.querySelector('.badge-roomname')||{}).textContent || '';
      
      if(modalTitle){
        const lang = window.currentLang || (document.documentElement.lang || 'th');
        modalTitle.textContent = (lang==='en') ? 'Room info' : 'ข้อมูลห้องพัก';
      }
      if(modalMeta) modalMeta.textContent = '';
      
      // 🔥 REBUILD GALLERY - TRAVELOKA STYLE
      if(modalGallery){
        modalGallery.innerHTML = '';
        const imgs = card.__imagesFull || [];
        if(imgs && imgs.length){
          // 1) Room name header (above image)
          const nameHeader = document.createElement('h4');
          nameHeader.className = 'traveloka-room-name';
          nameHeader.textContent = title;
          modalGallery.appendChild(nameHeader);

          // 2) Main image slider
          const mainSlider = document.createElement('div');
          mainSlider.className = 'traveloka-main-slider';
          mainSlider.innerHTML = `
            <div class="slides">${imgs.map(i=>`<img src="${i.url}" alt="${title}" loading="lazy" />`).join('')}</div>
            ${imgs.length>1? `<button class="nav prev" aria-label="Prev">‹</button><button class="nav next" aria-label="Next">›</button>`:''}
          `;
          modalGallery.appendChild(mainSlider);

          // 3) Thumbnail strip (dark background, below image)
          const thumbStrip = document.createElement('div');
          thumbStrip.className = 'traveloka-thumb-strip';
          
          const thumbInner = document.createElement('div');
          thumbInner.className = 'traveloka-thumb-inner';
          thumbInner.innerHTML = imgs.map((i,k)=>
            `<img class="traveloka-thumb ${k===0?'active':''}" data-k="${k}" src="${i.url}" alt="thumb ${k+1}" loading="lazy" />`
          ).join('');
          thumbStrip.appendChild(thumbInner);

          // 4) Counter inside thumb strip
          const counter = document.createElement('div');
          counter.className = 'traveloka-counter';
          counter.textContent = `1 / ${imgs.length}`;
          thumbStrip.appendChild(counter);

          modalGallery.appendChild(thumbStrip);

          // 5) Initialize slider
          initSliderContainer(mainSlider);
          
          // 6) Sync thumbnails + counter on slide change
          const thumbs = Array.from(thumbInner.querySelectorAll('.traveloka-thumb'));
          mainSlider.addEventListener('slidechange', (e)=>{
            const { index, total } = e.detail || { index:0, total: imgs.length };
            thumbs.forEach((t,k)=> t.classList.toggle('active', k===index));
            counter.textContent = `${index+1} / ${total}`;
          });

          // 7) Click thumbnail to change slide
          thumbs.forEach(t=> t.addEventListener('click', ()=>{
            const k = Number(t.getAttribute('data-k')||0);
            if(mainSlider.__setIndex) mainSlider.__setIndex(k);
          }));
        }
      }
      // Amenities in modal: prefer full list stored on card; fallback to copied list
      if(modalAmenities){
        modalAmenities.innerHTML = '';
        const all = card.__amenitiesFull || [];
        const bath = card.__bathroomFull || [];
        const rt = card.__rt || {};
        const lang = window.currentLang || (document.documentElement.lang || 'th');
        // meta: size and capacity
        const capAdults = (rt.max_adults!=null? rt.max_adults : 0);
        const capChildren = (rt.max_children!=null? rt.max_children : 0);
        const sizeText = rt.area_sqm? `📐 ${rt.area_sqm} m²` : '';
        const occText = lang==='en'
          ? `👤 Adults ${capAdults}${capChildren? ` · 👶 Children ${capChildren}`:''}`
          : `👤 ผู้ใหญ่ ${capAdults} คน${capChildren? ` · 👶 เด็ก ${capChildren} คน`:''}`;
        if(sizeText || occText){
          const meta = document.createElement('div');
          meta.className = 'modal-meta-grid';
          meta.innerHTML = `${sizeText? `<div class="pill">${sizeText}</div>`:''}${occText? `<div class="pill">${occText}</div>`:''}`;
          modalAmenities.appendChild(meta);
        }
        // amenities section
        if(all && all.length){
          const sec = document.createElement('div');
          sec.className = 'modal-section';
          sec.innerHTML = `<h4>${lang==='en'?'Amenities':'สิ่งอำนวยความสะดวก'}</h4>`;
          const ul = document.createElement('ul');
          ul.className = 'amenities-grid scrollable';
          ul.innerHTML = all
            .sort((a,b)=>(a.id||0)-(b.id||0))
            .map(a=>{
              const amenName = (lang==='en'?(a.name_en||a.name_th):(a.name_th||a.name_en))||a.code||'';
              const iconUrl = a.icon || a.icon_dir_path || '';
              const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="" loading="lazy" width="20" height="20" />` : '<span class="amen-bullet">•</span>';
              return `<li><span class="amen-icon">${iconHtml}</span><span class="amen-name">${amenName}</span></li>`;
            }).join('');
          sec.appendChild(ul); modalAmenities.appendChild(sec);
        }
        // bathroom items section
        if(bath && bath.length){
          const sec = document.createElement('div');
          sec.className = 'modal-section';
          sec.innerHTML = `<h4>${lang==='en'?'Bathroom items':'อุปกรณ์ในห้องน้ำ'}</h4>`;
          const ul = document.createElement('ul');
          ul.className = 'amenities-grid scrollable';
          ul.innerHTML = bath
            .sort((a,b)=>(a.id||0)-(b.id||0))
            .map(bi=>{
              const name = (lang==='en'?(bi.item_en||bi.item_th):(bi.item_th||bi.item_en)) || bi.code || '';
              return `<li><span class="amen-icon">🧴</span><span class="amen-name">${name}</span></li>`;
            }).join('');
          sec.appendChild(ul); modalAmenities.appendChild(sec);
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
  // Expose opener for external callers (e.g., image slider in cards)
  try{ window.__openRoomModalFromCard = openModalFromCard; }catch(_){ }

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
    // ---------- เช็คธง RETURNED_FROM_CHECKOUT: เคลียร์ cart + รีเสิร์ชใหม่ ----------
    try {
      const returnedFlag = localStorage.getItem('RETURNED_FROM_CHECKOUT');
      if (returnedFlag === '1') {
        console.log('🔄 Returned from checkout, clearing cart and re-searching...');
        localStorage.removeItem('RETURNED_FROM_CHECKOUT');
        localStorage.removeItem('booking_session');
        localStorage.removeItem('booking_session_timestamp');
        
        // ตั้งธง trigger ให้ runSearch ทำงาน
        localStorage.setItem('RETURNED_FROM_CHECKOUT_TRIGGER', '1');
        
        // รีเซ็ต drawer UI
        if (window.BookingDrawer && typeof window.BookingDrawer.reset === 'function') {
          window.BookingDrawer.reset();
        }
        // รีเซ็ต badge
        try {
          const badges = document.querySelectorAll('[data-cart-badge], .bs-badge');
          badges.forEach(b => b.textContent = '0');
          document.documentElement.classList.remove('bs-has-items');
        } catch (_) {}
      }
      
      // เผื่อ session หมดอายุ (> 5 นาที)
      try {
        const sessionTs = localStorage.getItem('booking_session_timestamp');
        if (sessionTs && (Date.now() - Number(sessionTs) > 5 * 60 * 1000)) {
          console.log('⏰ Session expired, clearing cart...');
          localStorage.removeItem('booking_session');
          localStorage.removeItem('booking_session_timestamp');
        }
      } catch (_) {}
      
      // ถ้าไม่มี hold แต่มี cart → ลบทิ้ง (เพื่อไม่ให้เห็นรายการค้าง)
      try {
        const bdRaw = localStorage.getItem('booking_data');
        const sessionRaw = localStorage.getItem('booking_session');
        if (sessionRaw && bdRaw) {
          const bd = JSON.parse(bdRaw);
          const hasHold = bd.hold_id || (Array.isArray(bd.hold_ids) && bd.hold_ids.length) || (Array.isArray(bd.holds_detail) && bd.holds_detail.length);
          if (!hasHold) {
            console.log('🗑️ No hold found but cart exists, clearing cart...');
            localStorage.removeItem('booking_session');
            localStorage.removeItem('booking_session_timestamp');
          }
        }
      } catch (_) {}
    } catch (_) {}

    populateNights();
    wireSameAsGuest();
    wireRoomSelection();

    // --- Prefetch request presets (special requests) and cache for checkout ---
    // This runs early on booking page so checkout can render immediately without extra API latency.
    (function prefetchRequestPresets(){
      try{
        // Skip if already cached recently (< 30 min)
        const raw = localStorage.getItem('request_presets');
        if(raw){
          try{
            const obj = JSON.parse(raw);
            if(obj && Array.isArray(obj.presets) && obj.fetched_at && (Date.now() - obj.fetched_at < 30*60*1000)){
              return; // Fresh cache
            }
          }catch(_){ /* invalid cache → refetch */ }
        }
      }catch(_){ }
      function getApiBase(){
        if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
        return (window.location.port === '8080') ? 'https://www.backpackkohyao.com' : '';
      }
      async function fetchPresets(){
        const apiBase = getApiBase();
        const urls = [
          `${apiBase}/api/v1/request-presets.php`,
          `${apiBase}/php-api/v1/request-presets.php`
        ];
        for(const u of urls){
          try{
            const res = await fetch(u, { cache:'no-cache' });
            if(res && res.ok){
              const data = await res.json();
              if(data && data.ok && Array.isArray(data.presets)){
                try{ localStorage.setItem('request_presets', JSON.stringify({ fetched_at: Date.now(), presets: data.presets })); }catch(_){ }
                console.log('✅ Cached request presets:', data.presets.length);
                return;
              }
            }
          }catch(err){ console.warn('⚠️ request-presets fetch failed on', u, err.message); }
        }
        console.warn('⚠️ Unable to fetch any request_presets endpoints');
      }
      fetchPresets();
    })();

    // --- Dynamic availability rendering using new API ---
    function getApiBase(){
      if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
      // For localhost testing, point to production API
  return (window.location.port === '8080') ? 'https://www.backpackkohyao.com' : '';
    }
    async function fetchAvailability(params){
      const q = new URLSearchParams(params);
      // Correct endpoint path includes .php
      const url = `${getApiBase()}/api/v1/availability.php?${q.toString()}`;
      console.log('🌐 API Call:', url);
      try{ 
        const res = await fetch(url, { cache:'no-cache' }); 
        if(!res.ok) {
          console.error('❌ API Error:', res.status, res.statusText);
          return { items:[] };
        }
        const data = await res.json();
        console.log('✅ API Success:', url, data);
        return data;
      }catch(err){ 
        console.error('❌ Fetch Error:', err);
        return { items:[] }; 
      }
    }

    function renderAvailList(rootId, items, lang, opts){
      const checkIn = (opts && opts.checkIn) ? String(opts.checkIn) : null;
      const root = document.getElementById(rootId);
      if(!root) return;
      // Clear existing cards
      root.innerHTML = '';
      if(!items || !items.length){ 
        const lang = window.currentLang || (document.documentElement.lang||'th');
        const isPriv = (rootId === 'panelRooms');
        const thMsg = isPriv
          ? 'ช่วงวันที่เลือกห้องเต็มหรือความจุไม่พอ แนะนำเพิ่มจำนวนห้องหรือเปลี่ยนวัน'
          : 'ช่วงวันที่เลือกเตียงเต็ม แนะนำลดจำนวนผู้เข้าพักหรือเปลี่ยนวัน';
        const enMsg = isPriv
          ? 'Rooms are sold out or capacity is insufficient for your selection. Try more rooms or change dates.'
          : 'Beds are sold out for the selected dates. Try fewer guests or change dates.';
        root.innerHTML = `<p class="muted">${lang==='en'? enMsg : thMsg}</p>`;
        return; 
      }
      items.forEach(it=>{
        const rt = it.room_type || {}; const name = (lang==='en'?(rt.name_en||rt.name_th):(rt.name_th||rt.name_en)) || rt.code || '';
  const imgs = Array.isArray(it.images) ? it.images.slice() : [];
  const img = (imgs&&imgs.length)? imgs[0].url : '';
        const plans = it.rate_plans || [];
  const amenities = it.amenities || [];
        
        // Debug: log amenities data
        if(amenities.length > 0) console.log('Amenities for', name, ':', amenities);
        
        const article = document.createElement('article');
        article.className = 'room-card mt-12';
        article.setAttribute('data-room-row', (rt.is_private? 'private':'dorm'));
        const priceHeaderLabel = rt.is_private ? 'ราคา/ห้อง/คืน' : 'ราคา/เตียง/คืน';
        function pickPrice(p){
          let price = null;
          const dates = p && p.pricing && Array.isArray(p.pricing.dates) ? p.pricing.dates : [];
          if(dates && dates.length){
            // คำนวณราคาเฉลี่ยต่อคืนจากทุกวันที่พัก
            const totalPrice = dates.reduce((sum, d) => sum + (d.price_minor || 0), 0);
            price = Math.round(totalPrice / dates.length);
          }
          if(price == null) price = p.base_price_minor || 0;
          return { price_minor: price };
        }
        function mapPolicyText(code){
          const l = (window.currentLang||document.documentElement.lang||'th');
          const th = {
            FLEXIBLE: 'ยกเลิกได้ใกล้วันเข้าพัก',
            MODERATE: 'ยกเลิกได้ก่อน 2 วัน',
            STRICT: 'ยกเลิกได้แต่หักบางส่วน',
            NON_REFUNDABLE: 'ไม่คืนเงิน'
          };
          const en = {
            FLEXIBLE: 'Flexible (close to check-in)',
            MODERATE: 'Moderate (2 days before)',
            STRICT: 'Strict (partial refund)',
            NON_REFUNDABLE: 'Non-refundable'
          };
          const dict = l==='en'? en : th;
          return dict[(code||'').toUpperCase()] || (code||'');
        }
        function mapMealPlan(code){
          const l = (window.currentLang||document.documentElement.lang||'th');
          const th = {
            NONE:'ไม่รวมอาหาร',
            BREAKFAST:'รวมอาหารเช้า',
            HALF_BOARD:'อาหาร 2 มื้อ (เช้า+เย็น)',
            FULL_BOARD:'ครบ 3 มื้อ'
          };
          const en = {
            NONE:'No meals',
            BREAKFAST:'Breakfast included',
            HALF_BOARD:'Half board (breakfast+dinner)',
            FULL_BOARD:'Full board (3 meals)'
          };
          const dict = l==='en'? en : th;
          return dict[(code||'').toUpperCase()] || (code||'');
        }
        function mapRefundable(flag){
          const l = (window.currentLang||document.documentElement.lang||'th');
          const yes = l==='en' ? 'Refundable (contact property 3 days before check-in)' : 'รับคืนเงินได้ (กรุณาติดต่อที่พักก่อนวันเข้าพัก 3 วัน)';
          const no  = l==='en' ? 'Non-refundable' : 'ไม่สามารถรับเงินคืนได้';
          return (flag===1 || flag===true || flag==='1') ? yes : no;
        }
        article.innerHTML = `
          <div class="room-media">
            <div class="room-badges">
              <span class="badge badge-roomname">${name}</span>
            </div>
            ${imgs && imgs.length ? `
            <div class="media-slider">
              <div class="slides">${imgs.map(i=>`<img src="${i.url}" alt="${name}" loading="lazy" decoding="async" width="800" height="600"/>`).join('')}</div>
              ${imgs.length>1? `<button class="nav prev" aria-label="Prev" style="pointer-events: auto;">&#8249;</button><button class="nav next" aria-label="Next" style="pointer-events: auto;">&#8250;</button><div class="dots">${imgs.map((_,k)=>`<span class="dot ${k===0?'active':''}" data-k="${k}"></span>`).join('')}</div>`:''}
            </div>` : ''}
            <div class="room-size">📐 ${rt.area_sqm||''} m²</div>
            ${amenities && amenities.length > 0 ? `
            <div class="room-amenities">
              <ul class="amenities-list">${amenities
                .sort((a,b)=>(a.id||0)-(b.id||0))
                .slice(0,4)
                .map(a=>{
                  const amenName = (lang==='en'?(a.name_en||a.name_th):(a.name_th||a.name_en))||a.code||'';
                  const iconUrl = a.icon || a.icon_dir_path || '';
                  const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="" loading="lazy" width="20" height="20" />` : '✓';
                  return `<li><span class="amen-icon">${iconHtml}</span><span class="amen-name">${amenName}</span></li>`;
                }).join('')}
              </ul>
            </div>
            ` : ''}
            <a href="#" class="room-link">ดูรายละเอียดห้องพัก</a>
          </div>
          <div class="room-body">
            <div class="rate-table">
              <div class="rate-header">
                <div>ตัวเลือกห้องพัก</div>
                <div>ผู้เข้าพัก</div>
                <div>${priceHeaderLabel}</div>
              </div>
              ${(plans||[]).map(p=>{
              const selected = pickPrice(p);
              // Round half up: ปัดทศนิยม 2 ตำแหน่งแบบ half up
              const priceInBaht = ((selected.price_minor||0))/100;
              const show = (Math.round(priceInBaht * 100) / 100).toFixed(2);
              const desc = (window.currentLang==='en'?(p.description_en||p.description_th):(p.description_th||p.description_en))||'';
              const adults = (rt.max_adults!=null)? rt.max_adults : 0;
              const children = (rt.max_children!=null)? rt.max_children : 0;
              const refundText = mapRefundable(p.refundable);
              const policyText = mapPolicyText(p.cancellation_policy||'');
              const mealText = mapMealPlan(p.meal_plan||'');
              const refundableFlag = (p.refundable===1 || p.refundable===true || p.refundable==='1');

              // Left column: description + details (original style)
              let leftLines = [];
              if(desc) leftLines.push(`<div class="rate-desc"><span class="ic">✓</span>${desc}</div>`);
              if(refundText) leftLines.push(`<div class="rate-desc ${refundableFlag?'text-green':''}">${refundableFlag?'<span class="ic">💵</span>':''}${refundText}</div>`);
              if(p.cancellation_policy) leftLines.push(`<div class="rate-desc"><span class="ic">🗓️</span>${policyText}</div>`);
              if(p.meal_plan) leftLines.push(`<div class="rate-desc"><span class="ic">🍽️</span>${mealText}</div>`);
              // Availability tips based on API 'availability' field (content only)
              try{
                const av = it.availability || {};
                const isPriv = (rt.is_private===1 || rt.is_private==='1' || rt.is_private===true);
                const minAvail = Number(av.min_available!=null? av.min_available : NaN);
                const unitsReq = Number(av.units_required!=null? av.units_required : NaN);
                const capOk = (av.capacity_ok!==false);
                if(!isNaN(minAvail) && !isNaN(unitsReq)){
                  const remain = minAvail - unitsReq;
                  const lang2 = window.currentLang || (document.documentElement.lang||'th');
                  if(capOk){
                    if(remain===0){
                      leftLines.push(`<div class=\"rate-desc text-orange\">${lang2==='en'?'Exactly enough availability for your selection':'จำนวนว่างพอดีกับที่เลือก'}</div>`);
                    }else if(remain>0 && remain<=2){
                      const unitName = isPriv ? (lang2==='en'?'room(s)':'ห้อง') : (lang2==='en'?'bed(s)':'เตียง');
                      leftLines.push(`<div class=\"rate-desc text-orange\">${lang2==='en'?`Only ${remain} ${unitName} left for the selected dates`:`เหลืออีกเพียง ${remain} ${unitName} ในช่วงวันที่เลือก`}</div>`);
                    }
                  } else if(isPriv){
                    const maxA = (rt.max_adults!=null? Number(rt.max_adults):0);
                    const gu = (opts && typeof opts.guests==='number') ? opts.guests : (function(){ try{ const el=document.getElementById('guests'); return el? Number(el.value||2):2; }catch(_){ return 2; } })();
                    const needRooms = maxA>0? Math.ceil(gu/maxA) : unitsReq;
                    leftLines.push(`<div class=\"rate-desc text-red\">${lang2==='en'?`Guests exceed room capacity. Try at least ${needRooms} rooms.`:`จำนวนผู้เข้าพักมากกว่าความจุต่อห้อง แนะนำอย่างน้อย ${needRooms} ห้อง`}</div>`);
                  }
                }
              }catch(_){ }
              const leftContent = leftLines.join('');

              // Middle column: guest info
              const guestText = window.currentLang==='en' 
                ? `👤 ${adults} Adult${adults>1?'s':''}`
                : `👤 ${adults} ผู้ใหญ่`;
              const middleContent = `<div class="rate-guest">${guestText}</div>`;

              // Right column: price + button
              const currency = p.base_currency || 'THB';
              // ราคาทั้งหมดเป็นแบบ exclusive เสมอ → แสดงข้อความคงที่
              const taxText = window.currentLang==='en' 
                ? 'Exclusive of taxes and fees'
                : 'ไม่รวมภาษีและค่าธรรมเนียม';
              // เก็บข้อมูล rate plan และราคาแต่ละวันไว้ใน data attribute
              // Keep API descriptions verbatim (no cleaning)
              const planDataJson = JSON.stringify({
                room_type_id: rt.id, // include for precise button targeting
                plan_id: p.id,
                plan_name: p.name,
                name_th: p.name_th,
                name_en: p.name_en,
                description: (desc != null ? desc : p.description),
                description_th: (p.description_th != null ? p.description_th : p.description),
                description_en: (p.description_en != null ? p.description_en : p.description),
                base_currency: currency,
                tax_included: false,
                refundable: refundableFlag,
                cancellation_policy: p.cancellation_policy,
                meal_plan: p.meal_plan,
                pricing_dates: p.pricing && p.pricing.dates ? p.pricing.dates : [],
                nights: p.pricing && p.pricing.nights ? p.pricing.nights : 0
              });
              const rightContent = `
                <div class="rate-price">${currency} ${show}</div>
                <div class="rate-tax-info">${taxText}</div>
                <div class="rate-cta"><a href="./checkout.html" class="btn select-room" 
                  data-room="${rt.code||rt.id}" 
                  data-room-name="${name}"
                  data-original-text="${(window.currentLang==='en') ? 'Select' : 'เลือก'}"
                  data-plan='${planDataJson.replace(/'/g, '&apos;')}'>เลือก</a></div>
              `.trim();

              return `<div class="rate-row">
                <div>${leftContent}</div>
                <div>${middleContent}</div>
                <div>${rightContent}</div>
              </div>`;
            }).join('')}
            </div>
          </div>`;
    // Save full amenities & images for modal use
  try{ article.__amenitiesFull = Array.isArray(amenities) ? amenities.slice() : []; }catch(_){ }
  try{ article.__imagesFull = Array.isArray(imgs) ? imgs.slice() : []; }catch(_){ }
  try{ article.__bathroomFull = Array.isArray(it.bathroom_items) ? it.bathroom_items.slice() : []; }catch(_){ }
  try{ article.__rt = rt; }catch(_){ }
  root.appendChild(article);
        // Wire slider inside this card and click-to-open behavior
        try{
          const slider = article.querySelector('.media-slider');
          if(slider){
            initSliderContainer(slider);
            slider.querySelectorAll('img').forEach(im=>{
              im.style.cursor = 'pointer';
              im.addEventListener('click', (e)=>{ e.preventDefault(); if(window.__openRoomModalFromCard) window.__openRoomModalFromCard(article); });
            });
          }
        }catch(_){ }
      });
      // Re-wire selection and modal on newly created elements
      wireRoomSelection();
    }

    // Wire search bar: validate, persist, navigate
    try{
      const ci = qs('#checkin');
      const co = qs('#checkout');
      const g  = qs('#guests');
      // ✅ Removed 'rooms' field reference
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
        if(ci && ciQ) ci.value = ciQ;
        if(co && coQ) co.value = coQ;
        if(g && gQ) g.value = String(gQ);
        // Update the visible combined date range box if both are present
        if(box && (ciQ || coQ)){
          const left = ci ? (ci.value||ciQ||'') : (ciQ||'');
          const right = co ? (co.value||coQ||'') : (coQ||'');
          if(left && right) box.value = `${left} – ${right}`;
        }
        // Merge into draft
        const draftRaw = localStorage.getItem('booking_draft');
        const draft = draftRaw ? JSON.parse(draftRaw) : {};
        if(ciQ) draft.checkIn = ciQ;
        if(coQ) draft.checkOut = coQ;
        if(gQ)  draft.guests = Number(gQ);
        // ✅ Removed 'rooms' from draft - not needed anymore
        localStorage.setItem('booking_draft', JSON.stringify(draft));
      }catch(_){ }

      async function runSearch(){
        const lang = window.currentLang || (document.documentElement.lang || 'th');
        const paramsBase = { 
          check_in: ci? ci.value : undefined, 
          check_out: co? co.value : undefined, 
          sort:'price_asc',
          // ✅ Include only guests (rooms removed - quantity selected per item)
          guests: g ? Number(g.value||2) : undefined
        };
        
        // Guard: if dates missing, show info and abort
        if(!paramsBase.check_in || !paramsBase.check_out){
          try{
            const msgTh = 'กรุณาเลือกวันที่เช็คอินและเช็คเอาท์ก่อนค้นหา';
            const msgEn = 'Please select check-in and check-out dates first.';
            const msg = (lang==='en') ? msgEn : msgTh;
            const p1 = document.getElementById('panelRooms');
            const p2 = document.getElementById('panelBeds');
            if(p1) p1.innerHTML = `<p class="muted">${msg}</p>`;
            if(p2) p2.innerHTML = `<p class="muted">${msg}</p>`;
          }catch(_){ }
          return;
        }

        console.log('🔍 Fetching availability with params:', paramsBase);
        
        const [rooms, beds] = await Promise.all([
          fetchAvailability({ ...paramsBase, is_private:1 }),
          fetchAvailability({ ...paramsBase, is_private:0 })
        ]);
        
        console.log('📦 API Response - Rooms:', rooms);
        console.log('📦 API Response - Beds:', beds);
        
        const roomItems = Array.isArray(rooms.items) ? rooms.items : [];
        const bedItems  = Array.isArray(beds.items) ? beds.items : [];
        
    console.log('✅ Parsed - Room items:', roomItems.length, 'Bed items:', bedItems.length);

    const guestsNum = g ? Number(g.value||2) : undefined;
    renderAvailList('panelRooms', roomItems, lang, { checkIn: ci? ci.value : null, guests: guestsNum });
    renderAvailList('panelBeds', bedItems, lang, { checkIn: ci? ci.value : null, guests: guestsNum });

        // ✅ AFTER RENDER: Sync button states with current cart
        try {
          if(window.syncDisabledButtonsWithCart) {
            const raw = localStorage.getItem('booking_session');
            const sessionData = raw ? JSON.parse(raw) : null;
            if(sessionData && Array.isArray(sessionData.cart)) {
              console.log('🔄 Syncing button states after render:', sessionData.cart.length, 'items in cart');
              window.syncDisabledButtonsWithCart(sessionData.cart);
            }
          }
        } catch(err) {
          console.error('Error syncing button states after render:', err);
        }

        // Decide default visible tab after search per rules provided
        try{
          let target = 'rooms';
          const hasRooms = roomItems.length > 0;
          const hasBeds  = bedItems.length > 0;
          if(!hasRooms && hasBeds) target = 'beds';
          // other cases default 'rooms'
          if(window.RoomTabs && typeof window.RoomTabs.setActiveByKey === 'function'){
            window.RoomTabs.setActiveByKey(target);
          } else {
            // Fallback: toggle manually
            const tabRooms = document.getElementById('tabRooms');
            const tabBeds  = document.getElementById('tabBeds');
            if(target==='beds' && tabBeds) tabBeds.click(); else if(tabRooms) tabRooms.click();
          }
        }catch(_){ }
      }

      if(searchBtn){
        searchBtn.addEventListener('click', (e)=>{
          // Stay on page and fetch results
          if(e && typeof e.preventDefault === 'function') e.preventDefault();
          // Save selection then scroll to results
          try{
            const draftRaw = localStorage.getItem('booking_draft');
            const draft = draftRaw ? JSON.parse(draftRaw) : {};
            draft.checkIn  = ci ? ci.value : draft.checkIn;
            draft.checkOut = co ? co.value : draft.checkOut;
            draft.guests   = g ? Number(g.value||2) : (draft.guests||2);
            localStorage.setItem('booking_draft', JSON.stringify(draft));
          }catch(_){ }
          // Update hash for accessibility/scroll and fetch
          try{ if(location.hash !== '#rooms') location.hash = '#rooms'; }catch(_){ }
          runSearch();
        }, { once:false });
      }

      // Auto-run search only when coming from index.html (flag auto=1 in URL)
      // OR when returning from checkout (RETURNED_FROM_CHECKOUT flag was set)
      // If user opens booking.html directly, they must click the search button themselves.
      try {
        const usp = new URLSearchParams(location.search || '');
        const hasCi = !!usp.get('ci');
        const hasCo = !!usp.get('co');
        const auto = usp.get('auto') === '1';
        const returnedFromCheckout = (localStorage.getItem('RETURNED_FROM_CHECKOUT_TRIGGER') === '1');
        
        if ((auto && hasCi && hasCo) || returnedFromCheckout) {
          // Ensure the visible date range box reflects params before running
          if (box && ci && co && (!box.value || box.value.indexOf('–') === -1)) {
            box.value = `${ci.value} – ${co.value}`;
          }
          runSearch();
          // Clear trigger flag after running
          if (returnedFromCheckout) {
            localStorage.removeItem('RETURNED_FROM_CHECKOUT_TRIGGER');
          }
        }
      } catch (_) { /* no-op */ }
    }catch(_){ }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
