/**
 * Admin routes for dashboard functionality
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const supabaseService = require('../services/supabase');

// Simple in-memory token storage (in production, use Redis or database)
const validTokens = new Set();

/**
 * Generate a simple auth token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Admin login route
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required' 
      });
    }
    
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD environment variable not set');
      return res.status(500).json({ 
        success: false, 
        message: 'Admin access not configured' 
      });
    }
    
    if (password === adminPassword) {
      const token = generateToken();
      validTokens.add(token);
      
      // Remove token after 24 hours
      setTimeout(() => {
        validTokens.delete(token);
      }, 24 * 60 * 60 * 1000);
      
      console.log('Admin login successful');
      res.json({ 
        success: true, 
        token: token,
        message: 'Login successful' 
      });
    } else {
      console.log('Admin login failed - invalid password');
      res.status(401).json({ 
        success: false, 
        message: 'Invalid password' 
      });
    }
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed: ' + error.message 
    });
  }
});

/**
 * Middleware to verify admin token
 */
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'No authorization token provided' 
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!validTokens.has(token)) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
  
  next();
}

/**
 * Get all Shabbat registrations (admin only)
 */
router.get('/admin/registrations', verifyAdminToken, async (req, res) => {
  try {
    console.log('Admin requesting all registrations');
    
    const result = await supabaseService.getAllShabbatRegistrations();
    
    if (result.success) {
      console.log(`Retrieved ${result.data.length} registrations for admin`);
      res.json(result);
    } else {
      throw new Error('Failed to fetch registrations');
    }
  } catch (error) {
    console.error('Error fetching admin registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch registrations: ' + error.message 
    });
  }
});

/**
 * Delete a specific registration (admin only)
 */
router.delete('/admin/registrations/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration ID is required' 
      });
    }
    
    console.log(`Admin requesting deletion of registration ID: ${id}`);
    
    const result = await supabaseService.deleteShabbatRegistration(id);
    
    if (result.success) {
      console.log(`Successfully deleted registration ID: ${id}`);
      res.json(result);
    } else {
      throw new Error('Failed to delete registration');
    }
  } catch (error) {
    console.error('Error deleting registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete registration: ' + error.message 
    });
  }
});

/**
 * Get all Rosh Hashana registrations (admin only)
 */
router.get('/admin/rosh-hashana-registrations', verifyAdminToken, async (req, res) => {
  try {
    console.log('Admin requesting all Rosh Hashana registrations');
    
    const result = await supabaseService.getAllRoshHashanaRegistrations();
    
    if (result.success) {
      console.log(`Retrieved ${result.data.length} Rosh Hashana registrations for admin`);
      res.json(result);
    } else {
      throw new Error('Failed to fetch Rosh Hashana registrations');
    }
  } catch (error) {
    console.error('Error fetching admin Rosh Hashana registrations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch Rosh Hashana registrations: ' + error.message 
    });
  }
});

/**
 * Delete a specific Rosh Hashana registration (admin only)
 */
router.delete('/admin/rosh-hashana-registrations/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration ID is required' 
      });
    }
    
    console.log(`Admin requesting deletion of Rosh Hashana registration ID: ${id}`);
    
    const result = await supabaseService.deleteRoshHashanaRegistration(id);
    
    if (result.success) {
      console.log(`Successfully deleted Rosh Hashana registration ID: ${id}`);
      res.json(result);
    } else {
      throw new Error('Failed to delete Rosh Hashana registration');
    }
  } catch (error) {
    console.error('Error deleting Rosh Hashana registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete Rosh Hashana registration: ' + error.message 
    });
  }
});

/**
 * Admin logout (optional - removes token from valid tokens)
 */
router.post('/admin/logout', verifyAdminToken, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.substring(7);
  
  validTokens.delete(token);
  
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

module.exports = router; 