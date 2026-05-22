import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';

/** Verify Shopify HMAC-SHA256 signature on webhook requests */
export function verifyShopifyWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const signature = req.headers['x-shopify-hmac-sha256'] as string | undefined;

  if (!signature) {
    logger.warn('Shopify webhook: missing HMAC header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  if (!req.rawBody) {
    logger.warn('Shopify webhook: raw body not captured');
    res.status(400).json({ error: 'Raw body missing' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', config.shopify.webhookSecret)
    .update(req.rawBody)
    .digest('base64');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    logger.warn('Shopify webhook: invalid HMAC signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

/** Protect internal API routes with a shared secret header */
export function requireInternalSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = req.headers['x-internal-secret'] as string | undefined;

  if (!config.internalWebhookSecret || secret !== config.internalWebhookSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
