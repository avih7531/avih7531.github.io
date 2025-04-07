/**
 * Edge Config service for data storage and retrieval
 */
const { createClient } = require('@vercel/edge-config');
const config = require('../config');
const { fetchWithRetry } = require('../utils/fetch-utils');
const fs = require('fs');
const path = require('path');
const blobStorage = require('./blob-storage');
const fetch = require('node-fetch');

// Edge Config client
let edgeConfigClient = null;
let edgeConfigAvailable = false;
let edgeConfigInitialized = false;
let isEdgeConfigInitializing = false;

// Local fallback file path
const LOCAL_FALLBACK_FILE = path.join(__dirname, '..', 'data', 'passover-registrations.json');

// Count consecutive Edge Config failures
let edgeConfigFailureCount = 0;
const EDGE_CONFIG_FAILURE_THRESHOLD = config.edge?.failureThreshold || 3;

// Ensure data directory exists
try {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created local data directory for fallback storage');
  }
  
  // Create empty fallback file if it doesn't exist
  if (!fs.existsSync(LOCAL_FALLBACK_FILE)) {
    fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify([], null, 2), 'utf8');
    console.log('Created empty fallback file for registrations');
  }
} catch (err) {
  console.error('Failed to create data directory or fallback file:', err);
}

/**
 * Initialize Edge Config client
 * @returns {boolean} - Whether initialization was successful
 */
function initEdgeConfigClient() {
  try {
    // Only create the client if it doesn't exist yet
    if (!edgeConfigClient) {
      console.log('Initializing Edge Config client...');
      
      // Check if required environment variables are set
      if (!config.edgeConfig.id || !config.edgeConfig.token) {
        console.error('Missing Edge Config credentials:',
                     { 
                       'id': config.edgeConfig.id ? 'Set' : 'Missing',
                       'token': config.edgeConfig.token ? 'Set' : 'Missing'
                     });
        return false;
      }
      
      // Log connection details (without revealing full token)
      console.log('Edge Config connection details:', {
        id: config.edgeConfig.id,
        tokenPrefix: config.edgeConfig.token.substring(0, 4) + '...',
        connectionString: config.edgeConfig.connectionString().replace(/token=[^&]+/, 'token=REDACTED')
      });
      
      try {
        // First attempt: Using the connection string from env variable
        console.log('Attempting to initialize with EDGE_CONFIG environment variable...');
        if (!process.env.EDGE_CONFIG) {
          console.log('EDGE_CONFIG environment variable is not set, setting it now');
          process.env.EDGE_CONFIG = config.edgeConfig.connectionString();
        }
        
        edgeConfigClient = createClient();
        console.log('Edge Config client initialized using environment variable');
        return true;
      } catch (envError) {
        console.log('Failed to initialize with environment variable:', envError.message);
        console.log('SDK Error details:', {
          name: envError.name,
          message: envError.message,
          stack: envError.stack ? envError.stack.split('\n')[0] : 'No stack trace'
        });
        
        try {
          // Second attempt: Using direct parameters
          console.log('Attempting to initialize with direct parameters...');
          edgeConfigClient = createClient(config.edgeConfig.id, { token: config.edgeConfig.token });
          console.log('Edge Config client initialized using direct parameters');
          return true;
        } catch (directError) {
          console.log('Failed to initialize with direct parameters:', directError.message);
          console.log('SDK Error details:', {
            name: directError.name,
            message: directError.message,
            stack: directError.stack ? directError.stack.split('\n')[0] : 'No stack trace'
          });
          
          // Third attempt: Using a different parameter format
          try {
            console.log('Attempting to initialize with connection string object...');
            const connectionString = config.edgeConfig.connectionString();
            console.log('Using connection string (redacted):', 
                      connectionString.replace(/token=[^&]+/, 'token=REDACTED'));
                      
            edgeConfigClient = createClient({ connectionString });
            console.log('Edge Config client initialized using connection string object');
            return true;
          } catch (connectionStringError) {
            console.error('All SDK initialization attempts failed:', connectionStringError.message);
            console.log('SDK Error details:', {
              name: connectionStringError.name,
              message: connectionStringError.message,
              stack: connectionStringError.stack ? connectionStringError.stack.split('\n')[0] : 'No stack trace'
            });
            
            // Final attempt: Manually create a minimal client for API calls
            console.log('Creating a minimal client for API calls only...');
            edgeConfigClient = {
              get: async (key) => {
                console.log(`Manual API call to get key: ${key}`);
                const response = await fetchWithRetry(
                  `${config.edgeConfig.url()}/item/${key}?token=${config.edgeConfig.token}`,
                  { method: 'GET', headers: { 'Accept': 'application/json' } }
                );
                
                if (!response.ok) {
                  if (response.status === 404) return null;
                  throw new Error(`API error: ${response.status}`);
                }
                
                return response.json();
              },
              set: async (key, value) => {
                console.log(`Manual API call to set key: ${key}`);
                const response = await fetchWithRetry(
                  `${config.edgeConfig.url()}/items?token=${config.edgeConfig.token}`,
                  {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      items: [{ operation: 'upsert', key, value }]
                    })
                  }
                );
                
                if (!response.ok) {
                  throw new Error(`API error: ${response.status}`);
                }
              }
            };
            
            console.log('Created minimal API-based client');
            return true;
          }
        }
      }
    }
    return edgeConfigClient !== null;
  } catch (err) {
    console.error('Unhandled error in Edge Config client initialization:', err);
    edgeConfigClient = null;
    return false;
  }
}

/**
 * Get registrations from local storage
 * @returns {Promise<Array>} - Array of registrations
 */
async function getRegistrationsFromLocalStorage() {
  try {
    console.log('Attempting to read registrations from local storage fallback...');
    if (!fs.existsSync(LOCAL_FALLBACK_FILE)) {
      console.log('No local fallback file found, returning empty array');
      return [];
    }
    
    const data = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8'));
    console.log(`Read ${data.length} registrations from local storage`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error reading from local storage:', err);
    return [];
  }
}

/**
 * Save registrations to local storage
 * @param {Array} registrations - Array of registrations to save
 * @returns {Promise<boolean>} - Whether save was successful
 */
async function saveRegistrationsToLocalStorage(registrations) {
  try {
    console.log(`Saving ${registrations.length} registrations to local storage fallback...`);
    fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify(registrations, null, 2), 'utf8');
    console.log('Successfully saved registrations to local storage');
    return true;
  } catch (err) {
    console.error('Error saving to local storage:', err);
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
        
        // Also save to local storage as backup
        await saveRegistrationsToLocalStorage(normalizedData);
        
        // Mirror to blob storage if enabled
        if (blobStorage.isBlobMirroringEnabled()) {
          blobStorage.syncRegistrationsToBlob(normalizedData);
        }
        
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
    
    // Also save to local storage as backup
    await saveRegistrationsToLocalStorage(normalizedData);
    
    // Mirror to blob storage if enabled
    if (blobStorage.isBlobMirroringEnabled()) {
      blobStorage.syncRegistrationsToBlob(normalizedData);
    }
    
    return normalizedData;
  } catch (err) {
    console.log('Edge Config fetch error:', err.message);
    
    // Try blob storage first if enabled
    if (blobStorage.isBlobMirroringEnabled()) {
      console.log('Attempting to fetch from Blob storage...');
      const blobResult = await blobStorage.getRegistrationsFromBlob();
      
      if (blobResult.success && blobResult.data.length > 0) {
        console.log(`Retrieved ${blobResult.data.length} registrations from Blob storage`);
        return blobResult.data;
      }
      
      console.log('Blob storage retrieval unsuccessful, trying local storage...');
    }
    
    // Try local storage as last resort
    console.log('Falling back to local storage for registrations...');
    return await getRegistrationsFromLocalStorage();
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
    
    // Always save to local storage first as backup
    await saveRegistrationsToLocalStorage(registrations);
    
    // Mirror to blob storage if enabled
    if (blobStorage.isBlobMirroringEnabled()) {
      blobStorage.syncRegistrationsToBlob(registrations, true);
    }
    
    // Try using the SDK client first
    if (edgeConfigClient) {
      try {
        await edgeConfigClient.set('passover_registrations', registrations);
        console.log('Successfully saved registrations using SDK');
        return true;
      } catch (sdkError) {
        console.warn('SDK save failed, falling back to direct API:', sdkError.message);
        // Check if it's a size limitation error
        if (sdkError.message && (sdkError.message.includes('too large') || sdkError.message.includes('size limit'))) {
          console.warn('Edge Config size limit reached, will use Blob storage as primary storage');
          edgeConfigAvailable = false;
          return true; // Still return success since we've saved to Blob and local storage
        }
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
      
      // Check if it's a size limitation error
      if (errorText && (errorText.includes('too large') || errorText.includes('size limit'))) {
        console.warn('Edge Config size limit reached, will use Blob storage as primary storage');
        edgeConfigAvailable = false;
        return true; // Still return success since we've saved to Blob and local storage
      }
      
      throw new Error(`Failed to save registrations: ${updateResponse.status}`);
    }
    
    console.log('Successfully saved registrations using Vercel API');
    return true;
  } catch (err) {
    console.error('Edge Config save error:', err);
    
    // If we've already saved to local storage and blob, we can still return success
    console.log('Using local/blob storage fallback for registration data');
    return true;
  }
}

/**
 * Get registrations (wrapper function)
 * @returns {Promise<Array>} - Array of registrations
 */
async function getRegistrations() {
  try {
    // First, always save to localStorage for redundancy
    const localRegistrations = await getRegistrationsFromLocalStorage();
    
    // If we've exceeded the failure threshold and blob mirroring is enabled, prioritize blob storage
    if (edgeConfigFailureCount >= EDGE_CONFIG_FAILURE_THRESHOLD && blobStorage.isBlobMirroringEnabled()) {
      console.log(`Edge Config has failed ${edgeConfigFailureCount} consecutive times. Trying Blob storage first.`);
      
      try {
        const blobResult = await blobStorage.getRegistrationsFromBlob();
        if (blobResult.success) {
          console.log('Successfully retrieved registrations from Blob storage');
          // Reset the failure count if we successfully used the blob storage as fallback
          edgeConfigFailureCount = 0;
          return blobResult;
        }
      } catch (error) {
        console.error('Error retrieving from Blob storage:', error);
      }
    }
    
    // Ensure the Edge Config client is initialized
    if (!edgeConfigAvailable) {
      try {
        edgeConfigAvailable = await initializeEdgeConfig();
        // Reset failure count on successful initialization
        if (edgeConfigAvailable) {
          edgeConfigFailureCount = 0;
        }
      } catch (error) {
        console.warn('Edge Config unavailable, will try using local storage fallback:', error.message);
        edgeConfigFailureCount++; // Increment failure counter
        
        // Try blob storage first if enabled
        if (blobStorage.isBlobMirroringEnabled()) {
          console.log('Attempting to fetch from Blob storage...');
          const blobResult = await blobStorage.getRegistrationsFromBlob();
          
          if (blobResult.success && blobResult.data.length > 0) {
            console.log(`Retrieved ${blobResult.data.length} registrations from Blob storage`);
            return blobResult;
          }
          
          console.log('Blob storage retrieval unsuccessful, trying local storage...');
        }
        
        // Even though Edge Config is unavailable, we can still try to use local storage
        return { success: true, data: localRegistrations, message: 'Using local storage fallback' };
      }
    }
    
    try {
      const registrations = await getRegistrationsFromEdgeConfig();
      // Reset failure count on successful retrieval
      edgeConfigFailureCount = 0;
      return { success: true, data: registrations, message: 'Using Edge Config' };
    } catch (error) {
      console.error('Error retrieving from Edge Config:', error.message);
      edgeConfigFailureCount++; // Increment failure counter
      
      // Log the failure count
      console.warn(`Edge Config has failed ${edgeConfigFailureCount} times in a row`);
      
      // Try blob storage if enabled
      if (blobStorage.isBlobMirroringEnabled()) {
        console.log('Attempting to fetch from Blob storage after Edge Config failure...');
        const blobResult = await blobStorage.getRegistrationsFromBlob();
        
        if (blobResult.success && blobResult.data.length > 0) {
          console.log(`Retrieved ${blobResult.data.length} registrations from Blob storage`);
          return { success: true, data: blobResult.data, message: 'Using Blob storage as fallback' };
        }
        
        console.log('Blob storage retrieval unsuccessful, trying local storage...');
      }
      
      // Final fallback to local storage
      console.log('Falling back to local storage after error');
      return { success: true, data: localRegistrations, message: 'Using local storage fallback' };
    }
  } catch (error) {
    console.error('Error in getRegistrations:', error.message);
    edgeConfigFailureCount++; // Increment failure counter
    
    // Final fallback to local storage
    console.log('Falling back to local storage after error');
    return { success: false, data: await getRegistrationsFromLocalStorage(), message: 'Error in getRegistrations' };
  }
}

/**
 * Save registrations (wrapper function)
 * @param {Array} registrations - Array of registrations to save
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function saveRegistrations(registrations) {
  try {
    // First, always save to localStorage for redundancy
    await saveRegistrationsToLocalStorage(registrations);
    
    // If we've exceeded the failure threshold and blob mirroring is enabled, prioritize blob storage
    if (edgeConfigFailureCount >= EDGE_CONFIG_FAILURE_THRESHOLD && blobStorage.isBlobMirroringEnabled()) {
      console.log(`Edge Config has failed ${edgeConfigFailureCount} consecutive times. Saving to Blob storage first.`);
      
      try {
        const blobResult = await blobStorage.saveRegistrationsToBlob(registrations);
        
        // Even if Blob storage succeeded, try to reinitialize Edge Config in the background
        if (!isEdgeConfigInitialized && !isEdgeConfigInitializing) {
          console.log('Trying to reinitialize Edge Config in the background...');
          initializeEdgeConfig().catch(error => {
            console.warn('Failed to reinitialize Edge Config:', error);
            edgeConfigFailureCount++; // Increment failure count if reinitialization fails
          });
        }
        
        if (blobResult.success) {
          return { success: true, message: 'Successfully saved registrations to Blob storage' };
        }
      } catch (error) {
        console.error('Failed to save to Blob storage:', error);
      }
    }
    
    // Ensure the Edge Config client is initialized
    if (!edgeConfigAvailable) {
      try {
        edgeConfigAvailable = await initializeEdgeConfig();
        // Reset failure count on successful initialization
        if (edgeConfigAvailable) {
          edgeConfigFailureCount = 0;
        }
      } catch (error) {
        console.warn('Edge Config unavailable, will save to local storage only:', error.message);
        edgeConfigFailureCount++; // Increment failure counter
        
        // Try to save to Blob storage if enabled
        if (blobStorage.isBlobMirroringEnabled()) {
          console.log('Attempting to save to Blob storage instead...');
          const blobResult = await blobStorage.saveRegistrationsToBlob(registrations);
          
          if (blobResult.success) {
            console.log('Successfully saved registrations to Blob storage');
            return { success: true, message: 'Successfully saved registrations to Blob storage' };
          }
          
          console.log('Blob storage save unsuccessful, data is still saved to local storage');
        }
        
        // Even though Edge Config is unavailable, we already saved to local storage
        return { success: true, message: 'Successfully saved registrations to local storage' };
      }
    }
    
    try {
      const success = await saveRegistrationsToEdgeConfig(registrations);
      // Reset failure count on successful save
      if (success) {
        edgeConfigFailureCount = 0;
      }
      return { success: true, message: 'Successfully saved registrations to Edge Config' };
    } catch (error) {
      console.error('Error saving to Edge Config:', error.message);
      edgeConfigFailureCount++; // Increment failure counter
      
      // Log the failure count
      console.warn(`Edge Config has failed ${edgeConfigFailureCount} times in a row`);
      
      // Try to save to Blob storage if enabled
      if (blobStorage.isBlobMirroringEnabled()) {
        console.log('Attempting to save to Blob storage after Edge Config failure...');
        const blobResult = await blobStorage.saveRegistrationsToBlob(registrations);
        
        if (blobResult.success) {
          console.log('Successfully saved registrations to Blob storage');
          return { success: true, message: 'Successfully saved registrations to Blob storage' };
        }
        
        console.log('Blob storage save unsuccessful, data is still saved to local storage');
      }
      
      // We've already saved to local storage, so consider it a partial success
      return { success: true, message: 'Successfully saved registrations to local storage' };
    }
  } catch (error) {
    console.error('Error in saveRegistrations:', error.message);
    edgeConfigFailureCount++; // Increment failure counter
    
    // We've already saved to local storage, so consider it a partial success
    console.log('Falling back to local storage after error');
    return { success: false, message: 'Error in saveRegistrations' };
  }
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
    console.warn('Failed to initialize Edge Config client, will try fallback');
  } else {
    console.log('Edge Config client initialized successfully');
  }
  
  // Even if client init failed, test Edge Config connectivity
  try {
    // Attempt a test read
    await getRegistrationsFromEdgeConfig();
    console.log('Edge Config test read successful');
    edgeConfigAvailable = true;
    return true;
  } catch (error) {
    console.error('Edge Config test read failed:', error.message);
    console.log('Switching to local file fallback mode');
    
    // Check if we can read from the local fallback
    try {
      if (fs.existsSync(LOCAL_FALLBACK_FILE)) {
        console.log('Local fallback file exists, will use for storage');
        // Mark Edge Config as unavailable but return success
        // since we can operate with the fallback
        edgeConfigAvailable = false;
        return true;
      } else {
        console.warn('Local fallback file does not exist, creating empty one');
        fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify([], null, 2), 'utf8');
        edgeConfigAvailable = false;
        return true;
      }
    } catch (fallbackError) {
      console.error('Failed to use local fallback:', fallbackError);
      edgeConfigAvailable = false;
      throw new Error('Edge Config unavailable and local fallback failed');
    }
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
      edgeConfigAvailable = true;
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
        edgeConfigAvailable = false;
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

/**
 * Check if Edge Config is available
 * @returns {boolean} - Whether Edge Config is available
 */
function isEdgeConfigAvailable() {
  return edgeConfigAvailable;
}

/**
 * Returns the current failure count for Edge Config
 * @returns {number} The number of consecutive Edge Config failures
 */
function getFailureCount() {
  return edgeConfigFailureCount;
}

/**
 * Gets the count of registrations from Edge Config
 * @returns {Promise<number>} The number of registrations or 0 if unavailable
 */
async function getRegistrationCount() {
  try {
    if (!edgeConfigAvailable) {
      console.log('Edge Config not available for getting registration count');
      return 0;
    }

    if (!edgeConfigClient) {
      console.log('Edge Config client not initialized for getting registration count');
      return 0;
    }

    const registrations = await edgeConfigClient.get('registrations');
    return Array.isArray(registrations) ? registrations.length : 0;
  } catch (error) {
    console.error('Error getting registration count from Edge Config:', error.message);
    return 0;
  }
}

/**
 * Save a test key for connectivity testing
 * @param {string} key - Key to save
 * @param {any} value - Value to save
 * @returns {Promise<boolean>} - Whether save was successful
 */
async function saveTestKey(key, value) {
  if (!edgeConfigClient) {
    // Try to initialize if not already done
    const initialized = initEdgeConfigClient();
    if (!initialized) {
      throw new Error('Unable to initialize Edge Config client for test');
    }
  }
  
  // First try SDK method
  try {
    await edgeConfigClient.set(key, value);
    console.log(`Successfully saved test key ${key} using SDK`);
    return true;
  } catch (sdkError) {
    console.log(`SDK method failed for test key ${key}, falling back to API:`, sdkError.message);
    
    // Fall back to direct API call
    const updateResponse = await fetchWithRetry(
      `${config.edgeConfig.url()}/items?token=${config.edgeConfig.token}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{
            operation: 'upsert',
            key: key,
            value: value
          }]
        })
      }
    );
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`Error saving test key ${key}: ${updateResponse.status} - ${errorText}`);
      throw new Error(`Failed to save test key: ${updateResponse.status}`);
    }
    
    console.log(`Successfully saved test key ${key} using API`);
    return true;
  }
}

/**
 * Get a test key for connectivity testing
 * @param {string} key - Key to get
 * @returns {Promise<any>} - Value of the key
 */
async function getTestKey(key) {
  if (!edgeConfigClient) {
    // Try to initialize if not already done
    const initialized = initEdgeConfigClient();
    if (!initialized) {
      throw new Error('Unable to initialize Edge Config client for test');
    }
  }
  
  // First try SDK method
  try {
    const value = await edgeConfigClient.get(key);
    console.log(`Successfully retrieved test key ${key} using SDK`);
    return value;
  } catch (sdkError) {
    console.log(`SDK method failed for test key ${key}, falling back to API:`, sdkError.message);
    
    // Fall back to direct API call
    const response = await fetchWithRetry(
      `${config.edgeConfig.url()}/item/${key}?token=${config.edgeConfig.token}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Test key ${key} not found in Edge Config`);
        return null;
      }
      throw new Error(`Edge Config response error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Successfully retrieved test key ${key} using API`);
    return data;
  }
}

/**
 * Manually set the Edge Config failure count
 * @param {number} count - The new failure count
 */
function setFailureCount(count) {
  console.log(`Manually setting Edge Config failure count to ${count}`);
  edgeConfigFailureCount = count;
  
  // If count is high, mark as unavailable
  if (count >= EDGE_CONFIG_FAILURE_THRESHOLD) {
    edgeConfigAvailable = false;
    console.log('Marking Edge Config as unavailable due to high failure count');
  } else if (count === 0) {
    // If count is reset, try to mark as available
    if (edgeConfigClient) {
      edgeConfigAvailable = true;
      console.log('Marking Edge Config as available after failure count reset');
    }
  }
}

/**
 * Manually mark Edge Config as unavailable
 */
function markEdgeConfigAsUnavailable() {
  console.log('Manually marking Edge Config as unavailable');
  edgeConfigAvailable = false;
  edgeConfigFailureCount = EDGE_CONFIG_FAILURE_THRESHOLD;
}

module.exports = {
  initEdgeConfigClient,
  getRegistrations,
  saveRegistrations,
  initializeEdgeConfig,
  testEdgeConfig,
  migrateRegistrationsWithDonationFields,
  isEdgeConfigAvailable,
  getFailureCount,
  getRegistrationCount,
  getRegistrationsFromLocalStorage,
  saveRegistrationsToLocalStorage,
  saveTestKey,
  getTestKey,
  setFailureCount,
  markEdgeConfigAsUnavailable
}; 