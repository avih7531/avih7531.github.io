# Rejewvenate Website

This repository contains the code for the Rejewvenate website, a platform for Jewish community events and donations.

## Project Structure

The project follows a modular architecture:

```
.
├── app.js                  # Main Express application
├── server.js               # Server entry point
├── config/                 # Configuration files
├── middlewares/            # Express middlewares
├── public/                 # Static files (HTML, CSS, client JS)
├── routes/                 # Express route handlers
├── services/               # Business logic services
└── utils/                  # Utility functions
```

### Key Components

- **app.js**: Main Express application that loads routes and middleware
- **config/**: Configuration for environment variables and app settings
- **middlewares/**: Express middleware functions
- **public/**: Static files served directly to clients
- **routes/**: API routes and endpoints
- **services/**: Core business logic
- **utils/**: Helper functions and utilities

## Setup and Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/rejewvenate-website.git
   cd rejewvenate-website
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   EDGE_CONFIG_ID=your-edge-config-id
   EDGE_CONFIG_TOKEN=your-edge-config-token
   STRIPE_SECRET_KEY=your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
   ```

4. Move static files to the public directory:
   ```
   npm run move-files
   ```

## Running the Application

### Development Mode

To run the application in development mode with automatic reloading:

```
npm run dev
```

### Production Mode

To run the application in production mode:

```
npm start
```

## Deployment to Vercel

This application is configured for deployment on Vercel. The `vercel.json` file contains the necessary configuration.

To deploy to Vercel:

1. Install Vercel CLI:
   ```
   npm install -g vercel
   ```

2. Deploy:
   ```
   vercel
   ```

## Features

- **Event Registration**: Users can register for Passover and other events
- **Donations**: Process donations via Stripe integration
- **Contact Form**: Allow users to send messages through a contact form
- **Admin Dashboard**: View and manage registrations

## Technologies Used

- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **Vercel Edge Config**: For storing registration data
- **Stripe**: Payment processing
- **HTML/CSS/JavaScript**: Frontend interface 