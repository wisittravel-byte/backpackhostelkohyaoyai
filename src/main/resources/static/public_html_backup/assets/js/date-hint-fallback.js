// JS fallback to avoid native date input placeholder (e.g. dd-----yyyy) on browsers
// that don't respect the CSS hiding. Strategy:
// - If an input[type=date] is empty on load, switch it to type=text to hide the native
//   placeholder/hint. On focus we switch it back to type=date so the native picker is available.
// - On blur, if still empty, revert to type=text.
// This is reversible and unobtrusive: it only changes the input type when empty.
(function(){
  // If the browser supports input[type=date], do nothing to avoid interfering with native UI/value.
  try{
    var test = document.createElement('input');
    test.setAttribute('type','date');
    if(test.type === 'date'){
      return; // native date supported; no fallback needed
    }
  }catch(e){ /* ignore and continue to fallback */ }
  function enhance(el){
    try{
      if(el.value) return; // already has value, nothing to do
      // remember we modified this input
      el.dataset._datehint = '1';
      el._origType = el.type;
      el.type = 'text';
      // remove placeholder (the page may set one)
      // keep empty placeholder to avoid showing format hints
      const origPlaceholder = el.getAttribute('placeholder');
      if(!origPlaceholder) el.setAttribute('placeholder','');
      el.addEventListener('focus', function onFocus(){
        // when focusing, allow date picker
        this.type = 'date';
        // re-focus to open picker in some browsers
        try{ this.focus(); }catch(e){}
      });
      el.addEventListener('blur', function onBlur(){
        if(this.dataset._datehint && !this.value){
          this.type = 'text';
        }
      });
    }catch(e){ /* fail silently */ }
  }
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('input[type="date"]').forEach(enhance);
  });
})();
