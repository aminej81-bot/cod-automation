import 'dotenv/config';
import http from 'http';
import app from './app';
import { config } from './config';
import logger from './utils/logger';
import prisma from './lib/prisma';
import { startJobs } from './jobs';

const server = http.createServer(app);

async function start(): Promise<void> {
  // Verify DB connectivity
  await prisma.$connect();
  logger.info('Database connected');

  server.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, {
      env: config.nodeEnv,
      timezone: config.timezone,
    });
  });

  startJobs();
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (err) {
      logger.error('Error disconnecting database', { err });
    }

    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
