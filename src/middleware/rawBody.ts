import { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/**
 * Pass as the `verify` option to express.json() so the raw Buffer
 * is available on req.rawBody before JSON parsing.
 */
export function captureRawBody(
  req: Request,
  _res: Response,
  buf: Buffer,
): void {
  req.rawBody = buf;
}
