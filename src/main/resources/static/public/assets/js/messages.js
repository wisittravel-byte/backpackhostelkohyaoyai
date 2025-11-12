(function(){
  const DICT = {
    th: {
      'msg.search.required': 'กรุณาเลือก เช็คอิน, เช็คเอาท์, จำนวนผู้เข้าพัก และ จำนวนห้อง ให้ครบ',
      'msg.checkout.mustAgree': 'กรุณายอมรับข้อกำหนดและนโยบายก่อนทำรายการ',
      'msg.booking.guestNameRequired': 'กรุณากรอกชื่อผู้เข้าพัก',
      'msg.checkout.reviewing': 'กรุณาตรวจสอบการจองของคุณ…',
      'msg.payment.required': 'กรุณากรอกข้อมูลที่จำเป็นทั้งหมด',
      'msg.payment.submitted': 'การชำระเงินถูกส่งแล้ว (เดโม)',
      'msg.generic.error': 'เกิดข้อผิดพลาด โปรดลองอีกครั้ง'
    },
    en: {
      'msg.search.required': 'Please select Check-in, Check-out, Guests and Rooms.',
      'msg.checkout.mustAgree': 'Please accept the terms and policies to continue.',
      'msg.booking.guestNameRequired': 'Please enter guest name.',
      'msg.checkout.reviewing': 'Reviewing your booking…',
      'msg.payment.required': 'Please complete all required fields.',
      'msg.payment.submitted': 'Payment submitted (demo).',
      'msg.generic.error': 'Something went wrong. Please try again.'
    }
  };

  function getLang(){
    try{ return (window.currentLang || localStorage.getItem('lang') || document.documentElement.lang || 'th').toLowerCase().startsWith('en') ? 'en' : 'th'; }catch(_){ return 'th'; }
  }

  function format(str, vars){
    if(!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, (_,k)=> (vars[k]!==undefined? String(vars[k]) : '{'+k+'}'));
  }

  function t(key, vars){
    const lang = getLang();
    const table = DICT[lang] || DICT.th;
    const str = table[key] || DICT.th[key] || key;
    return format(str, vars);
  }

  function alertMsg(key, vars){
    // ใช้ custom modal ถ้ามี ไม่งั้น fallback เป็น window.alert
    const msg = t(key, vars);
    if(typeof window.showSystemAlert === 'function'){ window.showSystemAlert(msg); return; }
    if(typeof window.showCustomAlert === 'function'){ window.showCustomAlert(msg); return; }
    try{ window.alert(msg); }catch(_){ }
  }

  window.Messages = { t, alert: alertMsg };

  // Global system alert (reusable modal แบบเดียวกับ checkout)
  if(!window.showSystemAlert){
    window.showSystemAlert = function(message){
      let modal = document.getElementById('systemAlertModal');
      if(!modal){
        modal = document.createElement('div');
        modal.id = 'systemAlertModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-content compact" tabindex="-1">
            <div class="modal-header"><h3 class="color-brand">แจ้งเตือน</h3></div>
            <div class="modal-body"><p id="systemAlertMessage"></p></div>
            <div class="modal-footer"><button type="button" class="btn" id="systemAlertOkBtn">ตกลง</button></div>
          </div>`;
        document.body.appendChild(modal);
        const okBtn = modal.querySelector('#systemAlertOkBtn');
        okBtn.addEventListener('click', ()=> modal.classList.add('hidden'));
      }
      const lang = (window.currentLang||'th').toLowerCase().startsWith('en')?'en':'th';
      // เปลี่ยนหัวข้อปุ่มตามภาษา
      try{ modal.querySelector('#systemAlertOkBtn').textContent = (lang==='en')? 'OK' : 'ตกลง'; }catch(_){ }
      try{ modal.querySelector('.modal-header h3').textContent = (lang==='en')? 'Notice' : 'แจ้งเตือน'; }catch(_){ }
      modal.querySelector('#systemAlertMessage').textContent = message;
      modal.classList.remove('hidden');
    };
  }
})();
