(function(){
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
        
        console.log('🔵 Select button clicked');
        
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
          const rt = card ? (card.__rt || {}) : {};
          const roomTypeId = rt && typeof rt.id !== 'undefined' ? rt.id : null;
          const isPrivate = (rt && (rt.is_private===1 || rt.is_private===true || rt.is_private==='1')) ? true : false;
          // Derive mode robustly with DOM fallback and safe default
          const domMode = card ? (card.getAttribute('data-room-row') || '') : '';
          let mode = isPrivate ? 'PRIVATE' : 'DORM';
          if(domMode){ mode = (domMode.toUpperCase()==='PRIVATE') ? 'PRIVATE' : 'DORM'; }
          // nightly_prices_minor ต่อหน่วย ต่อคืน (exclusive)
          const nightlyPrices = Array.isArray(plan.pricing_dates)
            ? plan.pricing_dates.map(d => Number(d && d.price_minor || 0))
            : [];
          
          // ดึงข้อมูลวันที่และจำนวนผู้เข้าพักจาก search form
          const ci = qs('#checkin');
          const co = qs('#checkout');
          const g = qs('#guests');
          const r = qs('#rooms');
          
          const bookingData = {
            // ข้อมูลห้อง
            room_code: roomCode,
            room_name: roomName,
            room_type_id: roomTypeId,
            is_private: isPrivate ? 1 : 0,
            mode: mode,
            
            // ข้อมูล rate plan
            rate_plan: plan,
            rate_plan_id: (plan && plan.plan_id != null) ? plan.plan_id : undefined,
            nightly_prices_minor: nightlyPrices,
            
            // ข้อมูลวันที่
            check_in: ci ? ci.value : null,
            check_out: co ? co.value : null,
            nights: plan.nights || 0,
            
            // ข้อมูลผู้เข้าพัก
            guests: g ? Number(g.value || 2) : 2,
            rooms: r ? Number(r.value || 1) : 1,
            
            // เวลาที่จอง
            booking_timestamp: new Date().toISOString()
          };
          
          // Try to create an inventory HOLD before navigating to checkout
          const apiBase = (window.location.port === '8080') ? 'https://www.backpackkohyao.com' : '';
          const payload = {
            room_type_id: roomTypeId,
            mode: mode,
            rooms: bookingData.rooms,
            guests: bookingData.guests,
            check_in: bookingData.check_in,
            check_out: bookingData.check_out,
            session_id: (typeof window.getSessionId === 'function') ? window.getSessionId() : undefined
          };
          console.log('🟦 Creating HOLD with payload:', payload);
          try{
            // Try primary API path first, then fallback to /php-api for local envs
            let res;
            try{
              res = await fetch(`${apiBase}/api/v1/inventory-hold-create.php`, {
                method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), cache:'no-cache'
              });
            }catch(_e){ res = null; }
            if(!(res && res.ok)){
              try{
                res = await fetch(`${apiBase}/php-api/v1/inventory-hold-create.php`, {
                  method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), cache:'no-cache'
                });
              }catch(_e2){ res = null; }
            }
            if(res && res.ok){
              const json = await res.json();
              console.log('🟩 HOLD created:', json);
              if(json && json.hold_id){
                bookingData.hold_id = json.hold_id;
                bookingData.hold_expires_at = json.expires_at;
                bookingData.hold_seconds = json.seconds_to_expiry;
              }
            } else {
              // If sold out (409) inform user and stop
              if(res && res.status === 409){
                try{ const err = await res.json(); console.warn('Sold out during selection:', err); }catch(_){ }
                alert((window.currentLang==='en')? 'Sorry, just sold out for the selected dates.' : 'ขออภัย ช่วงวันที่เลือกมีผู้จองก่อนหน้าแล้ว');
                return; // do not proceed
              }
              console.warn('HOLD API failed or unreachable', res && res.status);
            }
          }catch(err){ console.warn('HOLD API error:', err); }

          console.log('💾 Saving booking data:', bookingData);
          localStorage.setItem('booking_data', JSON.stringify(bookingData));
          console.log('✅ Saved to localStorage successfully');
          
          // Navigate to checkout
          window.location.href = 'checkout.html';
        } catch(err) {
          console.error('Error saving booking data:', err);
          // Fallback: ไปหน้า checkout ตามปกติ
          window.location.href = 'checkout.html';
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
    populateNights();
    wireSameAsGuest();
    wireRoomSelection();

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
              const planDataJson = JSON.stringify({
                plan_id: p.id,
                plan_name: p.name,
                name_th: p.name_th,
                name_en: p.name_en,
                description: desc,
                description_th: p.description_th,
                description_en: p.description_en,
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
        if(rQ)  draft.rooms = Number(rQ);
        localStorage.setItem('booking_draft', JSON.stringify(draft));
      }catch(_){ }

      async function runSearch(){
        const lang = window.currentLang || (document.documentElement.lang || 'th');
        const paramsBase = { 
          check_in: ci? ci.value : undefined, 
          check_out: co? co.value : undefined, 
          sort:'price_asc',
          // Include guests/rooms for capacity-aware availability
          guests: g ? Number(g.value||2) : undefined,
          rooms:  r ? Number(r.value||1) : undefined,
        };
        
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
  const roomsNum  = r ? Number(r.value||1) : undefined;
  renderAvailList('panelRooms', roomItems, lang, { checkIn: ci? ci.value : null, guests: guestsNum, rooms: roomsNum });
  renderAvailList('panelBeds', bedItems, lang, { checkIn: ci? ci.value : null, guests: guestsNum, rooms: roomsNum });

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
            draft.rooms    = r ? Number(r.value||1) : (draft.rooms||1);
            localStorage.setItem('booking_draft', JSON.stringify(draft));
          }catch(_){ }
          // Update hash for accessibility/scroll and fetch
          try{ if(location.hash !== '#rooms') location.hash = '#rooms'; }catch(_){ }
          runSearch();
        }, { once:false });
      }

      // Auto-run search only when coming from index.html (flag auto=1 in URL)
      // If user opens booking.html directly, they must click the search button themselves.
      try {
        const usp = new URLSearchParams(location.search || '');
        const hasCi = !!usp.get('ci');
        const hasCo = !!usp.get('co');
        const auto = usp.get('auto') === '1';
        if (auto && hasCi && hasCo) {
          // Ensure the visible date range box reflects params before running
          if (box && ci && co && (!box.value || box.value.indexOf('–') === -1)) {
            box.value = `${ci.value} – ${co.value}`;
          }
          runSearch();
        }
      } catch (_) { /* no-op */ }
    }catch(_){ }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
