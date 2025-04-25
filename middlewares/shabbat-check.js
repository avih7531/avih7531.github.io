const getClosureType = require('../utils/shabbat-checker');
const path = require('path');

function shabbatCheck(req, res, next) {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Handle force_shabbat for testing
  if (req.query.force_shabbat === 'true') {
    const type = req.query.type || 'shabbat';
    const name = req.query.name || '';
    
    // Preserve the original query parameters if force_shabbat is true
    const queryParams = new URLSearchParams();
    if (type) queryParams.set('type', type);
    if (name) queryParams.set('name', encodeURIComponent(name));
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return res.sendFile(path.join(__dirname, '../public', `shabbat.html${queryString}`));
  }

  // Check actual closure status
  const closureStatus = getClosureType();
  if (closureStatus.isClosed) {
    // If it's Shabbat or a holiday, serve the Shabbat page
    const queryParams = new URLSearchParams();
    queryParams.set('type', closureStatus.type || 'shabbat');
    if (closureStatus.name) queryParams.set('name', encodeURIComponent(closureStatus.name));
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return res.sendFile(path.join(__dirname, '../public', `shabbat.html${queryString}`));
  }
  
  next();
}

module.exports = shabbatCheck; 