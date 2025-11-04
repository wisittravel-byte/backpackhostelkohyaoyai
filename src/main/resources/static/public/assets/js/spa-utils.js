// Small SPA util: debounce, escapeHTML, state store, ETag cache
(function(){
  function debounce(fn, wait){
    let t; return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), wait); };
  }
  function escapeHTML(s){
    if(s==null) return '';
    return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;','`':'&#96;'}[c]));
  }
  const store = { state:{}, listeners: new Set(), set(p){ this.state=Object.assign({},this.state,p); this.listeners.forEach(l=>l(this.state)); } , on(l){ this.listeners.add(l); return ()=>this.listeners.delete(l);} };
  const etagCache = new Map(); // key -> {etag, json}
  window.SPA = { debounce, escapeHTML, store, etagCache };
})();
