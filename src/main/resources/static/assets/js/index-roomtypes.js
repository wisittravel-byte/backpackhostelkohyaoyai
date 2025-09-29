// Fetch room types and (optionally) update UI. Currently, UI has static cards; this script can be extended to render dynamically.
(function(){
  const propertyId = 1;
  // Map desired room_type_id -> selector of card strong element
  function getCardTitleEl(rtId){
    const card = document.querySelector(`.room[data-room-type-id="${rtId}"] .meta strong`);
    return card || null;
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      // Fetch room types for the property
      const url = `/api/room-types?propertyId=${propertyId}`;
      const rows = await API.fetchJson(url);
      if(!Array.isArray(rows)) return;

      // Index by id for quick lookup
      const byId = new Map();
      for(const r of rows){
        const id = Number(r.id ?? r.room_type_id ?? r.roomtypeid);
        const name = r.name || r.title || r.code;
        if(id && name) byId.set(id, name);
      }

      // Replace titles for ids 1,2,3
      [1,2,3].forEach(id=>{
        const el = getCardTitleEl(id);
        const name = byId.get(id);
        if(el && name){ el.textContent = name; }
      });
    }catch(e){
      console.debug('Room types API not available:', e.message);
    }
  });
})();
