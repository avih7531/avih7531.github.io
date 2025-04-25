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
    
    // Don't include the query parameters in the file path
    // Instead, set them in the response object for rendering
    res.locals = {
      shabbatType: type,
      holidayName: name
    };
    
    return res.sendFile(path.join(__dirname, '../public', 'shabbat.html'));
  }

  // Check actual closure status
  const closureStatus = getClosureType();
  if (closureStatus.isClosed) {
    // If it's Shabbat or a holiday, serve the Shabbat page
    res.locals = {
      shabbatType: closureStatus.type || 'shabbat',
      holidayName: closureStatus.name || ''
    };
    
    return res.sendFile(path.join(__dirname, '../public', 'shabbat.html'));
  }
  
  next();
}

module.exports = shabbatCheck; 