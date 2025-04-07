/**
 * Registration routes for the application
 */
const express = require('express');
const router = express.Router();
const path = require('path');

const registrationService = require('../services/registration');
const edgeConfig = require('../services/edge-config');
const blobStorage = require('../services/blob-storage');
const config = require('../config');

/**
 * Store a new Passover registration
 */
router.post('/store-passover-registration', async (req, res) => {
  try {
    // Check if Edge Config is available, if not, try to initialize it first
    if (!edgeConfig.isEdgeConfigAvailable()) {
      console.warn('Edge Config unavailable on registration attempt - trying to initialize...');
      try {
        // Increased to 3 retry attempts with a more descriptive message
        const edgeConfigWorking = await edgeConfig.testEdgeConfig(3);
        
        if (!edgeConfigWorking) {
          console.log('Edge Config unavailable, will continue with local fallback storage');
          // Continue with registration - we'll use local fallback storage
        } else {
          console.log('Edge Config successfully initialized during registration attempt');
          // Edge Config is now available, continue with the registration
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during registration:', initError);
        console.log('Continuing with local fallback storage');
        // Continue with registration using local fallback
      }
    }

    const registration = req.body;
    console.log('Received registration:', registration);
    
    // Store the registration
    const storedRegistration = await registrationService.storeRegistration(registration);
    
    res.json({
      success: true,
      message: 'Registration saved successfully',
      registration: storedRegistration
    });
  } catch (error) {
    console.error('Error processing registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process registration: ' + error.message
    });
  }
});

/**
 * Get Passover registrations (all or by ID)
 */
router.get('/get-passover-registrations', async (req, res) => {
  try {
    // Check if Edge Config is available, if not, try to initialize it
    if (!edgeConfig.isEdgeConfigAvailable()) {
      console.warn('Edge Config unavailable for get-passover-registrations - trying to initialize...');
      try {
        const edgeConfigWorking = await edgeConfig.testEdgeConfig(3);
        
        if (!edgeConfigWorking) {
          console.log('Edge Config unavailable, will continue with local fallback');
          // Continue with local fallback - the registration service will handle it
        } else {
          console.log('Edge Config successfully initialized');
        }
      } catch (initError) {
        console.error('Error initializing Edge Config:', initError);
        console.log('Continuing with local fallback');
        // Continue with local fallback - the registration service will handle it
      }
    }
    
    const registrationId = req.query.id;
    
    // If an ID is provided, get a specific registration
    if (registrationId) {
      console.log(`Getting registration by ID: ${registrationId}`);
      
      const registration = await registrationService.getRegistrationById(registrationId);
      
      if (registration) {
        return res.json({
          success: true,
          registration: registration
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Registration not found'
        });
      }
    }
    
    // Otherwise, get all registrations
    console.log('Getting all registrations');
    
    const registrations = await registrationService.getAllRegistrations();
    
    res.json({
      success: true,
      registrations: registrations
    });
  } catch (error) {
    console.error('Error getting registrations:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve registrations: ' + error.message
    });
  }
});

/**
 * Get a registration by ID (different endpoint format)
 */
router.get('/registration/:id', async (req, res) => {
  try {
    const registrationId = req.params.id;
    console.log(`Getting registration by path parameter: ${registrationId}`);
    
    // For debugging, log request details
    console.log('Request details:', {
      registrationId,
      path: req.path,
      url: req.url,
      host: req.headers.host,
      referrer: req.headers.referer
    });
    
    // Check if Edge Config is available
    if (!edgeConfig.isEdgeConfigAvailable()) {
      console.warn('Edge Config unavailable on registration lookup - trying to initialize...');
      try {
        const edgeConfigWorking = await edgeConfig.testEdgeConfig(3);
        
        if (!edgeConfigWorking) {
          console.log('Edge Config unavailable for lookup, will continue with local fallback');
          // Continue with local fallback - don't return an error
        } else {
          console.log('Edge Config successfully initialized during registration lookup');
        }
      } catch (initError) {
        console.error('Error initializing Edge Config during registration lookup:', initError);
        console.log('Continuing with local fallback for registration lookup');
        // Continue with local fallback - don't return an error
      }
    }
    
    // Try to get the registration
    let registrations;
    let retryAttempts = 3;
    
    // Retry loop for getting registrations with error handling
    while (retryAttempts > 0) {
      try {
        registrations = await registrationService.getAllRegistrations();
        break; // Success, exit the loop
      } catch (error) {
        retryAttempts--;
        console.error(`Error getting registrations, attempts remaining: ${retryAttempts}`, error);
        
        if (retryAttempts === 0) {
          return res.status(500).json({
            success: false,
            message: 'Failed to retrieve registration data after multiple attempts.'
          });
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Find the registration (first try exact match)
    let registration = registrations.find(reg => reg.registrationId === registrationId);
    
    // If not found, try flexible matching
    if (!registration) {
      console.log('No exact match found, trying flexible matching...');
      
      // Normalize for comparison
      const normalizedSearchId = registrationId.replace(/-/g, '').toLowerCase();
      
      // Find with flexible matching
      registration = registrations.find(reg => {
        const normalizedRegId = reg.registrationId.replace(/-/g, '').toLowerCase();
        return normalizedRegId === normalizedSearchId;
      });
      
      if (!registration) {
        console.warn(`Registration not found with ID: ${registrationId}`);
        
        // For debugging, log available registration IDs
        const availableIds = registrations.map(reg => reg.registrationId);
        console.log('Available registration IDs:', availableIds);
        
        return res.status(404).json({
          success: false,
          message: 'Registration not found'
        });
      }
    }
    
    res.json({
      success: true,
      registration: registration
    });
  } catch (error) {
    console.error('Error retrieving registration:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve registration: ' + error.message
    });
  }
});

/**
 * Delete a registration
 */
router.delete('/delete-passover-registration/:id', async (req, res) => {
  try {
    const registrationId = req.params.id;
    console.log(`Deleting registration: ${registrationId}`);
    
    // Check if the registration exists before trying to delete
    const registration = await registrationService.getRegistrationById(registrationId);
    
    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }
    
    // Delete the registration
    await registrationService.deleteRegistration(registrationId);
    
    res.json({
      success: true,
      message: 'Registration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting registration:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete registration: ' + error.message
    });
  }
});

/**
 * Get admin registrations (same as get-passover-registrations but with a different URL)
 */
router.get('/admin/registrations', async (req, res) => {
  try {
    console.log('Getting all registrations for admin');
    
    const registrations = await registrationService.getAllRegistrations();
    
    res.json({
      success: true,
      registrations: registrations
    });
  } catch (error) {
    console.error('Error getting admin registrations:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin registrations: ' + error.message
    });
  }
});

/**
 * Force sync between Edge Config and Blob storage
 */
router.post('/admin/sync-to-blob', async (req, res) => {
  try {
    if (!blobStorage.isBlobMirroringEnabled()) {
      return res.status(400).json({
        success: false,
        message: 'Blob mirroring is not enabled in configuration'
      });
    }

    console.log('Requested manual sync to blob storage');
    
    // Get all registrations
    const registrations = await registrationService.getAllRegistrations();
    
    // Sync to blob
    const syncResult = await blobStorage.syncRegistrationsToBlob(registrations, true);
    
    if (syncResult) {
      res.json({
        success: true,
        message: `Successfully synced ${registrations.length} registrations to blob storage`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to sync registrations to blob storage'
      });
    }
  } catch (error) {
    console.error('Error syncing to blob storage:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to sync: ' + error.message
    });
  }
});

/**
 * Get blob storage status
 */
router.get('/admin/blob-status', async (req, res) => {
  try {
    // First check Edge Config status
    const isEdgeConfigWorking = edgeConfig.isEdgeConfigAvailable();
    const edgeFailures = edgeConfig.getFailureCount ? edgeConfig.getFailureCount() : 'Unknown';
    const usingBlobAsPrimary = edgeFailures >= 3; // Threshold
    
    if (!blobStorage.isBlobMirroringEnabled()) {
      return res.json({
        success: true,
        enabled: false,
        message: 'Blob mirroring is not enabled',
        edgeConfig: {
          available: isEdgeConfigWorking,
          failureCount: edgeFailures,
          isPrimary: !usingBlobAsPrimary
        }
      });
    }

    // Check if blob exists
    const blobResult = await blobStorage.getRegistrationsFromBlob();
    const blobUrl = blobStorage.getRegistrationBlobUrl();
    
    res.json({
      success: true,
      enabled: true,
      hasMirror: blobResult.success,
      registrationCount: blobResult.success ? blobResult.data.length : 0,
      syncInterval: config.blob.syncInterval,
      accessMode: config.blob.accessMode,
      storeId: config.blob.storeId,
      directUrl: blobUrl,
      filename: config.blob.filename,
      hasToken: !!config.blob.token,
      isPrimary: usingBlobAsPrimary,
      edgeConfig: {
        available: isEdgeConfigWorking,
        failureCount: edgeFailures,
        isPrimary: !usingBlobAsPrimary
      }
    });
  } catch (error) {
    console.error('Error checking blob status:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to check blob status: ' + error.message
    });
  }
});

/**
 * Get system health status
 */
router.get('/admin/health', async (req, res) => {
  try {
    // Check Edge Config status
    const isEdgeConfigAvailable = edgeConfig.isEdgeConfigAvailable();
    const edgeFailures = edgeConfig.getFailureCount ? edgeConfig.getFailureCount() : 'Unknown';
    const edgeConfigThreshold = config.edge?.failureThreshold || 3;
    const usingBlobAsPrimary = edgeFailures >= edgeConfigThreshold;
    
    // Check Blob storage status
    const blobEnabled = blobStorage.isBlobMirroringEnabled();
    let blobStatus = { 
      enabled: blobEnabled,
      accessible: false,
      count: 0
    };
    
    if (blobEnabled) {
      try {
        const blobResult = await blobStorage.getRegistrationsFromBlob();
        blobStatus.accessible = blobResult.success;
        blobStatus.count = blobResult.success ? blobResult.data.length : 0;
        blobStatus.url = blobStorage.getRegistrationBlobUrl();
      } catch (error) {
        console.error('Error checking blob health:', error);
      }
    }
    
    // Check local storage
    let localStatus = {
      path: path.join(__dirname, '..', 'data', 'passover-registrations.json'),
      exists: false,
      count: 0
    };
    
    try {
      const localData = edgeConfig.getRegistrationsFromLocalStorage();
      localStatus.exists = true;
      localStatus.count = localData.length;
    } catch (error) {
      console.error('Error checking local storage health:', error);
    }
    
    // Return comprehensive health status
    res.json({
      timestamp: new Date().toISOString(),
      overall: {
        status: isEdgeConfigAvailable || blobStatus.accessible || localStatus.exists ? 'healthy' : 'unhealthy',
        primaryStorage: usingBlobAsPrimary ? 'blob' : (isEdgeConfigAvailable ? 'edgeConfig' : 'local'),
        registrationCount: {
          edgeConfig: isEdgeConfigAvailable ? await edgeConfig.getRegistrationCount() : 0,
          blob: blobStatus.count,
          local: localStatus.count
        }
      },
      edgeConfig: {
        available: isEdgeConfigAvailable,
        failureCount: edgeFailures,
        failureThreshold: edgeConfigThreshold,
        isPrimary: isEdgeConfigAvailable && !usingBlobAsPrimary
      },
      blobStorage: blobStatus,
      localStorage: localStatus
    });
  } catch (error) {
    console.error('Error checking system health:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to check system health: ' + error.message
    });
  }
});

/**
 * Test and initialize Edge Config
 */
router.get('/admin/test-edge-config', async (req, res) => {
  try {
    console.log('Testing Edge Config connectivity...');
    
    // First get current status
    const initialStatus = {
      available: edgeConfig.isEdgeConfigAvailable(),
      failureCount: edgeConfig.getFailureCount ? edgeConfig.getFailureCount() : 0
    };
    
    // Try to initialize with extended attempts
    console.log('Attempting to initialize Edge Config...');
    const success = await edgeConfig.testEdgeConfig(5);
    
    // Get updated status after attempt
    const currentStatus = {
      available: edgeConfig.isEdgeConfigAvailable(),
      failureCount: edgeConfig.getFailureCount ? edgeConfig.getFailureCount() : 0
    };
    
    // Check environment variables
    const envStatus = {
      EDGE_CONFIG: process.env.EDGE_CONFIG ? 'Set' : 'Not set',
      EDGE_CONFIG_ID: process.env.EDGE_CONFIG_ID ? 'Set' : 'Not set',
      EDGE_CONFIG_TOKEN: process.env.EDGE_CONFIG_TOKEN ? 'Set' : 'Not set',
      // Show masked token to verify it's correct without revealing full token
      tokenPreview: process.env.EDGE_CONFIG_TOKEN ? 
        `${process.env.EDGE_CONFIG_TOKEN.substring(0, 4)}...${process.env.EDGE_CONFIG_TOKEN.substring(process.env.EDGE_CONFIG_TOKEN.length - 4)}` : 
        'N/A'
    };
    
    // Try to save and get some test data for verification
    let readWriteTest = { success: false, message: 'Not attempted' };
    
    if (success) {
      try {
        // Generate a test timestamp
        const testData = {
          test: true,
          timestamp: new Date().toISOString()
        };
        
        // Try to write to Edge Config directly
        console.log('Testing Edge Config read/write...');
        
        // Get existing registrations first
        const existingData = await edgeConfig.getRegistrations();
        const existingCount = existingData.data ? existingData.data.length : 0;
        
        // Set the test key
        await edgeConfig.saveTestKey('test_connectivity', testData);
        
        // Read back the test key
        const readResult = await edgeConfig.getTestKey('test_connectivity');
        
        if (readResult && readResult.timestamp === testData.timestamp) {
          readWriteTest = { 
            success: true, 
            message: 'Test key successfully written and read',
            existingRegistrations: existingCount
          };
        } else {
          readWriteTest = { 
            success: false, 
            message: 'Test key write succeeded but read failed or values did not match',
            readResult: readResult
          };
        }
      } catch (ioError) {
        console.error('Edge Config read/write test failed:', ioError);
        readWriteTest = { 
          success: false, 
          message: 'Read/write test failed: ' + ioError.message 
        };
      }
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      initializationSuccess: success,
      initialStatus,
      currentStatus,
      environment: envStatus,
      readWriteTest,
      connectionString: config.edgeConfig.connectionString().replace(/token=[^&]+/, 'token=REDACTED'),
      config: {
        id: config.edgeConfig.id,
        url: config.edgeConfig.url()
      }
    });
  } catch (error) {
    console.error('Error testing Edge Config:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to test Edge Config: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Test Blob storage connectivity
 */
router.get('/admin/test-blob-storage', async (req, res) => {
  try {
    console.log('Testing Blob storage connectivity...');
    
    if (!blobStorage.isBlobMirroringEnabled()) {
      return res.json({
        success: false,
        message: 'Blob storage mirroring is not enabled in configuration',
        config: {
          enabled: false,
          storeId: config.blob.storeId,
          baseUrl: config.blob.baseUrl,
          hasToken: !!config.blob.token,
          tokenPreview: config.blob.token ? 
            `${config.blob.token.substring(0, 4)}...${config.blob.token.substring(config.blob.token.length - 4)}` : 
            'N/A'
        }
      });
    }
    
    // Test blob write
    const testData = {
      test: true,
      timestamp: new Date().toISOString()
    };
    
    // Try to write a test blob
    console.log('Testing Blob storage write...');
    const writeResult = await blobStorage.saveTestBlob('test-connectivity.json', testData);
    
    // Try to retrieve and validate it
    let readResult = { success: false, message: 'Not attempted' };
    
    if (writeResult.success) {
      console.log('Testing Blob storage read...');
      try {
        const testBlob = await blobStorage.getTestBlob('test-connectivity.json');
        
        if (testBlob.success && testBlob.data.timestamp === testData.timestamp) {
          readResult = {
            success: true, 
            message: 'Successfully read test data',
            data: testBlob.data
          };
        } else {
          readResult = {
            success: false,
            message: 'Blob retrieval succeeded but data did not match',
            data: testBlob.data
          };
        }
      } catch (readError) {
        readResult = {
          success: false,
          message: 'Failed to read test blob: ' + readError.message
        };
      }
    }
    
    // Also check if the registrations blob exists
    let registrationsBlob = { exists: false };
    try {
      const blobList = await blobStorage.listBlobs();
      const mainBlob = blobList.blobs.find(b => b.pathname === config.blob.filename);
      
      if (mainBlob) {
        registrationsBlob = {
          exists: true,
          url: blobStorage.getRegistrationBlobUrl(),
          size: mainBlob.size,
          uploadedAt: mainBlob.uploadedAt
        };
      }
    } catch (listError) {
      registrationsBlob = {
        exists: false,
        error: listError.message
      };
    }
    
    // Return results
    res.json({
      timestamp: new Date().toISOString(),
      enabled: true,
      writeTest: writeResult,
      readTest: readResult,
      registrationsBlob,
      config: {
        filename: config.blob.filename,
        baseUrl: config.blob.baseUrl,
        storeId: config.blob.storeId,
        contentType: config.blob.contentType,
        accessMode: config.blob.accessMode,
        syncInterval: config.blob.syncInterval
      }
    });
  } catch (error) {
    console.error('Error testing Blob storage:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to test Blob storage: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 