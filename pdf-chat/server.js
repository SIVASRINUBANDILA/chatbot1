const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import Netlify serverless function handlers
const authHandler = require('./backend/auth').handler;
const chatHandler = require('./backend/chat').handler;
const favsHandler = require('./backend/favs').handler;
const sessionsHandler = require('./backend/sessions').handler;

// Adapter to transform Express req/res to Netlify event/response format
async function handleRequest(handler, req, res) {
  // Construct a Netlify-compatible event object
  const event = {
    httpMethod: req.method,
    headers: req.headers,
    queryStringParameters: req.query || {},
    body: req.method !== 'GET' && req.method !== 'DELETE' ? JSON.stringify(req.body) : (req.body ? JSON.stringify(req.body) : null),
    path: req.path,
  };

  try {
    const result = await handler(event);

    // Set headers returned by the handler
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
    }

    // Send response
    res.status(result.statusCode || 200).send(result.body);
  } catch (error) {
    console.error(`Error handling ${req.method} ${req.path}:`, error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
}

// Serve static frontend files (useful for a monolith deployment on Render)
app.use(express.static('frontend'));

// API Routes
const routes = [
  { path: '/api/auth', handler: authHandler },
  { path: '/api/chat', handler: chatHandler },
  { path: '/api/favs', handler: favsHandler },
  { path: '/api/sessions', handler: sessionsHandler },
  // Duplicate for Netlify serverless path calls just in case
  { path: '/.netlify/functions/auth', handler: authHandler },
  { path: '/.netlify/functions/chat', handler: chatHandler },
  { path: '/.netlify/functions/favs', handler: favsHandler },
  { path: '/.netlify/functions/sessions', handler: sessionsHandler },
];

routes.forEach(route => {
  app.all(route.path, (req, res) => handleRequest(route.handler, req, res));
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(__dirname + '/frontend/index.html');
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` RAG PDF Chat stand-alone server starting up...`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Serve static assets from: ./frontend`);
  console.log(`==================================================`);
});
