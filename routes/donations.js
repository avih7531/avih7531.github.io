/**
 * Donation routes for the application
 */
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

const stripeService = require('../services/stripe');
const registrationService = require('../services/registration');

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
 * Create a Passover donation checkout session
 */
router.post('/create-passover-checkout-session', async (req, res) => {
  try {
    const { registrationId, amount, registrationData } = req.body;
    
    if (!registrationId || !amount || !registrationData) {
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
    
    const session = await stripeService.createPassoverCheckoutSession(
      { registrationId, amount, registrationData },
      origin
    );
    
    res.json(session);
  } catch (error) {
    console.error('Error creating Passover checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create checkout session: ' + error.message 
    });
  }
});

/**
 * Update registration with donation information
 */
router.post('/update-registration-donation', async (req, res) => {
  try {
    const { registrationId, donationAmount, stripeSessionId } = req.body;
    console.log('Received donation update request:', { registrationId, donationAmount, stripeSessionId });
    
    if (!registrationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration ID is required' 
      });
    }
    
    // Validate donation amount is a number and not negative
    const numericAmount = parseFloat(donationAmount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({
        success: false,
        message: `Invalid donation amount: ${donationAmount}`
      });
    }
    
    if (numericAmount < 0) {
      return res.status(400).json({
        success: false,
        message: `Negative donation amount not allowed: ${donationAmount}`
      });
    }
    
    // Update the registration with donation information
    const updatedRegistration = await registrationService.updateRegistrationDonation(
      registrationId,
      numericAmount,
      stripeSessionId
    );
    
    return res.json({ 
      success: true, 
      message: 'Registration updated with donation info',
      donationAmount: updatedRegistration.donationAmount
    });
  } catch (error) {
    console.error('Error updating registration with donation:', error);
    
    // Check if the error is a not found error
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false, 
        message: 'Registration not found' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update registration with donation: ' + error.message 
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
      
      // Get the metadata with registration ID if it exists
      if (session.metadata && session.metadata.registrationId) {
        const registrationId = session.metadata.registrationId;
        console.log('Processing donation for registration:', registrationId);
        
        // Get the payment amount in dollars
        const amountTotal = session.amount_total / 100; // Convert from cents
        
        try {
          // Update the registration with donation details
          await registrationService.updateRegistrationDonation(
            registrationId,
            amountTotal,
            session.id
          );
          
          console.log(`Registration ${registrationId} updated with donation: $${amountTotal.toFixed(2)}`);
        } catch (error) {
          console.error('Error updating registration with webhook data:', error);
        }
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

module.exports = router; 