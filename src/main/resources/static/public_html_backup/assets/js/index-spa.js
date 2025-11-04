(function(){
  const { debounce, escapeHTML, store } = SPA;
  const { lang, t } = useI18n();
  // Global UI state
  store.set({ lang, tab:'rooms', page:1, pageSize:12, sort:'name', order:'asc' });

  // Image URL normalizer - fix relative paths
  function normalizeImageUrl(u) {
    if (!u) return null;
    // ถ้ามาเป็น absolute อยู่แล้ว ก็ใช้งานต่อได้เลย
    if (/^https?:\/\//i.test(u)) return u;
    // ตัด ./ ออก แล้วบังคับให้ขึ้นต้นด้วย /
    const cleaned = String(u).replace(/^\.\/+/, '').replace(/^\/+/, '');
    return '/' + cleaned; // => "/web/dist/images/..."
  }

  // --- ETag cache (url -> { etag, json })
  const etagCache = new Map();

  async function fetchJsonWithETag(url, { timeoutMs = 10000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);

    const headers = new Headers();
    // send If-None-Match if we have one
    const cached = etagCache.get(url);
    if (cached?.etag) headers.set('If-None-Match', cached.etag);

    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        signal: ctrl.signal,
        // help dev-only: no-cache so proxies revalidate with ETag
        cache: 'no-cache'
      });
    } finally {
      clearTimeout(t);
    }

    console.info('status:', res.status, url);

    // 304 → use cached.json
    if (res.status === 304) {
      if (cached?.json) return cached.json;
      // no cached body yet; return empty shape instead of crashing
      return { meta:{ page:1, pageSize:12, total:0 }, items:[] };
    }

    if (!res.ok) {
      // graceful empty payload; don't crash renderer
      return { meta:{ page:1, pageSize:12, total:0 }, items:[] };
    }

    const json = await res.json().catch(() => ({ meta:{ page:1, pageSize:12, total:0 }, items:[] }));
    const etag = res.headers.get('ETag');

    if (etag) etagCache.set(url, { etag, json });
    else etagCache.delete(url); // avoid stale

    return json;
  }

  // Container helpers
  function getContainers(tab){
    if(tab==='rooms') return {
      list: document.getElementById('roomsList'),
      empty: document.getElementById('roomsEmpty')
    };
    return {
      list: document.getElementById('dormList'),
      empty: document.getElementById('dormEmpty')
    };
  }

  // Simple synchronous renderer - no async/await here
  function renderRoomTypes(tab, items) {
    console.info('will render', items.length, '→', tab);
    const { list, empty } = getContainers(tab);
    if(!list || !empty){ console.warn('missing containers', {tab}); return; }

    list.innerHTML = '';
    if (!items.length) {
      empty.classList.remove('hidden');
      list.classList.add('hidden');
      console.warn(`rendered 0 items to ${tab} – showing empty state`);
      return;
    }

    empty.classList.add('hidden');
    list.classList.remove('hidden');

    // Always render every item - no filtering
    for (const rt of items) {
      const name = rt.name_th || rt.name_en || rt.code || '—';
      
      // ใช้รูปจาก images array ก่อน (รูปแรก) ถ้าไม่มีค่อยใช้ cover
      let coverUrl = null;
      if (Array.isArray(rt.images) && rt.images.length > 0) {
        coverUrl = rt.images[0].url; // ใช้รูปแรกจาก images array
      } else {
        coverUrl = rt.cover?.url || rt.cover_url || null;
      }
      const normalizedUrl = normalizeImageUrl(coverUrl);
      
      // Room card - vertical layout for grid display
      const div = document.createElement('article');
      div.className = 'room-card bg-white rounded-2xl shadow-md overflow-hidden';
      div.setAttribute('data-smart-cover', '1');
      
      // Create image container - now on top
      const imgContainer = document.createElement('div');
      imgContainer.className = 'room-cover relative w-full aspect-[4/3] bg-slate-100 overflow-hidden';
      imgContainer.setAttribute('data-cover-box', '');
      
      if (normalizedUrl) {
        const img = document.createElement('img');
        img.className = 'block w-full h-full object-cover transition-[object-fit]';
        img.setAttribute('data-cover-img', '');
        img.setAttribute('data-src', normalizedUrl);
        img.src = ''; // Start empty, will be set by SMART fit
        img.alt = name;
        
        // Fallback badge with data-no-image
        const fallback = document.createElement('span');
        fallback.className = 'absolute left-2 top-2 text-xs bg-slate-700/70 text-white rounded px-2 py-1 hidden';
        fallback.setAttribute('data-no-image', '');
        fallback.textContent = 'ไม่มีรูป';
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(fallback);
      } else {
        // No image case
        const fallback = document.createElement('span');
        fallback.className = 'absolute left-2 top-2 text-xs bg-slate-700/70 text-white rounded px-2 py-1';
        fallback.setAttribute('data-no-image', '');
        fallback.textContent = 'ไม่มีรูป';
        imgContainer.appendChild(fallback);
      }
      
      // Create content container - now below image
      const content = document.createElement('div');
      content.className = 'p-4';
      content.innerHTML = `
        <div class="room-code text-sm text-slate-500 mb-2">${rt.code || ''}</div>
        <div class="room-name text-lg font-bold text-slate-900 leading-tight">${name}</div>`;
      
      div.appendChild(imgContainer);
      div.appendChild(content);
      list.appendChild(div);
    }
    console.info(`rendered ${items.length} items to ${tab}`);
    
    // Apply SMART image fitting after all cards are rendered
    smartFitImages(list);
  }


  // API endpoint lives at the root: /api
  const API_PATH = '/api/room-types.php';
  function buildRoomTypesUrl(isPrivate, language='th'){
    // Fixed defaults per spec (no pagination switching from UI here)
    const params = new URLSearchParams({
      is_private: String(isPrivate),
      lang: language || 'th',
      page: '1',
      pageSize: '12',
      sort: 'name',
      order: 'asc',
    });
    return `${API_PATH}?${params.toString()}`;
  }

  // Language toggle
  function LanguageToggle(root){
    const el = root || document.createElement('div');
    el.className = 'lang-toggle';
    el.innerHTML = `<button data-lang="th" class="btn ${lang==='th'?'active':''}">TH</button>
                    <button data-lang="en" class="btn ${lang==='en'?'active':''}">EN</button>`;
    el.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-lang]'); if(!btn) return;
      const newLang = btn.getAttribute('data-lang');
      if(newLang!==store.state.lang){
        store.set({ lang:newLang, page:1 });
        const url = new URL(location.href); url.searchParams.set('lang', newLang); history.replaceState(null,'',url);
        fetchAndRender();
      }
      [...el.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b===btn));
    });
    return el;
  }

  // Tabs - updated to use new container IDs
  function Tabs(){
    const tabsRoot = document.getElementById('roomTabs');
    if(!tabsRoot) return;
    tabsRoot.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-tab]'); if(!btn) return;
      const tab = btn.getAttribute('data-tab');
      if(tab!==store.state.tab){ 
        switchToTab(tab);
      }
    });
  }

  // Updated tab switching to use new async fetcher
  async function switchToTab(tab) {
    store.set({ tab, page:1 });
    
    // Update UI immediately
    document.getElementById('tabRooms').classList.toggle('active', tab==='rooms');
    document.getElementById('tabBeds').classList.toggle('active', tab==='beds');
    
    const roomsTab = document.getElementById('roomsTab');
    const dormTab = document.getElementById('dormTab');
    
    if(tab==='rooms'){
      roomsTab?.classList.remove('hidden');
      dormTab?.classList.add('hidden');
    } else {
      dormTab?.classList.remove('hidden'); 
      roomsTab?.classList.add('hidden');
    }
    
    // Fetch data for the selected tab
    await fetchAndRenderRoomTypes(tab === 'rooms');
  }



  // Helper: allow overriding API base from index.html via window.API_BASE
  function getApiBase(){
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
    // Local dev: static on 8080, API on http://localhost
    return (window.location.port === '8080') ? 'http://localhost' : '';
  }

  // Direct async fetch and render - no debounce, proper timing
  async function fetchAndRenderRoomTypes(isPrivate) {
    const lang = window.currentLang || 'th';
    const url = `${getApiBase()}/api/room-types.php?is_private=${isPrivate ? 1 : 0}&lang=${lang}&page=1&pageSize=12&sort=name&order=asc`;

    console.group('room-types payload');
    console.info('url:', url);
    
    let res;
    try {
      res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    } catch (err) {
      console.error('Fetch failed:', err);
      renderRoomTypes(isPrivate ? 'rooms' : 'beds', []);
      console.groupEnd();
      return;
    }
    
    console.info('status:', res.status);

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      console.error('JSON parse failed', err);
      data = { items: [] };
    }

    console.info('items.length:', Array.isArray(data.items) ? data.items.length : 'not array');
    console.groupEnd();

    const items = Array.isArray(data.items) ? data.items : [];
    console.log('items.length before render:', items.length);
    renderRoomTypes(isPrivate ? 'rooms' : 'beds', items);
  }

  // Boot - proper async initialization with smart default tab selection
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Setup tabs
    Tabs();
    
    // Wait a bit for header/footer to load, then fetch both tabs and decide default
    setTimeout(async () => {
      // Fetch data for both tabs to determine which one to show first
  const lang = window.currentLang || 'th';
  const API_BASE = getApiBase();
      
      // Fetch room counts for both types
      const [roomsResponse, bedsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/room-types.php?is_private=1&lang=${lang}&page=1&pageSize=12&sort=name&order=asc`, { cache: 'no-cache' }).catch(() => null),
        fetch(`${API_BASE}/api/room-types.php?is_private=0&lang=${lang}&page=1&pageSize=12&sort=name&order=asc`, { cache: 'no-cache' }).catch(() => null)
      ]);
      
      let roomsCount = 0;
      let bedsCount = 0;
      
      if (roomsResponse?.ok) {
        const roomsData = await roomsResponse.json().catch(() => ({ items: [] }));
        roomsCount = Array.isArray(roomsData.items) ? roomsData.items.length : 0;
      }
      
      if (bedsResponse?.ok) {
        const bedsData = await bedsResponse.json().catch(() => ({ items: [] }));
        bedsCount = Array.isArray(bedsData.items) ? bedsData.items.length : 0;
      }
      
      // Business logic for default tab selection:
      // 1. If no rooms (private) found → show beds (dorm) first
      // 2. If no beds (dorm) found → show rooms (private) first  
      // 3. If both found → show rooms (private) first (default)
      let defaultTab = 'rooms'; // default to rooms
      
      if (roomsCount === 0 && bedsCount > 0) {
        defaultTab = 'beds'; // no rooms, but have beds → show beds
      } else if (roomsCount > 0 && bedsCount === 0) {
        defaultTab = 'rooms'; // have rooms, no beds → show rooms
      } else if (roomsCount > 0 && bedsCount > 0) {
        defaultTab = 'rooms'; // both found → show rooms first
      } else {
        defaultTab = 'rooms'; // none found → default to rooms
      }
      
      // Now fetch and render both tabs, then switch to default
      await fetchAndRenderRoomTypes(true);   // ห้องพัก (is_private=1)
      await fetchAndRenderRoomTypes(false);  // เตียง Dorm (is_private=0)
      
      // Switch to the determined default tab
      await switchToTab(defaultTab);
    }, 100);
  });

  // --- SMART image-fit utilities (non-breaking) --- //
  function smartFitImages(rootEl) {
    if (!rootEl) return;
    const cards = rootEl.querySelectorAll('[data-smart-cover="1"]');
    cards.forEach(card => {
      // ป้องกันรันซ้ำ
      if (card.dataset.fitted === '1') return;

      const container = card.querySelector('[data-cover-box]');
      const img = card.querySelector('img[data-cover-img]');
      const badge = card.querySelector('[data-no-image]');

      if (!container || !img) { return; }

      // เตรียมสถานะเริ่มต้น: ซ่อน badge, โหมดรอรูป
      if (badge) badge.classList.add('hidden');
      // ใช้ CSS default (4:3 landscape) ไม่ต้อง set inline style

      // โหลดรูปแบบไม่ขวาง UI
      const probe = new Image();
      probe.decoding = 'async';
      probe.loading = 'eager';
      probe.src = img.getAttribute('data-src') || img.src;

      const applyPortrait = () => {
        container.setAttribute('data-orientation', 'portrait');
        img.src = probe.src;
        card.dataset.fitted = '1';
      };

      const applyLandscape = () => {
        container.removeAttribute('data-orientation'); // Default landscape
        img.src = probe.src;
        card.dataset.fitted = '1';
      };

      const applyNoImage = () => {
        if (badge) badge.classList.remove('hidden');
        // ซ่อนรูป/เว้นพื้นที่ไว้เท่าไร ให้ยึดตาม container เดิม
        img.style.display = 'none';
        container.removeAttribute('data-orientation'); // Default landscape 4:3
        card.dataset.fitted = '1';
      };

      probe.onload = () => {
        if (!probe.naturalWidth || !probe.naturalHeight) return applyNoImage();
        const w = probe.naturalWidth, h = probe.naturalHeight;
        (h > w) ? applyPortrait() : applyLandscape();
      };
      probe.onerror = applyNoImage;
    });
  }
})();
