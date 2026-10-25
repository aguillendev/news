/**
 * server.mjs — Lightweight HTTP API server for news config management.
 *
 * Endpoints:
 *   GET  /api/config          → returns current temas from estado.json
 *   PUT  /api/config          → replaces temas array (validates before write)
 *   GET  /                    → serves index.html
 *   GET  /admin               → serves admin.html
 *   GET  /<file>              → serves static files from project root
 *
 * Usage:
 *   node server.mjs
 *   PORT=3000 node server.mjs
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTemas } from "./src/core/config/ConfigValidator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ESTADO_PATH = path.join(__dirname, "estado.json");
const PORT = Number(process.env.PORT ?? 3000);

// ── MIME types ──────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function readEstado() {
  const raw = await fs.readFile(ESTADO_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeEstado(estado) {
  const tmp = `${ESTADO_PATH}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(estado, null, 2)}\n`, "utf-8");
  await fs.rename(tmp, ESTADO_PATH); // atomic swap
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleGetConfig(req, res) {
  try {
    const estado = await readEstado();
    json(res, 200, { temas: estado.temas });
  } catch (err) {
    json(res, 500, { error: `Failed to read config: ${err.message}` });
  }
}

async function handlePutConfig(req, res) {
  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const { temas } = body;
  const validation = validateTemas(temas);
  if (!validation.valid) {
    json(res, 422, { error: "Validation failed.", details: validation.errors });
    return;
  }

  try {
    const estado = await readEstado();

    // Preserve ultimaEjecucion for existing topics; set epoch for new ones
    const existingMap = new Map(
      estado.temas.map((t) => [t.id, t.ultimaEjecucion]),
    );

    const mergedTemas = temas.map((t) => ({
      id: t.id.trim(),
      nombre: t.nombre.trim(),
      consulta: t.consulta.trim(),
      frecuenciaHoras: t.frecuenciaHoras,
      ultimaEjecucion:
        existingMap.get(t.id.trim()) ?? new Date(0).toISOString(),
    }));

    await writeEstado({ ...estado, temas: mergedTemas });
    json(res, 200, { ok: true, temas: mergedTemas });
  } catch (err) {
    json(res, 500, { error: `Failed to save config: ${err.message}` });
  }
}

async function handleStatic(req, res, urlPath) {
  // Map /admin → /admin.html, / → /index.html
  let filePath;
  if (urlPath === "/" || urlPath === "") {
    filePath = path.join(__dirname, "index.html");
  } else if (urlPath === "/admin") {
    filePath = path.join(__dirname, "admin.html");
  } else {
    filePath = path.join(__dirname, urlPath.slice(1)); // strip leading /
  }

  // Security: prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(__dirname)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
}

// ── Request dispatcher ────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (pathname === "/api/config" && req.method === "GET") {
    await handleGetConfig(req, res);
  } else if (pathname === "/api/config" && req.method === "PUT") {
    await handlePutConfig(req, res);
  } else if (req.method === "GET") {
    await handleStatic(req, res, pathname);
  } else {
    json(res, 405, { error: "Method Not Allowed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`🚀 News config server running at http://localhost:${PORT}`);
    console.log(`   Admin panel: http://localhost:${PORT}/admin`);
  });
}

export { server, handleGetConfig, handlePutConfig, readEstado, writeEstado };
