/** OpenAPI paths for the alerts module (CONTRACTS §4.3, §4.5). */
export const alertPaths = {
  '/api/v1/alerts': {
    get: {
      tags: ['Alerts'],
      summary: 'List alerts (filter by camera + time range, paginated)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'cameraId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/Alert' } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/v1/internal/alerts': {
    post: {
      tags: ['Internal'],
      summary: 'Ingest a detection event (worker only)',
      security: [{ workerKey: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } },
      },
      responses: { 201: { description: 'Stored + broadcast' } },
    },
  },
  '/api/v1/internal/stats': {
    post: { tags: ['Internal'], summary: 'Ingest per-camera stats (worker only)', security: [{ workerKey: [] }], responses: { 204: { description: 'Broadcast' } } },
  },
  '/api/v1/internal/camera-state': {
    post: { tags: ['Internal'], summary: 'Ingest camera state change (worker only)', security: [{ workerKey: [] }], responses: { 204: { description: 'Updated + broadcast' } } },
  },
} as const;
