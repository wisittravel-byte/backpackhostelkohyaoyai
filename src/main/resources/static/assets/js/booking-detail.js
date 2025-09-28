// booking-detail.js
(function(){
  const DRAFT_KEY = 'booking_draft';

  function money(v){ return '฿' + Number(v||0).toLocaleString(); }

  // simple utilities for payment validation
  function sanitizeCardNumber(v){ return (v||'').replace(/[^0-9]/g,''); }
  function luhnCheck(num){
    const s = String(num).split('').reverse().map(n=>parseInt(n,10));
    let sum=0; for(let i=0;i<s.length;i++){ let val=s[i]; if(i%2===1){ val = val*2; if(val>9) val-=9; } sum+=val; } return sum%10===0;
  }
  function formatCardInput(v){ return (v||'').replace(/\D/g,'').replace(/(.{4})/g,'$1 ').trim(); }
  function formatExpiry(v){ return (v||'').replace(/\D/g,'').replace(/^(\d{2})(\d{0,2}).*/, (m,p1,p2)=> p2 ? p1 + '/' + p2 : p1); }


  function renderEmpty(){
    const el = document.getElementById('summary');
    el.innerHTML = '<div class="muted">ไม่มีข้อมูลการจอง (booking draft)</div>';
  }

  function t(key){ return (window.I18N && window.I18N[window.currentLang] && window.I18N[window.currentLang][key]) || key; }

  function render(d){
    // populate contact fields
    document.getElementById('firstName').value = d.guestName || '';
    document.getElementById('lastName').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('mobile').value = d.bookerName || '';
    document.getElementById('email').value = '';
    document.getElementById('notes').value = d.notes || '';

    // price details (per-night + tax)
    const nights = Number(d.nights || 1);
    const pricePerNight = Number(d.pricePerNight || 0);
    const roomLine = pricePerNight;
    const subtotal = nights * pricePerNight;
    const TAX_RATE = 0.07; // 7%
    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + tax;
    const pd = document.getElementById('priceDetails');
    pd.innerHTML = '';
    // per-night breakdown
    for(let i=1;i<=nights;i++){
      pd.insertAdjacentHTML('beforeend', `<div class="price-line"><div>Night ${i}</div><div>${money(roomLine)}</div></div>`);
    }
    pd.insertAdjacentHTML('beforeend', `<div class="price-line"><div>Subtotal</div><div>${money(subtotal)}</div></div>`);
    pd.insertAdjacentHTML('beforeend', `<div class="price-line"><div>Tax (${Math.round(TAX_RATE*100)}%)</div><div>${money(tax)}</div></div>`);
    document.getElementById('totalAmt').textContent = money(total);
    // expose computed values for payment
    d.__computed = { subtotal, tax, total };
  }

  function loadDraft(){
    try{
      const raw = localStorage.getItem(DRAFT_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){ return null; }
  }

  function init(){
    const draft = loadDraft();
    if(!draft){ renderEmpty(); }
    else { render(draft); }

    document.getElementById('backBtn').addEventListener('click', ()=>{ window.location.href='Booking.html'; });
    // continue / pay
    const payBtn = document.getElementById('payBtn') || document.getElementById('saveBtn');
    if(payBtn){
      payBtn.addEventListener('click', async ()=>{
        const setMessage = (msg, isError)=>{
          const m = document.getElementById('formMessage');
          m.textContent = msg || '';
          m.style.color = isError ? 'crimson' : 'inherit';
        };
        const setLoading = (loading)=>{
          document.getElementById('paySpinner').style.display = loading ? 'inline-block' : 'none';
          document.getElementById('payText').textContent = loading ? 'Processing...' : 'Continue';
          payBtn.disabled = loading;
        };

        // validate contact
        const first = document.getElementById('firstName').value.trim();
        const mobile = document.getElementById('mobile').value.trim();
        const email = document.getElementById('email').value.trim();
        if(!first || !mobile || !email){ setMessage('Please fill required contact fields (First name, Mobile, Email)', true); return; }

        // billing validation
        const bill1 = document.getElementById('billAddr1').value.trim();
        const city = document.getElementById('billCity').value.trim();
        const postal = document.getElementById('billPostal').value.trim();
        const country = document.getElementById('billCountry').value.trim();
        if(!bill1 || !city || !postal || !country){ setMessage('Please fill billing address fields', true); return; }

        // card validation
        const cardRaw = sanitizeCardNumber(document.getElementById('cardNumber').value);
        const expiryRaw = document.getElementById('cardExpiry').value.replace(/\s/g,'');
        const cvv = document.getElementById('cardCvv').value.trim();
        const nameOnCard = document.getElementById('cardName').value.trim();
        if(cardRaw.length < 13 || !luhnCheck(cardRaw)){ setMessage('Invalid card number', true); return; }
        const [mm,yy] = expiryRaw.split('/');
        if(!mm || !yy || Number(mm)<1 || Number(mm)>12){ setMessage('Invalid expiry', true); return; }
        const now = new Date();
        const expYear = 2000 + Number(yy);
        const expMonth = Number(mm);
        if(expYear < now.getFullYear() || (expYear===now.getFullYear() && expMonth < (now.getMonth()+1))){ setMessage('Card expired', true); return; }
        if(cvv.length<3){ setMessage('Invalid CVV', true); return; }

        // build payment payload
        const draft = loadDraft() || {};
        const amount = (draft.__computed && draft.__computed.total) || 0;

        // First try to create a Stripe Checkout session via a backend endpoint
        setLoading(true); setMessage('');
        try{
          const res = await fetch('/create-checkout-session', {
            method:'POST', headers:{'content-type':'application/json'},
            body: JSON.stringify({ amount, lineItems: [{price_data:{currency:'thb',product_data:{name:'Booking - '+(draft.roomType||'')},unit_amount: amount},quantity:1}], successUrl: window.location.href, cancelUrl: window.location.href })
          });
          if(res.ok){
            const data = await res.json();
            if(window.Stripe && data && data.id){
              const stripe = window.Stripe(window.STRIPE_PUBLISHABLE_KEY || '');
              if(!stripe){ setMessage('Stripe not configured (publishable key missing)', true); setLoading(false); return; }
              // redirect to Stripe Checkout
              const { error } = await stripe.redirectToCheckout({ sessionId: data.id });
              if(error) setMessage('Stripe redirect error: ' + error.message, true);
              return;
            }
          }
        }catch(e){ console.info('Stripe session creation failed, falling back to mockPayment', e); }

        // fallback to mock payment
        try{
          const response = await window.mockPayment({amount, cardLast4: cardRaw.slice(-4), name:nameOnCard});
          if(response && response.ok){
            localStorage.removeItem(DRAFT_KEY);
            setMessage('Payment succeeded: ' + response.id, false);
            setLoading(false);
            setTimeout(()=> window.location.href = 'Booking.html', 900);
          } else {
            setMessage('Payment failed: ' + (response && response.error || 'unknown'), true);
            setLoading(false);
          }
        }catch(e){ setMessage('Payment error: ' + e.message, true); setLoading(false); }
      });
    }

    const addRoom = document.getElementById('addRoom');
    if(addRoom) addRoom.addEventListener('click', ()=> window.location.href = 'Booking.html');

    // input masks: format card number and expiry as user types
    const cardEl = document.getElementById('cardNumber');
    const expEl = document.getElementById('cardExpiry');
    if(cardEl) cardEl.addEventListener('input', (ev)=>{ const pos = cardEl.selectionStart; cardEl.value = formatCardInput(cardEl.value); });
    if(expEl) expEl.addEventListener('input', ()=>{ expEl.value = formatExpiry(expEl.value); });
  }

  if(document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
