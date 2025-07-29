/**
 * Supabase service for database operations
 */
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_ENDPOINT;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  throw new Error('Supabase configuration is required');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
  
  try {
    console.log('Adding Shabbat registration to database:', { firstName, lastName, email, donationAmount });
    
    const { data, error } = await supabase
      .from('YP_SHABBOS')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          email: email,
          donation_amount: parseFloat(donationAmount),
          new: isNew
        }
      ])
      .select();
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log('Successfully added Shabbat registration:', data);
    return { success: true, data };
    
  } catch (error) {
    console.error('Error adding Shabbat registration:', error);
    throw error;
  }
}

/**
 * Check if an email already exists in the YP_SHABBOS table
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} - Whether email exists
 */
async function emailExists(email) {
  try {
    const { data, error } = await supabase
      .from('YP_SHABBOS')
      .select('id')
      .eq('email', email)
      .limit(1);
    
    if (error) {
      console.error('Error checking email existence:', error);
      throw error;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking email existence:', error);
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
      .from('YP_SHABBOS')
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

module.exports = {
  addShabbatRegistration,
  emailExists,
  getAllShabbatRegistrations,
  supabase
}; 