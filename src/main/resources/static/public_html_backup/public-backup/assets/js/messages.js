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
    try{ window.alert(t(key, vars)); }catch(_){ /* no-op */ }
  }

  window.Messages = { t, alert: alertMsg };
})();
