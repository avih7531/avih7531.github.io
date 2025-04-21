const isShabbat = require('../utils/shabbat-checker');
const path = require('path');

function shabbatCheck(req, res, next) {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  if (isShabbat()) {
    // If it's Shabbat, serve the Shabbat page
    return res.sendFile(path.join(__dirname, '../public', 'shabbat.html'));
  }
  
  next();
}

module.exports = shabbatCheck; 