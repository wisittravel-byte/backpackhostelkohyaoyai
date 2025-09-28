(function(){
  function init(){
    var headerRight = document.querySelector('.site-header header .header-right');
    var toggle = headerRight && headerRight.querySelector('.menu-toggle');
    var nav = headerRight && headerRight.querySelector('#main-nav');
    if(!headerRight || !toggle || !nav) return;

    function setOpen(open){
      headerRight.setAttribute('data-menu-open', String(!!open));
      toggle.setAttribute('aria-expanded', String(!!open));
    }
    setOpen(false);

    // Toggle on click
    toggle.addEventListener('click', function(){
      var open = headerRight.getAttribute('data-menu-open') === 'true';
      setOpen(!open);
    });

    // Close when clicking link (useful on mobile)
    nav.addEventListener('click', function(e){
      var t = e.target;
      if(t && t.tagName === 'A') setOpen(false);
    });

    // Close on resize to desktop
    var mq = window.matchMedia('(min-width: 901px)');
    function handle(m){ if(m.matches) setOpen(false); }
    if(mq.addEventListener){ mq.addEventListener('change', handle); }
    else if(mq.addListener){ mq.addListener(handle); }
    handle(mq);
  }

  // Run after shared header injection
  document.addEventListener('sharedHeaderLoaded', init);
  if(document.readyState !== 'loading') setTimeout(init, 0); else document.addEventListener('DOMContentLoaded', init);
})();
