/**
 * Main application file
 * This file imports and connects all the modular components
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const cleanJsonResponse = require('./middlewares/json-response');

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cleanJsonResponse);

// Static files - explicitly configure both the root public directory and subdirectories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Import routes
const donationRoutes = require('./routes/donations');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const roshHashanaRoutes = require('./routes/rosh-hashana');

// Register routes
app.use(donationRoutes);
app.use(contactRoutes);
app.use(adminRoutes);
app.use(roshHashanaRoutes);

// Serve main HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add route for Shabbat registration
app.get('/yp/shabbat/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yp', 'shabbat', 'register.html'));
});

// Add route for Shabbat confirmation
app.get('/yp/shabbat/confirmation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'yp', 'shabbat', 'confirmation.html'));
});

// Add route for admin dashboard
app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

// Add routes for other HTML pages
const htmlPages = [
  'about-us',
  'team',
  'contact',
  'donate',
  'simple-donate',
  'donation-success'
];

htmlPages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// 404 handler
app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred'
  });
});

// Start server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`http://localhost:${port}`);
  });
}

module.exports = app; 