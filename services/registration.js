/**
 * Registration service for handling Passover registrations
 */
const edgeConfig = require('./edge-config');

/**
 * Store a new registration
 * @param {Object} registration - Registration data
 * @returns {Promise<Object>} - The stored registration
 */
async function storeRegistration(registration) {
  // Add registration date
  registration.registrationDate = new Date().toISOString();
  
  // Initialize donation fields
  registration.hasDonated = false;
  registration.donationAmount = "0.00";
  
  try {
    // Get current registrations
    const registrations = await edgeConfig.getRegistrations();
    
    // Add new registration
    registrations.push(registration);
    
    // Save updated registrations
    await edgeConfig.saveRegistrations(registrations);
    
    return registration;
  } catch (error) {
    console.error('Error storing registration:', error);
    throw new Error('Failed to store registration data');
  }
}

/**
 * Get a registration by ID
 * @param {string} registrationId - Registration ID to find
 * @returns {Promise<Object|null>} - The found registration or null
 */
async function getRegistrationById(registrationId) {
  try {
    const registrations = await edgeConfig.getRegistrations();
    
    // Try to find an exact match first
    const registration = registrations.find(reg => reg.registrationId === registrationId);
    
    if (registration) {
      return registration;
    }
    
    // If no exact match, try more flexible matching (e.g., ignore hyphens, case)
    console.log(`No exact match found for ${registrationId}, trying flexible matching...`);
    
    // Normalize for comparison
    const normalizedSearchId = registrationId.replace(/-/g, '').toLowerCase();
    
    // Find with flexible matching
    const flexMatch = registrations.find(reg => {
      const normalizedRegId = reg.registrationId.replace(/-/g, '').toLowerCase();
      return normalizedRegId === normalizedSearchId;
    });
    
    return flexMatch || null;
  } catch (error) {
    console.error('Error getting registration by ID:', error);
    throw new Error('Failed to retrieve registration data');
  }
}

/**
 * Get all registrations
 * @returns {Promise<Array>} - Array of all registrations
 */
async function getAllRegistrations() {
  try {
    return await edgeConfig.getRegistrations();
  } catch (error) {
    console.error('Error getting all registrations:', error);
    throw new Error('Failed to retrieve registrations data');
  }
}

/**
 * Update a registration with donation information
 * @param {string} registrationId - Registration ID
 * @param {number} donationAmount - Donation amount
 * @param {string} stripeSessionId - Stripe session ID
 * @returns {Promise<Object>} - The updated registration
 */
async function updateRegistrationDonation(registrationId, donationAmount, stripeSessionId) {
  try {
    // Get current registrations
    const registrations = await edgeConfig.getRegistrations();
    
    // Find the registration to update
    const registrationIndex = registrations.findIndex(reg => reg.registrationId === registrationId);
    
    if (registrationIndex === -1) {
      throw new Error(`Registration not found: ${registrationId}`);
    }
    
    // Update the registration with donation info
    registrations[registrationIndex].hasDonated = true;
    registrations[registrationIndex].donationAmount = parseFloat(donationAmount).toFixed(2);
    registrations[registrationIndex].stripeSessionId = stripeSessionId || null;
    registrations[registrationIndex].donationDate = new Date().toISOString();
    
    // Save updated registrations
    await edgeConfig.saveRegistrations(registrations);
    
    return registrations[registrationIndex];
  } catch (error) {
    console.error('Error updating registration with donation:', error);
    throw new Error('Failed to update registration with donation info');
  }
}

/**
 * Delete a registration
 * @param {string} registrationId - Registration ID to delete
 * @returns {Promise<boolean>} - Whether deletion was successful
 */
async function deleteRegistration(registrationId) {
  try {
    // Get current registrations
    const registrations = await edgeConfig.getRegistrations();
    
    // Find the registration index
    const registrationIndex = registrations.findIndex(reg => reg.registrationId === registrationId);
    
    if (registrationIndex === -1) {
      throw new Error(`Registration not found: ${registrationId}`);
    }
    
    // Remove the registration
    registrations.splice(registrationIndex, 1);
    
    // Save updated registrations
    await edgeConfig.saveRegistrations(registrations);
    
    return true;
  } catch (error) {
    console.error('Error deleting registration:', error);
    throw new Error('Failed to delete registration');
  }
}

module.exports = {
  storeRegistration,
  getRegistrationById,
  getAllRegistrations,
  updateRegistrationDonation,
  deleteRegistration
}; 