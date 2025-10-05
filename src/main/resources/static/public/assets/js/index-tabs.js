(function(){
  // Config flag to enable/disable Beds tab
  window.CONFIG = window.CONFIG || {}; 
  if(typeof window.CONFIG.hasDorm === 'undefined') window.CONFIG.hasDorm = true;

  function byId(id){ return document.getElementById(id); }
  function show(el, yes){ if(!el) return; el.classList.toggle('hidden', !yes); }
  function setActive(tab){
    document.querySelectorAll('#roomTabs .tab').forEach(b=>{
      const active = (b === tab);
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    const target = tab && tab.dataset.tab;
    show(byId('panelRooms'), target === 'rooms');
    show(byId('panelBeds'), target === 'beds');
  }

  function init(){
    const tabRooms = byId('tabRooms');
    const tabBeds = byId('tabBeds');
    const panelBeds = byId('panelBeds');

    // Respect config flag for Dorm
    if(!window.CONFIG.hasDorm){
      if(tabBeds) tabBeds.parentNode.removeChild(tabBeds);
      if(panelBeds) panelBeds.parentNode.removeChild(panelBeds);
      setActive(tabRooms);
    } else {
      // default: show Rooms on first load
      setActive(tabRooms);
      if(tabBeds) tabBeds.addEventListener('click', ()=> setActive(tabBeds));
    }
    if(tabRooms) tabRooms.addEventListener('click', ()=> setActive(tabRooms));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
