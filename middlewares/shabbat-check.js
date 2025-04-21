const getClosureType = require('../utils/shabbat-checker');
const path = require('path');

function shabbatCheck(req, res, next) {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Check for force_shabbat query parameter
  const forceShabbat = req.query.force_shabbat === 'true';
  const closureInfo = getClosureType();

  if (closureInfo.isClosed || forceShabbat) {
    // If it's Shabbat/holiday or force_shabbat is true, serve the Shabbat page
    // Pass the closure type as a query parameter
    const redirectUrl = `/shabbat.html?type=${closureInfo.type || 'shabbat'}&name=${closureInfo.name || ''}`;
    return res.redirect(redirectUrl);
  }
  
  next();
}

module.exports = shabbatCheck; 