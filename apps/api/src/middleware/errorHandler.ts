import type { ErrorRequestHandler } from "express";
import { asLegacyUnknownCode, type ApiErrorCode, type ApiErrorResponse } from "@miclub/shared";

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  code?: string;
  retryable?: boolean;
  batchId?: string;
  details?: unknown;
};

const getStatusCode = (error: HttpError): number => {
  const status = error.statusCode ?? error.status;
  return typeof status === "number" && status >= 400 && status < 600 ? status : 500;
};

export const errorHandler: ErrorRequestHandler = (error: HttpError, req, res, _next) => {
  const status = getStatusCode(error);
  const message = status >= 500 && !error.expose ? "Error interno del servidor." : error.message;

  if (status >= 500) {
    if (process.env.NODE_ENV === "production") console.error({ message: error.message, requestId: req.requestId, status });
    else console.error(error);
  }

  const code = (error.code
    ? asLegacyUnknownCode<"api-error">(error.code)
    : status === 500 ? "INTERNAL_ERROR" : "HTTP_ERROR") satisfies ApiErrorCode;
  const response = {
    ok: false,
    error: true,
    message,
    status,
    code,
    batchId: error.batchId,
    details: error.details,
    retryable: error.retryable ?? status >= 500,
    requestId: req.requestId
  } satisfies ApiErrorResponse;
  res.status(status).json(response);
};

export default errorHandler;
