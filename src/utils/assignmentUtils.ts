import { Prisma } from "../../prisma/generated/portal";
import { getPortalPrismaClient } from "./dbUtils";

export type PlanAssignmentResult = {
  clientConsumerId: string;
  assignedPlanId?: string;
  assignmentMode: "RULE" | "DEFAULT";
  error?: string;
};

export type EmployeeGradeData = {
  clientConsumerId: string;
  gradeId: string;
  departmentId: string;
  organizationId: string;
};

export const findRuleBasedPlan = async (
  tx: Prisma.TransactionClient,
  orgId: string,
  gradeId: string,
  deptId: string
) => {
  return await tx.rulePlanAssignment.findFirst({
    where: {
      organizationId: orgId,
      gradeId,
      deptId,
    },
  });
};

// Find the default plan for an organization
export const findDefaultPlan = async (
  tx: Prisma.TransactionClient,
  orgId: string
) => {
  return await tx.defaultplanAssignment.findFirst({
    where: { organizationId: orgId },
  });
};

// Assign a rule-based plan to an employee
export const assignRuleBasedPlan = async (
  tx: Prisma.TransactionClient,
  orgId: string,
  clientConsumerId: string,
  planId: string
): Promise<PlanAssignmentResult> => {
  const assignedPlan = await tx.planAssignment.upsert({
    where: {
      clientConsumerId: clientConsumerId,
    },
    create: {
      organizationId: orgId,
      clientConsumerId,
      planId,
      assignmentMode: "RULE",
      assignmentDate: new Date(),
      createdBy: "system",
      updatedBy: "system",
    },
    update: {
      planId,
      assignmentMode: "RULE",
      assignmentDate: new Date(),
      updatedBy: "system",
    },
  });

  await logPlanAssignment(
    tx,
    orgId,
    clientConsumerId,
    planId,
    "RULE",
    "Employee assigned to plan by rule"
  );

  return {
    clientConsumerId,
    assignedPlanId: assignedPlan.planId,
    assignmentMode: "RULE",
  };
};

// Assign the default plan to an employee if no rule-based plan exists
export const assignDefaultPlan = async (
  tx: Prisma.TransactionClient,
  orgId: string,
  clientConsumerId: string
): Promise<PlanAssignmentResult> => {
  const defaultPlan = await tx.defaultplanAssignment.findFirst({
    where: { organizationId: orgId },
  });

  if (defaultPlan) {
    const assignedPlan = await tx.planAssignment.upsert({
      where: {
        clientConsumerId: clientConsumerId,
      },
      create: {
        organizationId: orgId,
        clientConsumerId,
        planId: defaultPlan.planId,
        assignmentMode: "DEFAULT",
        assignmentDate: new Date(),
        createdBy: "system",
        updatedBy: "system",
      },
      update: {
        planId: defaultPlan.planId,
        assignmentMode: "DEFAULT",
        assignmentDate: new Date(),
        updatedBy: "system",
      },
    });

    await logPlanAssignment(
      tx,
      orgId,
      clientConsumerId,
      defaultPlan.planId,
      "DEFAULT",
      "Employee assigned to default plan"
    );

    return {
      clientConsumerId,
      assignedPlanId: assignedPlan.planId,
      assignmentMode: "DEFAULT",
    };
  } else {
    return {
      clientConsumerId,
      error: `No default plan found for orgId ${orgId}`,
      assignmentMode: "DEFAULT",
    };
  }
};

export const assignPlanToEmployee = async (
  gradeData: EmployeeGradeData
): Promise<PlanAssignmentResult> => {
  const tx = await getPortalPrismaClient();
  const { organizationId, clientConsumerId, gradeId, departmentId } = gradeData;
  const ruleBasedPlan = await findRuleBasedPlan(
    tx,
    organizationId,
    gradeId,
    departmentId
  );
  console.log("Rule based plan", ruleBasedPlan);

  const defaultPlan = await findDefaultPlan(tx, organizationId);
  if (ruleBasedPlan) {
    console.log("Assigning rule based plan");
    return await assignRuleBasedPlan(
      tx,
      organizationId,
      clientConsumerId,
      ruleBasedPlan.planId
    );
  } else if (defaultPlan) {
    console.log("Assigning default plan");
    return await assignDefaultPlan(tx, organizationId, clientConsumerId);
  } else {
    return {
      clientConsumerId,
      error: `No default plan found for organizationId ${organizationId}`,
      assignmentMode: "DEFAULT",
    };
  }
};

// Log the assignment of a plan to an employee
export const logPlanAssignment = async (
  tx: Prisma.TransactionClient,
  orgId: string,
  clientConsumerId: string,
  planId: string,
  assignmentMode: "RULE" | "DEFAULT",
  logMessage: string
) => {
  return await tx.planAssignmentLog.create({
    data: {
      organizationId: orgId,
      clientConsumerId,
      assignmentDate: new Date(),
      assignmentMode,
      planId,
      logMessage,
      createdBy: "system",
      updatedBy: "system",
    },
  });
};
const planServiceCache = new Map<
  string,
  Prisma.PlanServiceGetPayload<{
    include: { plan: true; serviceRestrictions: true };
  }>[]
>();
