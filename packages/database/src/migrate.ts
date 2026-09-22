import { migrateDatabase, closeDatabaseConnection } from './client.js';

async function run() {
  console.log('🐾 Running Meow Analytics database migrations...');
  try {
    await migrateDatabase();
    console.log('✅ Migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

run();
