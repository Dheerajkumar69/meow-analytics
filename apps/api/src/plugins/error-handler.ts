import { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Invalid or missing authentication credentials') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied to this resource') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, 'CONFLICT', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  // Centralized Error Handler
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Zod Validation Errors
    if (error instanceof ZodError) {
      const message = error.issues.map((i) => i.message).join('; ');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: message || 'Invalid request payload',
        },
      });
    }

    // 2. Explicit Application Errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // 3. Fastify HTTP Errors (e.g. body parsing, schema validation, 400 Bad Request)
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      let code = 'BAD_REQUEST';
      if (fastifyError.statusCode === 400) code = 'BAD_REQUEST';
      if (fastifyError.statusCode === 401) code = 'UNAUTHORIZED';
      if (fastifyError.statusCode === 403) code = 'FORBIDDEN';
      if (fastifyError.statusCode === 404) code = 'NOT_FOUND';

      return reply.status(fastifyError.statusCode).send({
        error: {
          code,
          message: fastifyError.message,
        },
      });
    }

    // 4. Unknown / Internal Server Errors
    // NEVER expose stack traces, database credentials, internal paths, or env vars
    request.log.error({ err: error }, 'Unhandled internal server error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal server error occurred',
      },
    });
  });

  // Centralized Not Found Handler
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
