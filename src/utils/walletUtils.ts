import { GraphQLClient, gql } from "graphql-request";
import axios from "axios";
import { getEBPrismaClient, getPortalPrismaClient } from "./dbUtils";
import { PlanService, ServiceRestriction } from "../../prisma/generated/portal";
const RAPHA_GRAPHQL_URL = "https://api.raphacure.com/graphql";
const RAPHA_REST_URL = "https://api.raphacure.com/api/v1";
let tokenCache: { token: string; expiry: number } | null = null;

export async function fetchBerryBoxToken() {
  try {
    const response = await axios.post(`${RAPHA_REST_URL}/auth/token`, {
      email: "berry.box",
      password: "berry@20223",
    });
    // console.log("Test:", response.data.data.accessToken);

    const token = response.data.data.accessToken;
    const expiry = Date.now() + 2 * 60 * 60 * 1000;

    tokenCache = { token, expiry };
    return token;
  } catch (error) {
    console.error("Error fetching token:", error);
    throw new Error("Failed to get authentication token");
  }
}

export async function getBerryBoxToken() {
  if (!tokenCache || Date.now() >= tokenCache.expiry) {
    return await fetchBerryBoxToken();
  }
  return tokenCache.token;
}

export async function getConsumerToken(patientId: string) {
  try {
    // Get BerryBox token
    const bbxToken = await getBerryBoxToken();
    // Make API call to Rapha
    const response = await axios.patch(
      `${RAPHA_REST_URL}/user/signin`,
      { patient_id: patientId },
      {
        headers: {
          Authorization: `Bearer ${bbxToken}`,
        },
      }
    );

    return { sucess: true, accessToken: response.data.data.user.accessToken }; // Return only the data from the response
  } catch (error: any) {
    // console.error("Error fetching token:", error.response.data, patientId);
    return { sucess: false, accessToken: error.response.data };
  }
}

// Generic function to make GraphQL requests
export async function makeGraphqlCall(
  query: string,
  token: string,
  variables = {}
) {
  try {
    const client = new GraphQLClient(RAPHA_GRAPHQL_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return await client.request(query, variables);
  } catch (error) {
    console.error("GraphQL request failed:", error);
    throw error;
  }
}

const GET_CLIENTS = gql`
  query GET_CLIENTS {
    clients {
      id
      name
      address
      city
      state
      zip
      logo_url
      wallets {
        name
        type
        specialization
        limits
        discount_percentage
        amount
      }
    }
  }
`;

export const fetchClientWallets = async () => {
  try {
    const response = await makeGraphqlCall(
      GET_CLIENTS,
      await getBerryBoxToken()
    );
    if (response.errors) {
      console.error("GraphQL errors:", response.errors);
      throw new Error("Failed to fetch client wallets");
    }
    return response.clients;
  } catch (error) {
    console.error("Error fetching client wallets:", error);
    throw error;
  }
};

export const fetchConsumerWallet = async (consumerId: string) => {
  try {
    const consumerToken = await getConsumerToken(consumerId);
    // console.log("Consumer token:", consumerToken);
    if (!consumerToken.sucess) {
      // console.error("Error fetching consumer token:", consumerToken);
      return { sucess: false, error: consumerToken.accessToken };
    }
    // console.log(
    //   "Consumer token fetched successfully. Now making request to fetch wallet : ",consumerToken.accessToken
    // );

    const response = await axios.get(`${RAPHA_REST_URL}/wallet`, {
      headers: {
        Authorization: `Bearer ${consumerToken.accessToken}`,
      },
    });

    // console.log("Consumer wallets fetched from rapha :", response.data);
    return { sucess: true, wallet: response.data.data };
  } catch (error) {
    console.error("Error fetching consumer wallets:", error);
    throw error;
  }
};

export const findMissingOrganizations = async () => {
  try {
    const prisma = await getPortalPrismaClient();

    // Fetch organizations from DB
    const dbOrganizations = await prisma.organization.findMany();
    const dbOrgNames = new Set(
      dbOrganizations.map((org) => org.name.toLocaleLowerCase().trim())
    );

    // Fetch organizations from clientWallets
    const clientWallets = await fetchClientWallets();
    const clientOrgNames = new Set(
      clientWallets.map((client: { name: any }) =>
        client.name.toLocaleLowerCase().trim()
      )
    );

    // Find organizations in client but not in DB
    const clientOnly = clientWallets.filter(
      (client: { name: string }) =>
        !dbOrgNames.has(client.name.toLocaleLowerCase().trim())
    );

    // Find organizations in DB but not in client
    const orgOnly = dbOrganizations.filter(
      (org) => !clientOrgNames.has(org.name.toLocaleLowerCase().trim())
    );

    clientOnly.forEach((client: { name: string }) => {
      console.log(`Client only: ${client.name}`);
    });
    orgOnly.forEach((org) => {
      console.log(`Organization only: ${org.name}`);
    });

    return { clientOnly, orgOnly };
  } catch (error) {
    console.error("Error finding missing organizations:", error);
    throw error;
  }
};

export const getPlanWalletSize = (clientName: string) => {
  switch (clientName) {
    case "Vxceed Software Solutions Pvt. Ltd.":
      return 20000;

    case "Cogniquest Technologies Private Limited":
      return 6500;

    case "Kidvento":
      return 0;

    case "INTEGRATED ELECTRIC COMPANY PRIVATE LIMITED":
      return 10000;

    case "Futurisk":
      return 6000;

    case "The Math Company Private Limited":
      return 10000;

    case "Envision":
      return 0;

    case "Infiniti Software Solutions":
      return 10000;

    case "Tyfone Communications Development India Pvt Ltd":
      return 0;

    case "Softway Solutions Private Limited":
      return 0;

    case "Availity India Private Limited":
      return 10000;

    case "Charles Hudson Technology Solutions":
      return 0;

    case "Breakthrough Trust":
      return 10000;

    case "Retail Kloud Technologies Pvt Ltd":
      return 0;

    case "Onsitego":
      return 0;

    case "Triveni Public School":
      return 10000;

    case "New Wave Computing Pvt ltd":
      return 0;

    case "MMSH Clinical Research Pvt Ltd - Directors":
      return 10000;

    case "Odessa Solutions Pvt Ltd":
      return 0;

    case "Geba Cables and Wires India Pvt Ltd":
      return 10000;

    case "Affine Analytics Pvt Ltd":
      return 10000;

    case "BDI India":
      return 10000;

    case "Ocwen Financial Corporation":
      return 20000;

    case "testuser-prod":
      return 10000;

    case "V Guard":
      return 0;

    case "Brokentusk Technologies":
      return 20000;

    case "Indihood Private Limited":
      return 10000;

    case "Berry Box Futurisk Prospects":
      return 10000;

    case "Aurigo Software Solutions":
      return 5000;

    case "Berry Box Benefits":
      return 10000;

    case "Markov MI India Private Limited":
      return 0;

    case "Novelvox Softwares India Pvt Ltd":
      return 0;

    case "Purshotam Company Private Limited":
      return 25000;

    case "Neutrinos - Build, Next Incredible":
      return 0;

    case "Field Assist":
      return 0;

    case "Innova L12-L14":
      return 20000;

    case "Demo Organization":
      return 10000;

    case "testRapha":
      return 10000;

    case "Innova L10-L12":
      return 20000;

    case "MMSH Clinical Research Pvt Ltd - Managers":
      return 10000;

    case "MMSH Clinical Research Pvt Ltd - Employees":
      return 10000;

    case "GyanSys Infotech Pvt. Ltd":
      return 0;

    case "BlackBuck":
      return 0;

    case "Infinite Computer Solutions":
      return 15000;

    case "Innova L1-L6":
      return 100000;

    case "Innova L7-L9":
      return 25000;

    default:
      return 0;
  }
};

export const getServiceName = (
  serviceType: string,
  specialization: string,
  defaultName: string
) => {
  switch (serviceType) {
    case "opd_consultation":
      return "OPD Appointments";
    case "diagnostic_tests":
      return "Diagnostics";
    case "pharmacy":
      return "Order Medicine";
    case "dental_consultation":
      return "Dental Consultation";
    case "eye_consultation":
      return "Vision Consultation";
    case "virtual_consultation":
      return "Online Consultation";
    case "gym_subscription":
      return "Gym Access";
    case "ambulance":
      return "Ambulance Service";
    case "panchakarma":
      return "Panchakarma Services";
    case "virtual_consultation_specific":
      return specialization === "Ayurvedic"
        ? "AYUSH Consultation"
        : specialization === "Psychologist"
          ? "Psychologist Consultation"
          : specialization === "Physiotherapist"
            ? "Physiotherapy Consultation"
            : specialization === "Nutritionist"
              ? "Nutrition Consultation"
              : specialization === "General Physician"
                ? "GP Consultation(online)"
                : specialization === "Dentist"
                  ? "Dental Consultation(online)"
                  : specialization === "Ophthalmologist"
                    ? "Vision Consultation(online)"
                    : "GP Consultation(online)";
    default:
      return defaultName;
  }
};

export const migrateServiceItems = async () => {
  try {
    const prisma = await getEBPrismaClient();
    const portalPrisma = await getPortalPrismaClient();
    const planService: PlanService[] = [];
    const serviceRestrictions: ServiceRestriction[] = [];
    const serviceItems = await prisma.service_usage_quota.findMany();
    for (const serviceItem of serviceItems) {
      if (serviceItem.quota_type != "FREE") {
        const planServiceId = await portalPrisma.planService.findUnique({
          where: {
            planId_vendorServiceId_vendorItemCode: {
              planId: serviceItem.bundle_id ? serviceItem.bundle_id : "",
              vendorServiceId: "7b2036d6-2cfb-443d-81d9-50d98ae134c2",
              vendorItemCode: "",
            },
          },
          select: {
            id: true,
          },
        });
        if (!planServiceId) {
          console.error(
            "Plan service not found for service item:",
            serviceItem.id
          );
          continue;
        }

        await portalPrisma.serviceRestriction.update({
          where: {
            planServiceId: planServiceId.id ? planServiceId.id : "",
          },
          data: {
            markupPercentage: serviceItem.percentage,
          },
        });
      } else {
        planService.push({
          id: serviceItem.id,
          organizationId: serviceItem.client_id,
          planId: serviceItem.bundle_id ? serviceItem.bundle_id : "",
          isPackage: false,
          isItem: true,
          packageVersionId: null,
          packageWalletSize: 0,
          startDate: new Date(),
          endDate: new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000),
          vendorItemCode: serviceItem.vendor_service_code,
          vendorPackageCode: "",
          vendorServiceId: "7b2036d6-2cfb-443d-81d9-50d98ae134c2",
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: "MIGRATION_SCRIPT",
          createdBy: "MIGRATION_SCRIPT",
        });

        serviceRestrictions.push({
          id: serviceItem.id,
          organizationId: serviceItem.client_id,
          planServiceId: serviceItem.id,
          walletType: "limits",
          serviceWalletSize: 0,
          walletTransactionLimit: 0,
          walletMaxAmt: 0,
          discount: 100,
          discountMaxAmt: 99999,
          discountTransactionLimit: serviceItem.service_usage_limit,
          cumulativeDiscount: 99999,
          markupPercentage: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: "MIGRATION_SCRIPT",
          createdBy: "MIGRATION_SCRIPT",
        });
      }
    }

    await portalPrisma.planService.createMany({
      data: planService,
      skipDuplicates: true,
    });
    await portalPrisma.serviceRestriction.createMany({
      data: serviceRestrictions,
      skipDuplicates: true,
    });

    console.log("Service items migrated successfully");
  } catch (error) {
    console.error("Error migrating service items:", error);
    throw error;
  }
};

export const migrateUserServiceQuotas = async () => {
  try {
    const prisma = await getEBPrismaClient();
    const portalPrisma = await getPortalPrismaClient();
    let updateQueries = [];

    const userQuota = await prisma.user_service_quota.findMany({
      where: {
        service_usage_quota: {
          quota_type: "FREE",
        },
      },
      include: {
        service_usage_quota: true,
      },
    });
    console.log("User quotas to migrate:", userQuota.length);

    for (const userQuot of userQuota) {
      const planServiceId = await portalPrisma.planService.findUnique({
        where: {
          planId_vendorServiceId_vendorItemCode: {
            planId: userQuot.service_usage_quota.bundle_id
              ? userQuot.service_usage_quota.bundle_id
              : "",
            vendorServiceId: "7b2036d6-2cfb-443d-81d9-50d98ae134c2",
            vendorItemCode: userQuot.service_usage_quota.vendor_service_code,
          },
          isItem: true,
        },
        select: {
          id: true,
        },
      });
      if (!planServiceId) {
        console.error("Plan service not found for service item:", userQuot.id);
        continue;
      }
      console.log("Plan service ID to update :", planServiceId.id);

      updateQueries.push(
        portalPrisma.consumerPlanServiceWallet.updateMany({
          where: {
            consumerPlanWallet: {
              clientConsumerId: userQuot.employee_id,
              isActive: true,
            },
            planServiceId: planServiceId.id,
            isActive: true,
          },
          data: {
            currentDiscountTransactionLimit:
              userQuot.service_usage_count == 0 ? 1 : 0,
          },
        })
      );
    }

    try {
      console.log("Inserting updates started!");
      await prisma.$transaction(updateQueries);
      console.log("Batch update executed successfully!");
    } catch (error) {
      console.error("Batch update failed:", error);
    }
  } catch (error) {
    console.error("Error migrating user service quotas:", error);
    throw error;
  }
};

export const updateWalletType = async () => {
  try {
    const prisma = await getPortalPrismaClient();
    await prisma.serviceRestriction.updateMany({
      where: {
        walletType: null,
      },
      data: {
        walletType: "not_applicable",
      },
    });
  } catch (error) {
    console.error("Error updating wallet type:", error);
    throw error;
  }
};
