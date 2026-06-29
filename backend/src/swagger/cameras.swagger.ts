/** OpenAPI paths for the cameras module (CONTRACTS §4.2, §4.4). */
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

const cameraResponse = {
  description: 'Camera',
  content: {
    'application/json': {
      schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Camera' } } },
    },
  },
} as const;

export const cameraPaths = {
  '/api/v1/cameras': {
    get: {
      tags: ['Cameras'],
      summary: 'List the current user\'s cameras',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Camera' } } } } } },
        },
      },
    },
    post: {
      tags: ['Cameras'],
      summary: 'Create a camera',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'rtspUrl'],
              properties: {
                name: { type: 'string' },
                rtspUrl: { type: 'string' },
                location: { type: 'string', nullable: true },
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 201: cameraResponse },
    },
  },
  '/api/v1/cameras/{id}': {
    get: { tags: ['Cameras'], summary: 'Get a camera', security: [{ bearerAuth: [] }], parameters: [idParam], responses: { 200: cameraResponse, 404: { description: 'Not found' } } },
    patch: {
      tags: ['Cameras'],
      summary: 'Update a camera',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                rtspUrl: { type: 'string' },
                location: { type: 'string', nullable: true },
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 200: cameraResponse },
    },
    delete: { tags: ['Cameras'], summary: 'Delete a camera', security: [{ bearerAuth: [] }], parameters: [idParam], responses: { 204: { description: 'Deleted' } } },
  },
  '/api/v1/cameras/{id}/start': {
    post: { tags: ['Cameras'], summary: 'Start worker processing', security: [{ bearerAuth: [] }], parameters: [idParam], responses: { 200: cameraResponse, 502: { description: 'Worker unavailable' } } },
  },
  '/api/v1/cameras/{id}/stop': {
    post: { tags: ['Cameras'], summary: 'Stop worker processing', security: [{ bearerAuth: [] }], parameters: [idParam], responses: { 200: cameraResponse } },
  },
  '/api/v1/cameras/{id}/stream/offer': {
    post: {
      tags: ['Cameras'],
      summary: 'WebRTC signaling: exchange SDP offer for answer',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['sdp', 'type'], properties: { sdp: { type: 'string' }, type: { type: 'string', enum: ['offer'] } } } } },
      },
      responses: {
        200: {
          description: 'SDP answer',
          content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { sdp: { type: 'string' }, type: { type: 'string', enum: ['answer'] } } } } } } },
        },
      },
    },
  },
  '/api/v1/cameras/{id}/alerts': {
    get: {
      tags: ['Alerts'],
      summary: 'List alerts for one owned camera',
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam,
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Alert' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } },
        },
      },
    },
  },
} as const;
