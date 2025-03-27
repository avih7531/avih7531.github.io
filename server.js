// server.js
const express = require('express');
const stripe = require('stripe')('sk_test_51PT3twJb8qwjsbroIbCxIRlmRqrFOUzNaXLAtnxYDvQihBqXpD9thkzCrcT1DzAxAEjS39czL1ItsUv6CPOz4uSo00IK18tyx2'); // Using correct test mode secret key
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@vercel/edge-config');

const app = express();
const PORT = process.env.PORT || 3000;

// Edge Config setup
const edgeConfigId = 'ecfg_u19oenik3gvnaimrebefbcaoe6dy';
const edgeConfigToken = '98e90ddb-8e17-49b6-b53b-ebf4677a8a7b';
const edgeConfigUrl = `https://edge-config.vercel.com/${edgeConfigId}`;

// Hardcoded Vercel API token (replace with environment variable in production)
const VERCEL_API_TOKEN = 'zK6O71OhkWKKeCqq3X9NHW8S';

// Global variable to store registrations in memory - make it persistent across requests
global.inMemoryRegistrations = global.inMemoryRegistrations || [];

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Helper functions for Edge Config API access
async function getRegistrationsFromEdgeConfig() {
  try {
    // Try to directly fetch from Edge Config
    const response = await fetch(`${edgeConfigUrl}/item/passover_registrations?token=${edgeConfigToken}`);
    
    if (!response.ok) {
      // If the item doesn't exist yet, return an empty array
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Edge Config response error: ${response.status}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.log('Edge Config fetch error, using local storage:', err.message);
    return [];
  }
}

async function saveRegistrationsToEdgeConfig(registrations) {
  // Skip if we already know Edge Config isn't available
  if (!isEdgeConfigAvailable) {
    return false;
  }
  
  try {
    // Use the hardcoded API token
    const vercelApiToken = process.env.VERCEL_API_TOKEN || VERCEL_API_TOKEN;
    
    console.log('Updating Edge Config with Vercel API token');
    
    const updateResponse = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${vercelApiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{
          operation: 'upsert',
          key: 'passover_registrations',
          value: registrations
        }]
      })
    });
    
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(`Failed to update Edge Config: ${JSON.stringify(errorData)}`);
    }
    
    console.log('Edge Config updated successfully with new registrations data');
    return true;
  } catch (err) {
    console.error('Error saving to Edge Config:', err);
    return false;
  }
}

// Wrapper functions for getting/saving registrations
async function getRegistrations() {
  if (isEdgeConfigAvailable) {
    try {
      const edgeConfigData = await getRegistrationsFromEdgeConfig();
      if (edgeConfigData && edgeConfigData.length > 0) {
        // Update local cache
        global.inMemoryRegistrations = edgeConfigData;
        return edgeConfigData;
      }
    } catch (err) {
      console.error('Error getting registrations from Edge Config:', err);
    }
  }
  
  // Fall back to local storage
  return global.inMemoryRegistrations;
}

async function saveRegistrations(registrations) {
  // Update in-memory store
  global.inMemoryRegistrations = registrations;
  
  // Try to save to Edge Config if available
  try {
    if (typeof edgeConfig !== 'undefined' && edgeConfig.set) {
      await edgeConfig.set('passover_registrations', registrations);
    }
  } catch (error) {
    console.error('Error saving to Edge Config, changes only in memory:', error);
  }
}

// Initialize Edge Config passover_registrations if needed
async function initializeEdgeConfig() {
  if (!isEdgeConfigAvailable) return false;
  
  try {
    // Check if passover_registrations exists
    const response = await fetch(`${edgeConfigUrl}/item/passover_registrations?token=${edgeConfigToken}`);
    
    // If not found, initialize it
    if (response.status === 404) {
      console.log('Initializing passover_registrations in Edge Config');
      
      const vercelApiToken = process.env.VERCEL_API_TOKEN || VERCEL_API_TOKEN;
      
      const initResponse = await fetch(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${vercelApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{
            operation: 'upsert',
            key: 'passover_registrations',
            value: global.inMemoryRegistrations
          }]
        })
      });
      
      if (initResponse.ok) {
        console.log('Successfully initialized passover_registrations in Edge Config');
        return true;
      } else {
        const errorData = await initResponse.json();
        throw new Error(`Failed to initialize Edge Config: ${JSON.stringify(errorData)}`);
      }
    }
    
    return true;
  } catch (err) {
    console.error('Error initializing Edge Config:', err);
    return false;
  }
}

// Test if Edge Config is available
async function testEdgeConfig() {
  try {
    console.log('Testing Edge Config connection...');
    
    // Try to access Edge Config
    const response = await fetch(`${edgeConfigUrl}/items?token=${edgeConfigToken}`);
    
    if (response.ok) {
      isEdgeConfigAvailable = true;
      console.log('Edge Config is available and working!');
      
      // Check if we have any data
      const data = await response.json();
      console.log('Edge Config items:', data);
      
      // If we have passover_registrations, use them
      if (data && data.passover_registrations && Array.isArray(data.passover_registrations)) {
        global.inMemoryRegistrations = data.passover_registrations;
        console.log(`Loaded ${data.passover_registrations.length} registrations from Edge Config`);
      } else {
        // Initialize passover_registrations if it doesn't exist
        await initializeEdgeConfig();
      }
      
      return true;
    } else {
      console.log(`Edge Config test failed with status: ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error('Edge Config test error:', err);
    return false;
  }
}

// Initialize system
async function initialize() {
  // Test Edge Config availability
  const edgeConfigWorking = await testEdgeConfig();
  
  console.log('Initialization complete - using ' + 
    (edgeConfigWorking ? 'Edge Config for persistent storage' : 'local memory for temporary storage'));
  
  if (!edgeConfigWorking) {
    console.log('Note: In local development, data will not persist between server restarts');
    console.log('In Vercel production, data will be properly persisted');
  }
}

// Initialize when server starts
initialize().catch(err => {
  console.error('Initialization error:', err);
  // Continue with local storage
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

// Get all registrations endpoint
app.get('/get-passover-registrations', async (req, res) => {
  try {
    let registrations = [];
    
    // Try Edge Config first
    try {
      const { createClient } = require('@vercel/edge-config');
      
      try {
        const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
        registrations = await edgeConfigClient.get('passover_registrations') || [];
        console.log(`Loaded ${registrations.length} registrations from Edge Config`);
      } catch (error) {
        try {
          const edgeConfigClient = createClient({ token: process.env.EDGE_CONFIG_TOKEN });
          registrations = await edgeConfigClient.get('passover_registrations') || [];
          console.log(`Loaded ${registrations.length} registrations from Edge Config using token object`);
        } catch (error2) {
          console.log('Both Edge Config approaches failed, using global memory store');
          registrations = global.inMemoryRegistrations || [];
        }
      }
    } catch (error) {
      console.log('Error accessing Edge Config, using global memory store');
      registrations = global.inMemoryRegistrations || [];
    }
    
    // Ensure we have registrations from somewhere
    if (!registrations || registrations.length === 0) {
      registrations = global.inMemoryRegistrations || [];
      console.log(`Using in-memory store with ${registrations.length} registrations`);
    }
    
    console.log(`Returning ${registrations.length} registrations`);
    res.json({ success: true, registrations });
  } catch (error) {
    console.error('Error getting registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Store registration endpoint
app.post('/store-passover-registration', async (req, res) => {
  try {
    const registration = req.body;
    
    // Load current registrations
    const registrations = await getRegistrations();
    
    // Add new registration
    registrations.push(registration);
    
    // Save updated registrations
    await saveRegistrations(registrations);
    
    res.json({ success: true, message: 'Registration saved successfully' });
  } catch (error) {
    console.error('Error storing registration:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Delete registration endpoint with improved persistence
app.delete('/delete-passover-registration/:id', async (req, res) => {
  try {
    const registrationId = req.params.id;
    
    if (!registrationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration ID is required' 
      });
    }
    
    console.log('Attempting to delete registration:', registrationId);
    
    // Get all current registrations and make a copy
    let allRegistrations = [];
    
    // Try multiple sources and merge them
    try {
      // Try getting from Vercel Edge Config
      const { createClient } = require('@vercel/edge-config');
      
      // Try standard environment variable approach
      let edgeConfigClient;
      try {
        edgeConfigClient = createClient(process.env.EDGE_CONFIG);
        const configRegistrations = await edgeConfigClient.get('passover_registrations') || [];
        console.log(`Loaded ${configRegistrations.length} registrations from Edge Config`);
        allRegistrations = configRegistrations;
      } catch (error) {
        console.log('Could not connect to Edge Config using token, trying object approach...');
        
        // Try object approach
        try {
          edgeConfigClient = createClient({ token: process.env.EDGE_CONFIG_TOKEN });
          const configRegistrations = await edgeConfigClient.get('passover_registrations') || [];
          console.log(`Loaded ${configRegistrations.length} registrations from Edge Config using token object`);
          allRegistrations = configRegistrations;
        } catch (error2) {
          console.log('Both Edge Config approaches failed, using global memory store');
        }
      }
    } catch (error) {
      console.log('Error accessing Edge Config, using global memory store');
    }
    
    // If Edge Config didn't work, use the global memory store
    if (allRegistrations.length === 0) {
      allRegistrations = global.inMemoryRegistrations || [];
      console.log(`Using in-memory store with ${allRegistrations.length} registrations`);
    }
    
    console.log(`Starting with ${allRegistrations.length} registrations, looking for ID: ${registrationId}`);
    
    // Log all registration IDs to help debug
    const allIds = allRegistrations.map(reg => 
      reg.registrationId || reg.registration_id || reg.id || 'unknown'
    );
    console.log('Available registration IDs:', allIds);
    
    // Find and remove the registration
    const filteredRegistrations = allRegistrations.filter(reg => {
      const regId = reg.registrationId || reg.registration_id || reg.id;
      const keep = regId !== registrationId;
      if (!keep) console.log(`Found registration to remove: ${regId}`);
      return keep;
    });
    
    // Check if anything was removed
    if (filteredRegistrations.length === allRegistrations.length) {
      console.log(`Registration with ID ${registrationId} not found in the ${allRegistrations.length} registrations`);
      return res.status(404).json({ 
        success: false, 
        message: 'Registration not found',
        availableIds: allIds
      });
    }
    
    console.log(`Removed registration, count reduced from ${allRegistrations.length} to ${filteredRegistrations.length}`);
    
    // Update all possible storage locations
    global.inMemoryRegistrations = filteredRegistrations;
    
    // Try to update Edge Config using both methods
    try {
      const { createClient } = require('@vercel/edge-config');
      
      try {
        const edgeConfigClient = createClient(process.env.EDGE_CONFIG);
        await edgeConfigClient.set('passover_registrations', filteredRegistrations);
        console.log('Updated Edge Config using standard method');
      } catch (error) {
        try {
          const edgeConfigClient = createClient({ token: process.env.EDGE_CONFIG_TOKEN });
          await edgeConfigClient.set('passover_registrations', filteredRegistrations);
          console.log('Updated Edge Config using token object method');
        } catch (error2) {
          console.log('Failed to update Edge Config, but memory store is updated');
        }
      }
    } catch (error) {
      console.log('Error accessing Edge Config for update, but memory store is updated');
    }
    
    return res.json({ 
      success: true, 
      message: 'Registration deleted successfully',
      originalCount: allRegistrations.length,
      newCount: filteredRegistrations.length
    });
    
  } catch (error) {
    console.error('Error in delete endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete registration: ' + error.message,
      stack: error.stack
    });
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
    // Support both field names for compatibility
    const donationAmount = req.body.donationAmount || req.body.amount;
    const { donationType, firstName, lastName, email } = req.body;
    
    console.log('Donation request received:', { 
      donationAmount, donationType, firstName, lastName, email
    });
    
    // Validate donation amount
    if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid donation amount' });
    }
    
    // Convert donation amount to cents for Stripe
    const amountInCents = Math.round(donationAmount * 100);
    
    // Create product description based on donation type
    let productName = 'Donation to Rejewvenate';
    let productDescription = 'Thank you for your generous donation';
    
    if (donationType === 'sponsor') {
      productName = 'Student Sponsorship';
      productDescription = 'Sponsor a student at Rejewvenate';
    } else if (donationType === 'recurring') {
      productDescription = 'Monthly support for Rejewvenate';
    } else {
      productDescription = 'One-time donation to Rejewvenate';
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: amountInCents,
            ...(donationType === 'recurring' ? { recurring: { interval: 'month' } } : {})
          },
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      metadata: {
        donationType: donationType || 'one-time',
        firstName: firstName || '',
        lastName: lastName || '',
      },
      mode: donationType === 'recurring' ? 'subscription' : 'payment',
      success_url: `${req.headers.origin}/donation-success.html?session_id={CHECKOUT_SESSION_ID}&donation=${donationAmount}`,
      cancel_url: `${req.headers.origin}/donate.html`,
    });
    
    // Return the session ID and URL for client-side redirect
    res.json({ 
      success: true, 
      sessionId: session.id, 
      url: session.url 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ success: false, message: 'Failed to create checkout session: ' + error.message });
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
        // Get current registrations
        let registrations = await getRegistrations();
        
        // Find and update the registration
        const registrationIndex = registrations.findIndex(reg => reg.registrationId === registrationId);
        
        if (registrationIndex !== -1) {
          // Update the registration
          registrations[registrationIndex].hasDonated = true;
          registrations[registrationIndex].donationAmount = session.amount_total / 100; // Convert from cents
          registrations[registrationIndex].stripeSessionId = session.id;
          registrations[registrationIndex].donationDate = new Date().toISOString();
          
          // Save back to storage
          await saveRegistrations(registrations);
          
          console.log('Webhook: Updated registration with donation:', registrationId);
        }
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

// Create checkout session for Passover donation
app.post('/create-passover-checkout-session', async (req, res) => {
  try {
    console.log('Received checkout request:', req.body);
    
    // Get donation amount in a more robust way
    let donationAmount = 0;
    
    if (req.body.amount) {
      donationAmount = parseInt(req.body.amount) / 100; // Convert from cents
    } else if (req.body.registrationData && req.body.registrationData.donationAmount) {
      donationAmount = parseFloat(req.body.registrationData.donationAmount);
    } else if (req.body.donationAmount) {
      donationAmount = parseFloat(req.body.donationAmount);
    }
    
    const registrationId = req.body.registrationId;
    const registrationData = req.body.registrationData || {};
    
    // Get personal info
    const firstName = registrationData.firstName || req.body.firstName || '';
    const lastName = registrationData.lastName || req.body.lastName || '';
    const email = registrationData.email || req.body.email || '';
    
    console.log('Processing donation:', {
      amount: donationAmount,
      registrationId,
      name: `${firstName} ${lastName}`,
      email
    });
    
    // Validate donation amount
    if (!donationAmount || isNaN(donationAmount) || donationAmount <= 0) {
      console.error('Invalid donation amount:', donationAmount);
      return res.status(400).json({
        success: false,
        message: 'Invalid donation amount',
        received: donationAmount,
        parsed: parseFloat(donationAmount)
      });
    }
    
    // Convert donation amount to cents for Stripe
    const amountInCents = Math.round(donationAmount * 100);
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Passover Seder Donation',
              description: 'Thank you for your donation to Rejewvenate Passover Seder',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email || undefined,
      metadata: {
        registrationId: registrationId,
        firstName: firstName,
        lastName: lastName
      },
      success_url: `${req.headers.origin}/passover-registration-success.html?registration_id=${registrationId}&session_id={CHECKOUT_SESSION_ID}&donation=${donationAmount}`,
      cancel_url: `${req.headers.origin}/passover.html`,
    });
    
    console.log('Created Stripe session:', {
      id: session.id,
      url: session.url
    });
    
    // Return the URL for direct redirect
    res.json({
      success: true,
      sessionId: session.id, // Include this just in case
      url: session.url      // This is what we'll actually use
    });
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session: ' + error.message,
      details: error.stack
    });
  }
});

// Add this route for favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // Return a "No Content" response for favicon requests
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin registrations available at: http://localhost:${PORT}/admin/registrations?password=rejewvenate2025`);
}); 