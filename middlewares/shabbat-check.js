const isClosedTime = require('../utils/shabbat-checker');
const path = require('path');

function shabbatCheck(req, res, next) {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Check for force_shabbat query parameter
  const forceShabbat = req.query.force_shabbat === 'true';

  if (isClosedTime() || forceShabbat) {
    // If it's Shabbat/holiday or force_shabbat is true, serve the Shabbat page
    return res.sendFile(path.join(__dirname, '../public', 'shabbat.html'));
  }
  
  next();
}

module.exports = shabbatCheck; 