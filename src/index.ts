import { generateCognitoCSV } from "./migration/configs/csvgenerator";
import {
  bbxUserMigrationConfig,
  futuriskEmployeeDumpMigrationConfig,
  futuriskPolicyDocumentMigrationConfig,
  petsMigrationConfig,
  vendorBusinessInfoDetailsMigrationConfig,
} from "./migration/configs/mobileAppMigrationConfig";
import {
  corporateMigrationConfig,
  departmentMigrationConfig,
  fillLookupDetails,
  gradeMigrationConfig,
  migrateCorporateDefaults,
  organizationMigrationConfig,
} from "./migration/configs/orgFlowMigrationConfig";
import { migrateBundleMappings } from "./migration/configs/planAssignmentConfig";
import { migrateBundlesToPlans } from "./migration/configs/planFlowMigrationConfig";
import { prodSupport } from "./migration/configs/prodSupportScripts";
import { migrateEmployeesAndDependents } from "./migration/configs/userFlowMigrationConfig";
import {
  categoryMigrationConfig,
  vendorMigrationConfig,
  benefitServiceMigrationConfig,
  vendorBenefitServiceMigrationConfig,
  vendorUserMigrationConfig,
  bundleMigrationConfig,
  planAssignmentMigrationConfig,
  employeeDefaultAddressConfig,
  employeeAddressMigrationConfig,
} from "./migration/configs/vendorFlowMigrationConfig";
import {
  initiateWallets,
  migrateClientWallets,
  migrateConsumerWallets,
  restoreProdUsers,
  updateCadabumsWallet,
  updateConsumerGroups,
  updateLabstackWallet,
} from "./migration/configs/walletMigrationConfig";
import { runMigration } from "./migration/migrate";
import { adminConfirmAllUsers, updateCognitoUserIds } from "./utils/authDriver";
import { pwaTest } from "./utils/pwatest";
import {
  migrateServiceItems,
  migrateUserServiceQuotas,
  updateWalletType,
} from "./utils/walletUtils";

async function runPreMigration() {
  const PreUserMigrations = [
    categoryMigrationConfig(),
    vendorMigrationConfig(),
    benefitServiceMigrationConfig(),
    vendorBenefitServiceMigrationConfig(),
    organizationMigrationConfig(),
    corporateMigrationConfig(),
    gradeMigrationConfig(),
    departmentMigrationConfig(),
  ];
  await fillLookupDetails();
  for (const migration of PreUserMigrations) {
    await runMigration(migration);
  }
  await migrateCorporateDefaults();
  await runMigration(bundleMigrationConfig());
}

async function runPostMigration() {
  const PostUserMigrations = [
    futuriskEmployeeDumpMigrationConfig(),
    futuriskPolicyDocumentMigrationConfig(),
    vendorBusinessInfoDetailsMigrationConfig(),
    petsMigrationConfig(),
    employeeDefaultAddressConfig(),
    employeeAddressMigrationConfig(),
  ];
  for (const migration of PostUserMigrations) {
    await runMigration(migration);
  }
}

async function migrate() {
  await runPreMigration();
  await migrateBundlesToPlans();
  await migrateBundleMappings();
  await migrateClientWallets();
  await updateWalletType();
  await migrateServiceItems();
  await updateCadabumsWallet();
  await migrateEmployeesAndDependents();
  await runMigration(planAssignmentMigrationConfig());
  await runMigration(vendorUserMigrationConfig());
  await runPostMigration();
  await initiateWallets();
  await migrateConsumerWallets();
  await migrateUserServiceQuotas();
  await restoreProdUsers();
  await bbxUserMigrationConfig();
  await adminConfirmAllUsers();
  await updateCognitoUserIds();
  await updateConsumerGroups();
  await updateLabstackWallet();
  await prodSupport();
  await pwaTest();
}

async function main() {
  console.log("Starting the execution of scripts...");
  await migrate();
  console.log("All scripts executed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error({ error }, "Unhandled error in main");
    process.exit(1);
  });
