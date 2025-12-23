import { getEBPrismaClient, getPortalPrismaClient } from "../../utils/dbUtils";
import { generateUniqueCode } from "../../utils/migrationUtils";
import {
  bundles,
  categories,
  employee_address,
  employees,
  services,
  subcategory,
  vendor_users,
  vendors,
} from "../../../prisma/generated/eb";
import { getOrgIdByBundleId } from "./planFlowMigrationConfig";

export const categoryMigrationConfig = async () => ({
  sourceTableName: "categories",
  targetTableName: "category",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: categories) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).category.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null; // Skip the migration for this record
    }
    return {
      id: oldRow.id,
      name: oldRow.name,
      createdAt: oldRow.created_at,
      updatedAt: oldRow.updated_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const vendorMigrationConfig = async () => ({
  sourceTableName: "vendors",
  targetTableName: "vendor",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: vendors) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).vendor.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null; // Skip the migration for this record
    }
    return {
      id: oldRow.id,
      name: oldRow.name,
      vendorCode: generateUniqueCode("VEN"),
      createdAt: oldRow.created_at,
      updatedAt: oldRow.updated_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const benefitServiceMigrationConfig = async () => ({
  sourceTableName: "subcategory",
  targetTableName: "BenefitService",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: subcategory) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).benefitService.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      name: oldRow.name,
      benefitServiceCode: generateUniqueCode("SER"),
      categoryId: oldRow.category_id,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const vendorBenefitServiceMigrationConfig = async () => ({
  sourceTableName: "services",
  targetTableName: "VendorBenefitService",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: services) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).vendorBenefitService.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      vendorId: oldRow.vendor_id,
      serviceId: oldRow.subcategory_id,
      createdAt: oldRow.created_at,
      updatedAt: oldRow.updated_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const vendorUserMigrationConfig = async () => ({
  sourceTableName: "vendor_users",
  targetTableName: "vendorUser",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: vendor_users) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).vendorUser.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    if (oldRow.dependent_id) {
      return {
        id: oldRow.id,
        vendorId: oldRow.vendor_id,
        clientConsumerId: oldRow.dependent_id,
        vendorUserId: oldRow.vendor_user_id,
        createdAt: oldRow.created_at,
        updatedAt: oldRow.updated_at,
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      };
    } else {
      return {
        id: oldRow.id,
        vendorId: oldRow.vendor_id,
        clientConsumerId: oldRow.employee_id,
        vendorUserId: oldRow.vendor_user_id,
        createdAt: oldRow.created_at,
        updatedAt: oldRow.updated_at,
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      };
    }
  },
});

export const bundleMigrationConfig = async () => ({
  sourceTableName: "bundles",
  targetTableName: "plan",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: bundles) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).plan.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    const orgDetails = await getOrgIdByBundleId(
      oldRow.id,
      await getEBPrismaClient(),
      await getPortalPrismaClient()
    );
    const today = new Date();
    const oneYearBefore = new Date(today);
    oneYearBefore.setFullYear(today.getFullYear() - 1);

    // Set end date to five years after today
    const fiveYearsAfter = new Date(today);
    fiveYearsAfter.setFullYear(today.getFullYear() + 1);
    return {
      id: oldRow.id,
      name:
        `${orgDetails.orgCode}-PLAN-${oldRow.id}` ||
        `Plan for Bundle ${oldRow.id}`,
      organizationId: orgDetails.orgId,
      noOfDependents: orgDetails.noOfDependents,
      startDate: oneYearBefore,
      endDate: fiveYearsAfter,
      planCode: generateUniqueCode("PLAN"),
      status: "ACTIVE",
      isArchived: false,
      archivedBy: null,
      archivedOn: null,
      walletSize: 0,
      createdBy: "MIGRATION_SCRIPT",
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const planAssignmentMigrationConfig = async () => ({
  sourceTableName: "employees",
  targetTableName: "planAssignment",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: employees) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).planAssignment.findUnique({
      where: { clientConsumerId: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      organizationId: oldRow.client_id,
      clientConsumerId: oldRow.id,
      planId: oldRow.bundle_id,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "migration_script",
      updatedBy: "migration_script",
      assignmentMode: "CUSTOM",
      assignmentDate: new Date(),
    };
  },
});

export const employeeDefaultAddressConfig = async () => ({
  sourceTableName: "employees",
  targetTableName: "bbxUserAddress",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: employees) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).bbxUserAddress.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      isPrimary: true,
      bbxUserId: null,
      clientConsumerId: oldRow.id,
      address1: oldRow?.address1 ? oldRow.address1 : "",
      address2: oldRow?.address2 ? oldRow.address2 : "",
      address3: oldRow?.address3 ? oldRow.address3 : "",
      city: oldRow?.city ? oldRow.city : "",
      state: oldRow?.state ? oldRow.state : "",
      country: oldRow?.country ? oldRow.country : "",
      zipCode: oldRow?.pin ? oldRow.pin : "",
      latLong: oldRow?.lat_long ? oldRow.lat_long : "",
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const employeeAddressMigrationConfig = async () => ({
  sourceTableName: "employee_address",
  targetTableName: "bbxUserAddress",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: employee_address) => {
    // Check if the record is already migrated by its unique ID
    const existingRecord = await (
      await getPortalPrismaClient()
    ).bbxUserAddress.findUnique({
      where: { id: oldRow.id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    if (oldRow.dependent_id) {
      return {
        id: oldRow.id,
        isPrimary: false,
        bbxUserId: null,
        clientConsumerId: oldRow.dependent_id,
        address1: oldRow?.address_1 ? oldRow.address_1 : "",
        address2: oldRow?.address_2 ? oldRow.address_2 : "",
        address3: oldRow?.address_3 ? oldRow.address_3 : "",
        city: oldRow?.city ? oldRow.city : "",
        state: oldRow?.state ? oldRow.state : "",
        country: oldRow?.country ? oldRow.country : "",
        zipCode: oldRow?.zip_code ? oldRow.zip_code : "",
        latLong: oldRow?.lat_long ? oldRow.lat_long : "",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      };
    } else {
      return {
        id: oldRow.id,
        isPrimary: false,
        clientConsumerId: oldRow.employee_id,
        address1: oldRow?.address_1 ? oldRow.address_1 : "",
        address2: oldRow?.address_2 ? oldRow.address_2 : "",
        address3: oldRow?.address_3 ? oldRow.address_3 : "",
        city: oldRow?.city ? oldRow.city : "",
        state: oldRow?.state ? oldRow.state : "",
        country: oldRow?.country ? oldRow.country : "",
        zipCode: oldRow?.zip_code ? oldRow.zip_code : "",
        latLong: oldRow?.lat_long ? oldRow.lat_long : "",
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
      };
    }
  },
});
