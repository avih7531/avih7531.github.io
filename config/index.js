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
  
  // Vercel Blob storage settings
  blob: {
    enabled: process.env.BLOB_MIRROR_ENABLED === '1' || true,
    storeId: process.env.BLOB_STORE_ID || 'store_5G8YAnelpqAcRsbj',
    baseUrl: process.env.BLOB_BASE_URL || 'https://5g8yanelpqacrsbj.public.blob.vercel-storage.com',
    token: process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_5G8YAnelpqAcRsbj_GFs9WgSFvELbVTW2QjBzHiNTzEYqHn',
    filename: 'passover-registrations.json',
    contentType: 'application/json',
    accessMode: 'public', // or 'private' if you prefer
    syncInterval: parseInt(process.env.BLOB_SYNC_INTERVAL_MINUTES || '60', 10), // sync interval in minutes
  },
  
  // Stripe settings
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_default_key_for_development_only',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  },
  
  // Vercel API settings
  vercel: {
    apiToken: process.env.VERCEL_API_TOKEN || 'zK6O71OhkWKKeCqq3X9NHW8S'
  },
  
  // Edge Config settings
  edge: {
    token: process.env.EDGE_CONFIG_TOKEN || '',
    failureThreshold: parseInt(process.env.EDGE_CONFIG_FAILURE_THRESHOLD, 10) || 3,
  },
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
  BLOB_MIRROR_ENABLED: config.blob.enabled ? 'Yes' : 'No',
  BLOB_STORE_ID: config.blob.storeId ? 'Defined' : 'Undefined',
  BLOB_TOKEN: config.blob.token ? 'Defined' : 'Undefined'
});

module.exports = config; 