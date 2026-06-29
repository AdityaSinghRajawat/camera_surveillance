import { ERROR_CODE, type ErrorCode } from '../constants/errorCodes.constants';

/**
 * Typed application error. Services throw these; the central error middleware
 * maps them to the canonical `{ error: { code, message, details } }` response.
 * Generic + stateless — lives in utils.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, ERROR_CODE.VALIDATION_ERROR, message, details);
  }
  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, ERROR_CODE.UNAUTHORIZED, message);
  }
  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, ERROR_CODE.FORBIDDEN, message);
  }
  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, ERROR_CODE.NOT_FOUND, message);
  }
  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, ERROR_CODE.CONFLICT, message, details);
  }
  static workerUnavailable(message = 'Worker service is unavailable'): AppError {
    return new AppError(502, ERROR_CODE.WORKER_UNAVAILABLE, message);
  }
  static internal(message = 'Internal server error', details?: unknown): AppError {
    return new AppError(500, ERROR_CODE.INTERNAL_ERROR, message, details);
  }
}
