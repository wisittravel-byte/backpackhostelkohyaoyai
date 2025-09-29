// Ensure native date inputs reflect chosen value across browsers
(function(){
  function bindMirror(id){
    var el = document.getElementById(id);
    if(!el) return;
    function mirror(){
      try{ el.setAttribute('value', el.value || ''); }catch(e){}
    }
    el.addEventListener('change', mirror);
    el.addEventListener('input', mirror);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ bindMirror('checkin'); bindMirror('checkout'); });
  }else{ bindMirror('checkin'); bindMirror('checkout'); }
})();
