/** Reusable OpenAPI component schemas (canonical shapes from CONTRACTS). */
export const components = {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    workerKey: { type: 'apiKey', in: 'header', name: 'X-Worker-Key' },
  },
  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object', nullable: true },
          },
        },
      },
    },
    User: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        username: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    AuthResult: {
      type: 'object',
      properties: {
        user: { $ref: '#/components/schemas/User' },
        token: { type: 'string' },
      },
    },
    Camera: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        rtspUrl: { type: 'string' },
        location: { type: 'string', nullable: true },
        enabled: { type: 'boolean' },
        status: { type: 'string', enum: ['stopped', 'connecting', 'live', 'error'] },
        lastError: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    BoundingBox: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
        confidence: { type: 'number' },
      },
    },
    Alert: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        cameraId: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: ['person_detected'] },
        label: { type: 'string' },
        confidence: { type: 'number' },
        detectionCount: { type: 'integer' },
        boundingBoxes: { type: 'array', items: { $ref: '#/components/schemas/BoundingBox' } },
        frameTimestamp: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    Pagination: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
        totalPages: { type: 'integer' },
      },
    },
  },
} as const;
