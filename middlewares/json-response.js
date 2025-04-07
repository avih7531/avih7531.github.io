/**
 * Middleware to ensure clean JSON responses
 * Prevents prefixes like "cle1::" that can occur with certain Node.js versions
 */

/**
 * Clean JSON response middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function cleanJsonResponse(req, res, next) {
  // Store the original res.json function
  const originalJson = res.json;
  
  // Override res.json to ensure clean JSON responses
  res.json = function(obj) {
    // Set proper JSON content type
    res.setHeader('Content-Type', 'application/json');
    
    // Call the original json function with the clean object
    return originalJson.call(this, obj);
  };
  
  // Continue to the next middleware or route handler
  next();
}

module.exports = cleanJsonResponse; 