import { getDatabase, migrateDatabase, closeDatabaseConnection } from './client.js';
import { projects, projectDomains, apiKeys } from './schema/index.js';
import { generateProjectId, generateSiteId, generateDomainId, generateApiKeyId, generateApiKey } from '@meow-analytics/shared';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding Meow Analytics database...');
  try {
    await migrateDatabase();
    const db = getDatabase();

    // Check if Meow Stream project already exists
    const existing = await db.select().from(projects).where(eq(projects.name, 'Meow Stream')).limit(1);

    if (existing.length > 0) {
      console.log('ℹ️ Demo project "Meow Stream" already exists. Skipping seed.');
      return;
    }

    const projectId = generateProjectId();
    const siteId = generateSiteId();

    console.log(`Creating project "Meow Stream" (ID: ${projectId}, Site ID: ${siteId})...`);
    await db.insert(projects).values({
      id: projectId,
      name: 'Meow Stream',
      site_id: siteId,
      status: 'active',
      timezone: 'Asia/Kolkata',
    });

    const domainId = generateDomainId();
    console.log('Adding domain "stream.meowanalytics.dev"...');
    await db.insert(projectDomains).values({
      id: domainId,
      project_id: projectId,
      domain: 'stream.meowanalytics.dev',
      verified: true,
    });

    const keyData = generateApiKey();
    const keyId = generateApiKeyId();
    console.log(`Generating API Key "${keyData.keyPrefix}..."`);
    await db.insert(apiKeys).values({
      id: keyId,
      project_id: projectId,
      name: 'Default Production Key',
      key_hash: keyData.keyHash,
      key_prefix: keyData.keyPrefix,
    });

    console.log('----------------------------------------------------');
    console.log('🎉 Seed complete! Initial credentials:');
    console.log(`   Project: Meow Stream`);
    console.log(`   Site ID: ${siteId}`);
    console.log(`   API Key: ${keyData.key} (SAVE THIS, NOT STORED AGAIN)`);
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

seed();
