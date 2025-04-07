/**
 * Server entry point
 * This file imports the Express app and starts the server
 */
const app = require('./app');

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`http://localhost:${port}`);
}); 