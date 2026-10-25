/**
 * @fileoverview Lightweight HTTP server that:
 *  1. Serves static files (index.html, admin.html, etc.) from the project root.
 *  2. Exposes a REST API for the admin configuration panel:
 *
 *     GET    /api/temas          — list all topics
 *     POST   /api/temas          — add a topic
 *     PUT    /api/temas/:id      — update a topic (partial patch)
 *     DELETE /api/temas/:id      — remove a topic
 *
 * Usage:
 *   node server.mjs
 *   node server.mjs --port 4000
 *
 * Environment variables:
 *   PORT   — listening port (default 3000)
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JsonConfigRepository } from './src/infrastructure/config/JsonConfigRepository.mjs';
import { ConfigService } from './src/core/config/ConfigService.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------------------
// Bootstrap ConfigService
// ---------------------------------------------------------------------------
const repo = new JsonConfigRepository();
const configService = new ConfigService(repo);
await configService.loadTemas();

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sends a JSON response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

/**
 * Reads and parses the request body as JSON.
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// API router
// ---------------------------------------------------------------------------

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<boolean>} true if request was handled as API, false otherwise.
 */
async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return true;
  }

  // GET /api/temas
  if (pathname === '/api/temas' && method === 'GET') {
    const temas = await configService.loadTemas();
    jsonResponse(res, 200, { temas });
    return true;
  }

  // POST /api/temas
  if (pathname === '/api/temas' && method === 'POST') {
    try {
      const body = await parseBody(req);
      await configService.addTema(body);
      jsonResponse(res, 201, { temas: configService.getTemas() });
    } catch (err) {
      jsonResponse(res, 400, { error: err.message });
    }
    return true;
  }

  // PUT /api/temas/:id
  const putMatch = pathname.match(/^\/api\/temas\/([^/]+)$/);
  if (putMatch && method === 'PUT') {
    const id = decodeURIComponent(putMatch[1]);
    try {
      const body = await parseBody(req);
      await configService.updateTema(id, body);
      jsonResponse(res, 200, { temas: configService.getTemas() });
    } catch (err) {
      jsonResponse(res, 400, { error: err.message });
    }
    return true;
  }

  // DELETE /api/temas/:id
  const deleteMatch = pathname.match(/^\/api\/temas\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const id = decodeURIComponent(deleteMatch[1]);
    try {
      await configService.deleteTema(id);
      jsonResponse(res, 200, { temas: configService.getTemas() });
    } catch (err) {
      jsonResponse(res, 404, { error: err.message });
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Static file handler
// ---------------------------------------------------------------------------

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  // Security: prevent path traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath);
    const mime = MIME[ext] ?? 'application/octet-stream';
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

// ---------------------------------------------------------------------------
// Main server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const handled = await handleApi(req, res);
    if (!handled) await handleStatic(req, res);
  } catch (err) {
    console.error('[server] Unhandled error:', err);
    jsonResponse(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Radar de novedades ▶  http://localhost:${PORT}`);
  console.log(`Panel de administración  http://localhost:${PORT}/admin.html`);
});
