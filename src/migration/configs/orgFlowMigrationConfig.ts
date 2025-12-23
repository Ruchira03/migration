import { clients, grades_and_departments } from "../../../prisma/generated/eb";
import {
  getEBPrismaClient,
  getPortalPrismaClient,
  PortalPrisma,
} from "../../utils/dbUtils";
import { generateUniqueCode } from "../../utils/migrationUtils";

//function to fill the state, city, pincode, website, countryCode
export const fillLookupDetails = async () => {
  const prisma = await getPortalPrismaClient();
  const pincode = [
    {
      id: "7b5dd2d1-0487-4775-9a16-981a05a59b74",
      createdAt: "2024-12-05T06:28:33.419Z",
      createdBy: "Rashmi",
      updatedAt: "2024-12-05T06:28:33.419Z",
      updatedBy: "Rashmi",
      cityName: "Bengaluru",
      pincode: "560041",
      stateCode: "KA",
    },
  ];
  const city = [
    {
      id: "8c653bb0-f843-4e65-9c3c-f2003b7aad58",
      stateCode: "KA",
      createdAt: "2024-12-05T05:49:55.292Z",
      createdBy: "Rashmi",
      updatedAt: "2024-12-05T05:49:55.292Z",
      updatedBy: "Rashmi",
      cityName: "Bengaluru",
    },
  ];
  const state = [
    {
      id: "1a8b33ef-219a-4c1d-a1e6-8c2b8ad75ec6",
      stateCode: "KA",
      createdAt: "2024-12-05T05:49:55.285Z",
      createdBy: "Rashmi",
      updatedAt: "2024-12-05T05:49:55.285Z",
      updatedBy: "Rashmi",
      countryCode: "IN",
      stateName: "Karnataka",
    },
  ];

  const country = [
    {
      id: "08b2e272-4355-47e5-b655-415e77585c9e",
      countryCode: "IN",
      createdAt: "2024-12-05T11:16:34.091Z",
      createdBy: "Master Admin",
      updatedAt: "2024-12-05T11:16:34.091Z",
      updatedBy: "Master Admin",
      countryName: "India",
    },
  ];

  await prisma.$transaction(async (tx) => {
    for (const coun of country) {
      const existingCountry = await tx.countryLookUp.findUnique({
        where: { countryCode: coun.countryCode },
      });
      if (!existingCountry) {
        await tx.countryLookUp.create({ data: coun });
      }
    }

    for (const stat of state) {
      const existingState = await tx.stateLookUp.findUnique({
        where: { stateCode: stat.stateCode },
      });
      if (!existingState) {
        await tx.stateLookUp.create({ data: stat });
      }
    }

    for (const cit of city) {
      const existingCity = await tx.cityLookUp.findFirst({
        where: { cityName: cit.cityName },
      });
      if (!existingCity) {
        await tx.cityLookUp.create({ data: cit });
      }
    }
  });
  console.log("Filled state,city,country,pincode lookup details successfully");
};

export const organizationMigrationConfig = async () => ({
  sourceTableName: "clients",
  targetTableName: "Organization",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: clients) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).organization.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      orgCode: generateUniqueCode("ORG"),
      organizationType: "CORPORATE", // Hardcoded ENUM
      name: oldRow.name,
      address: oldRow.address,
      state: "KA", // Placeholder to fill later
      city: "Bengaluru",
      pincode: "560041",
      website: "WEBSITE_PLACEHOLDER",
      multiLocation: false,
      intermediary: false,
      spocName: oldRow.spoc,
      spocEmail: oldRow.email,
      invitationStatus: "READY", // ENUM
      invitationExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      countryCode: "IN",
      spocMobile: oldRow.contact_number,
      consumersToInvite: 0,
      createdAt: oldRow.created_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedAt: oldRow.updated_at,
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const corporateMigrationConfig = async () => ({
  sourceTableName: "clients",
  targetTableName: "Corporate",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: clients) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).corporate.findUnique({
      where: { organizationId: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      gstNo: generateUniqueCode(), // Placeholder to fill later
      numberOfEmployees: oldRow.number_of_employees
        ? oldRow.number_of_employees
        : 0,
      businessType: "PRIVATE_LIMITED_COMPANY",
      enterpriseCategory: "MEDIUM",
      totalTurnOver: 0,
      domain: oldRow.domain,
      keywords: oldRow.keywords,
      organizationId: oldRow.id,
      createdAt: oldRow.created_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedAt: oldRow.updated_at,
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const migrateCorporateDefaults = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    // Fetch all Corporate records
    const corporateRecords = await prisma.corporate.findMany({
      include: {
        organization: true,
      },
    });

    for (const corporate of corporateRecords) {
      const organizationId = corporate.organization.id;

      await prisma.$transaction(async (tx) => {
        // Check if default configurations already exist
        const existingGeneralConfig = await tx.generalConfiguration.findUnique({
          where: { organizationId },
        });
        if (!existingGeneralConfig) {
          // Add Default Department
          await tx.department.create({
            data: {
              department: "Default",
              organizationId,
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
            },
          });

          // Add Default Grade
          await tx.grade.create({
            data: {
              grade: "Default",
              organizationId,
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
            },
          });

          // Add General Configuration
          const today = new Date();
          const oneYearBefore = new Date(today);
          oneYearBefore.setFullYear(today.getFullYear() - 1);

          // Set end date to five years after today
          const fiveYearsAfter = new Date(today);
          fiveYearsAfter.setFullYear(today.getFullYear() + 5);

          await tx.generalConfiguration.create({
            data: {
              organizationId,
              enableAdvancedReports: false,
              isDefault: false,
              storage: "10GB",
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
              subscriptionStartDate: oneYearBefore,
              subscriptionEndDate: fiveYearsAfter,
            },
          });

          // Add Benefit Configuration
          await tx.benefitConfiguration.create({
            data: {
              organizationId,
              isDefault: false,
              moduleSubscribed: false,
              employeeDependentAddition: false,
              gracePeriod: 15,
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
            },
          });

          // Add Insurance Configuration
          await tx.insuranceConfiguration.create({
            data: {
              organizationId,
              isDefault: false,
              dependentCategory: "e+2",
              employeeDependentAddition: false,
              gracePeriod: "ELW",
              moduleSubscribed: false,
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
            },
          });
        } else {
          console.log(
            `Default configurations already exist for organization: ${organizationId}`
          );
        }
      });
    }

    // Insert default employee policies only if they don't already exist
    const policiesToAdd = [
      {
        policyName:
          "GPA" as PortalPrisma.EmployeePolicyCreateInput["policyName"],
        policyDescription: "Group Personal Accident",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      {
        policyName:
          "GMC" as PortalPrisma.EmployeePolicyCreateInput["policyName"],
        policyDescription: "Group Medical Cover",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      {
        policyName:
          "GTP" as PortalPrisma.EmployeePolicyCreateInput["policyName"],
        policyDescription: "Group Term Policy",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
    ];

    for (const policy of policiesToAdd) {
      const existingPolicy = await prisma.employeePolicy.findUnique({
        where: {
          policyName: policy.policyName,
        },
      });

      if (!existingPolicy) {
        await prisma.employeePolicy.create({ data: policy });
        console.log(`Added policy: ${policy.policyName}`);
      } else {
        console.log(`Policy already exists: ${policy.policyName}`);
      }
    }
    //GP Consultation service
    await prisma.benefitService.upsert({
      where: { id: "2f97f49c-1830-4fdc-b4c0-8db283063a5e" },
      create: {
        id: "2f97f49c-1830-4fdc-b4c0-8db283063a5e",
        name: "GP Consultation(online)",
        benefitServiceCode: "SER123456",
        categoryId: "d5ca8cc4-4ce9-4cb6-aad5-d7a0c52e9313",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    await prisma.vendorBenefitService.upsert({
      where: { id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd48" },
      create: {
        id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd48",
        vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
        serviceId: "2f97f49c-1830-4fdc-b4c0-8db283063a5e",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });
    //ambuakance service
    await prisma.benefitService.upsert({
      where: { id: "2f97f49c-1830-4fdc-b4c0-8db283063b5y" },
      create: {
        id: "2f97f49c-1830-4fdc-b4c0-8db283063b5y",
        name: "Ambulance Service",
        benefitServiceCode: "SER123654",
        categoryId: "d5ca8cc4-4ce9-4cb6-aad5-d7a0c52e9313",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    await prisma.vendorBenefitService.upsert({
      where: { id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd52" },
      create: {
        id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd52",
        vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
        serviceId: "2f97f49c-1830-4fdc-b4c0-8db283063b5y",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    //Vision Consultation(online)
    await prisma.benefitService.upsert({
      where: { id: "2f97f49c-1830-4fdc-b4c0-8db283063c6p" },
      create: {
        id: "2f97f49c-1830-4fdc-b4c0-8db283063c6p",
        name: "Vision Consultation(online)",
        benefitServiceCode: "SER123729",
        categoryId: "d5ca8cc4-4ce9-4cb6-aad5-d7a0c52e9313",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    await prisma.vendorBenefitService.upsert({
      where: { id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd53" },
      create: {
        id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd53",
        vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
        serviceId: "2f97f49c-1830-4fdc-b4c0-8db283063c6p",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    //Dental Consultation(online)
    await prisma.benefitService.upsert({
      where: { id: "2f97f49c-1830-4fdc-b4c0-8db283063e8q" },
      create: {
        id: "2f97f49c-1830-4fdc-b4c0-8db283063e8q",
        name: "Dental Consultation(online)",
        benefitServiceCode: "SER123662",
        categoryId: "d5ca8cc4-4ce9-4cb6-aad5-d7a0c52e9313",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    await prisma.vendorBenefitService.upsert({
      where: { id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd82" },
      create: {
        id: "83b22c0d-abdb-4ee5-aaa0-05bbd7e9cd82",
        vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
        serviceId: "2f97f49c-1830-4fdc-b4c0-8db283063e8q",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      },
      update: {},
    });

    console.log("Corporate Defaults Migration completed successfully");
  } catch (error) {
    console.error(error, "Error occurred during corporate migration:");
    throw new Error("Migration failed");
  }
};

export const gradeMigrationConfig = async () => {
  const sourceClient = await getEBPrismaClient();
  const targetClient = await getPortalPrismaClient();

  // Fetch existing grades to reduce database calls
  const existingGrades = await targetClient.grade.findMany({
    select: { organizationId: true, grade: true },
  });
  const existingGradeSet = new Set(
    existingGrades.map((record) => `${record.organizationId}::${record.grade}`)
  );

  const uniqueGradesSet = new Set<string>();

  return {
    sourceTableName: "grades_and_departments",
    targetTableName: "grade",
    sourceClient,
    targetClient,

    mapData: async (oldRow: grades_and_departments) => {
      const client_id =
        typeof oldRow.client_id === "string" ? oldRow.client_id : "unknown";
      const grade =
        typeof oldRow.grade === "string" && oldRow.grade.trim()
          ? oldRow.grade.trim() == "any"
            ? "Default"
            : oldRow.grade.trim()
          : "Default";

      const uniqueKey = `${client_id}::${grade}`;

      // Skip if already processed or exists in target database
      if (
        uniqueGradesSet.has(uniqueKey) ||
        existingGradeSet.has(uniqueKey) ||
        grade === "Default"
      ) {
        //console.log(`Skipping duplicate or existing record: ${uniqueKey}`);
        return null;
      }

      // Add unique key to the processed set
      uniqueGradesSet.add(uniqueKey);
      console.log("unique key: ", uniqueKey);

      return {
        grade: grade,
        organizationId: client_id,
        createdAt: oldRow.created_at || new Date(),
        createdBy: "MIGRATION_SCRIPT",
        updatedAt: oldRow.updated_at || new Date(),
        updatedBy: "MIGRATION_SCRIPT",
      };
    },
  };
};

export const departmentMigrationConfig = async () => {
  const sourceClient = await getEBPrismaClient();
  const targetClient = await getPortalPrismaClient();

  // Fetch existing grades to reduce database calls
  const existingDepartments = await targetClient.department.findMany({
    select: { organizationId: true, department: true },
  });
  const existingDepartmentset = new Set(
    existingDepartments.map(
      (record) => `${record.organizationId}::${record.department}`
    )
  );

  const uniqueDepartmentSet = new Set<string>();

  return {
    sourceTableName: "grades_and_departments",
    targetTableName: "department",
    sourceClient,
    targetClient,

    mapData: async (oldRow: grades_and_departments) => {
      const client_id =
        typeof oldRow.client_id === "string" ? oldRow.client_id : "unknown";
      const department =
        typeof oldRow.department === "string" && oldRow.department.trim()
          ? oldRow.department.trim() == "any" ||
            oldRow.department.trim() == "UNKNOWN"
            ? "Default"
            : oldRow.department.trim()
          : "Default";

      const uniqueKey = `${client_id}::${department}`;

      // Skip if already processed or exists in target database
      if (
        uniqueDepartmentSet.has(uniqueKey) ||
        existingDepartmentset.has(uniqueKey) ||
        department === "Default"
      ) {
        //console.log(`Skipping duplicate or existing record: ${uniqueKey}`);
        return null;
      }

      // Add unique key to the processed set
      uniqueDepartmentSet.add(uniqueKey);
      console.log("unique key: ", uniqueKey);

      return {
        department: department,
        organizationId: client_id,
        createdAt: oldRow.created_at || new Date(),
        createdBy: "MIGRATION_SCRIPT",
        updatedAt: oldRow.updated_at || new Date(),
        updatedBy: "MIGRATION_SCRIPT",
      };
    },
  };
};
