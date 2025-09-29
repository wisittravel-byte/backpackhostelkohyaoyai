(function(){
  function onlyDigits(s){ return (s||'').replace(/\D+/g,''); }
  function formatCardNumber(v){
    const d = onlyDigits(v).slice(0,16);
    return d.replace(/(\d{4})(?=\d)/g,'$1 ').trim();
  }
  function formatExp(v){
    const d = onlyDigits(v).slice(0,4);
    if(d.length <= 2) return d;
    return d.slice(0,2) + '/' + d.slice(2);
  }
  function init(){
    const number = document.getElementById('cardNumber');
    const exp = document.getElementById('exp');
    const cvv = document.getElementById('cvv');
    const name = document.getElementById('cardName');
    const form = document.getElementById('cardForm');
    const cancelBtn = document.getElementById('cancelBtn');
    if(number){ number.addEventListener('input', ()=>{ number.value = formatCardNumber(number.value); }); }
    if(exp){ exp.addEventListener('input', ()=>{ exp.value = formatExp(exp.value); }); }
    if(cvv){ cvv.addEventListener('input', ()=>{ cvv.value = onlyDigits(cvv.value).slice(0,4); }); }
    if(cancelBtn){ cancelBtn.addEventListener('click', ()=>{ window.history.back(); }); }
    if(form){ form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const errs = [];
      if(!name.value.trim()) errs.push('name');
      if(onlyDigits(number.value).length < 13) errs.push('number');
      if(formatExp(exp.value).length !== 5) errs.push('exp');
      if(onlyDigits(cvv.value).length < 3) errs.push('cvv');
  if(errs.length){ try{ (window.Messages && window.Messages.alert) ? window.Messages.alert('msg.payment.required') : alert('Please complete all required fields.'); }catch(_){ } return; }
  // Simulate success and redirect to confirmation
  window.location.href = 'booking-confirmed.html';
    }); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
