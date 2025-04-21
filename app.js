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
const shabbatCheck = require('./middlewares/shabbat-check');
const hebcal = require('hebcal');

// List of holidays when the website should be closed
const CLOSED_HOLIDAYS = [
    'Rosh Hashana',
    'Yom Kippur',
    'Sukkot',
    'Shmini Atzeret',
    'Simchat Torah',
    'Pesach',
    'Shavuot'
];

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cleanJsonResponse);
app.use(shabbatCheck);

// Static files - explicitly configure both the root public directory and subdirectories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Import routes
const donationRoutes = require('./routes/donations');
const registrationRoutes = require('./routes/registrations');
const contactRoutes = require('./routes/contact');

// Register routes
app.use(donationRoutes);
app.use(registrationRoutes);
app.use(contactRoutes);

// Serve main HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/passover', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'passover.html'));
});

app.get('/passover-registration-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'passover-registration-success.html'));
});

// Add routes for other HTML pages
const htmlPages = [
  'about-us',
  'team',
  'contact',
  'donate',
  'donation-success',
  'admin-registrations'
];

// Add test route for Shabbat status
app.get('/shabbat-status', (req, res) => {
  const isClosedTime = require('./utils/shabbat-checker');
  const now = new Date();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Get Hebrew date
  const hDate = new hebcal.HDate(now);
  const currentHolidays = CLOSED_HOLIDAYS.filter(holiday => {
    try {
      const holidayDate = new hebcal.HolidayEvent(holiday, hDate.getFullYear());
      return holidayDate.getDate().isSameDate(hDate);
    } catch (e) {
      return false;
    }
  });
  
  res.json({
    isClosed: isClosedTime(),
    currentTime: now.toISOString(),
    userTimezone: userTimezone,
    dayOfWeek: now.getDay(),
    isFriday: now.getDay() === 5,
    isSaturday: now.getDay() === 6,
    currentHolidays: currentHolidays
  });
});

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