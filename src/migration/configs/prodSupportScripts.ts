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
    const arr = [
      {
        email: "rajeswari.kurapati@infinite.com",
        employeeName: "Rajeswari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "667610",
      },
      {
        email: "balaka.raja@infinite.com",
        employeeName: "Balaka",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "823169",
      },
      {
        email: "deepika.chintapalli@infinite.com",
        employeeName: "Chintapalli",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "429464",
      },
      {
        email: "nuthan.abhiram@infinite.com",
        employeeName: "Adepu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "323917",
      },
      {
        email: "srikanth.damera@infinite.com",
        employeeName: "Srikanth",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "564822",
      },
      {
        email: "mrinal.tiwary@infinite.com",
        employeeName: "Mrinal",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "998388",
      },
      {
        email: "pankaj.mandal@infinite.com",
        employeeName: "Pankaj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "499978",
      },
      {
        email: "rajiv.kumar@infinite.com",
        employeeName: "Rajiv",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "866206",
      },
      {
        email: "kavitha.ramagiri@infinite.com",
        employeeName: "Kavitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "810786",
      },
      {
        email: "darshan.veerabhadraiah@infinite.com",
        employeeName: "Darshan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "680603",
      },
      {
        email: "santhosh.gajji@infinite.com",
        employeeName: "Gajji",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "901396",
      },
      {
        email: "aman.gupta@infinite.com",
        employeeName: "Aman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "834429",
      },
      {
        email: "manibalan2601@gmail.com",
        employeeName: "B",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "874223",
      },
      {
        email: "narayanamoorthy.ravi@infinite.com",
        employeeName: "Narayanamoorthy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "545171",
      },
      {
        email: "dharmendra.pachauri@infinite.com",
        employeeName: "Dharmendra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "162542",
      },
      {
        email: "laxmanarao.kuna@infinite.com",
        employeeName: "Kuna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "454768",
      },
      {
        email: "mallikarjuna.chukkaluru@infinite.com",
        employeeName: "Chukkaluru",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "348545",
      },
      {
        email: "santhosh.ramadoss@infinite.com",
        employeeName: "R",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "920158",
      },
      {
        email: "arun.venkatesh@infinite.com",
        employeeName: "Arun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "300895",
      },
      {
        email: "bhavya.bhargavi@infinite.com",
        employeeName: "Thuthika",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "684564",
      },
      {
        email: "purushottam.singh@infinite.com",
        employeeName: "Purushottam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "651112",
      },
      {
        email: "mohit.gambhire@infinite.com",
        employeeName: "Mohit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "979396",
      },
      {
        email: "adithya.ramatenki@infinite.com",
        employeeName: "R",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "603803",
      },
      {
        email: "avinash.linga@infinite.com",
        employeeName: "Linga",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "817279",
      },
      {
        email: "mani.chandanareddy@infinite.com",
        employeeName: "T",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "787125",
      },
      {
        email: "neha.jain@infinite.com",
        employeeName: "Neha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "636880",
      },
      {
        email: "vannuraswamy.harijana@infinite.com",
        employeeName: "Harijana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "790898",
      },
      {
        email: "mona.chauhan@infinite.com",
        employeeName: "Mona",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "264820",
      },
      {
        email: "nehasri.ediga@infinite.com",
        employeeName: "Ediga",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "929701",
      },
      {
        email: "vijaya.kumar2@infinite.com",
        employeeName: "V",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "326137",
      },
      {
        email: "saikumar.korimi@infinite.com",
        employeeName: "Korimi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "726361",
      },
      {
        email: "balamadhavan.jagadeeswaran@infinite.com",
        employeeName: "Balamadhavan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "863053",
      },
      {
        email: "mallikarjuna.gooty@infinite.com",
        employeeName: "G",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "381349",
      },
      {
        email: "saiprasadreddy.kummetha@infinite.com",
        employeeName: "Saiprasadreddy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "426784",
      },
      {
        email: "thriveni.bapathu@infinite.com",
        employeeName: "Bapathu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "302313",
      },
      {
        email: "challa.sivakumar@infinite.com",
        employeeName: "Challa",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "651606",
      },
      {
        email: "pooja.kodi@infinite.com",
        employeeName: "Kodi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "823415",
      },
      {
        email: "priyanka.gowda@infinite.com",
        employeeName: "Priyanka",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "734263",
      },
      {
        email: "sam.stephen@infinite.com",
        employeeName: "Sam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "942775",
      },
      {
        email: "siddharth.dhama@infinite.com",
        employeeName: "Siddharth",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "867560",
      },
      {
        email: "maneesh.sudhakara@infinite.com",
        employeeName: "Maneesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "500832",
      },
      {
        email: "maneeshkumar.are@infinite.com",
        employeeName: "Are",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "748378",
      },
      {
        email: "sasikiran.katta@infinite.com",
        employeeName: "Katta",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "850203",
      },
      {
        email: "abhishek.kumar15@infinite.com",
        employeeName: "Abhishek",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "206361",
      },
      {
        email: "saidivyasree.pratha@infinite.com",
        employeeName: "Pratha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "877590",
      },
      {
        email: "madhu.gandham@infinite.com",
        employeeName: "Madhu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "924700",
      },
      {
        email: "arun.gundappa@infinite.com",
        employeeName: "Arun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "910178",
      },
      {
        email: "rahul.reddy2@infinite.com",
        employeeName: "V",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "719577",
      },
      {
        email: "narayan.dutta@infinite.com",
        employeeName: "Narayan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "858567",
      },
      {
        email: "akash.bisht2@infinite.com",
        employeeName: "Akash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "144147",
      },
      {
        email: "rakesh.mallika@infinite.com",
        employeeName: "Rakesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "898149",
      },
      {
        email: "pooja.singh2@infinite.com",
        employeeName: "Pooja",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "716321",
      },
      {
        email: "sudeep.brajabasi@infinite.com",
        employeeName: "Sudeep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "712391",
      },
      {
        email: "varunkumar.vishwanatha@infinite.com",
        employeeName: "Varunkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "387208",
      },
      {
        email: "nitesh.kakria@infinite.com",
        employeeName: "Nitesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "635758",
      },
      {
        email: "manamohan.somashekhar@infinite.com",
        employeeName: "Manamohan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "612672",
      },
      {
        email: "maheswara.panditi@infinite.com",
        employeeName: "Maheswara",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "764303",
      },
      {
        email: "nagarjuna.reddy6@infinite.com",
        employeeName: "Nagarjuna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "970999",
      },
      {
        email: "sivarama.krishna2@infinite.com",
        employeeName: "Siva",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "199141",
      },
      {
        email: "arunkumar.kesa@infinite.com",
        employeeName: "Kesa",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "278008",
      },
      {
        email: "meghana.akireddy@infinite.com",
        employeeName: "Akireddy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "205037",
      },
      {
        email: "dhanya.chandrashekhar@infinite.com",
        employeeName: "Dhanya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "957564",
      },
      {
        email: "vishnu.kodathala@infinite.com",
        employeeName: "K",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "806690",
      },
      {
        email: "ramesh.lingampally@infinite.com",
        employeeName: "Lingampally",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "913990",
      },
      {
        email: "anitha.ketha@infinite.com",
        employeeName: "Anitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "410690",
      },
      {
        email: "arshi.prasad@infinite.com",
        employeeName: "Arshi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "730173",
      },
      {
        email: "gaurav.gupta@infinite.com",
        employeeName: "Gaurav",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "788979",
      },
      {
        email: "urmila.amol@infinite.com",
        employeeName: "Urmila",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "998752",
      },
      {
        email: "preethi.dasegowda@infinite.com",
        employeeName: "Preethi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "706734",
      },
      {
        email: "suresh.ulli@infinite.com",
        employeeName: "U",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "147743",
      },
      {
        email: "marna.madhu@infinite.com",
        employeeName: "Marna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "730299",
      },
      {
        email: "shabbir.basha@infinite.com",
        employeeName: "Shabbir",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "134199",
      },
      {
        email: "shailendra.kumar@infinite.com",
        employeeName: "Shailendra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "551630",
      },
      {
        email: "saikrishna.vattam@infinite.com",
        employeeName: "Vattam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "105955",
      },
      {
        email: "ragulapadu.sairoopa@infinite.com",
        employeeName: "Ragulapadu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "105679",
      },
      {
        email: "dileepreddy.gudisa@infinite.com",
        employeeName: "Gudisa",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "499710",
      },
      {
        email: "rajeshkumar.grandhi@infinite.com",
        employeeName: "G",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "913638",
      },
      {
        email: "udaysai.yadav@infinite.com",
        employeeName: "Chittaboina",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "424928",
      },
      {
        email: "khader.nawaz2@infinite.com",
        employeeName: "Syed",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "284234",
      },
      {
        email: "saikishan.kumar@infinite.com",
        employeeName: "Borra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "770860",
      },
      {
        email: "pavithra.lakshmipathi@infinite.com",
        employeeName: "Pavithra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "346844",
      },
      {
        email: "reddaiah.guggilla@infinite.com",
        employeeName: "Reddaiah",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "229607",
      },
      {
        email: "jahnavi.batreddygari@infinite.com",
        employeeName: "Jahnavi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "145421",
      },
      {
        email: "sushmita.barve@infinite.com",
        employeeName: "Sushmita",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "905477",
      },
      {
        email: "pavankumar.yejandla@infinite.com",
        employeeName: "Yejandla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "928440",
      },
      {
        email: "khafia.ayyub@infinite.com",
        employeeName: "Khafia",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "129727",
      },
      {
        email: "karamvir.dagar@infinite.com",
        employeeName: "Karambir",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "824007",
      },
      {
        email: "jayavarman.chandrasekaran@infinite.com",
        employeeName: "Jayavarman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "862580",
      },
      {
        email: "prakash.dugyala@infinite.com",
        employeeName: "Dugyala",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "747389",
      },
      {
        email: "subhash.ray@infinite.com",
        employeeName: "Subhash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "246461",
      },
      {
        email: "arpit.kumar@infinite.com",
        employeeName: "Arpit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "773064",
      },
      {
        email: "mamta.yadav@infinite.com",
        employeeName: "Mamta",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "396459",
      },
      {
        email: "himanshu.verm@infinite.com",
        employeeName: "Himanshu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "576943",
      },
      {
        email: "kanthesharaddi.belahunasi@infinite.com",
        employeeName: "Kanthesharaddi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "489752",
      },
      {
        email: "saiteja.alugolu@infinite.com",
        employeeName: "Alugolu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "157082",
      },
      {
        email: "abdul.azeem@infinite.com",
        employeeName: "Mohammed",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "438583",
      },
      {
        email: "gowripriya.mulagada@infinite.com",
        employeeName: "Mulagada",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "346496",
      },
      {
        email: "bhanu.mokkala@infinite.com",
        employeeName: "M",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "940927",
      },
      {
        email: "aditya.bisht@infinite.com",
        employeeName: "Aditya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "745117",
      },
      {
        email: "chandankumar.renuka@infinite.com",
        employeeName: "Chandan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "745767",
      },
      {
        email: "anurag.singh@infinite.com",
        employeeName: "Anurag",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "727024",
      },
      {
        email: "sriharshini.ganti@infinite.com",
        employeeName: "Ganti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "756958",
      },
      {
        email: "shashidar.madishatty@infinite.com",
        employeeName: "Madishatty",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "695848",
      },
      {
        email: "sunita.kumari@infinite.com",
        employeeName: "Sunita",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "322689",
      },
      {
        email: "madhu.yedida@infinite.com",
        employeeName: "Madhu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "319887",
      },
      {
        email: "sindhu.peddi@infinite.com",
        employeeName: "Peddi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "326089",
      },
      {
        email: "aruna.padala@infinite.com",
        employeeName: "Aruna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "663467",
      },
      {
        email: "subhash.nalla@infinite.com",
        employeeName: "Nalla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "241156",
      },
      {
        email: "arvind.sharma@infinite.com",
        employeeName: "Arvind",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "804227",
      },
      {
        email: "harish.kumar@infinite.com",
        employeeName: "Harish",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "163615",
      },
      {
        email: "subbareddy.kotapati@infinite.com",
        employeeName: "Kotapati",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "102508",
      },
      {
        email: "divyasree.mamillapalli@infinite.com",
        employeeName: "Divya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "536967",
      },
      {
        email: "shriram.bansal@infinite.com",
        employeeName: "Shriram",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "512361",
      },
      {
        email: "swetha.kancherla@infinite.com",
        employeeName: "Kancherla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "848404",
      },
      {
        email: "chaithra.ravindra@infinite.com",
        employeeName: "Chaithra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "519197",
      },
      {
        email: "bhavani.bavisetti@infinite.com",
        employeeName: "Bavisetti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "421894",
      },
      {
        email: "vishal.kothari@infinite.com",
        employeeName: "Vishal",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "870182",
      },
      {
        email: "prakash.kumar2@infinite.com",
        employeeName: "Prakash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "695406",
      },
      {
        email: "nirisha.madeboina@infinite.com",
        employeeName: "M",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "404390",
      },
      {
        email: "kandasamy.shanmugam@infinite.com",
        employeeName: "Kanda",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "542428",
      },
      {
        email: "bhavagna.pinninti@infinite.com",
        employeeName: "Pinninti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "905772",
      },
      {
        email: "sunil.limje@infinite.com",
        employeeName: "Limje",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "744636",
      },
      {
        email: "sindhu.kommineni@infinite.com",
        employeeName: "Kommineni",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "762541",
      },
      {
        email: "mohamed.thaga@infinite.com",
        employeeName: "Mohamed",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "955629",
      },
      {
        email: "nirmalkumar.ramamurthy@infinite.com",
        employeeName: "Nirmalkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "927281",
      },
      {
        email: "sivakalyani.ummidi@infinite.com",
        employeeName: "Ummidi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "855372",
      },
      {
        email: "chandrika.bandi@infinite.com",
        employeeName: "Bandi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "566041",
      },
      {
        email: "sandeep.mahto@infinite.com",
        employeeName: "Sandeep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "352997",
      },
      {
        email: "shashank.rajashekar@infinite.com",
        employeeName: "Shashank",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "123855",
      },
      {
        email: "poojareddy.gaddam@infinite.com",
        employeeName: "Gaddam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "225938",
      },
      {
        email: "arunkumar.ravi2@infinite.com",
        employeeName: "Arunkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "592634",
      },
      {
        email: "rajesh.kannan@infinite.com",
        employeeName: "Rajesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "821606",
      },
      {
        email: "abin.ashokan@infinite.com",
        employeeName: "Abin",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "552940",
      },
      {
        email: "sanket.mallikarjuna@infinite.com",
        employeeName: "Sanket",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "740583",
      },
      {
        email: "annapoorani.kumaresan@infinite.com",
        employeeName: "Annapoorani",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "987484",
      },
      {
        email: "kirti.ghanghas@infinite.com",
        employeeName: "Kirti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "145318",
      },
      {
        email: "kartik.ganiger@infinite.com",
        employeeName: "Kartik",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "827009",
      },
      {
        email: "apsana.shaik@infinite.com",
        employeeName: "S",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "841201",
      },
      {
        email: "tejaswini.amballa@infinite.com",
        employeeName: "Amballa",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "101218",
      },
      {
        email: "shodh.yadav@infinite.com",
        employeeName: "Shodh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "363637",
      },
      {
        email: "rajalakshmi.sanathkumar@infinite.com",
        employeeName: "S",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "895117",
      },
      {
        email: "renuka.kurapati@infinite.com",
        employeeName: "Kurapati",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "748017",
      },
      {
        email: "vikas.ratara@infinite.com",
        employeeName: "Ratara",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "129852",
      },
      {
        email: "rohith.bhosle@infinite.com",
        employeeName: "Bhosle",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "658210",
      },
      {
        email: "arunkumar.mathiyazhakan@infinite.com",
        employeeName: "Arunkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "317273",
      },
      {
        email: "girija.nandhini@infinite.com",
        employeeName: "Navle",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "212302",
      },
      {
        email: "guntha.arun@infinite.com",
        employeeName: "Guntha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "408649",
      },
      {
        email: "lakshmi.prasanna@infinite.com",
        employeeName: "Partamsetti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "473287",
      },
      {
        email: "pavankumar.kotagunta@infinite.com",
        employeeName: "Kotagunta",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "767087",
      },
      {
        email: "rohith.patil@infinite.com",
        employeeName: "Rohith",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "988064",
      },
      {
        email: "ashoka.rajagopal@infinite.com",
        employeeName: "Ashoka",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "939365",
      },
      {
        email: "kamalendu.mahapatra@infinite.com",
        employeeName: "Kamalendu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "845974",
      },
      {
        email: "sadasiva.reddy@infinite.com",
        employeeName: "Pandillapalli",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "953937",
      },
      {
        email: "balu.mahendra@infinite.com",
        employeeName: "Adem",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "345311",
      },
      {
        email: "chandan.manjunath@infinite.com",
        employeeName: "Chandan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "892635",
      },
      {
        email: "venkatesan.ganesan@infinite.com",
        employeeName: "Venkatesan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "958899",
      },
      {
        email: "dharmraj.chopra@infinite.com",
        employeeName: "Dharmraj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "707226",
      },
      {
        email: "purnima.chamana@infinite.com",
        employeeName: "Purnima",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "417986",
      },
      {
        email: "bhavana.thota@infinite.com",
        employeeName: "Thota",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "515271",
      },
      {
        email: "varshini.ganesha@infinite.com",
        employeeName: "Varshini",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "479487",
      },
      {
        email: "srinivasa.darshak@infinite.com",
        employeeName: "T",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "472822",
      },
      {
        email: "rohankumar.sahoo@infinite.com",
        employeeName: "Rohan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "173352",
      },
      {
        email: "bhanuprasad.kummari@infinite.com",
        employeeName: "Kummari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "244799",
      },
      {
        email: "sailakshmi.routhu@infinite.com",
        employeeName: "Routhu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "118782",
      },
      {
        email: "rajeevkumar.surolia@infinite.com",
        employeeName: "Rajeev",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "874010",
      },
      {
        email: "supriya.dodla@infinite.com",
        employeeName: "Dss",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "978995",
      },
      {
        email: "uttkarsh.agarwal@infinite.com",
        employeeName: "Uttkarsh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "440227",
      },
      {
        email: "vishwajeet.singh@infinite.com",
        employeeName: "Vishwajeet",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "310837",
      },
      {
        email: "chiranjivi.kancherla@infinite.com",
        employeeName: "Kancherla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "726331",
      },
      {
        email: "jai.kishore@infinite.com",
        employeeName: "Jai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "582751",
      },
      {
        email: "amarendra.srivastava@infinite.com",
        employeeName: "Amarendra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "227095",
      },
      {
        email: "nived.nandakumar@infinite.com",
        employeeName: "Nived",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "602267",
      },
      {
        email: "santhosh.sankar2@infinite.com",
        employeeName: "Santhosh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "409975",
      },
      {
        email: "srikanth.chinthalapalli@infinite.com",
        employeeName: "Chinthalapalli",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "218405",
      },
      {
        email: "vishal.saini@infinite.com",
        employeeName: "Vishal",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "438078",
      },
      {
        email: "pushpraj.rana@infinite.com",
        employeeName: "Pushpraj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457991",
      },
      {
        email: "vaishnavi.gurrapusala@infinite.com",
        employeeName: "Gurrapusala",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "681529",
      },
      {
        email: "dhanasri.inampudi@infinite.com",
        employeeName: "Inampudi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "884147",
      },
      {
        email: "sangeetha.govindaraju@infinite.com",
        employeeName: "Sangeetha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "994406",
      },
      {
        email: "umesh.tiwari@infinite.com",
        employeeName: "Umesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "260203",
      },
      {
        email: "bhavani.akkala@infinite.com",
        employeeName: "Akkala",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "779525",
      },
      {
        email: "sravankumar.potthuri@infinite.com",
        employeeName: "Potthuri",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "649633",
      },
      {
        email: "brahmaji.kuppili@infinite.com",
        employeeName: "Kuppili",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "249426",
      },
      {
        email: "rahamathunisa.mohammad@infinite.com",
        employeeName: "Mohammad",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "577720",
      },
      {
        email: "shivani.sharma@infinite.com",
        employeeName: "Shivani",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "651149",
      },
      {
        email: "varsha.manjunatha@infinite.com",
        employeeName: "Varsha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "285329",
      },
      {
        email: "komal.tiwari@infinite.com",
        employeeName: "Komal",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "927727",
      },
      {
        email: "archana.venkataravanappa@infinite.com",
        employeeName: "Archana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "631597",
      },
      {
        email: "saikiran.gavarraju@infinite.com",
        employeeName: "Gavarraju",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "943671",
      },
      {
        email: "anveshyadav.gari@infinite.com",
        employeeName: "Gari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "262683",
      },
      {
        email: "noor.alam@infinite.com",
        employeeName: "Md",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "460628",
      },
      {
        email: "navyasri.neelapu@infinite.com",
        employeeName: "Neelapu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "360113",
      },
      {
        email: "kalpavalli.alajange@infinite.com",
        employeeName: "Alajange",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "296603",
      },
      {
        email: "raveendra.patnala@infinite.com",
        employeeName: "Raveendra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "334745",
      },
      {
        email: "indla.venkateswarlu@infinite.com",
        employeeName: "Indla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "761097",
      },
      {
        email: "manjunatha.srinivas@infinite.com",
        employeeName: "B",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "584166",
      },
      {
        email: "mytrika.nari@infinite.com",
        employeeName: "Nari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "321905",
      },
      {
        email: "prakash.shrinivasamurthy@infinte.com",
        employeeName: "Prakash.",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "617282",
      },
      {
        email: "nithyasree.katta@infinite.com",
        employeeName: "K",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "418443",
      },
      {
        email: "manoj.savukar@infinite.com",
        employeeName: "Manoj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "264781",
      },
      {
        email: "tirupati.reddy@infinite.com",
        employeeName: "Atla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "769965",
      },
      {
        email: "balaajee.mariyappan@infinite.com",
        employeeName: "Balaajee",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "856885",
      },
      {
        email: "varshini.vijaya@infinite.com",
        employeeName: "Varshini",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "524307",
      },
      {
        email: "savithri.panguluri@infinite.com",
        employeeName: "Panguluri",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "582889",
      },
      {
        email: "ramakrishna.mallepaddi@infinite.com",
        employeeName: "Ramakrishna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "347101",
      },
      {
        email: "priyanka.bagewadi@infinite.com",
        employeeName: "Priyanka",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "127365",
      },
      {
        email: "hariprasad.raghavan@infinite.com",
        employeeName: "Hariprasad",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "568086",
      },
      {
        email: "niranjan.sadashiva@infinite.com",
        employeeName: "Niranjan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "633379",
      },
      {
        email: "muthukumar.ganesan@infinite.com",
        employeeName: "Muthukumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "582704",
      },
      {
        email: "tirumalesh.pogula@infinite.com",
        employeeName: "Pogula",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "498505",
      },
      {
        email: "nikhil.sirupuram@infinite.com",
        employeeName: "Nikhil",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "685417",
      },
      {
        email: "deshik.krishnamurthy@infinite.com",
        employeeName: "K",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "962564",
      },
      {
        email: "sara.husain@infinite.com",
        employeeName: "Sara",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "883537",
      },
      {
        email: "sivakumar.palanisamy@infinite.com",
        employeeName: "Sivakumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "972875",
      },
      {
        email: "dayakarbabu.thippagudisa@infinite.com",
        employeeName: "Thippagudisa",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "521859",
      },
      {
        email: "sunitha.kalakappa@infinite.com",
        employeeName: "Sunitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "680193",
      },
      {
        email: "Ankitkumar.Gupta@infinite.com",
        employeeName: "Ankit Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ponnanna.Poovaiah@infinite.com",
        employeeName: "Ponnanna P",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Praveen.Kumar8@infinite.com",
        employeeName: "Praveen Kumar N",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Birupakhya.Dash@infinite.com",
        employeeName: "Birupakhya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mithun.Chowdhury@infinite.com",
        employeeName: "Mithun Roy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Suman.Kumari2@infinite.com",
        employeeName: "Suman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Hemanta.Patnaik@infinite.com",
        employeeName: "Hemanta Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Tarik.Singh@infinite.com",
        employeeName: "Tarik Deep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vivek.Mattamshetty@infinite.com",
        employeeName: "Mattamshetty",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Swathi.Patnala@infinite.com",
        employeeName: "Swathi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Lokesh.Neelam@infinite.com",
        employeeName: "Neelam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Tanya.Pradhan@infinite.com",
        employeeName: "Tanya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Jeewanshu.Sharma@infinite.com",
        employeeName: "Jeewanshu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Suman.Sourabh@infinite.com",
        employeeName: "Suman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ankit.Banduni@infinite.com",
        employeeName: "Ankit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Madhu.Bhimappa@infinite.com",
        employeeName: "MADHU B",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bharathi.Uriti@infinite.com",
        employeeName: "Uriti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ambesh.Tiwari@infinite.com",
        employeeName: "Ambesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Dinesh.Baikadi@infinite.com",
        employeeName: "Baikadi Dinesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Avinash.Shendage@infinite.com",
        employeeName: "Avinash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shravankumar.Eaga@infinite.com",
        employeeName: "Eaga Shravan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shruti.Rastogi@infinite.com",
        employeeName: "Shruti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rajesh.Pikkili@infinite.com",
        employeeName: "Pikkili",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vicky.Humne@infinite.com",
        employeeName: "Vicky B",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rahul.Sapare@infinite.com",
        employeeName: "Rahul V",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Aayush.Tiwari@infinite.com",
        employeeName: "Aayush",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Aman.Kalra@infinite.com",
        employeeName: "Aman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sathiyaraj.Govindharaj@infinite.com",
        employeeName: "Sathiyaraj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Gopi.Paruchuri@infinite.com",
        employeeName: "Paruchuri",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Prasanna.Sathish@infinite.com",
        employeeName: "Prasanna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Amrita.Chatterjee@infinite.com",
        employeeName: "Amrita",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Navin.Adlu@infinite.com",
        employeeName: "Navin Shriramlu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shriharsh.Sholapur@infinite.com",
        employeeName: "Shriharsh Shrinivas",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vijayakumar.Maradani@infinite.com",
        employeeName: "Maradani Vijaya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sagar.Rajak@infinite.com",
        employeeName: "Sagar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Jagadish.Mellamputi@infinite.com",
        employeeName: "Mellamputi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Chenchu.Rathnam@infinite.com",
        employeeName: "Aaderu Chenchu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sadhana.Shinde3@infinite.com",
        employeeName: "Sadhana Subhash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shalini.Bisht@infinite.com",
        employeeName: "Shalini",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rajashekar.Pulyala@infinite.com",
        employeeName: "Pulyala Rajashekar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sreevani.Gaddam@infinite.com",
        employeeName: "Gaddam",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shubham.Saurav@infinite.com",
        employeeName: "Shubham",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rituraj.Panchal@infinite.com",
        employeeName: "Ritu Raj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sakshi.Gautam@infinite.com",
        employeeName: "Sakshi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rahul.Sharma6@infinite.com",
        employeeName: "Rahul",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ankita.Kujur@infinite.com",
        employeeName: "Kujur Ankita",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Apurv.Gaurav@infinite.com",
        employeeName: "Apurv",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mausmi.Srivastava@infinite.com",
        employeeName: "Mausmi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vedant.Suhane@infinite.com",
        employeeName: "Vedant",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Kiran.Vadde@infinite.com",
        employeeName: "Kiran Marotirao",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Namrata.Karmalkar@infinite.com",
        employeeName: "Karmalkar Namrata",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Pavan.Kumar3@infinite.com",
        employeeName: "Pavan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vivek.Kumar5@infinite.com",
        employeeName: "Vivek",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Niraj.Kumar2@infinite.com",
        employeeName: "Niraj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shashank.Singh@infinite.com",
        employeeName: "Shashank",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Susmitha.Tippireddy@infinite.com",
        employeeName: "Susmitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ganeshkumar.Nachimuthu@infinite.com",
        employeeName: "Ganeshkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Amit.Singh3@infinite.com",
        employeeName: "Amit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Prathap.Gunisetti@infinite.com",
        employeeName: "Prathap",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Likitha.Penumetcha@infinite.com",
        employeeName: "Penumetcha Likitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rajeshwari.Yadav@infinite.com",
        employeeName: "Rajeshwari",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sandeepkumar.Chidurala@infinite.com",
        employeeName: "Chidurala Sandeep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Trupti.Kondavale@infinite.com",
        employeeName: "Kondavale",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shruti.Atkar@infinite.com",
        employeeName: "Shruti Rameshwar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mohd.Arkan@infinite.com",
        employeeName: "Mohd",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vishal.Bambarde@infinite.com",
        employeeName: "Vishal Abarao",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Tarunsai.Mutyala@infinite.com",
        employeeName: "Mutyala Tarun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Harshini.Bobba@infinite.com",
        employeeName: "Bobba",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Anil.Prabhat@infinite.com",
        employeeName: "M Anil",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nipun.Sharma@infinite.com",
        employeeName: "NIPUN",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mahesh.Subramani@infinite.com",
        employeeName: "Mahesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Praveenkumar.Mudadla@infinite.com",
        employeeName: "Mudadla Praveen",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ramvikram.Challa@infinite.com",
        employeeName: "Challa Ram Vikram",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Srikanth.Vellaiyan@infinite.com",
        employeeName: "Srikanth K",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saurav.Kumar@infinite.com",
        employeeName: "Saurav",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nagendra.Patel@infinite.com",
        employeeName: "Nagendra Swaroop",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vijai.Gunalan@infinite.com",
        employeeName: "Vijai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vinayak.Walikar@infinite.com",
        employeeName: "Vinayak",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Biswajit.Nayak@infinite.com",
        employeeName: "Biswajit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Anshul.Nagar@infinite.com",
        employeeName: "Anshul",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sudheer.Sharma@infinite.com",
        employeeName: "Sudheer",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mallikarjuna.Bellam@infinite.com",
        employeeName: "Malli karjuna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sreenivasulu.Chandragiri@infinite.com",
        employeeName: "Chandragiri",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Lakshmi.kummeta@infinite.com",
        employeeName: "Lakshmi Narayana Reddy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Santhosh.Narasimhan@infinite.com",
        employeeName: "Santhosh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Zubair.Khan@infinite.com",
        employeeName: "Mohd Zubair",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ranjeet.Gaur@infinite.com",
        employeeName: "Ranjeet",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Pavan.Dharipelly@infinite.com",
        employeeName: "Dharipelly Pavan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Monalisha.Pattanaik@infinite.com",
        employeeName: "Monalisha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Dhruv.Shah@infinite.com",
        employeeName: "Dhruv Manishkumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Venkataramana.Kasetti@infinite.com",
        employeeName: "Kasetti Venkata",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Aadi.Jain@infinite.com",
        employeeName: "Aadi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bhanuprakash.Patapanchala@infinite.com",
        employeeName: "Patapanchala",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Chiramya.Mohindra@infinite.com",
        employeeName: "Chiramya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Devanshu.Bhargava@infinite.com",
        employeeName: "Devanshu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Durgasai.Kottu@infinite.com",
        employeeName: "Durga Sai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sainaga.Gokavarapu@infinite.com",
        employeeName: "Gokavarapu Sai Naga",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Hari.Kumpatla@infinite.com",
        employeeName: "Kumpatla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Yasaswini.Meghana@infinite.com",
        employeeName: "Kompella Yasaswini Satya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bhavani.Mottike@infinite.com",
        employeeName: "Bhavani",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Arthi.Muddisetty@infinite.com",
        employeeName: "Muddisetty",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nikhil.Vaidhyanathan@infinite.com",
        employeeName: "Nikhil",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Pavan.yalavarthi@infinite.com",
        employeeName: "Yalavarthi Pavan Anantha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Kousalya.Potnuru@infinite.com",
        employeeName: "Potnuru",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Pradeep.Nuteti@infinite.com",
        employeeName: "Nuteti Pradeep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "prakruthi.Ulvi@infinite.com",
        employeeName: "Prakruthi U",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Raghu.Saran@infinite.com",
        employeeName: "Pathree Raghu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rajesh.Kesana@infinite.com",
        employeeName: "Kesana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sivamurali.Manohar@infinite.com",
        employeeName: "Siva Murali Manohar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saisanthosh.Pasala@infinite.com",
        employeeName: "Pasala Sai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sanjay.Kannan@infinite.com",
        employeeName: "Sanjaykannan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saqhib.Ahmed@infinite.com",
        employeeName: "Saqhib",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sriteja.Govindula@infinite.com",
        employeeName: "Govindula",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Somasekhar.Pulicherla@infinite.com",
        employeeName: "Pulicherla Somasekhar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Suchitha.Malige@infinite.com",
        employeeName: "Suchitha M",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Swetha.Garikapati@infinite.com",
        employeeName: "Swetha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saikeerthi.Tummagunta@infinite.com",
        employeeName: "Tummagunta Sai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bhargav.Vasupalli@infinite.com",
        employeeName: "Vasupalli",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Adisiva.Pattapu@infinite.com",
        employeeName: "Pattapu Adi Siva",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Gowthami.Bommasani@infinite.com",
        employeeName: "Bommasani",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Harshvardhan.Singh2@infinite.com",
        employeeName: "Harshvardhan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Tarunkumar.Jami@infinite.com",
        employeeName: "Jami Tarun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Tharun.Vadde@infinite.com",
        employeeName: "Tharun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ramya.Nara@infinite.com",
        employeeName: "Nara",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nirmala.Kannoji@infinite.com",
        employeeName: "Kannoji",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sahana.prabakaran@infinite.com",
        employeeName: "Sahana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Manisha.Reshaveni@infinite.com",
        employeeName: "Reshaveni",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Riya.Adhikari@infinite.com",
        employeeName: "Riya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mohith.Kashyap@infinite.com",
        employeeName: "Mohith k",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bhagya.Ravikumar@infinite.com",
        employeeName: "Bhagya Ravi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ishwar.Kolkar@infinite.com",
        employeeName: "Ishwar G",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Anshu.Kumari@infinite.com",
        employeeName: "Anshu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Hitesh.Verma@infinite.com",
        employeeName: "Hitesh Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Chandrareddy.Dumpala@infinite.com",
        employeeName: "Chandra Reddy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Monika.Bedi@infinite.com",
        employeeName: "Rayapu Monika",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ruchitha.Jayaprakash@infinite.com",
        employeeName: "Ruchitha J",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Chaitanya.Mashetty@infinite.com",
        employeeName: "Mashetty",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Devanshu.Babbar@infinite.com",
        employeeName: "Devanshu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shashank.Mutthineni@infinite.com",
        employeeName: "Mutthineni",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Aman.Tripathi@infinite.com",
        employeeName: "Aman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sampurna.Mishra@infinite.com",
        employeeName: "Sampurna Nand",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Murthy.Sristi@infinite.com",
        employeeName: "Sristi Venkata Ramana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vikash.Verma@infinite.com",
        employeeName: "Vikash",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Prashanth.Athota@infinite.com",
        employeeName: "Prashanth",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ishfaq.Mohammad@infinite.com",
        employeeName: "Ishfaq",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Arun.Chand@infinite.com",
        employeeName: "Arun",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nasir.Ansari@infinite.com",
        employeeName: "Md Nasir",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sahil.Kumar@infinite.com",
        employeeName: "Sahil",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Reshma.Dalmeida@infinite.com",
        employeeName: "Reshma",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vijayakumar.Pagadala@infinite.com",
        employeeName: "Pagadala Vijaya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Anugula.Madhu@infinite.com",
        employeeName: "Anugula",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Alagendra.Prasath@infinite.com",
        employeeName: "Alagendra Prasath",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Gupentharan.Muthuramalingam@infinite.com",
        employeeName: "M",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vani.Akula@infinite.com",
        employeeName: "Akula",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sadashiv.Ingale@infinite.com",
        employeeName: "Sadashiv Abhiman",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Poornachandra.Chandrashekar@infinite.com",
        employeeName: "Poornachandra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Jaivrat.Lohiya@infinite.com",
        employeeName: "Jaivrat",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ajay.Dey@infinite.com",
        employeeName: "Ajay",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sandeep.Kumar9@infinite.com",
        employeeName: "Sandeep",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Harikrishnan.Thirupathi@infinite.com",
        employeeName: "Harikrishnan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Pankaj.Sawant@infinite.com",
        employeeName: "Pankaj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Amarjeet.Kushwaha@infinite.com",
        employeeName: "Amarjeet",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Navin.Agarwal@infinite.com",
        employeeName: "Navin",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "HariPrasad.Narapareddi@infinite.com",
        employeeName: "Hari Prasad",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ayush.Dadhich@infinite.com",
        employeeName: "Ayush",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Preetipurna.Das@infinite.com",
        employeeName: "Preetipurna",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Haripriya.Parupalli@infinite.com",
        employeeName: "P",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nilesh.Rajput@infinite.com",
        employeeName: "Nilesh Ramsing",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Himmat.Dhaware@infinite.com",
        employeeName: "Himmat Baliram",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vaishnavi.Vaze@infinite.com",
        employeeName: "Vaishnavi U",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Abhishek.Kandi@infinite.com",
        employeeName: "Kandi Abhishek",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ravi.Chauhan@infinite.com",
        employeeName: "Ravi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Apoorva.Ananth@infinite.com",
        employeeName: "Apoorva C",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mishel.Seelam@infinite.com",
        employeeName: "Mishel Sajiv Rai",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rushikesh.Landge@infinite.com",
        employeeName: "Rushikesh Bhaskar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ankit.Sajwan@infinite.com",
        employeeName: "Ankit",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Seetha.Sugi@infinite.com",
        employeeName: "Seetha Sugi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Nitesh.Vishwakarma@infinite.com",
        employeeName: "Nitesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sanket.Mishra@infinite.com",
        employeeName: "Sanket",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sumit.Khandagale@infinite.com",
        employeeName: "Sumit Surendra",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mahesh.Vasireddy@infinite.com",
        employeeName: "Mahesh",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Govindaraju.Gavara@infinite.com",
        employeeName: "Govindaraju",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sanno.Bano@infinite.com",
        employeeName: "Sanno",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Preeti.Bhatia@infinite.com",
        employeeName: "Preeti",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Harshad.Manjre@infinite.com",
        employeeName: "Harshad",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Divyaprakash.Ambeeru@infinite.com",
        employeeName: "Ambeeru",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sahil.Ahmed@infinite.com",
        employeeName: "Sahil",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vivekananda.Katreddy@infinite.com",
        employeeName: "Katreddy Vivekananda",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Manoj.Kumar@infinite.com",
        employeeName: "Manoj Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ashok.Kumar3@infinite.com",
        employeeName: "Ashok",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Baraneeswaran.Chandrasekaran@infinite.com",
        employeeName: "Baraneeswaran",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Uvais.Mohamed@infinite.com",
        employeeName: "Mohamed Uvais Mogamed",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saranraj.Chandrasekaran@infinite.com",
        employeeName: "Saranraj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Janani.Kuruschev@infinite.com",
        employeeName: "Janani",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Niranjana.Harish@infinite.com",
        employeeName: "Niranjana",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Chandrasekar.Rajakrishnan@infinite.com",
        employeeName: "Chandrasekar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Karthikeyan.Moorthi@infinite.com",
        employeeName: "Karthikeyan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Priyanka.Manziny@infinite.com",
        employeeName: "Priyanka",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vignesh.Ayyalusamy@infinite.com",
        employeeName: "A",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Muskan.Aggarwal@infinite.com",
        employeeName: "Muskan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bhavadharini.Rathinavel@infinite.com",
        employeeName: "Bhavadharini",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Arunkumar.Palani@infinite.com",
        employeeName: "Arun Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Priya.Krishnamurthy@infinite.com",
        employeeName: "Priya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Anandhan.Sadhasivam@infinite.com",
        employeeName: "Anandhan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Gokula.Krishnan@infinite.com",
        employeeName: "Gokula",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ajay.Sairam@infinite.com",
        employeeName: "Namatheertham Ajay",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Poormitha.Kalapala@infinite.com",
        employeeName: "Kalapala Poormitha",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Manoj.Devarajulu@infinite.com",
        employeeName: "D",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Renuka.Kollu@infinite.com",
        employeeName: "Kollu",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Senbagam.Raju@infinite.com",
        employeeName: "R",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Shreepriya.Balamurugan@infinite.com",
        employeeName: "Shreepriya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Surjith.Mani@infinite.com",
        employeeName: "Surjith",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Vanshaj.Yadav@infinite.com",
        employeeName: "Vanshaj",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Hemanthreddy.Koti@infinite.com",
        employeeName: "Koti Naga Hemanth",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Hareesh.Anand@infinite.com",
        employeeName: "Hareesh Anand S",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Rohitkumar.Sharma@infinite.com",
        employeeName: "Rohit Kumar",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Saravanan.Shanmugam2@infinite.com",
        employeeName: "Saravanan",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Yamini.Devi@infinite.com",
        employeeName: "Yamini",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Dhivya.Srinivasan@infinite.com",
        employeeName: "Dhivya",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Bharath.Dhanabal@infinite.com",
        employeeName: "Bharath",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Armstrong.Seles@infinite.com",
        employeeName: "Armstrong  Seles",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Sumeet.Rajpal@infinite.com",
        employeeName: "Sumeet H",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Craig.Afonso@infinite.com",
        employeeName: "Craig Joseph",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ruchi.Gupta@infinite.com",
        employeeName: "Ruchi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ankaraju.Rugmani@infinite.com",
        employeeName: "Ankaraju",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Gokulaselvi.Soundararajan@infinite.com",
        employeeName: "GokulaSelvi",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Supraja.Subramanian@infinite.com",
        employeeName: "Supraja",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Ankush.Roy@infinite.com",
        employeeName: "Ankush Roy",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "Mohammedayaz.Baig@infinite.com",
        employeeName: "Mohammed Ayaz Ulla",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "457126",
      },
      {
        email: "testuser92@yopmail.com",
        employeeName: "Test",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "228366",
      },
      {
        email: "testuser90@yopmail.com",
        employeeName: "Test",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "725344",
      },
      {
        email: "testuser93@yopmail.com",
        employeeName: "Test",
        organisationName: "Infinite Computer Solutions",
        invitationCode: "493462",
      },
    ];

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
  username: "api",
  key: "a0b4c6dd70c2f9c9c78062a9148611e1-07ec2ba2-9691e37e",
});

const DOMAIN = "myberrybox.app";
const SENDER = "no-reply@myberrybox.com";
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
