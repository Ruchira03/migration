import { v4 as uuidv4 } from "uuid";
import {
  Package,
  PackageVersion,
  PackageBenefitService,
  PlanService,
  ServiceRestriction,
} from "../../../prisma/generated/portal";
import {
  EBClient,
  EBPrisma,
  getPortalPrismaClient,
  PortalClient,
} from "../../utils/dbUtils";
import { getEBPrismaClient } from "../../utils/dbUtils";
import { generateUniqueCode } from "../../utils/migrationUtils";
import { bundle_details } from "../../../prisma/generated/eb";
const BATCH_SIZE = 1000;

export const processBatch = async (offset: number) => {
  const portalClient = await getPortalPrismaClient();
  const ebClient = await getEBPrismaClient();

  try {
    const packageCache = new Map<string, string>();
    const packageVersions = new Map<string, string>();

    const bundleDetails = await ebClient.bundle_details.findMany({
      include: { bundles: true, services: true, vendors: true },
      skip: offset,
      take: BATCH_SIZE,
    });

    console.log(
      `Processing batch. Offset: ${offset}, Batch Size: ${bundleDetails.length}`
    );

    const {
      packagesData,
      packageVersionsData,
      packageBenefitServicesData,
      planServicesData,
      serviceRistrictionsData,
    } = await prepareMigrationData(
      bundleDetails,
      packageCache,
      packageVersions,
      ebClient,
      portalClient
    );
    await portalClient.$transaction(
      async (transactionClient) => {
        try {
          // console.log("Creating packages...");
          await transactionClient.package.createMany({
            data: packagesData,
            skipDuplicates: true,
          });
          // console.log("Packages created successfully");

          // console.log("Creating package versions...");
          await transactionClient.packageVersion.createMany({
            data: packageVersionsData,
            skipDuplicates: true,
          });
          // console.log("Package versions created successfully");

          // Collect mappings for updating currentVersionId
          const packageUpdates = Array.from(packageVersions.entries()).map(
            ([packageId, packageVersionId]) => ({
              packageId,
              packageVersionId,
            })
          );

          // Perform updateMany for currentVersionId in packages
          const updatePromises = packageUpdates.map(
            ({ packageId, packageVersionId }) =>
              transactionClient.package.update({
                where: { id: packageId },
                data: { currentVersionId: packageVersionId },
              })
          );

          await Promise.all(updatePromises);

          // console.log("Creating package benefit services...");
          await transactionClient.packageBenefitService.createMany({
            data: packageBenefitServicesData,
            skipDuplicates: true,
          });
          // console.log("Package benefit services created successfully");

          // console.log("Creating plan services...");
          await transactionClient.planService.createMany({
            data: planServicesData,
            skipDuplicates: true,
          });

          await transactionClient.serviceRestriction.createMany({
            data: serviceRistrictionsData,
            skipDuplicates: true,
          });
        } catch (error) {
          console.error("Error within transaction:", {
            // packagesData,
            // packageVersionsData,
            // packageBenefitServicesData,
            // planServicesData,
            // serviceRistrictionsData,
            error,
          });
          throw error;
        }
      },
      { timeout: 500000 }
    );

    console.log("Bundle to Plan migration completed successfully!");
  } catch (error) {
    console.error("Error during migration:", error);
  }
};

export const migrateBundlesToPlans = async () => {
  const totalRecords = 1000;
  const batchOffsets = Array.from(
    { length: Math.ceil(totalRecords / BATCH_SIZE) },
    (_, i) => i * BATCH_SIZE
  );

  await Promise.all(batchOffsets.map(processBatch));
};

const prepareMigrationData = async (
  bundleDetails: EBPrisma.bundle_detailsGetPayload<{
    include: { bundles: true; services: true; vendors: true };
  }>[],
  packageCache: Map<string, string>,
  packageVersions: Map<string, string>,
  ebClient: EBClient,
  orgClient: PortalClient
) => {
  const packagesData: Package[] = [];
  const packageVersionsData: PackageVersion[] = [];
  const packageBenefitServicesData: PackageBenefitService[] = [];
  const planServicesData: PlanService[] = [];
  const serviceRistrictionsData: Omit<ServiceRestriction, "id">[] = [];

  // Map to track services grouped by vendor and bundle
  const vendorServiceGroups: Record<string, Set<string>> = {};
  const bundleServiceGroups: Record<string, bundle_details> = {};

  bundleDetails.forEach((detail) => {
    const vendorId = detail.vendor_id;
    const serviceId = detail.service_id;
    const bundleId = detail.bundle_id;

    // Group services by vendor and bundle
    const groupKey = `${vendorId}:${bundleId}`;
    const serviceKey = `${bundleId}:${serviceId}`;
    if (!vendorServiceGroups[groupKey]) {
      vendorServiceGroups[groupKey] = new Set();
    }
    vendorServiceGroups[groupKey].add(serviceId);
    bundleServiceGroups[serviceKey] = detail;
  });

  for (const [groupKey, serviceSet] of Object.entries(vendorServiceGroups)) {
    const [vendorId, bundleId] = groupKey.split(":");

    // Check for duplicate package
    const servicesArray = Array.from(serviceSet).sort(); // Sort services for comparison
    const packageKey = `${vendorId}:${servicesArray.join(",")}`;
    // console.log("Migrating Package Key:", packageKey);

    if (!packageCache.has(packageKey)) {
      let packageId = uuidv4();

      packageCache.set(packageKey, packageId);
      const packageName = `Package for ${vendorId}-${uuidv4()}`; // Append unique UUID
      packagesData.push({
        id: packageId,
        packageCode: generateUniqueCode("PAC"),
        name: packageName,
        isArchived: false,
        vendorId: vendorId,
        currentVersionId: null,
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const packageVersionId = uuidv4();
      packageVersionsData.push({
        id: packageVersionId,
        packageId: packageId,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      });
      packageVersions.set(packageId, packageVersionId);
      // Add package benefit services, linking them to the correct package ID
      servicesArray.forEach((serviceId) => {
        packageBenefitServicesData.push({
          id: uuidv4(),
          packageVersionId: packageVersionId,
          vendorServiceId: serviceId,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "MIGRATION_SCRIPT",
          updatedBy: "MIGRATION_SCRIPT",
        });
      });
    }

    const packageId = packageCache.get(packageKey)!;

    // Handle plans (use bundleId as planId)
    const planId = bundleId; // Use bundleId as the planId
    console.log("Migrating Plan ID:", planId);

    // Link plan to package and services using the correct bundle details ID
    for (const serviceId of Array.from(serviceSet)) {
      const serviceKey = `${bundleId}:${serviceId}`;

      // console.log("Migrating Plan Service ID:", serviceKey);
      const orgDetails = await getOrgIdByBundleId(
        bundleId,
        ebClient,
        orgClient
      ); // Make sure this resolves before using orgDetails

      const couponDetails = await ebClient.coupons.findUnique({
        where: { id: bundleServiceGroups[serviceKey].coupon_id },
        select: { code: true },
      });
      // console.log("Coupon Details:", couponDetails);
      planServicesData.push({
        id: bundleServiceGroups[serviceKey].id,
        planId: planId,
        isPackage: true,
        isItem: false,
        vendorItemCode: "",
        vendorPackageCode: couponDetails?.code || "COUPON_CODE",
        organizationId: orgDetails.orgId,
        packageWalletSize: 0,
        packageVersionId: packageVersions.get(packageId) || "",
        vendorServiceId: serviceId,
        startDate: bundleServiceGroups[serviceKey].start_date,
        endDate: bundleServiceGroups[serviceKey].end_date,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      });

      // Add service restrictions
      serviceRistrictionsData.push({
        planServiceId: bundleServiceGroups[serviceKey].id,
        organizationId: orgDetails.orgId,
        serviceWalletSize: 0,
        walletType: 'not_applicable',
        walletMaxAmt: 0,
        walletTransactionLimit: 0,
        discount: 0,
        discountMaxAmt: 0,
        discountTransactionLimit: 0,
        cumulativeDiscount: 0,
        markupPercentage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      });
    }
  }

  return {
    packagesData,
    packageVersionsData,
    packageBenefitServicesData,
    planServicesData,
    serviceRistrictionsData,
  };
};

export async function getOrgIdByBundleId(
  bundleId: string,
  ebClient: EBClient,
  orgClient: PortalClient
) {
  const bundleMapping = await ebClient.bundle_mappings.findFirst({
    where: { bundle_id: bundleId },
  });
  const bundleDetails = await ebClient.bundle_details.findFirst({
    where: { bundle_id: bundleId },
    include: { plans: true },
  });

  const org = await orgClient.organization.findFirst({
    where: {
      id: bundleMapping?.client_id,
    },
    select: { orgCode: true },
  });
  // console.log({ bundleMapping, bundleDetails, org });

  return {
    orgId: bundleMapping?.client_id || "ORG_CODE",
    orgCode: org?.orgCode || "ORG_CODE",
    noOfDependents: parseDependents(bundleDetails?.plans.name || "E"),
    startDate: bundleDetails?.start_date || new Date(),
    endDate: bundleDetails?.end_date || new Date(),
  };
}

const parseDependents = (planName: string): number => {
  if (planName.includes("E+3")) return 3;
  if (planName.includes("E+5")) return 5;
  if (planName.includes("E+7")) return 7;
  return 0;
};
