import { migrate } from "../utils/migrationUtils";

export async function runMigration(configPromise: Promise<any>) {
  try {
    const config = await configPromise;
    console.log(`Starting migration for ${config.sourceTableName}...`);
    await migrate(config);
    console.log(`Migration completed for ${config.targetTableName}!`);
  } catch (error) {
    console.error({ error }, `Error in migrating ${configPromise}`);
    throw error;
  }
}
