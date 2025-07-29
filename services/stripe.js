/**
 * Stripe service for payment processing
 */
const stripe = require('stripe');
const config = require('../config');

// Initialize Stripe client
const stripeClient = stripe(config.stripe.secretKey);

/**
 * Create a standard donation checkout session
 * @param {Object} donationDetails - Donation details
 * @param {number} donationDetails.donationAmount - Donation amount
 * @param {string} donationDetails.donationType - Donation type (one-time, recurring, sponsor)
 * @param {string} donationDetails.firstName - Donor first name
 * @param {string} donationDetails.lastName - Donor last name
 * @param {string} donationDetails.email - Donor email
 * @param {string} origin - Request origin for success/cancel URLs
 * @returns {Promise<Object>} - Stripe checkout session
 */
async function createDonationCheckoutSession(donationDetails, origin) {
  const { donationAmount, donationType, firstName, lastName, email } = donationDetails;
  
  // Convert amount to cents for Stripe
  const amountInCents = Math.round(donationAmount * 100);
  
  // Ensure origin doesn't end with a slash
  const baseUrl = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  
  // Log the URLs for debugging
  const successUrl = `${baseUrl}/donation-success.html?donation=true&type=${donationType}`;
  const cancelUrl = `${baseUrl}/donate.html`;
  
  console.log('Stripe success URL:', successUrl);
  console.log('Stripe cancel URL:', cancelUrl);
  
  // Create appropriate product name based on donation type
  let productName = 'One-time Donation';
  let description = 'Thank you for supporting Rejewvenate';
  
  if (donationType === 'recurring') {
    productName = 'Monthly Donation';
    description = 'Thank you for your monthly support of Rejewvenate';
  } else if (donationType === 'sponsor') {
    productName = 'Student Sponsorship';
    description = 'Thank you for sponsoring a student at Rejewvenate';
  }
  
  // Create common session parameters
  const sessionParams = {
    payment_method_types: ['card'],
    metadata: {
      donationType,
      firstName,
      lastName,
      email,
      donationAmount
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  };
  
  // Handle one-time vs recurring donations differently
  if (donationType === 'recurring') {
    // First, create or retrieve a product for recurring donations
    const product = await stripeClient.products.create({
      name: productName,
      description: description,
    });
    
    // Create a price object for this product
    const price = await stripeClient.prices.create({
      product: product.id,
      unit_amount: amountInCents,
      currency: 'usd',
      recurring: {
        interval: 'month'
      },
    });
    
    // Add the line items for subscription
    sessionParams.line_items = [{
      price: price.id,
      quantity: 1,
    }];
    
    // Set the mode to subscription
    sessionParams.mode = 'subscription';
  } else {
    // One-time donation setup
    sessionParams.line_items = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: productName,
          description: description
        },
        unit_amount: amountInCents,
      },
      quantity: 1,
    }];
    
    // Set the mode to payment
    sessionParams.mode = 'payment';
  }
  
  // Create a Stripe Checkout Session
  const session = await stripeClient.checkout.sessions.create(sessionParams);
  
  return {
    success: true,
    url: session.url,
    sessionId: session.id
  };
}

/**
 * Create a Shabbat registration checkout session
 * @param {Object} registrationDetails - Registration details  
 * @param {number} registrationDetails.donationAmount - Donation amount
 * @param {string} registrationDetails.donationType - Should be 'shabbat-registration'
 * @param {string} registrationDetails.firstName - Registrant first name
 * @param {string} registrationDetails.lastName - Registrant last name
 * @param {string} registrationDetails.email - Registrant email
 * @param {string} origin - Request origin for success/cancel URLs
 * @returns {Promise<Object>} - Stripe checkout session
 */
async function createShabbatRegistrationSession(registrationDetails, origin) {
  const { donationAmount, donationType, firstName, lastName, email } = registrationDetails;
  
  // Convert amount to cents for Stripe
  const amountInCents = Math.round(donationAmount * 100);
  
  // Ensure origin doesn't end with a slash
  const baseUrl = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  
  // For Shabbat registrations, redirect to donation-success page with special parameters
  // This will show donation success AND open external link in new tab
  const successUrl = `${baseUrl}/donation-success.html?donation=true&type=shabbat-registration&shabbat=true`;
  const cancelUrl = `${baseUrl}/yp/shabbat/register.html`;
  
  console.log('Shabbat registration success URL:', successUrl);
  console.log('Shabbat registration cancel URL:', cancelUrl);
  
  const productName = 'Shabbat Registration Donation';
  const description = 'Thank you for your donation with Shabbat registration';
  
  // Create session parameters for one-time payment
  const sessionParams = {
    payment_method_types: ['card'],
    metadata: {
      donationType,
      firstName,
      lastName,
      email,
      donationAmount
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: productName,
          description: description
        },
        unit_amount: amountInCents,
      },
      quantity: 1,
    }],
    mode: 'payment'
  };
  
  // Create a Stripe Checkout Session
  const session = await stripeClient.checkout.sessions.create(sessionParams);
  
  return {
    success: true,
    url: session.url,
    sessionId: session.id
  };
}

/**
 * Verify and construct Stripe webhook event
 * @param {string} payload - Request body as string
 * @param {string} signature - Stripe signature header
 * @returns {Object} - Stripe event
 */
function constructWebhookEvent(payload, signature) {
  // If webhook secret is configured, verify the signature
  if (config.stripe.webhookSecret) {
    return stripeClient.webhooks.constructEvent(
      payload, 
      signature, 
      config.stripe.webhookSecret
    );
  }
  
  // For testing or when webhook secret is not configured
  return JSON.parse(payload);
}

module.exports = {
  createDonationCheckoutSession,
  createShabbatRegistrationSession,
  constructWebhookEvent,
  stripe: stripeClient
}; 