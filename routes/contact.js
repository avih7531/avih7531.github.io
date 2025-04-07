/**
 * Contact form routes
 */
const express = require('express');
const router = express.Router();

// Import a mail service if available
// const mailService = require('../services/mail');

/**
 * Handle contact form submissions
 */
router.post('/send-contact-form', async (req, res) => {
  try {
    // Extract contact form data
    const { name, email, subject, message } = req.body;
    
    console.log('Received contact form submission:', { name, email, subject });
    
    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // TODO: Implement actual email sending functionality
    // Example with a mail service:
    // await mailService.sendContactEmail({ name, email, subject, message });
    
    // For now, just log the contact form data and return success
    console.log('Contact form data:', { name, email, subject, message });
    
    res.json({
      success: true,
      message: 'Your message has been received. We will get back to you soon.'
    });
  } catch (error) {
    console.error('Error processing contact form:', error);
    
    res.status(500).json({
      success: false,
      message: 'There was an error processing your request. Please try again later.'
    });
  }
});

module.exports = router; 