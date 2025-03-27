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

// Flag for checking if Edge Config is available
let isEdgeConfigAvailable = false;
let edgeConfigClient = null;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Configure fetch with retry capability for robustness
async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    if (retries === 0) {
      throw err;
    }
    console.log(`Retrying fetch to ${url} after ${backoff}ms... (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

// Initialize Edge Config client
function initEdgeConfigClient() {
  try {
    // Only create the client if it doesn't exist yet
    if (!edgeConfigClient) {
      console.log('Initializing Edge Config client...');
      // Using the SDK method as recommended by Vercel
      edgeConfigClient = createClient(edgeConfigId, { token: edgeConfigToken });
      console.log('Edge Config client initialized');
    }
    return true;
  } catch (err) {
    console.error('Failed to initialize Edge Config client:', err);
    return false;
  }
}

// Helper functions for Edge Config API access
async function getRegistrationsFromEdgeConfig() {
  try {
    // Try using the SDK client first (optimized for reads)
    if (edgeConfigClient) {
      try {
        const data = await edgeConfigClient.get('passover_registrations');
        if (data === null || data === undefined) {
          console.log('No passover_registrations found in Edge Config via SDK, returning empty array');
          return [];
        }
        return Array.isArray(data) ? data : [];
      } catch (sdkError) {
        console.log('SDK method failed, falling back to direct API call:', sdkError);
        // Fall through to direct API call
      }
    }

    // Fallback to direct API call with retries
    console.log('Fetching registrations directly from Edge Config API...');
    const response = await fetchWithRetry(
      `${edgeConfigUrl}/item/passover_registrations?token=${edgeConfigToken}`,
      { 
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      // If the item doesn't exist yet, return an empty array
      if (response.status === 404) {
        console.log('No passover_registrations found in Edge Config, returning empty array');
        return [];
      }
      throw new Error(`Edge Config response error: ${response.status}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.log('Edge Config fetch error:', err.message);
    throw new Error('Unable to fetch data from Edge Config');
  }
}

async function saveRegistrationsToEdgeConfig(registrations) {
  try {
    // Use the hardcoded API token or environment variable
    const vercelApiToken = process.env.VERCEL_API_TOKEN || VERCEL_API_TOKEN;
    
    console.log('Updating Edge Config with registrations data...');
    
    // Using the recommended Vercel API endpoint with retries
    const updateResponse = await fetchWithRetry(
      `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`, 
      {
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
      }
    );
    
    if (!updateResponse.ok) {
      let errorMessage = `HTTP error ${updateResponse.status}`;
      try {
        const errorData = await updateResponse.json();
        errorMessage = `Failed to update Edge Config: ${JSON.stringify(errorData)}`;
      } catch (e) {
        // If parsing JSON fails, use the default error message
      }
      throw new Error(errorMessage);
    }
    
    console.log('Edge Config updated successfully with new registrations data');
    return true;
  } catch (err) {
    console.error('Error saving to Edge Config:', err);
    throw new Error('Failed to save to Edge Config: ' + err.message);
  }
}

// Wrapper functions for getting/saving registrations with graceful degradation
async function getRegistrations() {
  if (!isEdgeConfigAvailable) {
    throw new Error('Registration system is temporarily unavailable - Edge Config is required');
  }

  return await getRegistrationsFromEdgeConfig();
}

async function saveRegistrations(registrations) {
  if (!isEdgeConfigAvailable) {
    throw new Error('Registration system is temporarily unavailable - Edge Config is required');
  }

  return await saveRegistrationsToEdgeConfig(registrations);
}

// Initialize Edge Config passover_registrations if needed
async function initializeEdgeConfig() {
  try {
    console.log('Checking if passover_registrations exists in Edge Config...');
    
    // Check if passover_registrations exists
    const response = await fetchWithRetry(
      `${edgeConfigUrl}/item/passover_registrations?token=${edgeConfigToken}`,
      { method: 'GET' }
    );
    
    // If not found, initialize it
    if (response.status === 404) {
      console.log('Initializing passover_registrations in Edge Config...');
      
      const vercelApiToken = process.env.VERCEL_API_TOKEN || VERCEL_API_TOKEN;
      
      const initResponse = await fetchWithRetry(
        `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${vercelApiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            items: [{
              operation: 'upsert',
              key: 'passover_registrations',
              value: []
            }]
          })
        }
      );
      
      if (initResponse.ok) {
        console.log('Successfully initialized passover_registrations in Edge Config');
        return true;
      } else {
        let errorMessage;
        try {
          const errorData = await initResponse.json();
          errorMessage = JSON.stringify(errorData);
        } catch (e) {
          errorMessage = `HTTP error ${initResponse.status}`;
        }
        throw new Error(`Failed to initialize Edge Config: ${errorMessage}`);
      }
    } else if (response.ok) {
      console.log('passover_registrations already exists in Edge Config');
      return true;
    } else {
      throw new Error(`Unexpected response when checking passover_registrations: ${response.status}`);
    }
  } catch (err) {
    console.error('Error initializing Edge Config:', err);
    throw new Error('Failed to initialize Edge Config: ' + err.message);
  }
}

// Test if Edge Config is available with multiple attempts
async function testEdgeConfig(maxAttempts = 3) {
  console.log(`Testing Edge Config connection (max ${maxAttempts} attempts)...`);
  
  // Initialize the SDK client first
  const clientInitialized = initEdgeConfigClient();
  if (!clientInitialized) {
    console.warn('Failed to initialize Edge Config client, will try direct API access');
  }
  
  // Set to false by default
  isEdgeConfigAvailable = false;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Edge Config connection attempt ${attempt}/${maxAttempts}...`);
      
      // Try the SDK client first
      if (edgeConfigClient) {
        try {
          const items = await edgeConfigClient.getAll();
          console.log('Edge Config is available via SDK!');
          isEdgeConfigAvailable = true;
          
          // Check for passover_registrations
          if (items && items.passover_registrations) {
            console.log(`Found ${Array.isArray(items.passover_registrations) ? items.passover_registrations.length : 'non-array'} registrations in Edge Config`);
          } else {
            console.log('No passover_registrations found, will initialize it');
            await initializeEdgeConfig();
          }
          
          return true;
        } catch (sdkError) {
          console.warn('SDK access failed, trying direct API:', sdkError);
        }
      }
      
      // Fallback to direct API call
      const response = await fetchWithRetry(
        `${edgeConfigUrl}/items?token=${edgeConfigToken}`,
        { method: 'GET' },
        1  // only 1 retry per attempt
      );
      
      if (response.ok) {
        isEdgeConfigAvailable = true;
        console.log('Edge Config is available and working via direct API!');
        
        try {
          // Check if we have any data
          const data = await response.json();
          console.log('Edge Config items:', data);
          
          // Check for passover_registrations
          if (data && data.passover_registrations && Array.isArray(data.passover_registrations)) {
            console.log(`Found ${data.passover_registrations.length} registrations in Edge Config`);
          } else {
            console.log('No passover_registrations found, will initialize it');
            await initializeEdgeConfig();
          }
        } catch (parseError) {
          console.warn('Error parsing Edge Config response:', parseError);
          // Still consider Edge Config available if we got a successful response
        }
        
        return true;
      } else {
        console.log(`Edge Config test failed with status: ${response.status}`);
        
        // If we've tried all attempts, give up
        if (attempt === maxAttempts) {
          isEdgeConfigAvailable = false;
          return false;
        }
        
        // Wait before the next attempt with exponential backoff
        const delay = Math.pow(2, attempt) * 500;
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      console.error(`Edge Config test error (attempt ${attempt}/${maxAttempts}):`, err);
      
      // If we've tried all attempts, give up
      if (attempt === maxAttempts) {
        isEdgeConfigAvailable = false;
        return false;
      }
      
      // Wait before the next attempt with exponential backoff
      const delay = Math.pow(2, attempt) * 500;
      console.log(`Waiting ${delay}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  isEdgeConfigAvailable = false;
  return false;
}

// Initialize system with graceful degradation
async function initialize() {
  console.log('Initializing application...');
  
  try {
    // Test Edge Config availability with multiple attempts
    const edgeConfigWorking = await testEdgeConfig(3);
    
    if (edgeConfigWorking) {
      console.log('Initialization complete - using Edge Config for persistent storage');
      return true;
    } else {
      console.warn('Edge Config is not available - the application will operate in read-only mode');
      console.warn('Registration and admin functions will be unavailable until Edge Config connectivity is restored');
      return false;
    }
  } catch (error) {
    console.error('Initialization warning:', error);
    console.warn('Application will operate in limited mode with no registration functionality');
    return false;
  }
}

// Initialize when server starts - but don't prevent server from starting
initialize().then(success => {
  if (success) {
    console.log('Application initialized successfully with Edge Config');
  } else {
    console.warn('Application started in limited mode - some features will be unavailable');
  }
}).catch(err => {
  console.error('Initialization error:', err);
  console.warn('Application started in limited mode - some features will be unavailable');
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
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration retrieval is unavailable - Edge Config is required'
      });
    }
    
    // Get registrations from Edge Config
    const registrations = await getRegistrations();
    
    // Get a single registration if ID is provided
    const registrationId = req.query.id;
    if (registrationId) {
      const registration = registrations.find(reg => reg.registrationId === registrationId);
      if (registration) {
        return res.json({ success: true, registration });
      } else {
        return res.status(404).json({ 
          success: false, 
          message: 'Registration not found with ID: ' + registrationId 
        });
      }
    }
    
    console.log(`Returning ${registrations.length} registrations from Edge Config`);
    res.json({ success: true, registrations });
  } catch (error) {
    console.error('Error getting registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to retrieve registrations from Edge Config'
    });
  }
});

// Store registration endpoint
app.post('/store-passover-registration', async (req, res) => {
  try {
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration storage is unavailable - Edge Config is required'
      });
    }

    const registration = req.body;
    console.log('Received registration:', registration);
    
    // Add registration date
    registration.registrationDate = new Date().toISOString();
    
    // Get current registrations from Edge Config
    const registrations = await getRegistrations();
    
    // Add new registration
    registrations.push(registration);
    
    // Save to Edge Config
    await saveRegistrations(registrations);
    
    console.log('Registration saved successfully to Edge Config');
    res.json({ success: true, message: 'Registration saved successfully' });
  } catch (error) {
    console.error('Error storing registration:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to store registration in Edge Config'
    });
  }
});

// Delete registration endpoint with improved persistence
app.delete('/delete-passover-registration/:id', async (req, res) => {
  try {
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration deletion is unavailable - Edge Config is required'
      });
    }
    
    const registrationId = req.params.id;
    
    if (!registrationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration ID is required' 
      });
    }
    
    console.log('Attempting to delete registration:', registrationId);
    
    // Get all current registrations from Edge Config
    const allRegistrations = await getRegistrations();
    
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
    
    // Save updated registrations to Edge Config
    await saveRegistrations(filteredRegistrations);
    console.log('Updated Edge Config with removed registration');
    
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
      message: 'Failed to delete registration: ' + error.message
    });
  }
});

// Get registration by ID
app.get('/registration/:id', async (req, res) => {
  try {
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration retrieval is unavailable - Edge Config is required'
      });
    }
    
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
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration update is unavailable - Edge Config is required'
      });
    }
    
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
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      return res.status(503).json({
        success: false,
        message: 'Registration management is unavailable - Edge Config is required'
      });
    }
    
    // Get registrations only from Edge Config
    const registrations = await getRegistrations();
    res.json({ success: true, registrations });
  } catch (error) {
    console.error('Error retrieving registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve registrations: ' + error.message 
    });
  }
});

// Create a Stripe checkout session 
app.post('/create-passover-checkout-session', async (req, res) => {
  try {
    const { registrationId, amount, registrationData } = req.body;
    
    if (!registrationId || !amount || !registrationData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields for checkout session' 
      });
    }
    
    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Passover Seder Donation',
            description: 'Thank you for supporting our Passover Seder'
          },
          unit_amount: amount, // amount in cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/passover-registration-success.html?registration_id=${registrationId}&donation=true`,
      cancel_url: `${req.headers.origin}/passover-registration-success.html?registration_id=${registrationId}`,
      metadata: {
        registrationId,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        donationAmount: registrationData.donationAmount
      }
    });
    
    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create checkout session: ' + error.message 
    });
  }
});

// Listen for Stripe webhook events (if configured)
app.post('/stripe-webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  
  try {
    // This would require your Stripe webhook secret - for future implementation
    // event = stripe.webhooks.constructEvent(req.body, signature, 'whsec_your_stripe_webhook_secret');
    // Process the event, update registrations accordingly
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Edge Config ID: ${edgeConfigId}`);
}); 