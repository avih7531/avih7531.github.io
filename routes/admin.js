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