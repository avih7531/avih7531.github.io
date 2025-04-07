/**
 * Registration routes for the application
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

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
    
    // Test network connectivity to Edge Config
    let networkTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Testing basic network connectivity to Edge Config API...');
      const pingResponse = await fetch(`${config.edgeConfig.url()}`, {
        method: 'HEAD',
        timeout: 5000
      });
      
      networkTest = {
        success: pingResponse.ok || pingResponse.status === 404, // 404 is expected for HEAD request without token
        status: pingResponse.status,
        statusText: pingResponse.statusText,
        message: pingResponse.ok || pingResponse.status === 404 
          ? 'Network connectivity to Edge Config API is working' 
          : `Network connectivity issue: ${pingResponse.status} ${pingResponse.statusText}`
      };
    } catch (networkError) {
      networkTest = {
        success: false,
        message: `Network connectivity failed: ${networkError.message}`,
        error: networkError.message
      };
    }
    
    // Try to initialize with extended attempts
    console.log('Attempting to initialize Edge Config...');
    const success = await edgeConfig.testEdgeConfig(5);
    
    // Get updated status after attempt
    const currentStatus = {
      available: edgeConfig.isEdgeConfigAvailable(),
      failureCount: edgeConfig.getFailureCount ? edgeConfig.getFailureCount() : 0
    };
    
    // Check SDK version
    let sdkVersion = 'Unknown';
    try {
      const packagePath = path.join(__dirname, '..', 'node_modules', '@vercel', 'edge-config', 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        sdkVersion = pkg.version;
      }
    } catch (err) {
      console.error('Error checking SDK version:', err);
    }
    
    // Check environment variables
    const envStatus = {
      EDGE_CONFIG: process.env.EDGE_CONFIG ? 'Set' : 'Not set',
      EDGE_CONFIG_ID: process.env.EDGE_CONFIG_ID ? 'Set' : 'Not set',
      EDGE_CONFIG_TOKEN: process.env.EDGE_CONFIG_TOKEN ? 'Set' : 'Not set',
      // Show masked token to verify it's correct without revealing full token
      tokenPreview: process.env.EDGE_CONFIG_TOKEN ? 
        `${process.env.EDGE_CONFIG_TOKEN.substring(0, 4)}...${process.env.EDGE_CONFIG_TOKEN.substring(process.env.EDGE_CONFIG_TOKEN.length - 4)}` : 
        'N/A',
      EDGE_CONFIG_FULL: process.env.EDGE_CONFIG ? 
        process.env.EDGE_CONFIG.replace(/token=[^&]+/, 'token=REDACTED') : 'Not set'
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
    
    // Check if the edge config can be verified independently
    let verificationTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Verifying Edge Config via direct API call...');
      const response = await fetchWithRetry(
        `${config.edgeConfig.url()}/items?token=${config.edgeConfig.token}`,
        { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      verificationTest = {
        success: response.ok,
        status: response.status,
        message: response.ok 
          ? 'Successfully verified Edge Config via direct API call' 
          : `API verification failed with status ${response.status}`
      };
      
      if (response.ok) {
        const items = await response.json();
        verificationTest.itemCount = items.items ? items.items.length : 0;
      }
    } catch (verifyError) {
      verificationTest = {
        success: false,
        message: 'Verification failed: ' + verifyError.message
      };
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      initializationSuccess: success,
      initialStatus,
      currentStatus,
      networkTest,
      sdkVersion,
      environment: envStatus,
      readWriteTest,
      verificationTest,
      connectionString: config.edgeConfig.connectionString().replace(/token=[^&]+/, 'token=REDACTED'),
      config: {
        id: config.edgeConfig.id,
        url: config.edgeConfig.url()
      },
      runningEnvironment: {
        nodeVersion: process.version,
        platform: process.platform,
        isVercel: !!process.env.VERCEL,
        vercelEnv: process.env.VERCEL_ENV || 'Not set',
        isDevelopment: process.env.NODE_ENV === 'development'
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
    
    // Check Vercel Blob package version
    let packageVersion = 'Unknown';
    try {
      const packagePath = path.join(__dirname, '..', 'node_modules', '@vercel', 'blob', 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        packageVersion = pkg.version;
      }
    } catch (err) {
      console.error('Error checking Blob package version:', err);
    }
    
    // Test network connectivity to Blob storage
    let networkTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Testing basic network connectivity to Blob API...');
      const pingResponse = await fetch(config.blob.baseUrl, {
        method: 'HEAD',
        timeout: 5000
      });
      
      networkTest = {
        success: pingResponse.ok || pingResponse.status === 404, // 404 is expected for HEAD request
        status: pingResponse.status,
        statusText: pingResponse.statusText,
        message: pingResponse.ok || pingResponse.status === 404 
          ? 'Network connectivity to Blob storage is working' 
          : `Network connectivity issue: ${pingResponse.status} ${pingResponse.statusText}`
      };
    } catch (networkError) {
      networkTest = {
        success: false,
        message: `Network connectivity failed: ${networkError.message}`,
        error: networkError.message
      };
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
        
        if (testBlob.success && testBlob.data && testBlob.data.timestamp === testData.timestamp) {
          readResult = {
            success: true, 
            message: 'Successfully read test data',
            data: testBlob.data
          };
        } else {
          // Add additional diagnostics for data mismatch
          readResult = {
            success: false,
            message: 'Blob retrieval succeeded but data did not match expected values',
            expectedTimestamp: testData.timestamp,
            receivedData: testBlob.data,
            dataPresent: !!testBlob.data,
            rawData: testBlob.rawData || 'Not available'
          };
        }
      } catch (readError) {
        readResult = {
          success: false,
          message: 'Failed to read test blob: ' + readError.message,
          error: readError.stack ? readError.stack.split('\n')[0] : readError.message
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
        
        // Try to fetch the actual content to verify it's accessible
        try {
          const registrationsContent = await fetch(registrationsBlob.url);
          if (registrationsContent.ok) {
            const contentSample = await registrationsContent.text();
            registrationsBlob.contentSample = contentSample.substring(0, 100) + '...';
            registrationsBlob.contentLength = contentSample.length;
            registrationsBlob.isValidJson = true;
            
            try {
              JSON.parse(contentSample);
            } catch (jsonError) {
              registrationsBlob.isValidJson = false;
            }
          } else {
            registrationsBlob.contentAccessible = false;
            registrationsBlob.contentError = `HTTP ${registrationsContent.status}: ${registrationsContent.statusText}`;
          }
        } catch (contentError) {
          registrationsBlob.contentAccessible = false;
          registrationsBlob.contentError = contentError.message;
        }
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
      packageVersion,
      networkTest,
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
      },
      runningEnvironment: {
        nodeVersion: process.version,
        platform: process.platform,
        isVercel: !!process.env.VERCEL,
        vercelEnv: process.env.VERCEL_ENV || 'Not set'
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

/**
 * Fix blob data format issues - workaround for potential encoding problems
 */
router.post('/admin/fix-blob-data', async (req, res) => {
  try {
    if (!blobStorage.isBlobMirroringEnabled()) {
      return res.status(400).json({
        success: false,
        message: 'Blob mirroring is not enabled in configuration'
      });
    }
    
    console.log('Attempting to fix blob data format issues...');
    
    // First get local registrations data as our source of truth
    const localRegistrations = await edgeConfig.getRegistrationsFromLocalStorage();
    
    if (!localRegistrations || localRegistrations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No local registrations found to use for fixing blob data'
      });
    }
    
    // Force re-save to blob storage with proper encoding
    console.log(`Re-saving ${localRegistrations.length} registrations to blob with proper encoding...`);
    const saveResult = await blobStorage.saveRegistrationsToBlob(localRegistrations);
    
    if (!saveResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save registrations to blob storage',
        error: saveResult.error || 'Unknown error'
      });
    }
    
    // Verify the save was successful by reading it back
    console.log('Verifying blob data after fix...');
    const verifyResult = await blobStorage.getRegistrationsFromBlob();
    
    if (!verifyResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Saved data to blob but verification failed',
        saveResult,
        verifyError: verifyResult.error || 'Unknown error'
      });
    }
    
    res.json({
      success: true,
      message: `Successfully fixed blob data format for ${localRegistrations.length} registrations`,
      registrations: {
        count: verifyResult.data.length,
        blobUrl: blobStorage.getRegistrationBlobUrl(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fixing blob data:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fix blob data: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Test Edge Config authentication
 */
router.get('/admin/test-edge-config-auth', async (req, res) => {
  try {
    console.log('Testing Edge Config authentication specifically...');
    
    // First check if we can do an unauthenticated ping to verify network access
    let networkTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Checking basic network connectivity to Edge Config API...');
      const pingResponse = await fetch(`${config.edgeConfig.url()}`, {
        method: 'HEAD',
        timeout: 5000
      });
      
      networkTest = {
        success: pingResponse.ok || pingResponse.status === 404, // 404 is expected for HEAD request without token
        status: pingResponse.status,
        statusText: pingResponse.statusText,
        message: pingResponse.ok || pingResponse.status === 404 
          ? 'Network connectivity to Edge Config API is working' 
          : `Network connectivity issue: ${pingResponse.status} ${pingResponse.statusText}`
      };
    } catch (networkError) {
      networkTest = {
        success: false,
        message: `Network connectivity failed: ${networkError.message}`,
        error: networkError.message
      };
    }
    
    if (!networkTest.success) {
      return res.json({
        success: false,
        message: 'Cannot test authentication because network connectivity failed',
        networkTest
      });
    }
    
    // Now test the auth token specifically
    let authTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Testing Edge Config authentication with current token...');
      
      // Make a direct API call with the auth token
      const response = await fetch(`${config.edgeConfig.url()}/items?token=${config.edgeConfig.token}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        authTest = {
          success: true,
          status: response.status,
          message: 'Authentication successful!'
        };
        
        // Also get the item count
        const data = await response.json();
        authTest.items = data.items ? data.items.length : 0;
      } else if (response.status === 401 || response.status === 403) {
        authTest = {
          success: false,
          status: response.status,
          message: 'Authentication failed. Invalid token or insufficient permissions.'
        };
      } else {
        authTest = {
          success: false,
          status: response.status,
          message: `Unexpected response: ${response.status} ${response.statusText}`
        };
      }
    } catch (authError) {
      authTest = {
        success: false,
        message: 'Authentication test failed: ' + authError.message,
        error: authError.stack ? authError.stack.split('\n')[0] : authError.message
      };
    }
    
    // Check if Edge Config ID is valid by testing different endpoints
    let configIdTest = { success: false, message: 'Not attempted' };
    try {
      console.log('Verifying if Edge Config ID exists...');
      
      // Check authentication header method as an alternative
      const response = await fetch(`https://api.vercel.com/v1/edge-config/${config.edgeConfig.id}/items`, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${config.vercel.apiToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        configIdTest = {
          success: true,
          status: response.status,
          message: 'Edge Config ID exists and is accessible via Vercel API'
        };
        
        // Also get the item count
        const data = await response.json();
        configIdTest.items = data.items ? data.items.length : 0;
      } else if (response.status === 404) {
        configIdTest = {
          success: false,
          status: response.status,
          message: 'Edge Config ID not found. This ID may not exist or has been deleted.'
        };
      } else {
        configIdTest = {
          success: false,
          status: response.status,
          message: `Unexpected response: ${response.status} ${response.statusText}`
        };
      }
    } catch (configIdError) {
      configIdTest = {
        success: false,
        message: 'Edge Config ID test failed: ' + configIdError.message,
        error: configIdError.stack ? configIdError.stack.split('\n')[0] : configIdError.message
      };
    }
    
    // Return detailed diagnostics
    res.json({
      timestamp: new Date().toISOString(),
      networkTest,
      authTest,
      configIdTest,
      edgeConfig: {
        id: config.edgeConfig.id,
        tokenPrefix: config.edgeConfig.token ? 
          `${config.edgeConfig.token.substring(0, 4)}...${config.edgeConfig.token.substring(config.edgeConfig.token.length - 4)}` :
          'Not set',
        url: config.edgeConfig.url()
      },
      vercel: {
        apiTokenPrefix: config.vercel.apiToken ?
          `${config.vercel.apiToken.substring(0, 4)}...` :
          'Not set'
      }
    });
  } catch (error) {
    console.error('Error testing Edge Config authentication:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to test Edge Config authentication: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 