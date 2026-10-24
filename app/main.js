import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { PortalError, UrjaPortalClient } from './client.js';

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

export function createServer(client) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed' });
    try {
      if (url.pathname === '/health') return send(response, 200, { status: 'ok' });
      if (url.pathname === '/api/v1/meters') {
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 20);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
          return send(response, 400, { error: 'page must be positive and limit must be 1 to 100' });
        }
        return send(response, 200, await client.listMeters({ page, limit,
          status: url.searchParams.get('status'), transformerCode: url.searchParams.get('transformer_code') }));
      }
      if (url.pathname === '/api/v1/transformers') return send(response, 200, await client.listTransformers());
      const match = /^\/api\/v1\/meters\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      if (match) return send(response, 200, await client.getMeter(match[1]));
      return send(response, 404, { error: 'Route not found' });
    } catch (error) {
      const status = error instanceof PortalError ? error.status : 502;
      const message = error instanceof PortalError ? error.message : 'Portal response could not be parsed';
      return send(response, status, { error: message });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = config();
  createServer(new UrjaPortalClient(options)).listen(options.port, '127.0.0.1', () => {
    console.log(`Urja API listening on http://localhost:${options.port}`);
  });
}
