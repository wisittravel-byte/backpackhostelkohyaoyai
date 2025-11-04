// Dynamic room-type rendering for homepage tabs ("ห้องพัก" = private, "เตียง Dorm" = dorm)
(function(){
  const lang = new URLSearchParams(location.search).get('lang') || 'th';
  const qs = (p)=>encodeURIComponent(p);

  const elRooms = () => document.getElementById('roomsList');
  const elDorms = () => document.getElementById('dormList');

  // Fetch all room types from PHP API (root-level API path)
  const API_PATH = '/api/room-types.php';
  async function loadAll(){
    const url = `${API_PATH}?lang=${qs(lang)}`;
    console.info('[roomtypes] fetch', url);
    const res = await fetch(url, { credentials:'same-origin' });
    console.info('[roomtypes] status', res.status, url);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    return Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : json.items || []);
  }

  // Optional static fallback when API fails
  async function loadFallback(){
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), 3000);
    try{
      const r = await fetch('assets/json/room-types.json', {signal: controller.signal, cache:'no-store'});
      if(!r.ok) throw new Error('static room-types.json not found ('+r.status+')');
      return r.json();
    } finally { clearTimeout(id); }
  }

  // Build card element
  function createCard(item){
    const a = document.createElement('article');
    a.className = 'room';
    a.setAttribute('data-room-type-id', String(item.id||''));

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 800; img.height = 600;
    img.alt = (item.name||'Room');
    // Derive image URL; try absolute -> likely uploads path -> fallback
    const cover = (item.cover_image||'').trim();
    let src = 'assets/image/Hostel2.jpg';
    if(/^https?:\/\//i.test(cover)) src = cover;
    else if(cover) src = '/uploads/'+cover; // if you host images elsewhere, adjust here
    img.src = src;
    img.onerror = function(){ this.onerror=null; this.src='assets/image/Hostel2.jpg'; };

    const body = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('strong');
    title.textContent = item.name || item.code || 'Room';
    meta.appendChild(title);

    const muted = document.createElement('div');
    muted.className = 'muted';
    muted.textContent = item.description || '';

    body.appendChild(meta);
    body.appendChild(muted);

    const bottom = document.createElement('div');
    bottom.className = 'flex justify-between items-center';
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = (lang==='th')? 'จองเลย' : 'Book now';
    bottom.appendChild(document.createElement('div'));
    bottom.appendChild(btn);

    a.appendChild(img);
    a.appendChild(body);
    a.appendChild(bottom);
    return a;
  }

  function render(rows){
    if(!Array.isArray(rows)) return;
    const rooms = rows.filter(r => (r.is_private===1 || r.is_private===true || r.type==='private'));
    const dorms = rows.filter(r => (r.is_private===0 || r.is_private===false || r.type==='dorm'));

    // Clear all existing content and show only API data
    const rl = elRooms();
    const dl = elDorms();

    if(rl){
      rl.innerHTML = '';
      if(rooms.length){
        rooms.forEach(item => rl.appendChild(createCard(item)));
      } else {
        // Show empty state message when no private rooms in DB
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<p>ไม่พบห้องพักประเภทนี้ในขณะนี้</p>';
        rl.appendChild(empty);
      }
    }
    
    if(dl){
      dl.innerHTML = '';
      if(dorms.length){
        dorms.forEach(item => dl.appendChild(createCard(item)));
      } else {
        // Show empty state message when no dorm beds in DB
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<p>ไม่พบเตียง Dorm ในขณะนี้</p>';
        dl.appendChild(empty);
      }
    }
  }

  async function init(){
    try{
      const all = await loadAll();
      render(all);
    }catch(err){
      console.error('[roomtypes] API failed:', err.message);
      // Show error state instead of fallback data
      const rl = elRooms();
      const dl = elDorms();
      const errorMsg = '<div class="error-state"><p>ไม่สามารถโหลดข้อมูลห้องพักได้ กรุณาลองใหม่อีกครั้ง</p></div>';
      if(rl) rl.innerHTML = errorMsg;
      if(dl) dl.innerHTML = errorMsg;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
