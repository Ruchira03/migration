import { $Enums, Prisma } from "../../../prisma/generated/portal";
import { getPortalPrismaClient, PortalClient } from "../../utils/dbUtils";
import util from "util";
import { generateUniqueCode } from "../../utils/migrationUtils";
import { fetchConsumerWallet } from "../../utils/walletUtils";
import Mailgun from "mailgun.js";
import FormData from "form-data";

export const removeEmployees = async (empEmailsArray: string[]) => {
  const prisma = await getPortalPrismaClient();
  //' Step 1: Fetch all employees by email in one DB call',
  const employees = await prisma.employee.findMany({
    where: { email: { in: empEmailsArray } },
    select: { id: true, email: true, clientConsumerId: true },
  });

  const clientConsumerIds = employees.map((e) => e.clientConsumerId);

  const CHUNK_SIZE = 100;

  const deleteClientConsumers = async (
    prisma: PortalClient,
    employeeIds: string[]
  ) => {
    for (let i = 0; i < employeeIds.length; i += CHUNK_SIZE) {
      const chunk = employeeIds.slice(i, i + CHUNK_SIZE);

      await prisma.$transaction([
        prisma.employee.updateMany({
          where: { clientConsumerId: { in: chunk } },
          data: { status: "INACTIVE" },
        }),
        prisma.planAssignment.deleteMany({
          where: { clientConsumerId: { in: chunk } },
        }),
        prisma.mobileUserPlans.deleteMany({
          where: { clientConsumerId: { in: chunk } },
        }),
        prisma.consumerPlanWallet.updateMany({
          where: { clientConsumerId: { in: chunk }, isActive: true },
          data: { isActive: false },
        }),
        prisma.consumerPackageWallet.updateMany({
          where: {
            consumerPlanWallet: { clientConsumerId: { in: chunk } },
            isActive: true,
          },
          data: { isActive: false },
        }),
        prisma.consumerPlanServiceWallet.updateMany({
          where: {
            consumerPlanWallet: { clientConsumerId: { in: chunk } },
            isActive: true,
          },
          data: { isActive: false },
        }),
      ]);

      console.log(
        `Processed chunk ${i / CHUNK_SIZE + 1}: ${chunk.length} records`
      );
    }
  };

  await deleteClientConsumers(prisma, clientConsumerIds);
  console.log(
    "Deleted for:",
    employees.map((e) => e.email)
  );
};
export const prodSupport = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    //await sendInfiniteInvites();
    // const empEmailsArray = [
    //   "v.umamaheshwari.0809@gmail.com",
    //   "testuserinfinite@yopmail.com",
    //   "praveen@yopmail.com",
    //   "infinitetestuser1@yopmail.com",
    //   "infinitetestuser@yopmail.com",
    // ];
    // await removeEmployees(empEmailsArray);
    // Optional: Log which users were affected

    const emp = await getEmpData("Nazre.Alam@infinite.com ", prisma);

    // const walletResponse = await fetchConsumerWallet(
    //   emp?.clientConsumer.VendorUser[0].vendorUserId ?? ""
    // );

    // console.log(JSON.stringify(emp, null, 4));

    // await createDependent(
    //   'puneet.suri@infinite.com',
    //   'Falak',
    //   'Mir',
    //   'FEMALE',
    //   'SPOUSE',
    //   '1995-02-28'
    // );

    // const plan = await prisma.planService.findMany({
    //   where: {
    //     planId: '8c45b07f-975f-4697-a8af-2addf8f5d115',
    //   },
    //   include: {
    //     vendorService: {
    //       include: {
    //         service: true,
    //       },
    //     },
    //   },
    // });
    // console.log(JSON.stringify(plan, null, 4));
  } catch (error) {
    console.error("Error updating Cadabums wallet:", error);
    throw error;
  }
};

const createDependent = async (
  empEmail: string,
  depFirstName: string,
  depLastName: string,
  gender: $Enums.Gender,
  relationship: $Enums.FormalRelationship,
  dob: string
) => {
  const prisma = await getPortalPrismaClient();
  const emp = await getEmpData(empEmail, prisma);

  const dateAfter400Days = new Date();
  dateAfter400Days.setDate(dateAfter400Days.getDate() + 400);
  const clientConsumer = await prisma.clientConsumer.create({
    data: {
      firstName: depFirstName,
      lastName: depLastName,
      gender: gender,
      dob: new Date(dob),
      consumerType: "DEPENDENT",
      organizationId: emp?.organizationId ?? "",
      invitationCode: generateUniqueCode(),
      invitationStatus: "READY",
      invitationExpiry: dateAfter400Days,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    },
  });

  await prisma.consumerGroup.create({
    data: {
      groupId: emp?.clientConsumer.ConsumerGroups[0].groupId ?? "",
      primaryConsumerId: emp?.clientConsumerId ?? "",
      consumerId: clientConsumer.id,
      relationship: relationship,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    },
  });

  await prisma.dependent.create({
    data: {
      clientConsumerId: clientConsumer.id,
      relationship: relationship,
      organizationId: emp?.organizationId ?? "",
      employeeId: emp?.id ?? "",
      dependentIdentifier: `Dependent${emp?.clientConsumer?.ConsumerGroups?.length ?? 0 + 1}`,
      createdBy: "MIGRATION_SCRIPT",
      updatedBy: "MIGRATION_SCRIPT",
    },
  });
};

async function getEmpData(empEmail: string, prisma: PortalClient) {
  const user = await prisma.employee.findUnique({
    where: {
      email: empEmail,
      // clientConsumerId: empEmail,
    },
    include: {
      clientConsumer: {
        include: {
          ConsumerGroups: true,
          VendorUser: true,
          MobileUserPlans: {
            include: {
              user: {
                include: {
                  BbxUserAddress: true,
                },
              },
              plan: true,
            },
          },
        },
      },
    },
  });
  console.log(JSON.stringify(user, null, 4));

  return user;
}

export const sendInfiniteInvites = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    // const allInfiniteEmps = await prisma.employee.findMany({
    //   where: {
    //     organizationId: "b1f3ef09-7ae1-4539-8f70-795bd4e28b81",
    //     status: { not: "INACTIVE" },
    //   },
    //   include: {
    //     clientConsumer: {
    //       select: {
    //         firstName: true,
    //         MobileUserPlans: true,
    //         invitationCode: true,
    //       },
    //     },
    //   },
    // });

    // const clientConsumerIds = allInfiniteEmps
    //   .filter((emp) => emp.clientConsumer?.MobileUserPlans == null)
    //   .map((emp) => emp.clientConsumerId);

    // // Single updateMany call (only works if all rows get the same values)
    // await prisma.clientConsumer.updateMany({
    //   where: {
    //     id: { in: clientConsumerIds },
    //   },
    //   data: {
    //     invitationStatus: "SENT",
    //     invitationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    //   },
    // });
    const arr = [{
        email: "rajeswari.kurapati@infinite.com",
        employeeName: "Rajeswari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "667610",
      }]

    for (const emp of arr) {
      const empl = await prisma.employee.findUnique({
        where: { email: emp.email },
        select: {
          clientConsumerId: true,
        },
      });

      if (empl?.clientConsumerId) {
        await prisma.clientConsumer.update({
          where: { id: empl.clientConsumerId },
          data: {
            invitationStatus: "SENT",
            invitationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            invitationCode: emp.invitationCode,
          },
        });
      }
      console.log(emp.employeeName, "done");
    }

    // const usersWhosePlanHasBeenImported = await Promise.all(
    //   allInfiniteEmps
    //     .filter((emp) => emp.clientConsumer?.MobileUserPlans == null)
    //     .map(async (emp) => {
    //       return {
    //         email: emp.email,
    //         employeeName: emp.clientConsumer.firstName,
    //         organisationName: "Infinite Computer Solutions",
    //         invitationCode: emp.clientConsumer.invitationCode ?? "457126",
    //       };
    //     })
    // );

    // console.log(JSON.stringify(usersWhosePlanHasBeenImported, null, 4));
    // await writeLogToFile(
    //   JSON.stringify(usersWhosePlanHasBeenImported, null, 4),
    //   "logFile.txt"
    // );
    // console.log(usersWhosePlanHasBeenImported.length);

    // console.log(JSON.stringify(allInfiniteEmps, null, 4));
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  //write your creds here
});

const DOMAIN = "";
const SENDER = "";
const SUBJECT = "Your Berry Box Access is Ready - Log in Today!";

// console.log("DOMAIN, SENDER, SUBJECT:", DOMAIN, SENDER, SUBJECT);
// 🔒 Hardcoded users list
const usersToEmail = [
  {
    userEmail: "ruchira@myberrybox.com",
    userName: "Uma Maheshwari",
    password: "test123",
  },
];

const sendEmails = async () => {
  console.log("++++++++");

  for (const user of usersToEmail) {
    const data = {
      from: SENDER,
      to: user.userEmail,
      subject: SUBJECT,
      template: "abs coming soon 1", // Ensure this template exists in Mailgun
      "h:X-Mailgun-Variables": JSON.stringify({
        user_name: user.userName,
        user_email: user.userEmail,
        password: user.password,
      }),
    };

    try {
      await mg.messages.create(DOMAIN || "", data);
      console.log(`✅ Sent to ${user.userEmail}`);
    } catch (err) {
      console.error(`❌ Failed for ${user.userEmail}`, err);
    }
  }
};
