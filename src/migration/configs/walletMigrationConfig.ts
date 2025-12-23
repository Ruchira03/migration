import {
  BerryBoxUser,
  MobileUserPlans,
} from "../../../prisma/generated/portal";
import {
  getPortalPrismaClient,
  PortalClient,
  PortalPrisma,
} from "../../utils/dbUtils";
import {
  fetchClientWallets,
  fetchConsumerWallet,
  getPlanWalletSize,
  getServiceName,
} from "../../utils/walletUtils";
import { v4 as uuidv4 } from "uuid";
import chunk from "lodash.chunk";

export const migrateClientWallets = async () => {
  try {
    console.log("Migrating client wallets...");

    const prisma = await getPortalPrismaClient();

    const organizations = await prisma.organization.findMany({
      include: { Plan: true },
    });
    const clientWallets = await fetchClientWallets();

    for (const client of clientWallets) {
      const org = organizations.find(
        (o) =>
          o.name.toLocaleLowerCase().trim() ===
          client.name.toLocaleLowerCase().trim()
      );

      if (!org) {
        if (client.name != "BerryBox ") {
          console.warn(`Organization not found for: ${client.name}`);
        }
        continue;
      }
      const planWalletSize = getPlanWalletSize(org.name);
      //console.log("Plan wallet size:", planWalletSize);
      await prisma.plan.update({
        where: {
          id: org.Plan[0].id,
        },
        data: {
          walletSize: planWalletSize,
        },
      });
      await prisma.planService.updateMany({
        where: {
          organizationId: org.id,
        },
        data: {
          packageWalletSize: planWalletSize,
        },
      });
      // Insert each wallet linked to the matched organization
      for (const wallet of client.wallets) {
        if (wallet.type == "ds_tests") {
          continue;
        }
        const serviceName = getServiceName(
          wallet.type,
          wallet.specialization,
          wallet.type
        );
        let vendorServiceId = null;
        let vendorService = await prisma.vendorBenefitService.findFirst({
          where: {
            vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
            service: {
              name: serviceName,
            },
          },
          select: {
            id: true,
            service: {
              select: {
                categoryId: true,
              },
            },
          },
        });
        vendorServiceId = vendorService?.id;
        if (serviceName == "Diagnostics")
          vendorServiceId = "7b2036d6-2cfb-443d-81d9-50d98ae134c2";
        if (!vendorServiceId) {
          console.warn(`Service not found for: ${serviceName}`, wallet);
          continue;
        }
        //console.log("Vendor service id:", vendorServiceId);
        let planServiceId = null;
        const planService = await prisma.planService.findFirst({
          where: {
            organizationId: org.id,
            vendorServiceId: vendorServiceId,
          },
          select: {
            id: true,
          },
        });
        planServiceId = planService;
        if (!planServiceId) {
          console.log("Plan service not found for: ", serviceName);

          planServiceId = await prisma.planService
            .create({
              data: {
                planId: org.Plan[0].id,
                isPackage: false,
                isItem: false,
                vendorItemCode: "",
                vendorPackageCode: "COUPON_CODE",
                organizationId: org.id,
                packageWalletSize: 0,
                // packageVersionId: packageVersions.get(packageId) || "",
                vendorServiceId: vendorServiceId,
                startDate: org.Plan[0].createdAt,
                endDate: org.Plan[0].createdAt,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: "MIGRATION_SCRIPT",
                updatedBy: "MIGRATION_SCRIPT",
                serviceRestrictions: {},
              },
            })
            .then((res) => {
              return {
                id: res.id,
              };
            });

          await prisma.serviceRestriction.create({
            data: {
              planServiceId: planServiceId.id,
              organizationId: org.id,
              serviceWalletSize: 0,
              walletType: null,
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
            },
          });
        }

        if (!planServiceId) {
          console.warn(
            `Plan service not found for: ${serviceName} for the org : ${org.name}`
          );
          continue;
        }
        //console.log("Plan service id:", planServiceId);

        const sr = await prisma.serviceRestriction.findUnique({
          where: {
            planServiceId: planServiceId.id,
          },
        });
        if (!sr) {
          console.log(
            "Service restriction not found for plan service id:",
            planServiceId.id
          );
          continue;
        }
        //also update plan wallet and package wallet for given
        await prisma.serviceRestriction.update({
          where: {
            planServiceId: planServiceId.id,
          },
          data: {
            organizationId: org.id,
            planServiceId: planServiceId?.id,
            walletType: wallet.amount
              ? "wallet_amount"
              : wallet.limits
                ? wallet.limits == "9999"
                  ? "unlimited"
                  : "limits"
                : "not_applicable",
            serviceWalletSize: wallet.amount ? wallet.amount : 0,
            walletMaxAmt: wallet.amount ? wallet.amount : 0,
            walletTransactionLimit: wallet.amount ? 99999 : 0,
            discountTransactionLimit: wallet.discount_percentage
              ? wallet.limits
              : 0,
            discount: wallet.discount_percentage
              ? wallet.discount_percentage
              : 0,
            discountMaxAmt: wallet.discount_percentage ? 99999 : 0,
            cumulativeDiscount: wallet.discount_percentage ? 99999 : 0,
            createdBy: "MIGRATION_SCRIPT",
            updatedBy: "MIGRATION_SCRIPT",
          },
        });
      }
    }

    console.log("Client wallets migrated successfully!");
  } catch (error) {
    console.error("Error migrating client wallets:", error);
    throw error;
  }
};

export const migrateConsumerWallets = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    const allowedOrganizations = [
      "Vxceed Software Solutions Pvt. Ltd.",
      "Cogniquest Technologies Private Limited",
      "Kidvento",
      "INTEGRATED ELECTRIC COMPANY PRIVATE LIMITED",
      "Futurisk",
      "The Math Company Private Limited",
      "Envision",
      "Infiniti Software Solutions",
      "Tyfone Communications Development India Pvt Ltd",
      "Softway Solutions Private Limited",
      "Availity India Private Limited",
      "Charles Hudson Technology Solutions",
      "Breakthrough Trust",
      "Retail Kloud Technologies Pvt Ltd",
      "Onsitego",
      "Triveni Public School",
      "New Wave Computing Pvt ltd",
      "MMSH Clinical Research Pvt Ltd - Directors",
      "Odessa Solutions Pvt Ltd",
      "Geba Cables and Wires India Pvt Ltd",
      "Affine Analytics Pvt Ltd",
      "BDI India",
      "Ocwen Financial Corporation",
      "testuser-prod",
      "V Guard",
      "Brokentusk Technologies",
      "Indihood Private Limited",
      "Berry Box Futurisk Prospects",
      "Aurigo Software Solutions",
      "Berry Box Benefits",
      "Markov MI India Private Limited",
      "Novelvox Softwares India Pvt Ltd",
      "Purshotam Company Private Limited",
      "Neutrinos - Build, Next Incredible",
      "Field Assist",
      "Innova L12-L14",
      "Demo Organization",
      "testRapha",
      "Innova L10-L12",
      "MMSH Clinical Research Pvt Ltd - Managers",
      "MMSH Clinical Research Pvt Ltd - Employees",
      "GyanSys Infotech Pvt. Ltd",
      "BlackBuck",
      "Infinite Computer Solutions",
      "Innova L1-L6",
      "Innova L7-L9",
    ];

    // Load all vendorServiceId values once
    const vendorServices = await prisma.vendorBenefitService.findMany({
      where: {
        vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
      },
      select: { id: true, service: { select: { name: true } } },
    });

    // Create a static lookup table
    const vendorServiceMap = new Map(
      vendorServices.map(({ id, service }) => [service.name, id])
    );

    // Add fixed mappings (if required)
    vendorServiceMap.set("Diagnostics", "7b2036d6-2cfb-443d-81d9-50d98ae134c2");

    console.log("Vendor service map created");

    // Preload all planServiceId values
    const planServices = await prisma.planService.findMany({
      select: { id: true, organizationId: true, vendorServiceId: true },
    });

    // Create planServiceId lookup table (key: `${orgId}-${vendorServiceId}`)
    const planServiceMap = new Map(
      planServices.map(({ id, organizationId, vendorServiceId }) => [
        `${organizationId}-${vendorServiceId}`,
        id,
      ])
    );

    console.log("Plan service map created");

    let offset = 0;
    const consumers = await prisma.clientConsumer.findMany({
      where: {
        consumerType: "EMPLOYEE",
        organization: {
          name: { in: allowedOrganizations },
        },
        VendorUser: {
          some: {
            vendorId: "7a58e814-3041-494d-8c2f-9fd5994bb206",
          },
        },
      },
      include: {
        VendorUser: true,
        organization: true,
      },
      skip: offset,
    });

    console.log("consumersLength:", consumers.length);

    const BATCH_SIZE = 100;
    const consumerBatches = chunk(consumers, BATCH_SIZE);
    let count = 0;

    for (const batch of consumerBatches) {
      const updateQueries: any = [];
      await Promise.all(
        batch.map(async (consumer) => {
          if (!consumer.VendorUser || consumer.VendorUser.length === 0) {
            return;
          }

          const walletResponse = await fetchConsumerWallet(
            consumer.VendorUser[0].vendorUserId
          );

          if (!walletResponse.sucess) {
            return;
          }

          const walletUpdatePromises = walletResponse.wallet.wallets
            .filter(
              (wallet: { type: string }) =>
                wallet.type !== "ds_tests" && wallet.type !== "radiology"
            )
            .map(
              async (wallet: {
                type: string;
                specialization: string;
                amount: any;
                limits: any;
              }) => {
                const serviceName = getServiceName(
                  wallet.type,
                  wallet.specialization,
                  wallet.type
                );

                let vendorServiceId = vendorServiceMap.get(serviceName);

                if (!vendorServiceId) {
                  console.warn(`Service not found for: ${serviceName}`);
                  return;
                }

                // console.log("Vendor service id:", vendorServiceId);

                // Use preloaded lookup instead of findFirst()
                const planServiceId = planServiceMap.get(
                  `${consumer.organizationId}-${vendorServiceId}`
                );

                if (!planServiceId) {
                  console.warn(
                    `Plan service not found for: ${serviceName}, Org ID: ${consumer.organizationId}`
                  );
                  return;
                }
                // console.log("Plan service id:", planServiceId);

                updateQueries.push(
                  prisma.consumerPlanServiceWallet.updateMany({
                    where: {
                      consumerPlanWallet: {
                        clientConsumerId: consumer.id,
                        isActive: true,
                      },
                      planServiceId: planServiceId,
                      isActive: true,
                    },
                    data: {
                      currentWalletAmount: wallet.amount || 0,
                      currentDiscountTransactionLimit: wallet.limits || 0,
                      createdBy: "MIGRATION_SCRIPT",
                      updatedBy: "MIGRATION_SCRIPT",
                    },
                  })
                );
              }
            );

          await Promise.all(walletUpdatePromises);
        })
      );

      // Execute updates in batches using Prisma transaction
      const updateChunks: any = chunk(updateQueries, BATCH_SIZE);

      await Promise.all(
        updateChunks.map(async (updateBatch: any) => {
          try {
            //console.log("Inserting updates started!");
            await prisma.$transaction(updateBatch);
            //console.log("Batch update executed successfully!");
          } catch (error) {
            console.error("Batch update failed:", error);
          }
        })
      );

      // Small delay to prevent API overload
      count++;
      console.log(
        "processed : ",
        (((count * BATCH_SIZE) / consumers.length) * 100).toPrecision(4),
        "%         offset : ",
        count * BATCH_SIZE + offset
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log("Consumer wallets migrated successfully!");
  } catch (error) {
    console.error("Error migrating consumer wallets:", error);
    throw error;
  }
};

export const initiateWallets = async () => {
  try {
    const prisma = await getPortalPrismaClient();
    const BATCH_SIZE = 1000;
    const CONCURRENT_BATCHES = 10; // Number of batches to process in parallel

    let offset = 0;
    let hasMoreRecords = true;

    while (hasMoreRecords) {
      const batchPromises = [];

      // Fetch multiple batches in parallel
      for (let i = 0; i < CONCURRENT_BATCHES; i++) {
        batchPromises.push(
          processBatch(offset + i * BATCH_SIZE, BATCH_SIZE, prisma)
        );
      }

      // Wait for all batches to complete
      const results = await Promise.allSettled(batchPromises);

      // Log errors if any batch fails
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(`Batch ${index} failed:`, result.reason);
        }
      });

      // Move the offset forward
      offset += CONCURRENT_BATCHES * BATCH_SIZE;

      // If any batch had fewer records than BATCH_SIZE, we reached the end
      if (
        results.some(
          (result) => result.status === "fulfilled" && result.value < BATCH_SIZE
        )
      ) {
        hasMoreRecords = false;
      }
    }

    console.log("All batches processed.");
  } catch (error) {
    console.error("Error migrating wallets:", error);
    throw error;
  }
};

const processBatch = async (
  offset: number,
  batchSize: number,
  prisma: PortalClient
) => {
  const planAssignments = await prisma.planAssignment.findMany({
    skip: offset,
    take: batchSize,
    select: {
      planId: true,
      clientConsumerId: true,
    },
  });

  if (planAssignments.length === 0) return 0;

  console.log(
    `Processing batch from ${offset} to ${offset + planAssignments.length}`
  );

  await prisma.$transaction(
    async (tx: PortalPrisma.TransactionClient) => {
      // Fetch all planServices in one go for efficiency
      const planIds = planAssignments.map((p) => p.planId);
      const planServices = await tx.planService.findMany({
        where: { planId: { in: planIds } },
        include: { plan: true, serviceRestrictions: true },
      });

      // Index planServices by planId for quick lookup
      const planServiceMap = new Map<string, any[]>();
      for (const ps of planServices) {
        if (!planServiceMap.has(ps.planId)) {
          planServiceMap.set(ps.planId, []);
        }
        planServiceMap.get(ps.planId)?.push(ps);
      }

      // Prepare batch insert data
      const consumerPlanWalletData = [];
      const consumerPackageWalletData = [];
      const consumerPlanServiceWalletData = [];
      const walletIdMap = new Map<string, string>();

      for (const { planId, clientConsumerId } of planAssignments) {
        const planServiceList = planServiceMap.get(planId) || [];
        if (planServiceList.length === 0) continue;

        const plan = planServiceList[0].plan;

        // Check if wallet already exists
        const existingWallet = await tx.consumerPlanWallet.findFirst({
          where: {
            clientConsumerId,
            planId,
            isActive: true,
          },
        });

        if (existingWallet) continue;

        // Generate a new Wallet ID
        const walletID = uuidv4();
        walletIdMap.set(`${clientConsumerId}-${planId}`, walletID);

        consumerPlanWalletData.push({
          id: walletID,
          clientConsumerId,
          planId,
          isActive: true,
          currentWalletAmount: plan.walletSize,
          createdBy: "MIGRATION_SCRIPT",
          updatedBy: "MIGRATION_SCRIPT",
        });

        // Collect package wallet data
        const packageData = new Map<string, number>();
        for (const ps of planServiceList) {
          if (ps.packageVersionId && ps.packageWalletSize) {
            packageData.set(ps.packageVersionId, ps.packageWalletSize);
          }
        }

        for (const [packageVersionId, size] of packageData.entries()) {
          consumerPackageWalletData.push({
            packageVersionId,
            isActive: true,
            consumerPlanWalletId: walletID,
            currentWalletAmount: size,
            createdBy: "MIGRATION_SCRIPT",
            updatedBy: "MIGRATION_SCRIPT",
          });
        }

        // Collect service wallet data
        for (const planService of planServiceList) {
          for (const serviceRestriction of planService.serviceRestrictions) {
            consumerPlanServiceWalletData.push({
              planServiceId: planService.id,
              consumerPlanWalletId: walletID,
              isActive: true,
              currentWalletAmount: serviceRestriction.serviceWalletSize,
              currentWalletTransactionLimit:
                serviceRestriction.walletTransactionLimit,
              currentDiscountTransactionLimit:
                serviceRestriction.discountTransactionLimit,
              currentCumulativeDiscount: serviceRestriction.cumulativeDiscount,
              createdBy: "MIGRATION_SCRIPT",
              updatedBy: "MIGRATION_SCRIPT",
            });
          }
        }
      }
      console.log(
        `inserting batch from ${offset} to ${offset + planAssignments.length}`
      );
      // Batch insert at the end of processing
      if (consumerPlanWalletData.length > 0) {
        await tx.consumerPlanWallet.createMany({
          data: consumerPlanWalletData,
          skipDuplicates: true,
        });

        if (consumerPackageWalletData.length > 0) {
          await tx.consumerPackageWallet.createMany({
            data: consumerPackageWalletData,
            skipDuplicates: true,
          });
        }

        if (consumerPlanServiceWalletData.length > 0) {
          await tx.consumerPlanServiceWallet.createMany({
            data: consumerPlanServiceWalletData,
            skipDuplicates: true,
          });
        }
      }
    },
    { timeout: 8000000 }
  );

  console.log(
    `Completed batch from ${offset} to ${offset + planAssignments.length}`
  );
  return planAssignments.length;
};

export const updateCadabumsWallet = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    const sr = await prisma.serviceRestriction.findMany({
      where: {
        planService: {
          vendorServiceId: "69ec000c-746e-49ac-9b48-33788e242f54",
        },
      },
    });

    for (const serviceRestriction of sr) {
      await prisma.serviceRestriction.update({
        where: {
          id: serviceRestriction.id,
        },
        data: {
          walletType: "limits",
          discount: 100,
          discountTransactionLimit: 1,
          discountMaxAmt: 99999,
          cumulativeDiscount: 99999,
          createdBy: "MIGRATION_SCRIPT",
          updatedBy: "MIGRATION_SCRIPT",
        },
      });
    }
    console.log("Cadabums wallet updated successfully!");
  } catch (error) {
    console.error("Error updating Cadabums wallet:", error);
    throw error;
  }
};

export const restoreProdUsers = async () => {
  const bbxUsersData = [
    {
      id: "9b2ae30e-f1d5-4357-9ff4-c711f0f7cded",
      bbxUserId: "BBX433100",
      mobile: "+919199076261",
      firstName: "Ankush",
      lastName: "Kumar",
      dob: "1997-06-30T13:00:00.000Z",
      personalEmail: "ankush8496@gmail.com",
      cognitoUserId: "51132d2a-30a1-70de-4abf-fe659e7cf694",
      pinCode: "560029",
      createdAt: "2025-02-17T03:29:01.861Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T03:32:57.671Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
    {
      id: "8c7ae090-f8e5-407f-8b65-d9bd99e47d49",
      bbxUserId: "BBX667679",
      mobile: "+917022277184",
      firstName: "Suchita",
      lastName: "jain",
      dob: "2007-02-07T13:00:00.000Z",
      personalEmail: "jainsuchi21@gmail.com",
      cognitoUserId: "91d39d5a-90b1-70b5-0842-b1a0624e0f44",
      pinCode: "122011",
      createdAt: "2025-02-17T03:34:55.540Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T03:37:10.842Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "FEMALE",
    },
    {
      id: "772bb7ec-fd4f-41aa-9e9f-b6eda400079c",
      bbxUserId: "BBX471437",
      mobile: "+919573695491",
      firstName: null,
      lastName: null,
      dob: null,
      personalEmail: null,
      cognitoUserId: "e1038daa-30b1-70be-b6d3-478353f014ca",
      pinCode: null,
      createdAt: "2025-02-17T03:47:54.110Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T03:47:54.110Z",
      updatedBy: "PostConfirmationTrigger",
      gender: null,
    },
    {
      id: "a17aa717-ffdb-4e62-b450-d8d131c6a1ce",
      bbxUserId: "BBX424338",
      mobile: "+917349559414",
      firstName: "Ruth",
      lastName: "Antony ",
      dob: "2000-05-14T13:00:00.000Z",
      personalEmail: "Ruth@myberrybox.com",
      cognitoUserId: "e1939d1a-c011-706a-0ee0-1e68b956ffb5",
      pinCode: "560068",
      createdAt: "2025-02-17T04:23:44.550Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T04:27:34.963Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "FEMALE",
    },
    {
      id: "c334628b-8a3e-4b9f-a878-b04740122b8a",
      bbxUserId: "BBX986714",
      mobile: "+918050011860",
      firstName: "Siddharth",
      lastName: "Vikram ",
      dob: "1996-08-07T18:30:00.000Z",
      personalEmail: "manvswild742@gmail.com",
      cognitoUserId: "4103edfa-8061-7080-0e50-0e79f5d4a520",
      pinCode: "560068",
      createdAt: "2025-02-17T04:19:27.308Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T04:50:36.809Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
    {
      id: "ae325d52-1893-4010-8b0c-ab7455f88292",
      bbxUserId: "BBX906799",
      mobile: "+918008697008",
      firstName: "Sachin",
      lastName: "Yadav",
      dob: "2000-12-20T18:30:00.000Z",
      personalEmail: "sachin@myberrybox.com",
      cognitoUserId: "d1f39dba-a031-7095-1d98-547f8036099b",
      pinCode: "500016",
      createdAt: "2025-02-17T06:28:21.034Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T06:32:00.716Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
    {
      id: "9fb15bf1-309e-40f9-93cd-08209ae23e16",
      bbxUserId: "BBX289215",
      mobile: "+919731611004",
      firstName: "Pandia",
      lastName: "Rajan",
      dob: "1981-04-08T13:00:00.000Z",
      personalEmail: "pandiasrajan@gmail.com",
      cognitoUserId: "d1830dda-7051-702a-7f4f-ffa72faebaa1",
      pinCode: "560104",
      createdAt: "2025-02-17T07:17:01.538Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-17T07:18:43.222Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
    {
      id: "566535ea-df97-4ade-a46d-b28b93fae9f0",
      bbxUserId: "BBX706412",
      mobile: "+919848275851",
      firstName: "Dhruba ",
      lastName: "Dutta",
      dob: "1983-12-01T13:00:00.000Z",
      personalEmail: "dhruv.dutta@gmail.com",
      cognitoUserId: "81a3bdaa-60e1-70ad-9110-b696590c4170",
      pinCode: "560076",
      createdAt: "2025-02-17T08:59:03.262Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-18T00:32:05.023Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
    {
      id: "0ccb7b7a-bfde-4fd7-bff6-2ea4fd4c8742",
      bbxUserId: "BBX923763",
      mobile: "+919880841270",
      firstName: "Moni",
      lastName: "B",
      dob: "1975-12-31T13:00:00.000Z",
      personalEmail: "Monishitab@outlook.com",
      cognitoUserId: "41030dea-1051-70aa-1f70-e09ab97cecbb",
      pinCode: "560084",
      createdAt: "2025-02-18T07:35:25.207Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-18T23:23:08.089Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "FEMALE",
    },
    {
      id: "f1207a94-03f6-4db1-b7c9-2353be92dd85",
      bbxUserId: "BBX491370",
      mobile: "+919740470137",
      firstName: null,
      lastName: null,
      dob: null,
      personalEmail: null,
      cognitoUserId: "01233d1a-1071-70c2-a6bb-2d765c97db39",
      pinCode: null,
      createdAt: "2025-02-19T00:36:19.733Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-19T00:36:19.733Z",
      updatedBy: "PostConfirmationTrigger",
      gender: null,
    },
    {
      id: "9f2d811b-2e56-401b-8623-53c153b43d3f",
      bbxUserId: "BBX551172",
      mobile: "+918375973037",
      firstName: null,
      lastName: null,
      dob: null,
      personalEmail: null,
      cognitoUserId: "11f35d8a-a041-7028-4af6-bce8fffddd20",
      pinCode: null,
      createdAt: "2025-02-19T01:40:04.599Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-19T01:40:04.599Z",
      updatedBy: "PostConfirmationTrigger",
      gender: null,
    },
    {
      id: "9d915844-d79f-44db-8e00-e80a95aad8bb",
      bbxUserId: "BBX270951",
      mobile: "+919821255534",
      firstName: "Paulson",
      lastName: "Koodaly",
      dob: "1992-04-26T18:30:00.000Z",
      personalEmail: "paulson22@gmail.com",
      cognitoUserId: "b1b3ddca-9001-7072-c6a9-c6e4e53199a1",
      pinCode: "400043",
      createdAt: "2025-02-19T01:35:36.026Z",
      createdBy: "PostConfirmationTrigger",
      updatedAt: "2025-02-19T02:12:58.252Z",
      updatedBy: "PostConfirmationTrigger",
      gender: "MALE",
    },
  ] as unknown as BerryBoxUser[];

  const mobileUserPlansData = [
    {
      id: "00012730-a701-4741-9abe-2db93bbfc153",
      bbxUserId: "BBX986714",
      clientConsumerId: "8a6f6024-d19b-44bd-8697-209cdf56a728",
      planId: "7975d08b-3713-42ef-a83c-b4a59780d644",
      createdAt: "2025-02-17T04:50:20.017Z",
      createdBy: "BBX986714",
      updatedAt: "2025-02-17T04:50:20.017Z",
      updatedBy: "BBX986714",
      planTag: "Corporate Plan",
    },
    {
      id: "2250e3ac-9a7b-471a-b6c3-228ac4863769",
      bbxUserId: "BBX906799",
      clientConsumerId: "b188b416-7e44-4940-99d5-48eedb9b5285",
      planId: "7975d08b-3713-42ef-a83c-b4a59780d644",
      createdAt: "2025-02-17T06:30:42.359Z",
      createdBy: "BBX906799",
      updatedAt: "2025-02-17T06:30:42.359Z",
      updatedBy: "BBX906799",
      planTag: "Corporate Plan",
    },
    {
      id: "3afe3b1f-8f2a-40e7-9b9c-30ea75699ea7",
      bbxUserId: "BBX270951",
      clientConsumerId: "56d88b38-4c40-43e0-bfd0-ba9e8e3b81f8",
      planId: "7975d08b-3713-42ef-a83c-b4a59780d644",
      createdAt: "2025-02-19T02:12:25.679Z",
      createdBy: "BBX270951",
      updatedAt: "2025-02-19T02:12:25.679Z",
      updatedBy: "BBX270951",
      planTag: "Corporate Plan",
    },
  ] as unknown as MobileUserPlans[];

  const prisma = await getPortalPrismaClient();

  await prisma.berryBoxUser.createMany({
    data: bbxUsersData,
    skipDuplicates: true,
  });

  await prisma.mobileUserPlans.createMany({
    data: mobileUserPlansData,
    skipDuplicates: true,
  });
};

export const updateConsumerGroups = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    // Fetch all consumer groups at once
    const consumerGroups = await prisma.consumerGroup.findMany({
      where: {
        createdBy: "MIGRATION_SCRIPT",
      },
    });
    console.log("Consumer groups fetched:", consumerGroups.length);

    // Group by primaryConsumerId and assign new groupIds
    const groupedByPrimaryConsumer: { [key: string]: string } =
      consumerGroups.reduce((acc: { [key: string]: string }, group) => {
        if (!acc[group.primaryConsumerId]) {
          acc[group.primaryConsumerId] = uuidv4();
        }
        return acc;
      }, {});

    // Prepare update data
    const updates = consumerGroups.map((group) => ({
      id: group.id,
      groupId: groupedByPrimaryConsumer[group.primaryConsumerId],
    }));
    console.log("Updates prepared:", updates.length);

    // // Find duplicate groupIds before updating
    // const duplicateCheck = new Set();
    // const duplicates = new Set();

    // const bulkUpdates = consumerGroups.map((group) => {
    //   const newGroupId = groupedByPrimaryConsumer[group.primaryConsumerId];

    //   const key = `${newGroupId}-${group.primaryConsumerId}-${group.consumerId}`;

    //   if (duplicateCheck.has(key)) {
    //     duplicates.add(key);
    //   } else {
    //     duplicateCheck.add(key);
    //   }

    //   return {
    //     id: group.id,
    //     groupId: newGroupId,
    //   };
    // });

    // // Log detected duplicates before updating
    // if (duplicates.size > 0) {
    //   console.error("🚨 Potential duplicate entries detected:", [
    //     ...duplicates,
    //   ]);
    //   throw new Error(
    //     "Duplicate entries detected in bulk updates. Aborting update."
    //   );
    // }

    // Batch size and concurrency limit
    const BATCH_SIZE = 1000;
    const MAX_PARALLEL = 10;

    // Function to process updates in parallel with limit
    const processInBatches = async () => {
      for (let i = 0; i < updates.length; i += BATCH_SIZE * MAX_PARALLEL) {
        console.log(
          `Processing offset: ${i}, Batch size: ${BATCH_SIZE * MAX_PARALLEL}`
        );
        const batchPromises = [];

        for (
          let j = 0;
          j < MAX_PARALLEL && i + j * BATCH_SIZE < updates.length;
          j++
        ) {
          const batchOffset = i + j * BATCH_SIZE;
          const batch = updates.slice(batchOffset, batchOffset + BATCH_SIZE);
          console.log(
            `Starting batch at offset: ${batchOffset}, Size: ${batch.length}`
          );
          batchPromises.push(
            prisma
              .$transaction(
                batch.map((data) =>
                  prisma.consumerGroup.update({
                    where: { id: data.id },
                    data: {
                      groupId: data.groupId,
                      updatedBy: "MIGRATION_SCRIPT",
                    },
                  })
                )
              )
              .then(() =>
                console.log(
                  `Completed batch at offset: ${batchOffset}, Size: ${batch.length}`
                )
              )
              .catch((error) => {
                console.error(
                  `Error updating consumer group batch at offset: ${batchOffset}`,
                  error
                );
              })
          );
        }

        await Promise.all(batchPromises);
      }
    };

    await processInBatches();
    console.log("Consumer groups updated successfully!");
  } catch (error) {
    console.error("Error updating consumer groups:", error);
    throw error;
  }
};

export const updateLabstackWallet = async () => {
  try {
    const prisma = await getPortalPrismaClient();
    const employeeMap = new Map();
    for (const data of jsonData) {
      const consumer = await prisma.clientConsumer.findFirst({
        where: {
          id: data["Employee Id"],
        },
      });

      if (!consumer) {
        //console.warn(`Consumer not found for: ${data["Employee Id"]}`);
        continue;
      }
      //console.log("Consumer found for:", data["Employee Id"]);
      if (employeeMap.has(data["Employee Id"])) {
        console.log("Skipping update for:", data["Employee Id"]);
        continue;
      }
      employeeMap.set(data["Employee Id"], consumer);
      const wallet = await prisma.consumerPlanServiceWallet.findFirst({
        where: {
          consumerPlanWallet: {
            clientConsumerId: consumer.id,
            isActive: true,
          },
          planService: {
            vendorServiceId: "7b2036d6-2cfb-443d-81d9-50d98ae134c2",
            isItem: false,
          },
          isActive: true,
        },
      });

      if (!wallet) {
        console.warn(`Wallet not found for: ${data["Employee Id"]}`);
        continue;
      }

      // if (wallet.currentWalletAmount === data["Present Wallet Amount"]) {
      //   //console.log("Skipping update for:", data["Employee Id"]);
      //   continue;
      // }

      console.log(
        "Wallet found for:",
        data["Employee Id"],
        data["Present Wallet Amount"],
        wallet.currentWalletAmount
      );

      const update = await prisma.consumerPlanServiceWallet.update({
        where: { id: wallet.id },
        data: {
          currentWalletAmount: data["Present Wallet Amount"],
        },
      });
      console.log(
        "Wallet updated for:",
        data["Employee Id"],
        data["Present Wallet Amount"],
        update.currentWalletAmount
      );
      console.log("Updated wallet for:", data["Employee Id"]);
    }
  } catch (error) {
    console.error("Error updating consumer wallets:", error);
    throw error;
  }
};
const jsonData = [
  {
    "Employee Id": "58f4dd78-0fd9-4933-8ac4-9f2c9d4df819",
    "Present Wallet Amount": 1835,
  },
  {
    "Employee Id": "9447b6e3-6581-4f0c-bec3-020437736fe9",
    "Present Wallet Amount": -2987,
  },
 
];
