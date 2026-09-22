import { buildApp } from './app.js';
import { getConfig } from '@meow-analytics/config';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { startScheduler, stopScheduler } from './lib/scheduler.js';

async function start() {
  try {
    const config = getConfig();

    console.log('🐾 Initializing Meow Analytics API Server...');
    console.log(`🌍 Environment: ${config.NODE_ENV}`);

    // Ensure database tables are created and migrated
    console.log('📦 Verifying database schema...');
    await migrateDatabase();
    console.log('✅ Database schema ready.');

    const app = await buildApp();

    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    console.log(`🚀 Meow Analytics API running at http://${config.HOST}:${config.PORT}`);
    console.log(`🩺 Health check: http://${config.HOST}:${config.PORT}/api/health`);
    console.log(`🩺 Readiness check: http://${config.HOST}:${config.PORT}/api/ready`);

    // Start background aggregations & retention scheduler
    startScheduler();

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
        try {
          stopScheduler();
          await app.close();
          await closeDatabaseConnection();
          console.log('👋 Server shutdown complete.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    }
  } catch (err: any) {
    console.error('💥 Fatal error starting server:', err.message || err);
    process.exit(1);
  }
}

start();
