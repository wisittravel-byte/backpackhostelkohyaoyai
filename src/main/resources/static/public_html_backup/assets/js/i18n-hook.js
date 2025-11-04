(function(){
  const dict = {
    th:{ rooms:'ห้องพัก', dorm:'เตียง Dorm', loading:'กำลังโหลด…', retry:'ลองใหม่', details:'ดูรายละเอียด' },
    en:{ rooms:'Rooms', dorm:'Dorm beds', loading:'Loading…', retry:'Retry', details:'Details' }
  };
  function useI18n(){
    const lang = (new URLSearchParams(location.search).get('lang')||'th').toLowerCase()==='en'?'en':'th';
    const t = (k)=> (dict[lang]&&dict[lang][k]) || k;
    return { lang, t };
  }
  window.useI18n = useI18n;
})();
