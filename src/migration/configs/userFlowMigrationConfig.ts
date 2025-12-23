import { generateUniqueCode } from "../../utils/migrationUtils";
import { v4 as uuidv4 } from "uuid";
import {
  EBPrisma,
  getPortalPrismaClient,
  getEBPrismaClient,
  PortalClient,
} from "../../utils/dbUtils";
import {
  ClientConsumer,
  ConsumerGroup,
  Dependent,
  Employee,
} from "../../../prisma/generated/portal";
import {
  getClientConsumerData,
  getConsumerGroupData,
  getDependentData,
  getEmployeeData,
} from "../../utils/userFlowUtils";
const BATCH_SIZE = 1000;

const processBatch = async (offset: number) => {
  const ebClient = await getEBPrismaClient();
  const orgClient = await getPortalPrismaClient();
  console.log(`Processing batch with offset: ${offset}`);

  try {
    // Fetch all employees in one query and create a map
    const existingEmployees = await orgClient.employee.findMany({
      select: { id: true, clientConsumerId: true },
      skip: offset,
      take: BATCH_SIZE,
    });

    // Convert to map for quick lookups
    const employeeMap = new Map(
      existingEmployees.map((emp) => [emp.clientConsumerId, emp.id])
    );

    const employeesWithDependents = await ebClient.employees.findMany({
      include: { dependents: true },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (employeesWithDependents.length === 0) return;

    const data = await prepareBulkData(
      employeesWithDependents,
      orgClient,
      employeeMap
    );
    console.log(
      `Inserting batch with offset: ${offset} with size : ${data.employeesData.length}`
    );
    try {
      await orgClient.$transaction(
        async (transactionClient) => {
          await transactionClient.clientConsumer.createMany({
            data: data.clientConsumersData,
            skipDuplicates: true,
          });
          await transactionClient.employee.createMany({
            data: data.employeesData,
            skipDuplicates: true,
          });
          await transactionClient.dependent.createMany({
            data: data.dependentsData,
            skipDuplicates: true,
          });
          await transactionClient.consumerGroup.createMany({
            data: data.consumerGroupsData,
            skipDuplicates: true,
          });
        },
        { timeout: 600000 }
      );
    } catch (error) {
      console.error("Error during transaction:", error, data);
      throw error;
    }

    console.log(`Completed batch with offset: ${offset}`);
  } catch (error) {
    console.error(
      "Error during migration:----------------------------------->:",
      offset,
      error
    );
    throw error;
  }
};

export const migrateEmployeesAndDependents = async () => {
  const totalRecords = 32000;
  const startFrom = 20000;
  const CONCURRENCY_LIMIT = 10; // Adjust based on your system's capacity

  const batchOffsets = Array.from(
    { length: Math.ceil((totalRecords - startFrom) / BATCH_SIZE) },
    (_, i) => startFrom + i * BATCH_SIZE
  );

  // Process batches with controlled concurrency
  for (let i = 0; i < batchOffsets.length; i += CONCURRENCY_LIMIT) {
    const batchSlice = batchOffsets.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batchSlice.map(processBatch)); // Execute CONCURRENCY_LIMIT batches at a time
  }
};

// export const migrateEmployeesAndDependents = async () => {
//   const ebClient = await getEBPrismaClient();
//   const orgClient = await getPortalPrismaClient();

//   try {
//     const BATCH_SIZE = 1000; // Process records in batches
//     let offset = 3000;

//     while (true) {
//       const employeesWithDependents = await ebClient.employees.findMany({
//         include: { dependents: true },
//         skip: offset,
//         take: BATCH_SIZE,
//       });
//       console.log("fetched : ", employeesWithDependents.length);

//       if (employeesWithDependents.length === 0) break;

//       console.log(
//         `Processing batch of employees with dependents. Offset: ${offset}, Batch Size: ${employeesWithDependents.length}`
//       );

//       const {
//         employeesData,
//         dependentsData,
//         clientConsumersData,
//         consumerGroupsData,
//         planAssignmentsData,
//       } = await prepareBulkData(employeesWithDependents, orgClient);

//       // console.log({
//       //   employeesDataCount: employeesData.length,
//       //   dependentsDataCount: dependentsData.length,
//       //   clientConsumersDataCount: clientConsumersData.length,
//       //   consumerGroupsDataCount: consumerGroupsData.length,
//       //   planAssignmentsDataCount: planAssignmentsData.length,
//       // });

//       console.log({
//         employeesDataCount: employeesData,
//         dependentsDataCount: dependentsData,
//         clientConsumersDataCount: clientConsumersData,
//         consumerGroupsDataCount: consumerGroupsData,
//         planAssignmentsDataCount: planAssignmentsData,
//       });

//       await orgClient.$transaction(
//         async (transactionClient) => {
//           await transactionClient.clientConsumer.createMany({
//             data: clientConsumersData,
//             skipDuplicates: true, // Prevent duplicate insertion if retry occurs
//           });
//           //console.log("employee data", employeesData);

//           await transactionClient.employee.createMany({
//             data: employeesData,
//             skipDuplicates: true,
//           });

//           dependentsData.forEach((d) => {
//             if (!employeesData.some((e) => e.id === d.employeeId)) {
//               console.log("Invalid Employee ID in Dependents:", d.employeeId);
//             } else {
//               //console.log("Valid Employee ID in Dependents:", d.employeeId);
//             }
//           });

//           //console.log("dependent data", dependentsData);
//           await transactionClient.dependent.createMany({
//             data: dependentsData,
//             skipDuplicates: true,
//           });

//           await transactionClient.consumerGroup.createMany({
//             data: consumerGroupsData,
//             skipDuplicates: true,
//           });
//         },
//         { timeout: 50000 }
//       );
//       // console.log({ planAssignmentsData });

//       await (
//         await getPortalPrismaClient()
//       ).planAssignment.createMany({
//         data: planAssignmentsData,
//         skipDuplicates: true,
//       });

//       offset += BATCH_SIZE;
//     }

//     console.log("Migration completed successfully!");
//   } catch (error) {
//     console.error("Error during migration:", error);
//   }
// };

const prepareBulkData = async (
  employeesWithDependents: EBPrisma.employeesGetPayload<{
    include: { dependents: true };
  }>[],
  orgClient: PortalClient,
  employeeMap: Map<string, string> // Pass employee map instead of querying inside
) => {
  const clientConsumersData: Omit<ClientConsumer, "id">[] = [];
  const employeesData: Employee[] = [];
  const dependentsData: Omit<Dependent, "id">[] = [];
  const consumerGroupsData: Omit<ConsumerGroup, "id">[] = [];

  for (const employee of employeesWithDependents) {
    let empId = employeeMap.get(employee.id) || uuidv4(); // Get existing ID or generate new

    const groupId = uuidv4();
    clientConsumersData.push(getClientConsumerData(employee, "EMPLOYEE"));
    employeesData.push(await getEmployeeData(employee, orgClient, empId));
    consumerGroupsData.push(
      getConsumerGroupData(employee.id, employee.id, groupId, "SELF")
    );

    for (const dependent of employee.dependents) {
      clientConsumersData.push(
        getClientConsumerData(dependent, "DEPENDENT", {
          organizationId: employee.client_id,
        })
      );

      dependentsData.push(
        getDependentData(dependent, empId, employee.client_id)
      );

      consumerGroupsData.push(
        getConsumerGroupData(
          dependent.id,
          employee.id,
          groupId,
          dependent.relationship || "DEPENDENT"
        )
      );
    }
  }

  return {
    clientConsumersData,
    employeesData,
    dependentsData,
    consumerGroupsData,
  };
};
