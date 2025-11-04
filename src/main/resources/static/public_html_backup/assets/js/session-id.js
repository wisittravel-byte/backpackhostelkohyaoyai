// Generate and persist session ID for tracking user booking sessions
(function(){
  function generateSessionId(){
    // Create fingerprint from browser info
    const nav = window.navigator;
    const screen = window.screen;
    const fingerprint = [
      nav.userAgent,
      nav.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      new Date().getTime() // Add timestamp for uniqueness
    ].join('|');
    
    // Simple hash function (not cryptographic, just for session tracking)
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to hex and add random component
    const hashHex = Math.abs(hash).toString(16);
    const random = Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now().toString(36);
    
    return hashHex + random + timestamp;
  }
  
  function getOrCreateSessionId(){
    try{
      let sessionId = localStorage.getItem('session_id');
      if(!sessionId){
        sessionId = generateSessionId();
        localStorage.setItem('session_id', sessionId);
        console.log('🆔 New session ID created:', sessionId);
      }
      return sessionId;
    }catch(e){
      console.warn('Cannot access localStorage:', e);
      return generateSessionId(); // Fallback to temporary session
    }
  }
  
  // Initialize session ID on page load
  window.sessionId = getOrCreateSessionId();
  
  // Expose function globally for other scripts
  window.getSessionId = getOrCreateSessionId;
})();
