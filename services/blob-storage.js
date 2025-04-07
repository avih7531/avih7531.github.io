/**
 * Blob Storage service for mirroring Edge Config data
 */
const { put, list, del, get } = require('@vercel/blob');
const config = require('../config');
const path = require('path');
const fs = require('fs');
const { fetchWithRetry } = require('../utils/fetch-utils');

// For caching the last sync time
let lastSyncTime = null;
let syncInProgress = false;

// Track the current blob pathname (with the random string)
let currentBlobPathname = null;

// Blob storage configuration options with store ID and token
const blobOptions = {
  storeId: config.blob.storeId,
  token: config.blob.token
};

// Get full URL for a blob file
function getBlobUrl(filename) {
  return `${config.blob.baseUrl}/${filename}`;
}

/**
 * Check if blob mirroring is enabled
 * @returns {boolean} - Whether blob mirroring is enabled
 */
function isBlobMirroringEnabled() {
  return config.blob.enabled;
}

/**
 * Save registrations to Blob storage
 * @param {Array} registrations - Array of registrations to save
 * @returns {Promise<{url: string, success: boolean}>} - Result with URL if successful
 */
async function saveRegistrationsToBlob(registrations) {
  if (!isBlobMirroringEnabled()) {
    console.log('Blob mirroring is disabled, skipping save to blob storage');
    return { success: false, url: null };
  }

  try {
    console.log(`Saving ${registrations.length} registrations to Blob storage...`);
    
    // Convert registrations to JSON string
    const registrationsJson = JSON.stringify(registrations, null, 2);
    
    // If we have an existing blob path, try to update that one for consistency
    if (currentBlobPathname) {
      console.log(`Attempting to update existing blob: ${currentBlobPathname}`);
      try {
        // Upload to the same path
        const blob = await put(currentBlobPathname, registrationsJson, {
          contentType: config.blob.contentType, 
          access: config.blob.accessMode,
          ...blobOptions
        });
        
        console.log(`Successfully updated existing blob at: ${blob.url}`);
        
        // Update the last sync time
        lastSyncTime = new Date();
        
        return { success: true, url: blob.url, pathname: currentBlobPathname };
      } catch (updateError) {
        console.warn(`Failed to update existing blob: ${updateError.message}, will create new blob`);
        // Continue with creating a new blob
      }
    }
    
    // Upload to Vercel Blob with base filename (Vercel will add a random string)
    const blob = await put(config.blob.filename, registrationsJson, {
      contentType: config.blob.contentType, 
      access: config.blob.accessMode,
      ...blobOptions
    });
    
    console.log(`Successfully saved registrations to Blob storage at: ${blob.url}`);
    console.log(`Blob pathname: ${blob.pathname}`);
    
    // Store the new pathname for future updates
    currentBlobPathname = blob.pathname;
    
    // Update the last sync time
    lastSyncTime = new Date();
    
    return { success: true, url: blob.url, pathname: blob.pathname };
  } catch (err) {
    console.error('Error saving registrations to Blob storage:', err);
    return { success: false, url: null, error: err.message };
  }
}

/**
 * Get registrations from Blob storage
 * @returns {Promise<{data: Array, success: boolean}>} - Registrations data if successful
 */
async function getRegistrationsFromBlob() {
  if (!isBlobMirroringEnabled()) {
    console.log('Blob mirroring is disabled, skipping fetch from blob storage');
    return { success: false, data: [] };
  }

  try {
    console.log('Attempting to fetch registrations from Blob storage...');
    
    // First check if the blob exists by finding any file that starts with the filename prefix
    const blobs = await list({ ...blobOptions });
    console.log(`Found ${blobs.blobs.length} blobs in storage, looking for registration data...`);
    
    // Find any blobs that start with our filename prefix (without extension)
    const baseFilename = config.blob.filename.replace('.json', '');
    const potentialBlobs = blobs.blobs.filter(b => 
      b.pathname.startsWith(baseFilename) && b.pathname.endsWith('.json')
    );
    
    console.log(`Found ${potentialBlobs.length} potential registration blobs with pattern ${baseFilename}*.json`);
    
    if (potentialBlobs.length === 0) {
      console.log('No registrations blob found in storage');
      return { success: false, data: [], message: 'No registrations blob found' };
    }
    
    // Use the most recently uploaded blob
    const blobFile = potentialBlobs.sort((a, b) => 
      new Date(b.uploadedAt) - new Date(a.uploadedAt)
    )[0];
    
    console.log(`Using most recent blob: ${blobFile.pathname}, size: ${blobFile.size}, uploaded: ${blobFile.uploadedAt}`);
    
    // Get the blob file using its actual pathname
    const blob = await get(blobFile.pathname, { ...blobOptions });
    
    if (!blob) {
      console.log('Failed to fetch registrations blob');
      return { success: false, data: [], message: 'Failed to fetch registrations blob' };
    }
    
    // Download and parse JSON
    try {
      console.log(`Downloading blob from URL: ${blob.url}`);
      const response = await fetch(blob.url);
      
      if (!response.ok) {
        console.error(`Failed to download blob: ${response.status} ${response.statusText}`);
        return { 
          success: false, 
          data: [], 
          message: `HTTP error when downloading blob: ${response.status} ${response.statusText}` 
        };
      }
      
      const text = await response.text();
      console.log(`Received blob content (length: ${text.length})`);
      
      // Check if the content is valid JSON
      try {
        if (!text || text.trim() === '') {
          console.error('Blob content is empty');
          return { success: false, data: [], message: 'Blob content is empty' };
        }
        
        // Try to parse the JSON
        const data = JSON.parse(text);
        
        // Ensure we have an array
        if (!Array.isArray(data)) {
          console.error('Blob content is not an array');
          return { 
            success: false, 
            data: [], 
            message: 'Blob content is not an array',
            contentType: typeof data
          };
        }
        
        console.log(`Successfully parsed JSON, found ${data.length} registrations`);
        
        // Store the current blob pathname for future reference
        currentBlobPathname = blobFile.pathname;
        
        return { success: true, data };
      } catch (parseError) {
        console.error('Error parsing JSON from blob:', parseError);
        return { 
          success: false, 
          data: [], 
          message: `Error parsing JSON: ${parseError.message}`,
          contentSample: text.length > 100 ? text.substring(0, 100) + '...' : text
        };
      }
    } catch (fetchError) {
      console.error('Error fetching blob content:', fetchError);
      return { 
        success: false, 
        data: [], 
        message: `Error fetching blob: ${fetchError.message}` 
      };
    }
  } catch (err) {
    console.error('Error fetching registrations from Blob storage:', err);
    return { 
      success: false, 
      data: [], 
      message: `Error in getRegistrationsFromBlob: ${err.message}` 
    };
  }
}

/**
 * Sync registrations between Edge Config and Blob storage
 * @param {Array} [registrations] - Optional registrations to use (if already available)
 * @param {boolean} [force=false] - Force sync even if interval hasn't elapsed
 * @returns {Promise<boolean>} - Whether sync was successful
 */
async function syncRegistrationsToBlob(registrations = null, force = false) {
  if (!isBlobMirroringEnabled()) {
    return false;
  }

  // Prevent multiple syncs at once
  if (syncInProgress) {
    console.log('Sync already in progress, skipping');
    return false;
  }

  try {
    syncInProgress = true;
    
    // Check if we need to sync based on interval
    if (!force && lastSyncTime) {
      const now = new Date();
      const minutesSinceLastSync = (now - lastSyncTime) / (1000 * 60);
      
      if (minutesSinceLastSync < config.blob.syncInterval) {
        console.log(`Last sync was ${minutesSinceLastSync.toFixed(1)} minutes ago, ` +
                   `not yet reaching sync interval of ${config.blob.syncInterval} minutes`);
        syncInProgress = false;
        return false;
      }
    }
    
    console.log('Starting Edge Config to Blob storage sync...');
    
    // If registrations not provided, fetch from Edge Config
    if (!registrations) {
      try {
        // Use direct API call to get registrations from Edge Config
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
          if (response.status === 404) {
            console.log('No registrations found in Edge Config, syncing empty array');
            registrations = [];
          } else {
            throw new Error(`Edge Config response error: ${response.status}`);
          }
        } else {
          registrations = await response.json();
          console.log(`Fetched ${registrations.length} registrations from Edge Config for syncing`);
        }
      } catch (fetchError) {
        console.error('Error fetching from Edge Config for sync:', fetchError);
        syncInProgress = false;
        return false;
      }
    }
    
    // Save to Blob storage
    const result = await saveRegistrationsToBlob(registrations);
    
    syncInProgress = false;
    return result.success;
  } catch (err) {
    console.error('Error during Edge Config to Blob sync:', err);
    syncInProgress = false;
    return false;
  }
}

/**
 * Delete blob storage file
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteRegistrationsBlob() {
  if (!isBlobMirroringEnabled()) {
    return false;
  }

  try {
    console.log('Deleting registrations blob file...');
    
    // If we have a specific pathname, delete that
    if (currentBlobPathname) {
      console.log(`Deleting specific blob: ${currentBlobPathname}`);
      await del(currentBlobPathname, { ...blobOptions });
      console.log('Successfully deleted specific registrations blob');
      currentBlobPathname = null;
      return true;
    }
    
    // Otherwise try to find and delete any matching blobs
    console.log('Looking for registration blobs to delete...');
    const blobs = await list({ ...blobOptions });
    const baseFilename = config.blob.filename.replace('.json', '');
    const regBlobs = blobs.blobs.filter(b => 
      b.pathname.startsWith(baseFilename) && b.pathname.endsWith('.json')
    );
    
    if (regBlobs.length === 0) {
      console.log('No registrations blobs found to delete');
      return true;
    }
    
    console.log(`Found ${regBlobs.length} registration blobs to delete`);
    
    // Delete each found blob
    for (const blob of regBlobs) {
      console.log(`Deleting blob: ${blob.pathname}`);
      await del(blob.pathname, { ...blobOptions });
    }
    
    console.log('Successfully deleted all registration blobs');
    currentBlobPathname = null;
    return true;
  } catch (err) {
    console.error('Error deleting registrations blob:', err);
    return false;
  }
}

/**
 * Get the direct URL to the registration blob
 * @returns {string|null} - URL to the blob file or null if blob mirroring is disabled
 */
function getRegistrationBlobUrl() {
  if (!isBlobMirroringEnabled()) {
    return null;
  }
  
  // If we have a current pathname, use that
  if (currentBlobPathname) {
    return getBlobUrl(currentBlobPathname);
  }
  
  // Otherwise use the base filename (which will likely 404)
  return getBlobUrl(config.blob.filename);
}

/**
 * Save a test blob for connectivity testing
 * @param {string} filename - Name of the file to save
 * @param {any} data - Data to save
 * @returns {Promise<{success: boolean, url: string|null}>} - Result of the save
 */
async function saveTestBlob(filename, data) {
  if (!isBlobMirroringEnabled()) {
    console.log('Blob mirroring is disabled, skipping test save to blob storage');
    return { success: false, url: null, message: 'Blob mirroring is disabled' };
  }

  try {
    console.log(`Saving test data to Blob storage as ${filename}...`);
    
    // Convert data to JSON string
    const dataJson = JSON.stringify(data, null, 2);
    
    // Upload to Vercel Blob
    const blob = await put(filename, dataJson, {
      contentType: 'application/json', 
      access: 'public',
      ...blobOptions
    });
    
    console.log(`Successfully saved test data to Blob storage at: ${blob.url}`);
    console.log(`Test blob pathname: ${blob.pathname}`);
    
    return { 
      success: true, 
      url: blob.url,
      pathname: blob.pathname,
      message: 'Successfully saved test data' 
    };
  } catch (err) {
    console.error('Error saving test data to Blob storage:', err);
    return { 
      success: false, 
      url: null, 
      message: 'Error saving test data: ' + err.message,
      error: err.message
    };
  }
}

/**
 * Get a test blob for connectivity testing
 * @param {string} filename - Name of the file to retrieve
 * @returns {Promise<{data: any, success: boolean}>} - Test data if successful
 */
async function getTestBlob(filename) {
  if (!isBlobMirroringEnabled()) {
    console.log('Blob mirroring is disabled, skipping test fetch from blob storage');
    return { success: false, data: null, message: 'Blob mirroring is disabled' };
  }

  try {
    console.log(`Attempting to fetch test data from Blob storage (${filename})...`);
    
    // List blobs to find the most recent one matching our pattern
    const blobs = await list({ ...blobOptions });
    const baseFilename = filename.replace('.json', '');
    const matchingBlobs = blobs.blobs.filter(b => 
      b.pathname.startsWith(baseFilename) && b.pathname.endsWith('.json')
    );
    
    if (matchingBlobs.length === 0) {
      console.log(`No test blob found matching pattern: ${baseFilename}*.json`);
      return { success: false, data: null, message: 'Test blob not found' };
    }
    
    // Get the most recent blob
    const testBlob = matchingBlobs.sort((a, b) => 
      new Date(b.uploadedAt) - new Date(a.uploadedAt)
    )[0];
    
    console.log(`Found test blob: ${testBlob.pathname}, uploaded: ${testBlob.uploadedAt}`);
    
    // Get the blob file
    const blob = await get(testBlob.pathname, { ...blobOptions });
    
    if (!blob) {
      console.log('Failed to fetch test blob');
      return { success: false, data: null, message: 'Test blob not found' };
    }
    
    // Download and parse JSON
    try {
      console.log(`Downloading blob from URL: ${blob.url}`);
      const response = await fetch(blob.url);
      
      if (!response.ok) {
        throw new Error(`Failed to download blob: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      console.log(`Received blob content (first 100 chars): ${text.substring(0, 100)}...`);
      
      try {
        const data = JSON.parse(text);
        console.log('Successfully parsed blob data:', data);
        return { success: true, data, message: 'Successfully retrieved test data' };
      } catch (parseError) {
        console.error('Error parsing blob JSON:', parseError);
        return { 
          success: false, 
          data: null,
          rawData: text.length > 100 ? text.substring(0, 100) + '...' : text,
          message: 'Error parsing blob data: ' + parseError.message
        };
      }
    } catch (fetchError) {
      console.error('Error fetching blob content:', fetchError);
      return { 
        success: false, 
        data: null, 
        message: 'Error fetching blob content: ' + fetchError.message
      };
    }
  } catch (err) {
    console.error('Error fetching test data from Blob storage:', err);
    return { 
      success: false, 
      data: null, 
      message: 'Error fetching test data: ' + err.message,
      error: err.message
    };
  }
}

/**
 * List all blobs in the store
 * @returns {Promise<{blobs: Array, success: boolean}>} - List of blobs
 */
async function listBlobs() {
  if (!isBlobMirroringEnabled()) {
    console.log('Blob mirroring is disabled, skipping blob listing');
    return { success: false, blobs: [], message: 'Blob mirroring is disabled' };
  }

  try {
    console.log('Listing blobs in storage...');
    
    // List all blobs
    const listResult = await list({ ...blobOptions });
    
    console.log(`Found ${listResult.blobs.length} blobs in storage`);
    return { success: true, blobs: listResult.blobs, message: 'Successfully listed blobs' };
  } catch (err) {
    console.error('Error listing blobs from storage:', err);
    return { 
      success: false, 
      blobs: [], 
      message: 'Error listing blobs: ' + err.message,
      error: err.message
    };
  }
}

module.exports = {
  saveRegistrationsToBlob,
  getRegistrationsFromBlob,
  syncRegistrationsToBlob,
  deleteRegistrationsBlob,
  isBlobMirroringEnabled,
  getRegistrationBlobUrl,
  saveTestBlob,
  getTestBlob,
  listBlobs
}; 