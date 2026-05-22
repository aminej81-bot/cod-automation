import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { captureRawBody } from './middleware/rawBody';
import router from './routes';
import logger from './utils/logger';

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());

// ─── HTTP logging ─────────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg: string) => logger.http(msg.trim()) },
  }),
);

// ─── Body parsing (raw body captured for HMAC verification) ───────────────────
app.use(
  express.json({
    limit: '1mb',
    verify: captureRawBody,
  }),
);
app.use(express.urlencoded({ extended: false }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', router);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
