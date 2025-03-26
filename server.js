// server.js
const express = require('express');
const stripe = require('stripe')('sk_test_51PT3twJb8qwjsbroIbCxIRlmRqrFOUzNaXLAtnxYDvQihBqXpD9thkzCrcT1DzAxAEjS39czL1ItsUv6CPOz4uSo00IK18tyx2'); // Using correct test mode secret key
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Detect Vercel environment
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION;
console.log('Environment:', isVercel ? 'Vercel' : 'Local');

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

// Database setup
let db;

// Initialize the database
async function initializeDatabase() {
  // Open database connection - use in-memory database in Vercel
  const dbFilename = isVercel ? ':memory:' : path.join(__dirname, 'rejewvenate.db');
  
  console.log(`Using database: ${dbFilename}`);
  
  db = await open({
    filename: dbFilename,
    driver: sqlite3.Database
  });

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS passover_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      seder_night1 TEXT,
      seder_night2 TEXT,
      dietary_restrictions TEXT,
      has_donated BOOLEAN DEFAULT 0,
      donation_amount REAL DEFAULT 0,
      stripe_session_id TEXT,
      registration_date TEXT,
      donation_date TEXT
    )
  `);

  // Add sample data in Vercel environment
  if (isVercel) {
    try {
      // Check if we have any data
      const count = await db.get('SELECT COUNT(*) as count FROM passover_registrations');
      
      if (count.count === 0) {
        // Add sample registration for testing
        await db.run(
          `INSERT INTO passover_registrations (
            registration_id, first_name, last_name, email, phone, 
            seder_night1, seder_night2, dietary_restrictions, 
            has_donated, donation_amount, registration_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'REG-1743019494502-398',
            'John',
            'Doe',
            'test@example.com',
            '555-123-4567',
            'on',
            'on',
            'No pork',
            true,
            54,
            new Date().toISOString()
          ]
        );
        console.log('Added sample data for testing in Vercel environment');
      }
    } catch (err) {
      console.error('Error adding sample data:', err);
    }
  }

  console.log('Database initialized successfully');
}

// Initialize database when server starts
initializeDatabase().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, 'donate.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});

// Handle contact form submission
app.post('/send-contact-form', (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    // In a production environment, you would:
    // 1. Validate the data
    // 2. Send an email to YKIEVMAN@BOWERYJEWS.ORG (using Nodemailer or similar)
    // 3. Store the inquiry in a database
    
    console.log('Contact form submission:', { 
      name, 
      email, 
      subject, 
      message,
      recipient: 'YKIEVMAN@BOWERYJEWS.ORG',
      address: '353 Bowery NY NY 10003'
    });
    
    // Send a success response
    res.json({ success: true, message: 'Message received successfully!' });
  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ success: false, message: 'Failed to process your message' });
  }
});

// Store Passover registration
app.post('/store-passover-registration', async (req, res) => {
  try {
    const registrationData = req.body;
    
    // Generate a unique registration ID
    const registrationId = 'REG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const registrationDate = new Date().toISOString();
    
    // Insert into database
    await db.run(
      `INSERT INTO passover_registrations (
        registration_id, first_name, last_name, email, phone, 
        seder_night1, seder_night2, dietary_restrictions, 
        has_donated, donation_amount, registration_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        registrationId,
        registrationData.firstName || '',
        registrationData.lastName || '',
        registrationData.email || '',
        registrationData.phone || '',
        registrationData.sederNight1 || 'off',
        registrationData.sederNight2 || 'off',
        registrationData.dietaryRestrictions || '',
        false,
        0,
        registrationDate
      ]
    );
    
    console.log('New Passover registration stored:', registrationId);
    
    res.json({ 
      success: true, 
      message: 'Registration stored successfully', 
      registrationId: registrationId 
    });
  } catch (error) {
    console.error('Error storing registration:', error);
    res.status(500).json({ success: false, message: 'Failed to store registration' });
  }
});

// Update registration with donation information
app.post('/update-registration-donation', async (req, res) => {
  try {
    const { registrationId, donationAmount, stripeSessionId } = req.body;
    
    // Update the registration with donation info
    const result = await db.run(
      `UPDATE passover_registrations 
       SET has_donated = ?, donation_amount = ?, stripe_session_id = ?, donation_date = ?
       WHERE registration_id = ?`,
      [true, donationAmount, stripeSessionId, new Date().toISOString(), registrationId]
    );
    
    if (result.changes > 0) {
      console.log('Updated registration with donation:', registrationId);
      res.json({ success: true, message: 'Registration updated with donation info' });
    } else {
      res.status(404).json({ success: false, message: 'Registration not found' });
    }
  } catch (error) {
    console.error('Error updating registration:', error);
    res.status(500).json({ success: false, message: 'Failed to update registration' });
  }
});

// Get all registrations (protected by admin password in a simple way)
// In production, use proper authentication
app.get('/admin/registrations', async (req, res) => {
  const providedPassword = req.query.password;
  const adminPassword = 'rejewvenate2025'; // In production, use environment variables
  
  if (providedPassword !== adminPassword) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const registrations = await db.all('SELECT * FROM passover_registrations ORDER BY registration_date DESC');
    
    // Transform database results to match the previous format
    const formattedRegistrations = registrations.map(reg => ({
      registrationId: reg.registration_id,
      firstName: reg.first_name,
      lastName: reg.last_name,
      email: reg.email,
      phone: reg.phone,
      sederNight1: reg.seder_night1,
      sederNight2: reg.seder_night2,
      dietaryRestrictions: reg.dietary_restrictions,
      hasDonated: reg.has_donated === 1, // SQLite stores booleans as 0 or 1
      donationAmount: reg.donation_amount,
      stripeSessionId: reg.stripe_session_id,
      registrationDate: reg.registration_date,
      donationDate: reg.donation_date
    }));
    
    res.json({ success: true, registrations: formattedRegistrations });
  } catch (error) {
    console.error('Error retrieving registrations:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve registrations' });
  }
});

// Get a specific registration by ID
app.get('/registration/:id', async (req, res) => {
  try {
    const registration = await db.get(
      'SELECT * FROM passover_registrations WHERE registration_id = ?',
      [req.params.id]
    );
    
    if (registration) {
      // Transform to client format
      const formattedRegistration = {
        registrationId: registration.registration_id,
        firstName: registration.first_name,
        lastName: registration.last_name,
        email: registration.email,
        phone: registration.phone,
        sederNight1: registration.seder_night1,
        sederNight2: registration.seder_night2,
        dietaryRestrictions: registration.dietary_restrictions,
        hasDonated: registration.has_donated === 1,
        donationAmount: registration.donation_amount,
        stripeSessionId: registration.stripe_session_id,
        registrationDate: registration.registration_date,
        donationDate: registration.donation_date
      };
      
      res.json({ success: true, registration: formattedRegistration });
    } else {
      res.status(404).json({ success: false, message: 'Registration not found' });
    }
  } catch (error) {
    console.error('Error retrieving registration:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve registration' });
  }
});

// Create a Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { donationType, amount } = req.body;
    
    let sessionParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Rejewvenate ${donationType} Donation`,
              description: `Supporting the Rejewvenate community`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: donationType === 'monthly' ? 'subscription' : 'payment',
      success_url: `${req.headers.origin}/donation-success.html`,
      cancel_url: `${req.headers.origin}/donate.html`,
    };

    // If it's a monthly donation, create a subscription price
    if (donationType === 'monthly') {
      // Create a product for the subscription
      const product = await stripe.products.create({
        name: 'Monthly Support for Rejewvenate',
        description: 'Monthly recurring donation to support Rejewvenate activities',
      });

      // Create a price for the subscription
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: amount,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
      });

      // Update the session parameters for subscription
      sessionParams = {
        payment_method_types: ['card'],
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${req.headers.origin}/donation-success.html`,
        cancel_url: `${req.headers.origin}/donate.html`,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create a Stripe checkout session for Passover registration donation
app.post('/create-passover-checkout-session', async (req, res) => {
  try {
    const { amount, registrationData, registrationId } = req.body;
    
    // Parse registration data if it's a string
    const registration = typeof registrationData === 'string' ? 
      JSON.parse(registrationData) : registrationData;
    
    // Store or retrieve registration ID 
    let regId = registrationId;
    
    if (!regId) {
      // Create new registration record in database
      try {
        // Generate a unique registration ID
        regId = 'REG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        
        // Insert into database
        await db.run(
          `INSERT INTO passover_registrations (
            registration_id, first_name, last_name, email, phone, 
            seder_night1, seder_night2, dietary_restrictions, 
            has_donated, donation_amount, registration_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            regId,
            registration.firstName || '',
            registration.lastName || '',
            registration.email || '',
            registration.phone || '',
            registration.sederNight1 || 'off',
            registration.sederNight2 || 'off',
            registration.dietaryRestrictions || '',
            false,
            0,
            new Date().toISOString()
          ]
        );
        
        console.log('New Passover registration stored (pre-donation):', regId);
      } catch (error) {
        console.error('Error storing registration before checkout:', error);
        return res.status(500).json({ error: 'Failed to store registration data' });
      }
    }
    
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Passover Seder Donation',
              description: 'Supporting the Rejewvenate Passover Seder',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/passover-registration-success.html?donation=true&amount=${amount/100}&reg_id=${regId}`,
      cancel_url: `${req.headers.origin}/passover.html`,
      metadata: {
        registration_type: 'passover',
        registration_id: regId,
        first_name: registration.firstName || '',
        last_name: registration.lastName || '',
        email: registration.email || '',
        seder_night1: registration.sederNight1 ? 'yes' : 'no',
        seder_night2: registration.sederNight2 ? 'yes' : 'no'
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ id: session.id, registrationId: regId });
  } catch (error) {
    console.error('Error creating Passover checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook to handle Stripe events
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_6599f89d73e8c0abd30e4f5848e461b869c9089188791b4dfefc8cda046394cd'; // Using provided webhook secret

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      // Check if this is a Passover registration donation
      if (session.metadata && session.metadata.registration_type === 'passover') {
        // Update the registration with donation info
        const registrationId = session.metadata.registration_id;
        
        try {
          // Update database record
          await db.run(
            `UPDATE passover_registrations 
             SET has_donated = ?, donation_amount = ?, stripe_session_id = ?, donation_date = ?
             WHERE registration_id = ?`,
            [1, session.amount_total / 100, session.id, new Date().toISOString(), registrationId]
          );
          
          console.log('Updated registration with successful donation:', registrationId);
        } catch (error) {
          console.error('Error updating registration with donation in webhook:', error);
        }
      }
      
      console.log('Payment successful for session:', session.id);
      break;
    
    case 'invoice.paid':
      // Handle subscription payment
      console.log('Subscription payment successful');
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin registrations available at: http://localhost:${PORT}/admin/registrations?password=rejewvenate2025`);
}); 