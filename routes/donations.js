/**
 * Donation routes for the application
 */
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

const stripeService = require('../services/stripe');

/**
 * Create a standard donation checkout session
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { donationAmount, donationType, firstName, lastName, email } = req.body;
    
    if (!donationAmount || !firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields for checkout session' 
      });
    }
    
    // Fix URL construction to prevent protocol duplication
    let origin = req.headers.origin || req.headers.host;
    
    // If origin doesn't already include the protocol, add it
    if (origin && !origin.startsWith('http')) {
      origin = `${req.protocol}://${origin}`;
    }
    
    // For production environment with Vercel, use the VERCEL_URL if available
    if (process.env.VERCEL_URL) {
      origin = `https://${process.env.VERCEL_URL}`;
    }
    
    // Log the constructed origin for debugging
    console.log('Checkout session origin:', origin);
    
    const session = await stripeService.createDonationCheckoutSession(
      { donationAmount, donationType, firstName, lastName, email },
      origin
    );
    
    res.json(session);
  } catch (error) {
    console.error('Error creating donation checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create checkout session: ' + error.message 
    });
  }
});

/**
 * Stripe webhook handler
 */
router.post('/stripe-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  
  try {
    // Construct and verify the event
    event = stripeService.constructWebhookEvent(req.body.toString(), signature);
    
    console.log('Received webhook event:', event.type);
    
    // Handle the event based on its type
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('Checkout session completed:', session.id);
      
      // For standard donations, just log the successful completion
      const amountTotal = session.amount_total / 100; // Convert from cents
      console.log(`Donation completed: $${amountTotal.toFixed(2)}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

module.exports = router; 