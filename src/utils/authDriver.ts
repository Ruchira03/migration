// Replace these constants with your Cognito pool details
const USER_POOL_ID = "ap-south-1_WJxvl0HhP";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminSetUserPasswordCommand,
  ListUsersCommandOutput,
} from "@aws-sdk/client-cognito-identity-provider";
import { getPortalPrismaClient, PortalPrisma } from "./dbUtils";

const cognitoClient = new CognitoIdentityProviderClient({
  region: "ap-south-1",
});

const BATCH_SIZE = 500; // Adjust based on AWS limits

export const updateCognitoUserIds = async () => {
  try {
    let usersMapping: Record<string, string> = {}; // Stores { phone_number: cognito_user_id }
    let nextToken: string | undefined = undefined;

    do {
      const command = new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        AttributesToGet: ["phone_number"], // Fetch only required attributes
        PaginationToken: nextToken,
      });

      const response: ListUsersCommandOutput =
        await cognitoClient.send(command);

      if (response.Users) {
        response.Users.forEach((user) => {
          const phoneNumberAttr = user.Attributes?.find(
            (attr) => attr.Name === "phone_number"
          );
          if (phoneNumberAttr && phoneNumberAttr.Value) {
            usersMapping[phoneNumberAttr.Value] = user.Username!;
          }
        });
      }

      nextToken = response.PaginationToken; // Move to the next page if available
    } while (nextToken);

    console.log("✅ Phone Number to Cognito User ID Mapping:", usersMapping);

    // Save mapping to a file
    // fs.writeFileSync("usersMapping.json", JSON.stringify(usersMapping, null, 2), "utf8");
    console.log("📄 Mapping saved to usersMapping.json");

    // Prepare bulk update data
    const updateData = Object.entries(usersMapping).map(
      ([mobile, cognitoUserId]) => ({
        where: { mobile },
        update: { cognitoUserId },
        create: {
          mobile,
          bbxUserId: mobile,
          cognitoUserId,
          createdBy: "cognito_migration",
          updatedBy: "cognito_migration",
        },
      })
    );

    // Execute batch upserts
    await batchUpsertUsers(updateData);

    console.log("🚀 All users updated successfully!");
    return usersMapping;
  } catch (error) {
    console.error("❌ Error updating Cognito users in DB:", error);
    throw error;
  }
};

async function batchUpsertUsers(updateData: any[]) {
  if (updateData.length === 0) {
    console.log("ℹ️ No users to update.");
    return;
  }

  // Split data into batches
  const batches = [];
  for (let i = 0; i < updateData.length; i += BATCH_SIZE) {
    batches.push(updateData.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔄 Processing ${batches.length} batches in parallel...`);
  const prisma = await getPortalPrismaClient();
  // Run batches in parallel using Promise.allSettled
  await Promise.allSettled(
    batches.map(async (batch, index) => {
      try {
        await prisma.$transaction(
          batch.map((update) => prisma.berryBoxUser.upsert(update))
        );
        console.log(`✅ Batch ${index + 1}/${batches.length} completed!`);
      } catch (error) {
        console.error(`❌ Batch ${index + 1} failed:`, error);
      }
    })
  );

  console.log(`✅ Successfully processed ${updateData.length} users!`);
}

export async function adminConfirmAllUsers() {
  const maxRetries = 100;
  let retries = 0;
  let paginationToken: string | undefined;

  do {
    try {
      const listUsersResponse = await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          PaginationToken: paginationToken,
          Limit: 60, // Adjust based on Cognito limits
        })
      );

      if (!listUsersResponse.Users || listUsersResponse.Users.length === 0) {
        console.log("No users found in the User Pool.");
        return;
      }

      console.log(`Fetched ${listUsersResponse.Users.length} users.`);

      // Process users in parallel using Promise.allSettled()
      const adminConfirmPromises = listUsersResponse.Users.map(async (user) => {
        try {
          if (user.UserStatus != "CONFIRMED") {
            const command = new AdminSetUserPasswordCommand({
              UserPoolId: USER_POOL_ID,
              Username: "e193fdba-5051-70df-9572-58f97d58f96f",
              Password: "SomeStrongPassword123!",
              Permanent: true,
            });
            await cognitoClient.send(command);
            console.log(`✅ Confirmed user: ${user.Username}`);
            console.log(`✅ Confirmed sign-up for user: ${user.Username}`);
          } else {
            console.log(`User ${user.Username} is already confirmed.`);
          }
        } catch (error) {
          console.error(`❌ Error processing user ${user.Username}:`, error);
        }
      });

      await Promise.allSettled(adminConfirmPromises);

      paginationToken = listUsersResponse.PaginationToken;
      console.log(`Next PaginationToken: ${paginationToken || "None"}`);

      if (!paginationToken) {
        console.log("✅ Admin confirmations completed.");
        return;
      }
    } catch (error: any) {
      if (error.name === "TooManyRequestsException" && retries < maxRetries) {
        const delay = 8000; // 8 seconds exponential backoff
        // console.log(
        //   `⏳ Too many requests. Retrying in ${delay / 1000} seconds...`
        // );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries++;
      } else {
        console.error("❌ Error:", error);
        throw error;
      }
    }
  } while (retries < maxRetries);
}
