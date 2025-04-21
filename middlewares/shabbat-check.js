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
    // Preserve the original query parameters if force_shabbat is true
    const type = forceShabbat ? (req.query.type || 'shabbat') : closureInfo.type;
    const name = forceShabbat ? (req.query.name || '') : closureInfo.name;
    
    // Redirect to shabbat.html with the correct parameters
    const redirectUrl = `/shabbat.html?type=${type}&name=${name}`;
    return res.redirect(redirectUrl);
  }
  
  next();
}

module.exports = shabbatCheck; 