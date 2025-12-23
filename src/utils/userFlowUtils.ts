import { dependents } from "../../prisma/generated/eb";
import { $Enums } from "../../prisma/generated/portal";
import { EBPrisma, PortalClient, PortalPrisma } from "./dbUtils";
import { generateUniqueCode } from "./migrationUtils";

const MIGRATION_SCRIPT = "MIGRATION_SCRIPT";
const INVITATION_EXPIRY_DAYS = 400;
const DEFAULT_GRADE = "Default";
const DEFAULT_COUNTRY_CODE = "+91";

export const getClientConsumerData = (
  person: any,
  consumerType: $Enums.ConsumerType,
  overrides = {}
) => {
  const isValidDate = (date: any) => {
    const parsedDate = new Date(date);
    return !isNaN(parsedDate.getTime());
  };

  const splitName = (name: string) => {
    if (!name) return { firstName: "Unknown", lastName: "" }; // Default to "Unknown" for firstName if no name is provided
    const nameParts = name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""; // Default lastName to empty string
    return { firstName, lastName };
  };

  const { firstName, lastName } = splitName(person.name);

  const dob = isValidDate(person.dob) ? new Date(person.dob) : new Date();

  return {
    id: person.id as string,
    firstName: firstName,
    lastName: lastName,
    consumerType: consumerType,
    gender: mapGender(person.gender),
    dob: dob,
    invitationStatus: $Enums.InvitationStatus.READY,
    invitationExpiry: new Date(
      Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ),
    invitationCode: generateUniqueCode(),
    organizationId: person.client_id as string,
    createdAt: person.created_at,
    createdBy: MIGRATION_SCRIPT,
    updatedAt: person.updated_at,
    updatedBy: MIGRATION_SCRIPT,
    ...overrides,
  };
};

export const getEmployeeData = async (
  employee: EBPrisma.employeesGetPayload<{ include: { dependents: true } }>,
  portalClient: PortalClient,
  empId: string
) => {
  const isValidDate = (date: any) => {
    const parsedDate = new Date(date);
    return !isNaN(parsedDate.getTime());
  };
  let empStartdate, empEnddate;
  if (
    employee.employment_start_date &&
    !isValidDate(employee.employment_start_date)
  ) {
    empStartdate = isValidDate(employee?.employment_start_date)
      ? new Date(employee?.employment_start_date)
      : new Date();
  } else {
    empStartdate = new Date();
  }

  if (
    employee.employment_end_date &&
    !isValidDate(employee.employment_end_date)
  ) {
    empEnddate = isValidDate(employee?.employment_end_date)
      ? new Date(employee?.employment_end_date)
      : new Date();
  } else {
    empEnddate = new Date();
  }

  return {
    id: empId,
    clientConsumerId: employee.id,
    employeeCode: employee.employee_code || `MIGRATION_CODE-${empId}`,
    email: employee.official_email || `MIGRATION_EMAIL-${empId}`,
    countryCode: DEFAULT_COUNTRY_CODE,
    mobile: employee.mobile_number || null,
    employmentStartDate: empStartdate,
    employmentEndDate: empEnddate,
    gradeId: await fetchGradeIdByGrade(
      employee.grade,
      employee.client_id,
      portalClient
    ),
    departmentId: await fetchDepartmentIdByDepartment(
      employee.department,
      employee.client_id,
      portalClient
    ),
    status: "ENROLLED" as PortalPrisma.EmployeeCreateInput["status"],
    organizationId: employee.client_id,
    createdAt: employee.created_at,
    createdBy: MIGRATION_SCRIPT,
    updatedAt: employee.updated_at,
    updatedBy: MIGRATION_SCRIPT,
  };
};

export const getDependentData = (
  dependent: dependents,
  employeeId: string,
  organizationId: string
) => ({
  clientConsumerId: dependent.id,
  dependentIdentifier: `Dependent${dependent.name || 1}`,
  relationship: mapRelationship(dependent.relationship),
  employeeId,
  organizationId: organizationId,
  createdAt: dependent.created_at,
  createdBy: MIGRATION_SCRIPT,
  updatedAt: dependent.updated_at,
  updatedBy: MIGRATION_SCRIPT,
});

export const getConsumerGroupData = (
  consumerId: string,
  primaryConsumerId: string,
  groupId: string,
  relationship: string
) => ({
  groupId,
  relationship: mapRelationship(relationship),
  primaryConsumerId,
  consumerId,
  description: null,
  createdAt: new Date(),
  createdBy: MIGRATION_SCRIPT,
  updatedAt: new Date(),
  updatedBy: MIGRATION_SCRIPT,
});

const cache = new Map<string, any>();

export const fetchGradeIdByGrade = async (
  grade: string,
  organizationId: string,
  portalClient: PortalClient
) => {
  const gradeToBeSearched = grade?.trim() || DEFAULT_GRADE;
  const cacheKey = `grade-${organizationId}-${gradeToBeSearched}`;

  // Check if the result is cached
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // If not in cache, make the DB calls
  const gradeRecord = await portalClient.grade.findUnique({
    where: {
      organizationId_grade: { organizationId, grade: gradeToBeSearched },
    },
  });

  const defaultGradeRecord = await portalClient.grade.findUnique({
    where: { organizationId_grade: { organizationId, grade: DEFAULT_GRADE } },
  });

  const result = gradeRecord?.id || defaultGradeRecord?.id || DEFAULT_GRADE;

  // Cache the result
  cache.set(cacheKey, result);

  return result;
};

export const fetchDepartmentIdByDepartment = async (
  department: string,
  client_id: string,
  portalClient: PortalClient
) => {
  const departmentToBeSearched = department?.trim() || DEFAULT_GRADE;
  const cacheKey = `department-${client_id}-${departmentToBeSearched}`;

  // Check if the result is cached
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // If not in cache, make the DB calls
  const departmentRecord = await portalClient.department.findUnique({
    where: {
      organizationId_department: {
        organizationId: client_id,
        department: departmentToBeSearched,
      },
    },
  });

  const defaultDepartmentRecord = await portalClient.department.findUnique({
    where: {
      organizationId_department: {
        organizationId: client_id,
        department: DEFAULT_GRADE,
      },
    },
  });

  const result =
    departmentRecord?.id || defaultDepartmentRecord?.id || DEFAULT_GRADE;

  // Cache the result
  cache.set(cacheKey, result);

  return result;
};

enum FormalRelationship {
  SELF = "SELF",
  FATHER = "FATHER",
  MOTHER = "MOTHER",
  SPOUSE = "SPOUSE",
  DAUGHTER = "DAUGHTER",
  SON = "SON",
  MOTHER_IN_LAW = "MOTHER_IN_LAW",
  FATHER_IN_LAW = "FATHER_IN_LAW",
  NOT_PROVIDED = "NOT_PROVIDED",
}

export const mapRelationship = (relationship: string | null) => {
  if (!relationship) return FormalRelationship.NOT_PROVIDED;
  const relationshipUpper = relationship.trim().toUpperCase();
  switch (relationshipUpper) {
    case "SELF":
      return FormalRelationship.SELF as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "FATHER":
      return FormalRelationship.FATHER as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "MOTHER":
      return FormalRelationship.MOTHER as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "SPOUSE":
    case "HUSBAND":
    case "WIFE":
      return FormalRelationship.SPOUSE as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "DAUGHTER":
      return FormalRelationship.DAUGHTER as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "SON":
      return FormalRelationship.SON as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "MOTHER_IN_LAW":
      return FormalRelationship.MOTHER_IN_LAW as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    case "FATHER_IN_LAW":
      return FormalRelationship.FATHER_IN_LAW as PortalPrisma.ConsumerGroupCreateInput["relationship"];
    default:
      return FormalRelationship.NOT_PROVIDED as PortalPrisma.ConsumerGroupCreateInput["relationship"];
  }
};

export const mapGender = (gender: string | null) => {
  if (!gender) return "NOT_PROVIDED";
  const trimmedGender = gender.trim().toUpperCase();

  switch (trimmedGender) {
    case "MALE":
      return "MALE" as PortalPrisma.ClientConsumerCreateInput["gender"];
    case "FEMALE":
      return "FEMALE" as PortalPrisma.ClientConsumerCreateInput["gender"];
    case "OTHER":
    case "OTHERS":
      return "OTHERS" as PortalPrisma.ClientConsumerCreateInput["gender"];
    default:
      return "NOT_PROVIDED" as PortalPrisma.ClientConsumerCreateInput["gender"];
  }
};
