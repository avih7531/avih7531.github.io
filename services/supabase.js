/**
 * Supabase service for database operations
 */
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = 'https://xhlgfpnsiaqfbgtwjrbl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE environment variable');
  throw new Error('Supabase service role key is required');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Properly capitalize a name (title case)
 * @param {string} name - Name to capitalize
 * @returns {string} - Properly capitalized name
 */
function capitalizeName(name) {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Add a new Shabbat registration to the database
 * @param {Object} registrationData - Registration data
 * @param {string} registrationData.firstName - Registrant first name
 * @param {string} registrationData.lastName - Registrant last name
 * @param {string} registrationData.email - Registrant email
 * @param {number} [registrationData.donationAmount=0] - Donation amount
 * @param {boolean} [registrationData.isNew=true] - Whether this is a new registration
 * @returns {Promise<Object>} - Database insertion result
 */
async function addShabbatRegistration(registrationData) {
  const { firstName, lastName, email, donationAmount = 0, isNew = true } = registrationData;
  
  // Properly capitalize names
  const capitalizedFirstName = capitalizeName(firstName.trim());
  const capitalizedLastName = capitalizeName(lastName.trim());
  
  const insertData = {
    first_name: capitalizedFirstName,
    last_name: capitalizedLastName,
    email: email.toLowerCase().trim(),
    donation_amount: parseFloat(donationAmount),
    new: isNew
  };
  
  try {
    console.log('Adding Shabbat registration:', capitalizedFirstName, capitalizedLastName, 'Amount:', donationAmount);
    
    const { data, error } = await supabase
      .from('YP_Shabbos')
      .insert([insertData])
      .select();
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log('Successfully added Shabbat registration');
    return { success: true, data };
    
  } catch (error) {
    console.error('Error adding Shabbat registration:', error);
    throw error;
  }
}

/**
 * Check if a person with the same first and last name already exists in the YP_Shabbos table
 * @param {string} firstName - First name to check
 * @param {string} lastName - Last name to check
 * @returns {Promise<boolean>} - Whether name combination exists
 */
async function nameExists(firstName, lastName) {
  try {
    // Capitalize names for consistent comparison
    const capitalizedFirstName = capitalizeName(firstName.trim());
    const capitalizedLastName = capitalizeName(lastName.trim());
    
    const { data, error } = await supabase
      .from('YP_Shabbos')
      .select('id')
      .eq('first_name', capitalizedFirstName)
      .eq('last_name', capitalizedLastName)
      .limit(1);
    
    if (error) {
      console.error('Error checking name existence:', error);
      throw error;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking name existence:', error);
    throw error;
  }
}

/**
 * Get all Shabbat registrations (for admin purposes)
 * @returns {Promise<Array>} - Array of registrations
 */
async function getAllShabbatRegistrations() {
  try {
    const { data, error } = await supabase
      .from('YP_Shabbos')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching registrations:', error);
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching registrations:', error);
    throw error;
  }
}

/**
 * Delete a specific Shabbat registration
 * @param {number} id - Registration ID to delete
 * @returns {Promise<Object>} - Deletion result
 */
async function deleteShabbatRegistration(id) {
  try {
    console.log('Deleting Shabbat registration with ID:', id);
    
    const { data, error } = await supabase
      .from('YP_Shabbos')
      .delete()
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('Supabase error during deletion:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error('Registration not found or already deleted');
    }
    
    console.log('Successfully deleted registration:', data[0]);
    return { success: true, data };
    
  } catch (error) {
    console.error('Error deleting Shabbat registration:', error);
    throw error;
  }
}

/**
 * Add a new Rosh Hashana registration to the database
 * @param {Object} registrationData - Registration data
 * @param {string} registrationData.firstName - Registrant first name
 * @param {string} registrationData.lastName - Registrant last name
 * @param {string} registrationData.email - Registrant email
 * @param {number} [registrationData.donationAmount=0] - Donation amount
 * @param {boolean} [registrationData.isNew=true] - Whether this is a new registration
 * @returns {Promise<Object>} - Database insertion result
 */
async function addRoshHashanaRegistration(registrationData) {
  const { firstName, lastName, email, donationAmount = 0, isNew = true } = registrationData;
  
  // Properly capitalize names
  const capitalizedFirstName = capitalizeName(firstName.trim());
  const capitalizedLastName = capitalizeName(lastName.trim());
  
  const insertData = {
    first_name: capitalizedFirstName,
    last_name: capitalizedLastName,
    email: email.toLowerCase().trim(),
    donation_amount: parseFloat(donationAmount),
    new: isNew
  };
  
  try {
    console.log('Adding Rosh Hashana registration:', capitalizedFirstName, capitalizedLastName, 'Amount:', donationAmount);
    
    const { data, error } = await supabase
      .from('YP_RoshHashana')
      .insert([insertData])
      .select();
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log('Successfully added Rosh Hashana registration');
    return { success: true, data };
    
  } catch (error) {
    console.error('Error adding Rosh Hashana registration:', error);
    throw error;
  }
}

/**
 * Get all Rosh Hashana registrations (for admin purposes)
 * @returns {Promise<Array>} - Array of registrations
 */
async function getAllRoshHashanaRegistrations() {
  try {
    const { data, error } = await supabase
      .from('YP_RoshHashana')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching Rosh Hashana registrations:', error);
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching Rosh Hashana registrations:', error);
    throw error;
  }
}

/**
 * Delete a specific Rosh Hashana registration
 * @param {number} id - Registration ID to delete
 * @returns {Promise<Object>} - Deletion result
 */
async function deleteRoshHashanaRegistration(id) {
  try {
    console.log('Deleting Rosh Hashana registration with ID:', id);
    
    const { data, error } = await supabase
      .from('YP_RoshHashana')
      .delete()
      .eq('id', id)
      .select();
    
    if (error) {
      console.error('Supabase error during deletion:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error('Registration not found or already deleted');
    }
    
    console.log('Successfully deleted Rosh Hashana registration:', data[0]);
    return { success: true, data };
    
  } catch (error) {
    console.error('Error deleting Rosh Hashana registration:', error);
    throw error;
  }
}

module.exports = {
  addShabbatRegistration,
  nameExists,
  getAllShabbatRegistrations,
  deleteShabbatRegistration,
  addRoshHashanaRegistration,
  getAllRoshHashanaRegistrations,
  deleteRoshHashanaRegistration,
  capitalizeName,
  supabase
}; 