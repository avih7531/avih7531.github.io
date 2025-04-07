/**
 * Edge Config service for data storage and retrieval
 */
const { createClient } = require('@vercel/edge-config');
const config = require('../config');
const { fetchWithRetry } = require('../utils/fetch-utils');

// Edge Config client
let edgeConfigClient = null;
let isEdgeConfigAvailable = false;

/**
 * Initialize Edge Config client
 * @returns {boolean} - Whether initialization was successful
 */
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
          edgeConfigClient = createClient(config.edgeConfig.id, { token: config.edgeConfig.token });
          console.log('Edge Config client initialized using direct parameters');
          return true;
        } catch (directError) {
          console.log('Failed to initialize with direct parameters:', directError.message);
          
          // Third attempt: Using a different parameter format
          try {
            edgeConfigClient = createClient({ connectionString: config.edgeConfig.connectionString() });
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

/**
 * Get registrations from Edge Config
 * @returns {Promise<Array>} - Array of registrations
 */
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
        
        // Add default donation fields to registrations that don't have them
        const normalizedData = Array.isArray(data) ? data.map(reg => {
          // Ensure each registration has donation fields
          if (reg.hasDonated === undefined) {
            reg.hasDonated = false;
          }
          if (reg.donationAmount === undefined) {
            reg.donationAmount = "0.00";
          }
          return reg;
        }) : [];
        
        return normalizedData;
      } catch (sdkError) {
        console.log('SDK method failed, falling back to direct API call:', sdkError.message);
        // Fall through to direct API call
      }
    }

    // Fallback to direct API call with retries
    console.log('Fetching registrations directly from Edge Config API...');
    const response = await fetchWithRetry(
      `${config.edgeConfig.url()}/item/passover_registrations?token=${config.edgeConfig.token}`,
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
    
    // Add default donation fields to registrations that don't have them
    const normalizedData = Array.isArray(data) ? data.map(reg => {
      // Ensure each registration has donation fields
      if (reg.hasDonated === undefined) {
        reg.hasDonated = false;
      }
      if (reg.donationAmount === undefined) {
        reg.donationAmount = "0.00";
      }
      return reg;
    }) : [];
    
    return normalizedData;
  } catch (err) {
    console.log('Edge Config fetch error:', err.message);
    throw new Error('Unable to fetch data from Edge Config');
  }
}

/**
 * Save registrations to Edge Config
 * @param {Array} registrations - Array of registrations to save
 * @returns {Promise<boolean>} - Whether save was successful
 */
async function saveRegistrationsToEdgeConfig(registrations) {
  try {
    console.log(`Attempting to save ${registrations.length} registrations to Edge Config...`);
    
    // Try using the SDK client first
    if (edgeConfigClient) {
      try {
        await edgeConfigClient.set('passover_registrations', registrations);
        console.log('Successfully saved registrations using SDK');
        return true;
      } catch (sdkError) {
        console.warn('SDK save failed, falling back to direct API:', sdkError.message);
        // Fall through to direct API call
      }
    }
    
    // Fallback to direct API call with retries
    console.log('Saving registrations using Vercel API...');
    const updateResponse = await fetchWithRetry(
      `https://api.vercel.com/v1/edge-config/${config.edgeConfig.id}/items`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${config.vercel.apiToken}`,
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
      const errorText = await updateResponse.text();
      console.error(`Error saving registrations: ${updateResponse.status} - ${errorText}`);
      throw new Error(`Failed to save registrations: ${updateResponse.status}`);
    }
    
    console.log('Successfully saved registrations using Vercel API');
    return true;
  } catch (err) {
    console.error('Edge Config save error:', err);
    throw new Error('Failed to save data to Edge Config');
  }
}

/**
 * Get registrations (wrapper function)
 * @returns {Promise<Array>} - Array of registrations
 */
async function getRegistrations() {
  // Ensure the Edge Config client is initialized
  if (!isEdgeConfigAvailable) {
    try {
      isEdgeConfigAvailable = await initializeEdgeConfig();
    } catch (error) {
      console.error('Failed to initialize Edge Config during getRegistrations():', error);
      throw new Error('Edge Config initialization failed');
    }
  }
  
  return getRegistrationsFromEdgeConfig();
}

/**
 * Save registrations (wrapper function)
 * @param {Array} registrations - Array of registrations to save
 * @returns {Promise<boolean>} - Whether save was successful
 */
async function saveRegistrations(registrations) {
  // Ensure the Edge Config client is initialized
  if (!isEdgeConfigAvailable) {
    try {
      isEdgeConfigAvailable = await initializeEdgeConfig();
    } catch (error) {
      console.error('Failed to initialize Edge Config during saveRegistrations():', error);
      throw new Error('Edge Config initialization failed');
    }
  }
  
  return saveRegistrationsToEdgeConfig(registrations);
}

/**
 * Initialize Edge Config with retries
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
async function initializeEdgeConfig() {
  console.log('Initializing Edge Config...');
  
  // Try to initialize the client
  const clientInitialized = initEdgeConfigClient();
  if (!clientInitialized) {
    console.warn('Failed to initialize Edge Config client, will retry');
  } else {
    console.log('Edge Config client initialized successfully');
  }
  
  // Even if client init failed, test Edge Config connectivity
  try {
    // Attempt a test read
    await getRegistrationsFromEdgeConfig();
    console.log('Edge Config test read successful');
    isEdgeConfigAvailable = true;
    return true;
  } catch (error) {
    console.error('Edge Config test read failed:', error.message);
    isEdgeConfigAvailable = false;
    throw error;
  }
}

/**
 * Test Edge Config with multiple attempts
 * @param {number} maxAttempts - Maximum number of attempts
 * @returns {Promise<boolean>} - Whether test was successful
 */
async function testEdgeConfig(maxAttempts = 5) {
  console.log(`Testing Edge Config connectivity (max ${maxAttempts} attempts)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxAttempts}: Initializing Edge Config...`);
      
      // Try to initialize the client
      const clientInitialized = initEdgeConfigClient();
      
      if (!clientInitialized) {
        console.warn(`Attempt ${attempt}: Client initialization failed`);
        
        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 300; // Exponential backoff
          console.log(`Waiting ${delay}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        return false;
      }
      
      // Test with an actual read operation
      console.log(`Attempt ${attempt}: Testing Edge Config read operation...`);
      await getRegistrationsFromEdgeConfig();
      
      console.log('Edge Config test successful!');
      isEdgeConfigAvailable = true;
      return true;
    } catch (error) {
      console.error(`Attempt ${attempt}: Edge Config test failed:`, error.message);
      
      // If not the last attempt, wait before retrying
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 300; // Exponential backoff
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`All ${maxAttempts} attempts failed. Edge Config is unavailable.`);
        isEdgeConfigAvailable = false;
        return false;
      }
    }
  }
  
  return false;
}

/**
 * Ensure all registrations have donation fields
 * @returns {Promise<boolean>} - Whether migration was successful
 */
async function migrateRegistrationsWithDonationFields() {
  console.log('Starting migration to ensure all registrations have donation fields...');
  
  try {
    // Get all registrations
    let registrations;
    
    // Try using the SDK client first
    if (edgeConfigClient) {
      try {
        const data = await edgeConfigClient.get('passover_registrations');
        if (data === null || data === undefined) {
          console.log('No registrations to migrate');
          return true;
        }
        registrations = Array.isArray(data) ? data : [];
      } catch (sdkError) {
        console.warn('SDK failed when getting registrations for migration:', sdkError.message);
        
        // Fallback to API
        const response = await fetchWithRetry(
          `${config.edgeConfig.url()}/item/passover_registrations?token=${config.edgeConfig.token}`,
          { method: 'GET' }
        );
        
        if (!response.ok) {
          if (response.status === 404) {
            console.log('No registrations to migrate');
            return true;
          }
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        registrations = Array.isArray(data) ? data : [];
      }
    }
    
    console.log(`Found ${registrations.length} registrations to check for migration`);
    
    // Track if any registrations need updating
    let needsMigration = false;
    
    // Update any registrations missing donation fields
    registrations.forEach(reg => {
      let updated = false;
      
      if (reg.hasDonated === undefined) {
        reg.hasDonated = false;
        updated = true;
      }
      
      if (reg.donationAmount === undefined) {
        reg.donationAmount = "0.00";
        updated = true;
      }
      
      if (updated) {
        needsMigration = true;
      }
    });
    
    // If any registrations were updated, save them back
    if (needsMigration) {
      console.log('Migrating registrations with donation fields...');
      
      // Try SDK first
      if (edgeConfigClient) {
        try {
          await edgeConfigClient.set('passover_registrations', registrations);
          console.log('Successfully migrated registrations using SDK');
          return true;
        } catch (saveError) {
          console.warn('SDK failed to save migrated registrations:', saveError.message);
          // Fall through to API method
        }
      }
      
      // Fallback to API
      const updateResponse = await fetchWithRetry(
        `https://api.vercel.com/v1/edge-config/${config.edgeConfig.id}/items`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${config.vercel.apiToken}`,
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
      
      if (updateResponse.ok) {
        console.log('Successfully migrated registrations using API');
        return true;
      } else {
        console.error('Failed to migrate registrations:', updateResponse.status);
        return false;
      }
    } else {
      console.log('No registrations need migration, all have donation fields');
      return true;
    }
  } catch (error) {
    console.error('Error during registration migration:', error);
    return false;
  }
}

module.exports = {
  initEdgeConfigClient,
  getRegistrations,
  saveRegistrations,
  initializeEdgeConfig,
  testEdgeConfig,
  migrateRegistrationsWithDonationFields,
  isEdgeConfigAvailable: () => isEdgeConfigAvailable
}; 