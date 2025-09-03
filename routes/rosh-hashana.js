/**
 * Rosh Hashana registration routes
 */
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

const supabaseService = require('../services/supabase');

/**
 * Create a Rosh Hashana registration
 */
router.post('/create-rosh-hashana-registration', async (req, res) => {
  try {
    const { firstName, lastName, email, donationAmount } = req.body;
    
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields for registration' 
      });
    }
    
    const amount = parseFloat(donationAmount) || 0;
    
    // Check if person with same first and last name already exists in YP_Shabbos
    const nameAlreadyExists = await supabaseService.nameExists(firstName, lastName);
    const isNewRegistration = !nameAlreadyExists;
    
    // Add registration to YP_RoshHashana database
    try {
      const dbResult = await supabaseService.addRoshHashanaRegistration({
        firstName,
        lastName,
        email,
        donationAmount: amount,
        isNew: isNewRegistration
      });
      console.log('Rosh Hashana registration successful:', dbResult);
      
      res.json({
        success: true,
        message: 'Registration completed successfully',
        data: dbResult
      });
    } catch (dbError) {
      console.error('Database error during Rosh Hashana registration:', dbError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save registration to database: ' + dbError.message 
      });
    }
    
  } catch (error) {
    console.error('Error creating Rosh Hashana registration:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create registration: ' + error.message 
    });
  }
});

module.exports = router;
