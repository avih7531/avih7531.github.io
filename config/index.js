// Configuration settings for the application
require('dotenv').config();

// Environment variables
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: process.env.VERCEL === '1',
  vercelEnv: process.env.VERCEL_ENV,
  vercelUrl: process.env.VERCEL_URL,
  
  // Edge Config settings
  edgeConfig: {
    id: process.env.EDGE_CONFIG_ID || 'ecfg_u19oenik3gvnaimrebefbcaoe6dy',
    token: process.env.EDGE_CONFIG_TOKEN || '98e90ddb-8e17-49b6-b53b-ebf4677a8a7b',
    url: function() {
      return `https://edge-config.vercel.com/${this.id}`;
    },
    connectionString: function() {
      return `https://edge-config.vercel.com/${this.id}?token=${this.token}`;
    }
  },
  
  // Stripe settings
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_default_key_for_development_only',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },
  
  // Vercel API settings
  vercel: {
    apiToken: process.env.VERCEL_API_TOKEN || 'zK6O71OhkWKKeCqq3X9NHW8S'
  }
};

// Ensure EDGE_CONFIG environment variable is set for the SDK
if (!process.env.EDGE_CONFIG) {
  process.env.EDGE_CONFIG = config.edgeConfig.connectionString();
}

// Log available environment variables (without sensitive values)
console.log('Environment configuration:', {
  NODE_ENV: config.nodeEnv,
  VERCEL: config.isVercel,
  VERCEL_ENV: config.vercelEnv,
  VERCEL_URL: config.vercelUrl,
  EDGE_CONFIG: process.env.EDGE_CONFIG ? 'Defined' : 'Undefined',
  EDGE_CONFIG_ID: config.edgeConfig.id ? 'Defined' : 'Undefined',
  EDGE_CONFIG_TOKEN: config.edgeConfig.token ? 'Defined' : 'Undefined',
  VERCEL_API_TOKEN: config.vercel.apiToken ? 'Defined' : 'Undefined',
});

module.exports = config; 