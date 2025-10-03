// Fetch room types and (optionally) update UI. Currently, UI has static cards; this script can be extended to render dynamically.
(function(){
  const propertyId = 1;
  function getCardTitleEl(rtId){
    const card = document.querySelector(`.room[data-room-type-id="${rtId}"] .meta strong`);
    return card || null;
  }

  async function loadFromBackend(){
    const url = `/api/room-types?propertyId=${propertyId}`;
    return API.fetchJson(url);
  }

  async function loadFromStatic(){
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), 3000);
    try{
      const res = await fetch('assets/json/room-types.json', { headers: { 'Content-Type':'application/json' }, signal: controller.signal, cache: 'no-store' });
      if(!res.ok) throw new Error('static room-types.json not found ('+res.status+')');
      return res.json();
    } finally {
      clearTimeout(id);
    }
  }

  function applyNames(rows){
    if(!Array.isArray(rows)) return;
    const byId = new Map();
    for(const r of rows){
      const id = Number(r.id ?? r.room_type_id ?? r.roomtypeid);
      const name = r.name || r.title || r.code;
      if(id && name) byId.set(id, name);
    }
    [1,2,3].forEach(id=>{
      const el = getCardTitleEl(id);
      const name = byId.get(id);
      if(el && name){
        // Set text from API/static JSON
        el.textContent = name;
        // Prevent i18n language switcher from overwriting this value
        if(el.hasAttribute('data-i18n')) el.removeAttribute('data-i18n');
        el.dataset.apiBound = '1';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      const rows = await loadFromBackend();
      applyNames(rows);
    }catch(e){
      console.debug('[roomtypes] backend failed, using static json:', e.message);
      try{
        const rows = await loadFromStatic();
        applyNames(rows);
      }catch(e2){
        console.warn('[roomtypes] static json failed:', e2.message);
      }
    }
  });
})();
