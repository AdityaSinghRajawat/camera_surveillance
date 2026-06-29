import { Hono } from 'hono';
import { components } from './components.swagger';
import { authPaths } from './auth.swagger';
import { cameraPaths } from './cameras.swagger';
import { alertPaths } from './alerts.swagger';

/** Assembled OpenAPI 3.0 document from per-module path definitions. */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Skylark Surveillance API',
    version: '1.0.0',
    description:
      'Real-time camera surveillance backend. Auth (JWT), camera CRUD, alert filtering/pagination, and realtime WebSocket fan-out. See /ws for the WebSocket protocol.',
  },
  servers: [{ url: '/' }],
  components,
  paths: {
    ...authPaths,
    ...cameraPaths,
    ...alertPaths,
  },
} as const;

const SWAGGER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Skylark API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({ url: '/api/v1/docs/openapi.json', dom_id: '#swagger-ui' });
      };
    </script>
  </body>
</html>`;

/** Router serving Swagger UI + the raw OpenAPI JSON. */
export const swaggerRoute = new Hono();
swaggerRoute.get('/docs/openapi.json', (c) => c.json(openApiDocument));
swaggerRoute.get('/docs', (c) => c.html(SWAGGER_HTML));
