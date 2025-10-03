// mock-payment.js — simulates a payment API for demo purposes
window.mockPayment = async function(payload){
  console.info('mockPayment called', payload);
  // simulate network latency
  await new Promise(r => setTimeout(r, 800));
  // simple validation: reject if amount <= 0
  if(!payload || !payload.amount || payload.amount <= 0) return {ok:false, error:'invalid_amount'};
  // random-ish failure for demo (10% chance)
  if(Math.random() < 0.1) return {ok:false, error:'card_declined'};
  return {ok:true, id: 'MOCK_' + Math.floor(Math.random()*1000000)};
};
