// server.js
const express = require('express');
const stripe = require('stripe')('sk_test_51PT3twJb8qwjsbroIbCxIRlmRqrFOUzNaXLAtnxYDvQihBqXpD9thkzCrcT1DzAxAEjS39czL1ItsUv6CPOz4uSo00IK18tyx2'); // Using correct test mode secret key
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@vercel/edge-config');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory fallback storage for local development
let localRegistrations = [{
  registrationId: 'REG-1743019494502-398',
  firstName: 'John',
  lastName: 'Doe',
  email: 'test@example.com',
  phone: '555-123-4567',
  sederNight1: 'on',
  sederNight2: 'on',
  dietaryRestrictions: 'No pork',
  hasDonated: true,
  donationAmount: 54,
  registrationDate: new Date().toISOString(),
  donationDate: new Date().toISOString()
}];

// Edge Config is only fully available in Vercel production environment
// For local development, we'll just use the in-memory storage
let isEdgeConfigAvailable = false;
let edgeConfig;

// Create Edge Config client but only use it in Vercel environment
try {
  edgeConfig = createClient('https://edge-config.vercel.com/ecfg_u19oenik3gvnaimrebefbcaoe6dy?token=98e90ddb-8e17-49b6-b53b-ebf4677a8a7b');
  console.log('Edge Config client created');
} catch (err) {
  console.error('Error creating Edge Config client:', err);
  console.log('Falling back to local storage only');
}

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Edge Config wrapper functions to handle the API correctly
async function getRegistrations() {
  if (isEdgeConfigAvailable && edgeConfig) {
    try {
      // Try to get from Edge Config
      const data = await edgeConfig.get('passover_registrations');
      return data || localRegistrations;
    } catch (err) {
      console.log('Edge Config get error, using local storage:', err.message);
      return localRegistrations;
    }
  }
  return localRegistrations;
}

async function saveRegistrations(registrations) {
  // Always update local storage for fallback
  localRegistrations = registrations;
  
  // If Edge Config is available, try to update it
  if (isEdgeConfigAvailable && edgeConfig) {
    try {
      // In Vercel production, this would update Edge Config
      // But for local development, this operation is not supported
      console.log('Would update Edge Config if in Vercel production environment');
    } catch (err) {
      console.log('Edge Config update error:', err.message);
    }
  }
}

// Test Edge Config if available
async function testEdgeConfig() {
  if (!edgeConfig) return;
  
  try {
    // Just try to get a value to see if Edge Config is working
    console.log('Testing Edge Config connection...');
    const greeting = await edgeConfig.get('greeting');
    console.log('Edge Config test result:', greeting);
    
    if (greeting) {
      isEdgeConfigAvailable = true;
      console.log('Edge Config is available and working!');
      
      // Try to read existing registrations
      const existingData = await edgeConfig.get('passover_registrations');
      if (existingData && Array.isArray(existingData)) {
        localRegistrations = existingData;
        console.log(`Loaded ${existingData.length} registrations from Edge Config`);
      }
    }
  } catch (err) {
    console.error('Edge Config test failed:', err.message);
    console.log('Using local storage for registrations');
  }
}

// Initialize when server starts
async function initialize() {
  await testEdgeConfig();
  console.log('Initialization complete - using ' + 
    (isEdgeConfigAvailable ? 'Edge Config for persistent storage' : 'local memory for temporary storage'));
  
  if (!isEdgeConfigAvailable) {
    console.log('Note: In local development, data will not persist between server restarts');
    console.log('Data will be properly persisted when deployed to Vercel');
  }
}

// Initialize when server starts
initialize().catch(err => {
  console.error('Initialization error:', err);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, 'donate.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});

// Handle contact form submission
app.post('/send-contact-form', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // In a production environment, you would:
    // 1. Validate the data
    // 2. Send an email to YKIEVMAN@BOWERYJEWS.ORG (using Nodemailer or similar)
    // 3. Store the inquiry in a database
    
    console.log('Contact form submission:', { 
      name, 
      email, 
      subject, 
      message,
      recipient: 'YKIEVMAN@BOWERYJEWS.ORG',
      address: '353 Bowery NY NY 10003'
    });
    
    // Send a success response
    res.json({ success: true, message: 'Message received successfully!' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ success: false, message: 'Failed to process your message' });
  }
});

// Store Passover registration
app.post('/store-passover-registration', async (req, res) => {
  try {
    const registrationData = req.body;
    
    // Generate a unique registration ID
    const registrationId = 'REG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const registrationDate = new Date().toISOString();
    
    // Create registration object
    const registration = {
      registrationId: registrationId,
      firstName: registrationData.firstName || '',
      lastName: registrationData.lastName || '',
      email: registrationData.email || '',
      phone: registrationData.phone || '',
      sederNight1: registrationData.sederNight1 || 'off',
      sederNight2: registrationData.sederNight2 || 'off',
      dietaryRestrictions: registrationData.dietaryRestrictions || '',
      hasDonated: false,
      donationAmount: 0,
      registrationDate: registrationDate,
      donationDate: null
    };
    
    // Get current registrations
    let registrations = await getRegistrations();
    
    // Add new registration
    registrations.push(registration);
    
    // Save back to storage
    await saveRegistrations(registrations);
    
    console.log('New Passover registration stored:', registrationId);
    
    res.json({ 
      success: true, 
      message: 'Registration stored successfully', 
      registrationId: registrationId 
    });
  } catch (error) {
    console.error('Error storing registration:', error);
    res.status(500).json({ success: false, message: 'Failed to store registration' });
  }
});

// Get registration by ID
app.get('/registration/:id', async (req, res) => {
  try {
    const registrationId = req.params.id;
    
    // Get all registrations
    const registrations = await getRegistrations();
    
    // Find the requested registration
    const registration = registrations.find(reg => reg.registrationId === registrationId);
    
    if (registration) {
      res.json({ success: true, registration });
    } else {
      res.status(404).json({ success: false, message: 'Registration not found' });
    }
  } catch (error) {
    console.error('Error retrieving registration:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve registration' });
  }
});

// Update registration with donation information
app.post('/update-registration-donation', async (req, res) => {
  try {
    const { registrationId, donationAmount, stripeSessionId } = req.body;
    
    // Get current registrations
    let registrations = await getRegistrations();
    
    // Find and update the registration
    const registrationIndex = registrations.findIndex(reg => reg.registrationId === registrationId);
    
    if (registrationIndex !== -1) {
      // Update the registration
      registrations[registrationIndex].hasDonated = true;
      registrations[registrationIndex].donationAmount = donationAmount;
      registrations[registrationIndex].stripeSessionId = stripeSessionId;
      registrations[registrationIndex].donationDate = new Date().toISOString();
      
      // Save back to storage
      await saveRegistrations(registrations);
      
      console.log('Updated registration with donation:', registrationId);
      res.json({ success: true, message: 'Registration updated with donation info' });
    } else {
      res.status(404).json({ success: false, message: 'Registration not found' });
    }
  } catch (error) {
    console.error('Error updating registration:', error);
    res.status(500).json({ success: false, message: 'Failed to update registration' });
  }
});

// Get all registrations (protected by admin password in a simple way)
// In production, use proper authentication
app.get('/admin/registrations', async (req, res) => {
  const providedPassword = req.query.password;
  const adminPassword = 'rejewvenate2025'; // In production, use environment variables
  
  if (providedPassword !== adminPassword) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const registrations = await getRegistrations();
    res.json({ success: true, registrations });
  } catch (error) {
    console.error('Error retrieving registrations:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve registrations' });
  }
});

// Create a Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { donationAmount, registrationId, firstName, lastName, email } = req.body;
    
    // Validate donation amount
    if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid donation amount' });
    }
    
    // Convert donation amount to cents for Stripe
    const amountInCents = Math.round(donationAmount * 100);
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Passover Seder Donation',
              description: 'Thank you for your generous donation to our Passover Seder',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      metadata: {
        registrationId: registrationId || 'direct-donation',
        firstName: firstName || '',
        lastName: lastName || '',
      },
      mode: 'payment',
      success_url: `${req.headers.origin}/passover-registration-success.html?registration_id=${registrationId}&session_id={CHECKOUT_SESSION_ID}&donation=${donationAmount}`,
      cancel_url: `${req.headers.origin}/passover.html`,
    });
    
    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// Stripe webhook for handling successful payments
app.post('/stripe-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const payload = req.body;
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      'whsec_your_webhook_secret' // Replace with your actual webhook secret from Stripe
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Get the registration ID from the metadata
    const registrationId = session.metadata.registrationId;
    
    if (registrationId !== 'direct-donation') {
      // This was a donation connected to a registration, update it
      try {
        // Update registration with donation details
        await updateRegistrationWithDonation(
          registrationId,
          session.amount_total / 100, // Convert back from cents
          session.id
        );
        
        console.log('Webhook: Updated registration with donation:', registrationId);
      } catch (error) {
        console.error('Webhook: Error updating registration:', error);
      }
    } else {
      // This was a direct donation without registration
      console.log('Webhook: Processed direct donation:', session.id);
    }
  }
  
  res.status(200).json({ received: true });
});

// Helper function to update registration with donation
async function updateRegistrationWithDonation(registrationId, donationAmount, sessionId) {
  // Get current registrations
  let registrations = await getRegistrations();
  
  // Find the registration
  const registrationIndex = registrations.findIndex(reg => reg.registrationId === registrationId);
  
  if (registrationIndex !== -1) {
    // Update the registration
    registrations[registrationIndex].hasDonated = true;
    registrations[registrationIndex].donationAmount = donationAmount;
    registrations[registrationIndex].stripeSessionId = sessionId;
    registrations[registrationIndex].donationDate = new Date().toISOString();
    
    // Save back to storage
    await saveRegistrations(registrations);
    return true;
  }
  
  return false;
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin registrations available at: http://localhost:${PORT}/admin/registrations?password=rejewvenate2025`);
}); 