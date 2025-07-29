# Rejewvenate Website

This repository contains the code for the Rejewvenate website, a platform for Jewish community events and donations.

## Project Structure

The project has been refactored for better organization and maintainability:

- `/public` - Contains all static assets (HTML, CSS, JS, images)
- `/routes` - Express route handlers organized by feature
- `/services` - Business logic and external service integrations
- `/middlewares` - Express middleware functions
- `/utils` - Utility functions used across the application
- `/config` - Configuration files and environment variable management
- `/data` - Local data storage for Edge Config fallback

### Key Files

- `server.js` - Entry point that starts the Express server
- `app.js` - Express application setup and middleware configuration
- `vercel.json` - Vercel deployment configuration
- `.env` - Environment variables (not committed to Git)

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Run the development server:
   ```
   npm run dev
   ```

3. The site will be available at [http://localhost:3000](http://localhost:3000)

## Deployment

The site is deployed on Vercel. All HTML and static assets are stored in the `/public` directory and served as static files.

The server-side code handles API requests through various endpoints configured in `vercel.json`.

## Features

- **Donations**: Process donations via Stripe integration
- **Contact Form**: Allow users to send messages through a contact form

## Technologies Used

- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **Stripe**: For payment processing
- **HTML/CSS/JavaScript**: Frontend interface 