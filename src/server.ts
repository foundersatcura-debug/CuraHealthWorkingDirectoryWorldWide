import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { initSocket } from './socket';
import { logger } from './utils/logger';

const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    logger.info('✅  Database connected');

    await connectRedis();
    logger.info('✅  Redis connected');

    httpServer.listen(env.PORT, () => {
      logger.info(`🚀  Qura Healthcare API running on http://localhost:${env.PORT}`);
      logger.info(`📡  API prefix: ${env.API_PREFIX}`);
      logger.info(`🌍  Environment: ${env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('❌  Failed to start server:', err);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully...`);

  httpServer.close(async () => {
    try {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('✅  Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

void start();
