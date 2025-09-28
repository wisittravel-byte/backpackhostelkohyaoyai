# Stripe Checkout Server Example (Node/Express)

This file shows a minimal server-side example to create a Stripe Checkout Session. You'll need to run this on your own machine or server (do not expose secret keys in client-side code).

1) Install dependencies

```bash
npm init -y
npm install express stripe body-parser
```

2) Example server (index.js)

```js
const express = require('express');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/create-checkout-session', async (req, res) => {
  const {amount, currency='thb', successUrl, cancelUrl, lineItems} = req.body;
  try{
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems || [{price_data:{currency,product_data:{name:'Booking'},unit_amount:amount},quantity:1}],
      mode: 'payment',
      success_url: successUrl || 'https://example.com/success',
      cancel_url: cancelUrl || 'https://example.com/cancel'
    });
    res.json({id: session.id});
  }catch(err){
    console.error(err);
    res.status(500).json({error: err.message});
  }
});

app.listen(4242, ()=> console.log('Listening on http://localhost:4242'));
```

3) Usage from client

- The client posts to `/create-checkout-session` with the amount and optional line items.
- Server responds with `{ id: session.id }`.
- Client calls `stripe.redirectToCheckout({ sessionId: id })` to redirect.

Security note: keep STRIPE_SECRET_KEY secret and only call secret-key Stripe APIs from server-side code.
