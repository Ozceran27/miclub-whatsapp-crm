import type { NextFunction, Request, RequestHandler, Response } from "express";

export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

const asyncHandler = (handler: AsyncRouteHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export default asyncHandler;
