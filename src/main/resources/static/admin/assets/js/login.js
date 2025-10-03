(function(){
  function byId(id){ return document.getElementById(id); }
  const form = byId('loginForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = (byId('email').value||'').trim();
    const password = byId('password').value||'';
    // TODO: Replace with real API POST /api/admin/auth/login
    if(email && password){
      try{
        const key = 'admin_auth';
        const session = { user: email, ts: Date.now() };
        localStorage.setItem(key, JSON.stringify(session));
        // redirect to dashboard route
        window.location.href = './index.html#dashboard';
      }catch(_){ window.location.href = './index.html#dashboard'; }
    } else {
      alert('Email and password are required');
    }
  });
})();
