// Configuration settings for the application
require('dotenv').config();

// Environment variables
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: process.env.VERCEL === '1',
  vercelEnv: process.env.VERCEL_ENV,
  vercelUrl: process.env.VERCEL_URL,
  
  // Stripe settings
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_default_key_for_development_only',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },
};

// Log available environment variables (without sensitive values)
console.log('Environment configuration:', {
  NODE_ENV: config.nodeEnv,
  VERCEL: config.isVercel,
  VERCEL_ENV: config.vercelEnv,
  VERCEL_URL: config.vercelUrl,
});

module.exports = config; 