// server.js
// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_default_key_for_development_only'); // Using environment variable
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@vercel/edge-config');

const app = express();
const PORT = process.env.PORT || 3000;

// Log available environment variables (without sensitive values)
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  EDGE_CONFIG: process.env.EDGE_CONFIG ? 'Defined' : 'Undefined',
  EDGE_CONFIG_ID: process.env.EDGE_CONFIG_ID ? 'Defined' : 'Undefined',
  EDGE_CONFIG_TOKEN: process.env.EDGE_CONFIG_TOKEN ? 'Defined' : 'Undefined',
  VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN ? 'Defined' : 'Undefined',
});

// Edge Config setup - using environment variables
const edgeConfigId = process.env.EDGE_CONFIG_ID || 'ecfg_u19oenik3gvnaimrebefbcaoe6dy';
const edgeConfigToken = process.env.EDGE_CONFIG_TOKEN || '98e90ddb-8e17-49b6-b53b-ebf4677a8a7b';
const edgeConfigUrl = `https://edge-config.vercel.com/${edgeConfigId}`;

// Vercel API token from environment variable
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN || 'zK6O71OhkWKKeCqq3X9NHW8S';

// Flag for checking if Edge Config is available
let isEdgeConfigAvailable = false;
let edgeConfigClient = null;

// Configure proper environment variable for the SDK
if (!process.env.EDGE_CONFIG) {
  console.log('EDGE_CONFIG environment variable not found, creating it');
  process.env.EDGE_CONFIG = `https://edge-config.vercel.com/${edgeConfigId}?token=${edgeConfigToken}`;
} else {
  console.log('EDGE_CONFIG environment variable is already defined');
}

// Additional log for Vercel environment
if (process.env.VERCEL === '1') {
  console.log('Running in Vercel environment');
  
  // In Vercel production, the Edge Config client should auto-connect
  if (process.env.VERCEL_ENV === 'production') {
    console.log('In Vercel production environment, Edge Config should auto-connect');
  }
}

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
      
      try {
        // First attempt: Using the connection string from env variable
        edgeConfigClient = createClient();
        console.log('Edge Config client initialized using environment variable');
        return true;
      } catch (envError) {
        console.log('Failed to initialize with environment variable:', envError.message);
        
        try {
          // Second attempt: Using direct parameters
          edgeConfigClient = createClient(edgeConfigId, { token: edgeConfigToken });
          console.log('Edge Config client initialized using direct parameters');
          return true;
        } catch (directError) {
          console.log('Failed to initialize with direct parameters:', directError.message);
          
          // Third attempt: Using a different parameter format
          try {
            const connectionString = `https://edge-config.vercel.com/${edgeConfigId}?token=${edgeConfigToken}`;
            edgeConfigClient = createClient({ connectionString });
            console.log('Edge Config client initialized using connection string object');
            return true;
          } catch (connectionStringError) {
            console.error('All SDK initialization attempts failed:', connectionStringError.message);
            edgeConfigClient = null;
            return false;
          }
        }
      }
    }
    return edgeConfigClient !== null;
  } catch (err) {
    console.error('Failed to initialize Edge Config client:', err);
    edgeConfigClient = null;
    return false;
  }
}

// Helper functions for Edge Config API access
async function getRegistrationsFromEdgeConfig() {
  try {
    // Try using the SDK client first (optimized for reads)
    if (edgeConfigClient) {
      try {
        console.log('Attempting to read using SDK client...');
        const data = await edgeConfigClient.get('passover_registrations');
        console.log('SDK client read successful');
        if (data === null || data === undefined) {
          console.log('No passover_registrations found in Edge Config via SDK, returning empty array');
          return [];
        }
        return Array.isArray(data) ? data : [];
      } catch (sdkError) {
        console.log('SDK method failed, falling back to direct API call:', sdkError.message);
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
    // First try SDK client if available (best practice)
    if (edgeConfigClient) {
      try {
        console.log('Attempting to write using SDK client...');
        await edgeConfigClient.set('passover_registrations', registrations);
        console.log('Successfully saved registrations using SDK client');
        return true;
      } catch (sdkError) {
        console.log('SDK write failed, falling back to API call:', sdkError.message);
        // Fall through to API call
      }
    }
    
    // Use the hardcoded API token or environment variable
    const vercelApiToken = process.env.VERCEL_API_TOKEN || VERCEL_API_TOKEN;
    
    console.log('Updating Edge Config with registrations data via API...');
    
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
    console.warn('Edge Config is not available for data retrieval');
    throw new Error('Registration system is temporarily unavailable - Edge Config is required');
  }

  try {
    // Try to get the data, which may also initialize if needed
    return await getRegistrationsFromEdgeConfig();
  } catch (error) {
    console.error('Error in getRegistrations:', error);
    
    // Check if this is an "item not found" error, which means we need to initialize
    if (error.message.includes('404') || error.message.includes('not found') || error.message.includes('undefined')) {
      try {
        console.log('Attempting to initialize Edge Config since item was not found...');
        await initializeEdgeConfig();
        // After initialization, return empty array
        return [];
      } catch (initError) {
        console.error('Failed to initialize during get operation:', initError);
        throw new Error('Failed to initialize registration storage');
      }
    }
    
    // For other errors, just propagate
    throw error;
  }
}

async function saveRegistrations(registrations) {
  if (!isEdgeConfigAvailable) {
    console.warn('Edge Config is not available for data saving');
    throw new Error('Registration system is temporarily unavailable - Edge Config is required');
  }

  try {
    return await saveRegistrationsToEdgeConfig(registrations);
  } catch (error) {
    console.error('Error in saveRegistrations:', error);
    
    // If we get an error about the item not existing, try to initialize first
    if (error.message.includes('not found') || error.message.includes('404')) {
      try {
        console.log('Attempting to initialize Edge Config before saving...');
        await initializeEdgeConfig();
        // Try saving again after initialization
        return await saveRegistrationsToEdgeConfig(registrations);
      } catch (initError) {
        console.error('Failed to initialize during save operation:', initError);
        throw new Error('Failed to initialize registration storage for saving');
      }
    }
    
    // For other errors, just propagate
    throw error;
  }
}

// Initialize Edge Config passover_registrations if needed
async function initializeEdgeConfig() {
  try {
    console.log('Checking if passover_registrations exists in Edge Config...');
    
    // First try using the SDK client
    if (edgeConfigClient) {
      try {
        console.log('Checking for passover_registrations using SDK...');
        const data = await edgeConfigClient.get('passover_registrations');
        if (data === undefined || data === null) {
          console.log('No passover_registrations found via SDK, initializing it...');
          await edgeConfigClient.set('passover_registrations', []);
          console.log('Successfully initialized passover_registrations using SDK');
          return true;
        }
        console.log('passover_registrations already exists in Edge Config (via SDK)');
        return true;
      } catch (sdkError) {
        console.log('SDK check failed, falling back to API:', sdkError.message);
        // Fall through to API method
      }
    }
    
    // Check if passover_registrations exists using API
    const response = await fetchWithRetry(
      `${edgeConfigUrl}/item/passover_registrations?token=${edgeConfigToken}`,
      { method: 'GET' }
    );
    
    // If not found, initialize it
    if (response.status === 404) {
      console.log('Initializing passover_registrations in Edge Config via API...');
      
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
        console.log('Successfully initialized passover_registrations in Edge Config via API');
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
      console.log('passover_registrations already exists in Edge Config (via API)');
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
async function testEdgeConfig(maxAttempts = 5) { // Increased from 3 to 5 attempts
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
          console.log('Testing Edge Config connection via SDK...');
          const items = await edgeConfigClient.getAll();
          console.log('Edge Config is available via SDK!');
          isEdgeConfigAvailable = true;
          
          // Check for passover_registrations
          if (items && items.passover_registrations !== undefined) {
            const registrationsCount = Array.isArray(items.passover_registrations) 
              ? items.passover_registrations.length 
              : 'non-array';
            console.log(`Found ${registrationsCount} registrations in Edge Config (via SDK)`);
          } else {
            console.log('No passover_registrations found via SDK, will initialize it');
            await initializeEdgeConfig();
          }
          
          return true;
        } catch (sdkError) {
          console.warn('SDK access failed, trying direct API:', sdkError.message);
        }
      }
      
      // Fallback to direct API call
      console.log('Testing Edge Config connection via direct API...');
      const response = await fetchWithRetry(
        `${edgeConfigUrl}/items?token=${edgeConfigToken}`,
        { method: 'GET' },
        2  // Increased from 1 to 2 retries per attempt
      );
      
      if (response.ok) {
        isEdgeConfigAvailable = true;
        console.log('Edge Config is available and working via direct API!');
        
        try {
          // Check if we have any data
          const data = await response.json();
          console.log('Edge Config items:', data);
          
          // Check for passover_registrations
          if (data && data.passover_registrations !== undefined) {
            const registrationsCount = Array.isArray(data.passover_registrations) 
              ? data.passover_registrations.length 
              : 'non-array';
            console.log(`Found ${registrationsCount} registrations in Edge Config (via API)`);
          } else {
            console.log('No passover_registrations found via API, will initialize it');
            await initializeEdgeConfig();
          }
        } catch (parseError) {
          console.warn('Error parsing Edge Config response:', parseError.message);
          // Still consider Edge Config available if we got a successful response
          // But try to initialize passover_registrations to be safe
          try {
            await initializeEdgeConfig();
          } catch (initError) {
            console.warn('Failed to initialize Edge Config during error recovery:', initError.message);
          }
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
      console.error(`Edge Config test error (attempt ${attempt}/${maxAttempts}):`, err.message);
      
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
  
  // Try multiple initialization attempts
  let attempts = 3;
  
  while (attempts > 0) {
    try {
      // Test Edge Config availability with multiple attempts
      const edgeConfigWorking = await testEdgeConfig(5);
      
      if (edgeConfigWorking) {
        console.log('Initialization complete - using Edge Config for persistent storage');
        
        // Pre-warm the connection by fetching registrations
        try {
          console.log('Pre-warming Edge Config connection by fetching registrations...');
          const registrations = await getRegistrations();
          console.log(`Successfully pre-warmed Edge Config with ${registrations.length} registrations`);
        } catch (warmupError) {
          console.warn('Pre-warming fetch failed, but will continue with initialization:', warmupError.message);
          // Still continue as successful since the connection test passed
        }
        
        return true;
      } else {
        attempts--;
        
        if (attempts === 0) {
          console.warn('Edge Config is not available after multiple attempts - the application will operate in read-only mode');
          console.warn('Registration and admin functions will be unavailable until Edge Config connectivity is restored');
          return false;
        }
        
        console.log(`Edge Config test failed, ${attempts} initialization attempts remaining`);
        // Wait before retrying
        const delay = (4 - attempts) * 2000; // Increasing delay between attempts
        console.log(`Waiting ${delay}ms before next initialization attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      attempts--;
      
      if (attempts === 0) {
        console.error('Initialization error after multiple attempts:', error);
        console.warn('Application will operate in limited mode with no registration functionality');
        return false;
      }
      
      console.log(`Initialization error, ${attempts} attempts remaining:`, error.message);
      // Wait before retrying
      const delay = (4 - attempts) * 2000; // Increasing delay between attempts
      console.log(`Waiting ${delay}ms before next initialization attempt...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
}

// Initialize when server starts - but don't prevent server from starting
initialize().then(success => {
  if (success) {
    console.log('Application initialized successfully with Edge Config');
    
    // Set up a periodic check to keep the Edge Config connection alive
    const CONNECTIVITY_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes
    console.log(`Setting up periodic connectivity check every ${CONNECTIVITY_CHECK_INTERVAL/60000} minutes`);
    
    setInterval(async () => {
      try {
        if (isEdgeConfigAvailable) {
          console.log('Performing periodic Edge Config connectivity check...');
          
          // Try to get registrations to validate the connection
          const registrations = await getRegistrations();
          console.log(`Connectivity check successful, found ${registrations.length} registrations`);
        } else {
          console.log('Edge Config connection lost, attempting to re-initialize...');
          const reconnected = await testEdgeConfig(3);
          
          if (reconnected) {
            console.log('Successfully re-established Edge Config connection');
          } else {
            console.warn('Failed to re-establish Edge Config connection');
          }
        }
      } catch (error) {
        console.error('Error during periodic connectivity check:', error.message);
        
        // Try to reconnect
        console.log('Attempting to recover Edge Config connection...');
        try {
          const reconnected = await testEdgeConfig(3);
          if (reconnected) {
            console.log('Successfully recovered Edge Config connection');
          } else {
            console.warn('Failed to recover Edge Config connection');
          }
        } catch (reconnectError) {
          console.error('Error during connection recovery:', reconnectError.message);
        }
      }
    }, CONNECTIVITY_CHECK_INTERVAL);
  } else {
    console.warn('Application started in limited mode - some features will be unavailable');
    
    // Even if initial startup failed, set a periodic check to try to recover
    const RECOVERY_ATTEMPT_INTERVAL = 5 * 60 * 1000; // 5 minutes
    console.log(`Setting up periodic recovery attempts every ${RECOVERY_ATTEMPT_INTERVAL/60000} minutes`);
    
    setInterval(async () => {
      console.log('Attempting to recover Edge Config functionality...');
      
      try {
        const recovered = await initialize();
        if (recovered) {
          console.log('Successfully recovered Edge Config functionality!');
        } else {
          console.log('Recovery attempt failed, will try again later');
        }
      } catch (error) {
        console.error('Error during recovery attempt:', error.message);
      }
    }, RECOVERY_ATTEMPT_INTERVAL);
  }
}).catch(err => {
  console.error('Initialization error:', err);
  console.warn('Application started in limited mode - some features will be unavailable');
  
  // Set up periodic recovery attempts even after initialization error
  const RECOVERY_ATTEMPT_INTERVAL = 5 * 60 * 1000; // 5 minutes
  console.log(`Setting up periodic recovery attempts every ${RECOVERY_ATTEMPT_INTERVAL/60000} minutes`);
  
  setInterval(async () => {
    console.log('Attempting to recover from initialization error...');
    
    try {
      const recovered = await initialize();
      if (recovered) {
        console.log('Successfully recovered from initialization error!');
      } else {
        console.log('Recovery attempt failed, will try again later');
      }
    } catch (error) {
      console.error('Error during recovery attempt:', error.message);
    }
  }, RECOVERY_ATTEMPT_INTERVAL);
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
    // Log the request details for debugging
    console.log('Registration retrieval request:', {
      id: req.query.id,
      headers: req.headers.host,
      referrer: req.headers.referer || 'none'
    });
    
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      console.warn('Edge Config unavailable during registration retrieval');
      
      // Try to initialize it on demand
      try {
        const initialized = await testEdgeConfig(3);
        if (!initialized) {
          console.error('Failed to initialize Edge Config for registration retrieval');
          return res.status(503).json({
            success: false,
            message: 'Registration retrieval is temporarily unavailable. Please try again in a few minutes.'
          });
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during retrieval:', initError);
        return res.status(503).json({
          success: false, 
          message: 'Registration system is experiencing technical difficulties'
        });
      }
    }
    
    // Get registrations from Edge Config with retries
    let registrations;
    let getAttempts = 3;
    
    while (getAttempts > 0) {
      try {
        console.log(`Retrieving registrations for query (attempt ${4-getAttempts}/3)...`);
        registrations = await getRegistrations();
        console.log(`Retrieved ${registrations.length} registrations for filtering`);
        break; // Success, exit the loop
      } catch (getError) {
        getAttempts--;
        if (getAttempts === 0) {
          console.error('Failed to retrieve registrations after multiple attempts:', getError);
          return res.status(500).json({
            success: false,
            message: 'Failed to access registration data. Please try again in a few minutes.'
          });
        }
        
        console.log(`Error retrieving registrations, ${getAttempts} attempts remaining:`, getError.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Get a single registration if ID is provided
    const registrationId = req.query.id;
    if (registrationId) {
      console.log(`Looking for registration with ID: ${registrationId}`);
      console.log(`Available IDs: ${registrations.map(r => r.registrationId || 'undefined').join(', ')}`);
      
      const registration = registrations.find(reg => reg.registrationId === registrationId);
      if (registration) {
        console.log(`Found registration for ${registration.firstName} ${registration.lastName}`);
        return res.json({ success: true, registration });
      } else {
        console.warn(`Registration with ID ${registrationId} not found in ${registrations.length} registrations`);
        
        // Try to handle common ID format variations
        const alternativeFormatRegistration = registrations.find(reg => {
          if (!reg.registrationId) return false;
          return reg.registrationId.replace(/-/g, '') === registrationId.replace(/-/g, '') || 
                 reg.registrationId.toLowerCase() === registrationId.toLowerCase();
        });
        
        if (alternativeFormatRegistration) {
          console.log(`Found registration with alternative ID format: ${alternativeFormatRegistration.registrationId}`);
          return res.json({ success: true, registration: alternativeFormatRegistration });
        }
        
        return res.status(404).json({ 
          success: false, 
          message: 'Registration not found with ID: ' + registrationId,
          availableIds: registrations.slice(0, 5).map(r => r.registrationId) // Only send first 5 for privacy
        });
      }
    }
    
    // If no ID provided, return all registrations (for admin use)
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
    // Check if Edge Config is available, if not, try to initialize it first
    if (!isEdgeConfigAvailable) {
      console.warn('Edge Config unavailable on registration attempt - trying to initialize...');
      try {
        // Increased to 3 retry attempts with a more descriptive message
        const edgeConfigWorking = await testEdgeConfig(3);
        
        if (!edgeConfigWorking) {
          console.error('Edge Config initialization failed during registration attempt');
          return res.status(503).json({
            success: false,
            message: 'Our registration system is temporarily unavailable. ' +
                    'Please try again in a few minutes or contact us directly at YKIEVMAN@BOWERYJEWS.ORG ' +
                    'with your name, email, and which Seder night(s) you would like to attend.'
          });
        } else {
          console.log('Edge Config successfully initialized during registration attempt');
          // Edge Config is now available, continue with the registration
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during registration:', initError);
        return res.status(503).json({
          success: false,
          message: 'Our registration system is experiencing technical difficulties. ' +
                  'Please try again in a few minutes or contact us directly at YKIEVMAN@BOWERYJEWS.ORG.'
        });
      }
    }

    const registration = req.body;
    console.log('Received registration:', registration);
    
    // Add registration date
    registration.registrationDate = new Date().toISOString();
    
    // Double check Edge Config availability
    if (!isEdgeConfigAvailable) {
      console.log('Edge Config still unavailable after initialization attempt, trying once more...');
      try {
        const edgeConfigWorking = await testEdgeConfig(3);
        if (!edgeConfigWorking) {
          console.error('Edge Config is still unavailable after multiple initialization attempts');
          return res.status(503).json({
            success: false,
            message: 'Registration storage is temporarily unavailable. Please try again in a few minutes.'
          });
        } else {
          console.log('Edge Config successfully initialized on second attempt');
        }
      } catch (recheckError) {
        console.error('Error rechecking Edge Config availability:', recheckError);
        return res.status(503).json({
          success: false,
          message: 'Registration storage system is experiencing technical difficulties. Please try again in a few minutes.'
        });
      }
    }
    
    // Get current registrations with retry logic
    let registrations;
    let getAttempts = 3;
    
    while (getAttempts > 0) {
      try {
        console.log(`Retrieving current registrations (attempt ${4-getAttempts}/3)...`);
        registrations = await getRegistrations();
        console.log(`Retrieved ${registrations.length} existing registrations`);
        break; // Success, exit the loop
      } catch (getError) {
        getAttempts--;
        if (getAttempts === 0) {
          console.error('Failed to retrieve registrations after multiple attempts:', getError);
          return res.status(500).json({
            success: false,
            message: 'Failed to access registration storage. Please try again in a few minutes.'
          });
        }
        
        console.log(`Error retrieving registrations, ${getAttempts} attempts remaining:`, getError.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Add new registration
    registrations.push(registration);
    console.log(`Adding new registration, total count: ${registrations.length}`);
    
    // Save to Edge Config with retry logic
    let saveAttempts = 3;
    
    while (saveAttempts > 0) {
      try {
        console.log(`Saving updated registrations (attempt ${4-saveAttempts}/3)...`);
        await saveRegistrations(registrations);
        console.log('Registration saved successfully to Edge Config');
        break; // Success, exit the loop
      } catch (saveError) {
        saveAttempts--;
        if (saveAttempts === 0) {
          console.error('Failed to save registration after multiple attempts:', saveError);
          return res.status(500).json({
            success: false,
            message: 'Failed to save your registration. Please try again in a few minutes or contact our support team.'
          });
        }
        
        console.log(`Error saving registration, ${saveAttempts} attempts remaining:`, saveError.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Registration saved successfully',
      registrationId: registration.registrationId 
    });
  } catch (error) {
    console.error('Unexpected error storing registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An unexpected error occurred. Please try again or contact us directly at YKIEVMAN@BOWERYJEWS.ORG.'
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
    // Log request details for debugging
    console.log('Single registration retrieval request:', {
      registrationId: req.params.id,
      path: req.path,
      headers: req.headers.host,
      referrer: req.headers.referer || 'none'
    });
    
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      console.warn('Edge Config unavailable during individual registration retrieval');
      
      // Try to initialize it on demand
      try {
        const initialized = await testEdgeConfig(3);
        if (!initialized) {
          console.error('Failed to initialize Edge Config for individual registration retrieval');
          return res.status(503).json({
            success: false,
            message: 'Registration data temporarily unavailable. Please try again in a few minutes.'
          });
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during individual retrieval:', initError);
        return res.status(503).json({
          success: false, 
          message: 'Registration system is experiencing technical difficulties'
        });
      }
    }
    
    const registrationId = req.params.id;
    
    // Get all registrations with retry logic
    let registrations;
    let getAttempts = 3;
    
    while (getAttempts > 0) {
      try {
        console.log(`Retrieving registrations for ID lookup (attempt ${4-getAttempts}/3)...`);
        registrations = await getRegistrations();
        console.log(`Retrieved ${registrations.length} registrations to find ID ${registrationId}`);
        break; // Success, exit the loop
      } catch (getError) {
        getAttempts--;
        if (getAttempts === 0) {
          console.error('Failed to retrieve registrations after multiple attempts:', getError);
          return res.status(500).json({
            success: false,
            message: 'Failed to access registration data. Please try again in a few minutes.'
          });
        }
        
        console.log(`Error retrieving registrations, ${getAttempts} attempts remaining:`, getError.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Look for exact match first
    let registration = registrations.find(reg => reg.registrationId === registrationId);
    
    // If not found, try more flexible matching
    if (!registration) {
      console.log(`No exact match found for ID ${registrationId}, trying flexible matching`);
      
      // Try without hyphens, different capitalization, etc.
      registration = registrations.find(reg => {
        if (!reg.registrationId) return false;
        
        // Compare without hyphens
        const normalizedRequestId = registrationId.replace(/[-]/g, '').toLowerCase();
        const normalizedStoredId = reg.registrationId.replace(/[-]/g, '').toLowerCase();
        
        return normalizedRequestId === normalizedStoredId;
      });
    }
    
    if (registration) {
      console.log(`Found registration for ${registration.firstName} ${registration.lastName}`);
      res.json({ success: true, registration });
    } else {
      console.warn(`Registration with ID ${registrationId} not found in ${registrations.length} registrations`);
      
      // Log available IDs for debugging
      const availableIds = registrations.map(r => r.registrationId || 'undefined').slice(0, 5);
      console.log(`First 5 available IDs: ${availableIds.join(', ')}`);
      
      res.status(404).json({ 
        success: false, 
        message: 'Registration not found',
        registrationId: registrationId
      });
    }
  } catch (error) {
    console.error('Error retrieving individual registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve registration: ' + error.message 
    });
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
  const adminPassword = process.env.ADMIN_PASSWORD || 'rejewvenate2025'; // Using environment variable
  
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

// Create a standard donation checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { donationAmount, donationType, firstName, lastName, email } = req.body;
    
    if (!donationAmount || !firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields for checkout session' 
      });
    }
    
    // Convert amount to cents for Stripe
    const amountInCents = Math.round(donationAmount * 100);
    
    // Create appropriate product name based on donation type
    let productName = 'One-time Donation';
    let description = 'Thank you for supporting Rejewvenate';
    
    if (donationType === 'recurring') {
      productName = 'Monthly Donation';
      description = 'Thank you for your monthly support of Rejewvenate';
    } else if (donationType === 'sponsor') {
      productName = 'Student Sponsorship';
      description = 'Thank you for sponsoring a student at Rejewvenate';
    }
    
    // Create common session parameters
    const sessionParams = {
      payment_method_types: ['card'],
      metadata: {
        donationType,
        firstName,
        lastName,
        email,
        donationAmount
      },
      success_url: `${req.headers.origin}/donation-success.html?donation=true&type=${donationType}`,
      cancel_url: `${req.headers.origin}/donate.html`
    };
    
    // Handle one-time vs recurring donations differently
    if (donationType === 'recurring') {
      // First, create or retrieve a product for recurring donations
      const product = await stripe.products.create({
        name: productName,
        description: description,
      });
      
      // Create a price object for this product
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: amountInCents,
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
      });
      
      // Add the line items for subscription
      sessionParams.line_items = [{
        price: price.id,
        quantity: 1,
      }];
      
      // Set the mode to subscription
      sessionParams.mode = 'subscription';
    } else {
      // One-time donation setup
      sessionParams.line_items = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            description: description
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }];
      
      // Set the mode to payment
      sessionParams.mode = 'payment';
    }
    
    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionParams);
    
    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating donation checkout session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create checkout session: ' + error.message 
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

// Add an API version of the get registrations endpoint for better compatibility
app.get('/api/get-passover-registrations', async (req, res) => {
  console.log('API route for get-passover-registrations, forwarding request...');
  
  try {
    // Check if Edge Config is available
    if (!isEdgeConfigAvailable) {
      console.warn('Edge Config unavailable during API registration retrieval');
      
      // Try to initialize it on demand
      try {
        const initialized = await testEdgeConfig(3);
        if (!initialized) {
          console.error('Failed to initialize Edge Config for API registration retrieval');
          return res.status(503).json({
            success: false,
            message: 'Registration retrieval is temporarily unavailable. Please try again in a few minutes.'
          });
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during API retrieval:', initError);
        return res.status(503).json({
          success: false, 
          message: 'Registration system is experiencing technical difficulties'
        });
      }
    }
    
    // Get registrations from Edge Config with retries
    let registrations;
    let getAttempts = 3;
    
    while (getAttempts > 0) {
      try {
        console.log(`API: Retrieving registrations for query (attempt ${4-getAttempts}/3)...`);
        registrations = await getRegistrations();
        console.log(`API: Retrieved ${registrations.length} registrations for filtering`);
        break; // Success, exit the loop
      } catch (getError) {
        getAttempts--;
        if (getAttempts === 0) {
          console.error('API: Failed to retrieve registrations after multiple attempts:', getError);
          return res.status(500).json({
            success: false,
            message: 'Failed to access registration data. Please try again in a few minutes.'
          });
        }
        
        console.log(`API: Error retrieving registrations, ${getAttempts} attempts remaining:`, getError.message);
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Get a single registration if ID is provided
    const registrationId = req.query.id;
    if (registrationId) {
      console.log(`API: Looking for registration with ID: ${registrationId}`);
      
      const registration = registrations.find(reg => reg.registrationId === registrationId);
      if (registration) {
        console.log(`API: Found registration for ${registration.firstName} ${registration.lastName}`);
        return res.json({ success: true, registration });
      } else {
        console.warn(`API: Registration with ID ${registrationId} not found in ${registrations.length} registrations`);
        
        // Try to handle common ID format variations
        const alternativeFormatRegistration = registrations.find(reg => {
          if (!reg.registrationId) return false;
          return reg.registrationId.replace(/-/g, '') === registrationId.replace(/-/g, '') || 
                 reg.registrationId.toLowerCase() === registrationId.toLowerCase();
        });
        
        if (alternativeFormatRegistration) {
          console.log(`API: Found registration with alternative ID format: ${alternativeFormatRegistration.registrationId}`);
          return res.json({ success: true, registration: alternativeFormatRegistration });
        }
        
        return res.status(404).json({ 
          success: false, 
          message: 'Registration not found with ID: ' + registrationId
        });
      }
    }
    
    // If no ID provided, return all registrations (for admin use)
    console.log(`API: Returning ${registrations.length} registrations from Edge Config`);
    res.json({ success: true, registrations });
  } catch (error) {
    console.error('API: Error getting registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to retrieve registrations from API endpoint'
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Edge Config ID: ${edgeConfigId}`);
}); 