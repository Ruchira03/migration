import fs from "fs";
import { PortalClient, EBClient } from "./dbUtils";
import { promises as fsPromises } from "fs";

// Utility function to write logs to a file using promises
async function writeLogToFile(
  logData: string[],
  fileName: string
): Promise<void> {
  try {
    //console.log("Writing log data to file...", logData);

    await fs.promises.appendFile(fileName, logData.join("\n") + "\n");
    console.log("Log data written to file:", fileName);
  } catch (err) {
    console.error("Error writing log to file:", err);
  }
}
// Main function to migrate data from one table to another
export async function migrateTable<SourceRow extends TargetRow, TargetRow>(
  sourceTableName: string,
  targetTableName: string,
  sourceClient: EBClient,
  targetClient: PortalClient,
  dataMapFunction: (row: SourceRow) => Promise<TargetRow>
): Promise<{
  success: boolean;
  logData: string[];
  skippedRecords: SourceRow[];
  processedRecords: SourceRow[];
}> {
  try {
    const startTime = Date.now();
    const logData: string[] = [];
    const skippedRecords: SourceRow[] = [];
    const processedRecords: SourceRow[] = [];

    // Step 1: Fetch data from the source table
    const oldData = await fetchDataFromTable<SourceRow>(
      sourceTableName,
      sourceClient
    );
    logData.push(
      `\nTotal records for ${targetTableName}-Migration in old EB DB: ${oldData.length}`
    );
    //console.log(`Fetched data from ${sourceTableName}:`, oldData);

    // Step 2: Map and transform the data
    const transformedData = await mapAndValidateData(
      oldData,
      dataMapFunction,
      skippedRecords,
      processedRecords
    );
    //console.log(`Transformed data for ${targetTableName}:`, transformedData);
    logData.push(
      `Total records skipped for ${targetTableName}-Migration(because it is already migrated): ${skippedRecords.length}`
    );
    logData.push(
      `Total Valid records to be migrated: ${transformedData.length} for ${targetTableName}-Migration`
    );
    // Step 3: Perform the migration
    const skipped = await performMigration<TargetRow>(
      transformedData,
      targetTableName,
      targetClient,
      startTime,
      skippedRecords,
      `${targetTableName}-Migration`,
      oldData.length,
      logData
    );

    // Step 4: Write logs to a file
    //console.log("Writing log data to file...", logData);

    await writeLogToFile(logData, "logFile.txt");

    return {
      success: true,
      logData,
      skippedRecords,
      processedRecords,
    };
  } catch (error: any) {
    console.error("Migration failed:", error);
    throw new Error(error.message);
  }
}

// Fetch data from the source table
async function fetchDataFromTable<RowType>(
  tableName: string,
  prisma: EBClient
): Promise<RowType[]> {
  // Define RowType with snake_case field names
  return prisma.$queryRawUnsafe<RowType[]>(`SELECT * FROM ${tableName}`);
}

// Map and validate the data
async function mapAndValidateData<SourceRow, TargetRow>(
  oldData: SourceRow[],
  dataMapFunction: (row: SourceRow) => Promise<TargetRow>,
  skippedRecords: SourceRow[],
  processedRecords: SourceRow[]
): Promise<Awaited<TargetRow>[]> {
  const transformedData = await Promise.all(
    oldData.map(async (row, idx) => {
      //console.log("Remaining records to process:", oldData.length - idx);
      try {
        const newData = await dataMapFunction(row);
        if (newData === null) {
          // If null, log the skipped record and don't include it in the final data
          skippedRecords.push(row);
          //console.log(`Skipping record with ID because its already migrated`);
          return null;
        }
        processedRecords.push(row);
        return newData;
      } catch (error: any) {
        skippedRecords.push(row);
        console.error(`Skipping record due to error: ${error.message}`);
        return null;
      }
    })
  );

  // Filter out null values and ensure correct type inference
  return transformedData.filter(
    (item): item is NonNullable<typeof item> => item !== null
  );
}

// Perform the migration to the target table
async function performMigration<RowType>(
  values: RowType[],
  targetTableName: string,
  prisma: PortalClient,
  startTime: number,
  skippedRecords: RowType[],
  migrationName: string,
  totalRecords: number,
  logData: string[]
): Promise<RowType[]> {
  if (values.length > 0) {
    logMigrationStart(logData, migrationName, totalRecords, values.length);
    //console.log(`Migrating ${values.length} records to ${targetTableName}`);

    logData.push(`\nStarting migration for ${migrationName}`);
    logData.push(`\nTotal records: ${totalRecords}`);
    logData.push(`\nValid records: ${values.length}`);

    // Perform the actual data insertion
    await (prisma as any)[targetTableName].createMany({
      data: values,
    });

    //in single insert : only for debugging
    // const BATCH_SIZE = 1; // Set batch size to 2000

    // for (let i = 0; i < values.length; i += BATCH_SIZE) {
    //   const batch = values.slice(i, i + BATCH_SIZE); // Slice values into batches of 2000
    //   console.log(`Batch ${i / BATCH_SIZE + 1} getting inserted.`);
    //   try {
    //     await Promise.all(
    //       batch.map(async (value) => {
    //         await (prisma as any)[targetTableName].create({
    //           data: value,
    //         });
    //       })
    //     );
    //     console.log(`Batch ${i / BATCH_SIZE + 1} processed successfully.`);
    //   } catch (error) {
    //     console.error(`Failed to process batch ${i / BATCH_SIZE + 1}`, batch);
    //     console.error(`Error: ${error}`);
    //     throw error;
    //   }
    // }

    await logMigrationCompletion(logData, migrationName, startTime);

    return skippedRecords;
  } else {
    console.log(`No valid entries to migrate for ${migrationName}.`);
    logData.push(
      `\n----------------------${migrationName} completed ---------------------------------\n`
    );
    return [];
  }
}

// Log the start of the migration process
async function logMigrationStart(
  logData: string[],
  migrationName: string,
  totalRecords: number,
  validRecords: number
): Promise<void> {
  console.log("Ruchira");

  console.log(
    `Starting migration for ${migrationName}\nTotal records: ${totalRecords}\nValid records: ${validRecords}`
  );
  logData.push(`\nStarting migration for ${migrationName}`);
  logData.push(`\nTotal records: ${totalRecords}`);
  logData.push(`\nValid records: ${validRecords}`);
}

// Log the completion of the migration process
async function logMigrationCompletion(
  logData: string[],
  migrationName: string,
  startTime: number
): Promise<void> {
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`\nMigration for ${migrationName} completed in ${duration} ms`);
  logData.push(`\nMigration for ${migrationName} completed in ${duration} ms`);
  logData.push(
    `\n----------------------${migrationName} completed ---------------------------------\n`
  );
}

export const generateUniqueCode = (prefix = "") => {
  const generatedCodes = new Set<string>();

  let code: string;

  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (generatedCodes.has(code));

  generatedCodes.add(code);
  return `${prefix}${code}`;
};

type MigrationConfig<TSource, TTarget> = {
  sourceTableName: string;
  targetTableName: string;
  sourceClient: EBClient;
  targetClient: PortalClient;
  mapData: (oldRow: TSource) => Promise<TTarget>;
};

export async function migrate<TSource extends TTarget, TTarget>(
  config: MigrationConfig<TSource, TTarget>
) {
  const {
    sourceTableName,
    targetTableName,
    sourceClient,
    targetClient,
    mapData,
  } = config;
  await migrateTable<TSource, TTarget>(
    sourceTableName,
    targetTableName,
    sourceClient,
    targetClient,
    mapData
  );
}
