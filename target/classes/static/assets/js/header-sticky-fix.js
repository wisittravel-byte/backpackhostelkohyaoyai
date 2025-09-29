// Fallback to ensure sticky header remains visible across layouts.
// Listens for the sharedHeaderLoaded event and makes the .site-header fixed
// and adds equivalent top padding to the body so content doesn't jump.
(function(){
  function enableFixedHeader(){
    try{
      const sh = document.querySelector('.site-header.header-sticky');
      if(!sh) return;
      // measure height after header has been rendered
      const hdr = sh.getBoundingClientRect();
      const h = Math.ceil(hdr.height) || 64;
      // apply fixed positioning to ensure it remains visible when scrolling
      sh.style.position = 'fixed';
      sh.style.top = '0';
      sh.style.left = '0';
      sh.style.right = '0';
      sh.style.zIndex = '40';
      // remove margins so fixed element sits flush
      sh.style.marginTop = '0';
      sh.style.marginBottom = '0';
      // ensure inner header remains centered
      // If the header's inner <header> has max-width styling, keep it; otherwise ensure padding
      // Add top padding to body so content doesn't go under the fixed header
      const current = parseInt(window.getComputedStyle(document.body).paddingTop||0,10) || 0;
      document.body.style.paddingTop = (current + h) + 'px';
    }catch(e){ console.error('header-sticky-fix error', e); }
  }

  // When header is injected
  document.addEventListener('sharedHeaderLoaded', ()=>{
    // small delay to allow layout to stabilise and CSS to apply
    setTimeout(enableFixedHeader, 40);
  });
  // also attempt on load in case header was already present
  window.addEventListener('load', ()=> setTimeout(enableFixedHeader, 40));
})();