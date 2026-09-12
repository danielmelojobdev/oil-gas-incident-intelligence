/** Typed errors so the HTTP layer can map them to status codes without `instanceof any`. */

export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 404, 'not_found');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'validation_error', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'unauthorized');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super(message, 403, 'forbidden');
  }
}

export class ProviderError extends AppError {
  constructor(
    readonly providerId: string,
    message: string,
    readonly retryable: boolean = true,
  ) {
    super(`[${providerId}] ${message}`, 502, 'provider_error');
  }
}

export class AiResponseError extends AppError {
  constructor(
    message: string,
    readonly rawResponse: string,
  ) {
    super(message, 502, 'ai_response_error');
  }
}

export class TimeoutError extends AppError {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms}ms`, 504, 'timeout');
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
