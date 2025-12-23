import {
  DefaultplanAssignment,
  RuleGroup,
  RulePlanAssignment,
} from "../../../prisma/generated/portal";
import { assignPlanToEmployee } from "../../utils/assignmentUtils";
import { getPortalPrismaClient, getEBPrismaClient } from "../../utils/dbUtils";
import { v4 as uuidv4 } from "uuid";

export async function migrateBundleMappings() {
  try {
    const portalClient = await getPortalPrismaClient();
    const ebClient = await getEBPrismaClient();

    // Group data by client_id
    const bundleMappingsGrouped = await ebClient.bundle_mappings.groupBy({
      by: ["client_id"],
      _count: {
        id: true,
      },
    });

    for (const group of bundleMappingsGrouped) {
      const clientId: string = group.client_id;
      // Fetch all bundle mappings for this client
      const bundleMappings = await ebClient.bundle_mappings.findMany({
        where: { client_id: clientId },
      });

      const ruleGroups: RuleGroup[] = [];
      const rulePlanAssignments: Omit<RulePlanAssignment, "id">[] = [];
      const defaultPlanAssignments: Omit<DefaultplanAssignment, "id">[] = [];
      let ruleGroupCounter = 1; // Reset counter for each client

      for (const mapping of bundleMappings) {
        // Convert department
        const department =
          typeof mapping.dept === "string" && mapping.dept.trim()
            ? ["any", "unknown"].includes(mapping.dept.trim().toLowerCase())
              ? "Default"
              : mapping.dept.trim()
            : "Default";

        // Convert grade
        const grade =
          typeof mapping.grade === "string" && mapping.grade.trim()
            ? mapping.grade.trim().toLowerCase() === "any"
              ? "Default"
              : mapping.grade.trim()
            : "Default";

        const isDefaultPlan = department === "Default" && grade === "Default";

        if (isDefaultPlan) {
          // Add to default plan assignments
          defaultPlanAssignments.push({
            organizationId: mapping.client_id,
            planId: mapping.bundle_id,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "migration_script",
            updatedBy: "migration_script",
          });
        } else {
          let ruleGroupId = uuidv4();
          // Generate a unique rule group name for this client
          const ruleGroupName = `Rule ${ruleGroupCounter}`;

          const ruleGroup = {
            id: ruleGroupId,
            ruleName: ruleGroupName,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "migration_script",
            updatedBy: "migration_script",
          };
          ruleGroups.push(ruleGroup);
          ruleGroupCounter++;

          // Add rule plan assignment with temporary ruleGroupName
          rulePlanAssignments.push({
            organizationId: mapping.client_id,
            ruleGroupId: ruleGroupId,
            gradeId: grade,
            deptId: department,
            planId: mapping.bundle_id,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "migration_script",
            updatedBy: "migration_script",
          });
        }
      }

      // Create rule groups in the database
      await portalClient.ruleGroup.createMany({
        data: ruleGroups,
        skipDuplicates: true,
      });

      // Save rule plan assignments to the database
      try {
        await portalClient.rulePlanAssignment.createMany({
          data: rulePlanAssignments,
          skipDuplicates: true,
        });
      } catch (error) {
        console.error("Error inserting records:", {
          rulePlanAssignments,
          error,
        });
        throw error;
      }

      // Save default plan assignments to the database
      try {
        await portalClient.defaultplanAssignment.createMany({
          data: defaultPlanAssignments,
          skipDuplicates: true,
        });
      } catch (error) {
        console.error("Error inserting records:", {
          defaultPlanAssignments,
          error,
        });
        throw error;
      }

      console.log(`Migration completed for client_id: ${clientId}`);
    }
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  }
}

export async function migrateAssignment(clientId: string) {
  const orgClient = await getPortalPrismaClient();
  const allEmployees = await orgClient.employee.findMany({
    where: { organizationId: clientId },
    select: {
      organizationId: true,
      clientConsumerId: true,
      gradeId: true,
      departmentId: true,
    },
  });

  await Promise.all(
    allEmployees.map(async (employee) => {
      await assignPlanToEmployee({
        organizationId: employee.organizationId,
        clientConsumerId: employee.clientConsumerId,
        gradeId: employee.gradeId,
        departmentId: employee.departmentId,
      });
    })
  );
}
