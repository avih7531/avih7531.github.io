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
  
  console.log('=== SUPABASE DEBUG ===');
  console.log('Supabase URL:', 'https://xhlgfpnsiaqfbgtwjrbl.supabase.co');
  console.log('Service Role Key available:', !!process.env.SUPABASE_SERVICE_ROLE);
  console.log('Service Role Key length:', process.env.SUPABASE_SERVICE_ROLE ? process.env.SUPABASE_SERVICE_ROLE.length : 'undefined');
  
  const insertData = {
    first_name: capitalizedFirstName,
    last_name: capitalizedLastName,
    email: email.toLowerCase().trim(),
    donation_amount: parseFloat(donationAmount),
    new: isNew
  };
  
  console.log('Data to insert:', insertData);
  
  try {
    console.log('Attempting to insert into YP_Shabbos table...');
    
    const { data, error } = await supabase
      .from('YP_Shabbos')
      .insert([insertData])
      .select();
    
    console.log('Supabase response - data:', data);
    console.log('Supabase response - error:', error);
    
    if (error) {
      console.error('Supabase error details:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    console.log('Successfully added Shabbat registration:', data);
    console.log('=== END SUPABASE DEBUG ===');
    return { success: true, data };
    
  } catch (error) {
    console.error('=== SUPABASE ERROR ===');
    console.error('Error adding Shabbat registration:', error);
    console.error('Error message:', error.message);
    console.error('Error details:', JSON.stringify(error, null, 2));
    console.error('=== END SUPABASE ERROR ===');
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

module.exports = {
  addShabbatRegistration,
  nameExists,
  getAllShabbatRegistrations,
  capitalizeName,
  supabase
}; 