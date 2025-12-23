import {
  futurisk_employee_dump,
  futurisk_policy_documents,
  vendor_business_info_dtls,
  user_service_quota,
  service_usage_quota,
  pets,
} from "../../../prisma/generated/eb";
import { getEBPrismaClient, getPortalPrismaClient } from "../../utils/dbUtils";
import { generateUniqueCode } from "../../utils/migrationUtils";
import { mapGender } from "../../utils/userFlowUtils";

// Futurisk Employee Dump Migration
export const futuriskEmployeeDumpMigrationConfig = async () => ({
  sourceTableName: "futurisk_employee_dump",
  targetTableName: "futuriskEmployeeDump",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: futurisk_employee_dump) => {
    const existingRecord = await (
      await getPortalPrismaClient()
    ).futuriskEmployeeDump.findUnique({ where: { id: oldRow.id } });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      employeeCode: oldRow.employee_code,
      planName: oldRow.plan_name,
      corporateCode: oldRow.corporate_code,
      corporateName: oldRow.corporate_name,
      loginId: oldRow.login_id,
      password: oldRow.password,
      mobile: oldRow.mobile,
      relation: oldRow.relation,
      employeeName: oldRow.employee_name,
      gender: oldRow.gender,
      dob: oldRow.dob,
      doj: oldRow.doj,
      age: oldRow.age,
      location: oldRow.location,
      grade: oldRow.grade,
      businessUnit: oldRow.business_unit,
      department: oldRow.department,
      designation: oldRow.designation,
      dateOfInsurance: oldRow.date_of_insurance,
      sumInsured: oldRow.sum_insured,
      employeePremium: oldRow.employee_premium,
      companyPremium: oldRow.company_premium,
      gste: oldRow.gste,
      gstc: oldRow.gstc,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

// Futurisk Policy Document Migration
export const futuriskPolicyDocumentMigrationConfig = async () => ({
  sourceTableName: "futurisk_policy_documents",
  targetTableName: "futuriskPolicyDocument",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: futurisk_policy_documents) => {
    const existingRecord = await (
      await getPortalPrismaClient()
    ).futuriskPolicyDocument.findUnique({ where: { id: oldRow.id } });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      id: oldRow.id,
      policyPdf: oldRow.policy_pdf,
      corporateCode: oldRow.corporate_code,
      documentName: oldRow.document_name,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

// Vendor Business Info Details Migration
export const vendorBusinessInfoDetailsMigrationConfig = async () => ({
  sourceTableName: "vendor_business_info_dtls",
  targetTableName: "vendorBusinessInfoDetails",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: vendor_business_info_dtls) => {
    const existingRecord = await (
      await getPortalPrismaClient()
    ).vendorBusinessInfoDetails.findFirst({
      where: { vendorId: oldRow.vendor_id },
    });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    return {
      vendorId: oldRow.vendor_id,
      vendorName: oldRow.vendor_name,
      vendorGstin: oldRow.vendor_gstin,
      businessInfo: oldRow.business_info,
      supportEmail: oldRow.support_email,
      supportMobile: oldRow.support_mobile,
      createdAt: oldRow.created_at,
      updatedAt: oldRow.updated_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

// Pets Migration
export const petsMigrationConfig = async () => ({
  sourceTableName: "pets",
  targetTableName: "pet",
  sourceClient: await getEBPrismaClient(),
  targetClient: await getPortalPrismaClient(),
  mapData: async (oldRow: pets) => {
    const existingRecord = await (
      await getPortalPrismaClient()
    ).pet.findUnique({ where: { id: oldRow.id } });

    if (existingRecord) {
      console.log(`Record with ID ${oldRow.id} already migrated. Skipping.`);
      return null;
    }
    function normalizeDOB(dob: string | null): string | null {
      if (!dob) return null; // Handle null or undefined values

      // Check if the string is already in ISO-8601 format
      if (!isNaN(Date.parse(dob))) {
        return new Date(dob).toISOString(); // Return as ISO-8601
      }

      // Otherwise, treat it as a timestamp in milliseconds
      const timestamp = Number(dob);
      if (!isNaN(timestamp)) {
        return new Date(timestamp).toISOString(); // Convert to ISO-8601
      }

      throw new Error(`Invalid dob format: ${dob}`); // Throw error for invalid formats
    }

    return {
      id: oldRow.id,
      name: oldRow.name,
      kind: oldRow.kind,
      clientConsumerId: oldRow.employee_id,
      dob: normalizeDOB(oldRow.dob),
      imageUrl: oldRow.image_url,
      createdAt: oldRow.created_at,
      updatedAt: oldRow.updated_at,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    };
  },
});

export const bbxUserMigrationConfig = async () => {
  try {
    const prisma = await getEBPrismaClient(); // EB DB
    const portalPrisma = await getPortalPrismaClient(); // Portal DB

    // Fetch employees from EB
    const users = await prisma.employees.findMany({
      where: { mobile_number: { not: "" } },
      select: {
        id: true, // clientConsumerId
        mobile_number: true,
        name: true,
        dob: true,
        gender: true,
        personal_email: true,
        pin: true,
        bundle_id: true, // Plan ID
      },
      distinct: ["mobile_number"],
    });

    console.log(`Fetched ${users.length} users from EB`);

    // Prepare data for bulk insert
    const berryBoxUsersData = [];
    const mobileUserPlansData = [];
    const existingBbxUserIds = new Set(
      (
        await portalPrisma.berryBoxUser.findMany({
          select: { bbxUserId: true },
        })
      ).map((u) => u.bbxUserId)
    );

    for (const user of users) {
      const {
        id,
        mobile_number,
        name,
        dob,
        gender,
        personal_email,
        pin,
        bundle_id,
      } = user;

      if (!mobile_number) {
        console.log(`Skipping user: ${id} -> No mobile number`);
        continue;
      }
      let bbxUserId;
      do {
        bbxUserId = generateUniqueCode("BBX");
      } while (existingBbxUserIds.has(bbxUserId));
      existingBbxUserIds.add(bbxUserId);

      const [firstName, ...lastNameArr] = name ? name.split(" ") : ["", ""];
      const lastName = lastNameArr.join(" ") || "";

      // Prepare berryBoxUser data
      berryBoxUsersData.push({
        bbxUserId,
        mobile: `+91${mobile_number}`,
        firstName,
        lastName,
        dob,
        gender: mapGender(gender),
        personalEmail: personal_email,
        pinCode: pin,
        createdBy: "MIGRATION_SCRIPT",
        updatedBy: "MIGRATION_SCRIPT",
        cognitoUserId: bbxUserId, // Placeholder for Cognito ID
      });

      // Prepare mobileUserPlans data (only if bundle_id exists)
      if (bundle_id) {
        mobileUserPlansData.push({
          bbxUserId,
          clientConsumerId: id,
          planId: bundle_id,
          planTag: "Corporate Plan",
          createdBy: "MIGRATION_SCRIPT",
          updatedBy: "MIGRATION_SCRIPT",
        });
      }

      // console.log(`Prepared user: ${id} -> bbxUserId: ${bbxUserId}`);
    }

    console.log(
      "Prepared data for bulk insert",
      berryBoxUsersData
      // mobileUserPlansData.length
    );
    // Perform bulk insert using a transaction
    await portalPrisma.$transaction([
      portalPrisma.berryBoxUser.createMany({
        data: berryBoxUsersData,
        // skipDuplicates: true,
      }),
      portalPrisma.mobileUserPlans.createMany({
        data: mobileUserPlansData,
        // skipDuplicates: true,
      }),
    ]);

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
};
