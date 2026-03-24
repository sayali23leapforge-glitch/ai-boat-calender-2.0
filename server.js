#!/usr/bin/env node

/**
 * Custom server entry point that loads error handlers BEFORE Next.js starts
 * This prevents unhandled promise rejections from crashing the process
 */

// Load error handlers FIRST - before any other code
require('./error-handler.js');

console.log('[Server] Error handlers loaded, starting Next.js server...');

// Now load and start Next.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: path.join(__dirname) });
const handle = app.getRequestHandler();

console.log('[Server] Next.js app created, waiting for preparation...');

app.prepare().then(() => {
  console.log('[Server] Next.js app prepared, creating HTTP server...');
  
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (e) {
      console.error('[Server] Error handling request:', e);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`[Server] ✅ Server ready at http://${host}:${port}`);
  });

  // Handle server errors
  server.on('error', (err) => {
    console.error('[Server] Server error:', err);
  });

  // Handle server close
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, gracefully shutting down...');
    server.close(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, gracefully shutting down...');
    server.close(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
  });
}).catch((err) => {
  console.error('[Server] Failed to prepare app:', err);
  process.exit(1);
});
