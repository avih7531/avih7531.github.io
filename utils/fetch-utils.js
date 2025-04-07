/**
 * Utility functions for fetch operations
 */

/**
 * Fetch with retry capability for robustness
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retries
 * @param {number} backoff - Initial backoff time in ms
 * @returns {Promise<Response>} - The fetch response
 */
async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (err) {
    if (retries <= 0) {
      throw err;
    }
    console.log(`Retrying fetch to ${url} after ${backoff}ms... (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
}

module.exports = {
  fetchWithRetry
}; 