import fs from "fs";
import { format } from "fast-csv";
import path from "path";
import { getEBPrismaClient } from "../../utils/dbUtils";

export const generateCognitoCSV = async () => {
  try {
    const prisma = await getEBPrismaClient();
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

    console.log("Total users fetched: ", users.length);

    if (users.length === 0) {
      console.warn("No users found, skipping CSV generation.");
      return;
    }

    // Define an absolute file path inside your project directory
    const filePath = path.join(__dirname, "cognito_users.csv");

    console.log("CSV file will be saved at:", filePath);

    const writableStream = fs.createWriteStream(filePath);
    const csvStream = format({ headers: true });

    csvStream.pipe(writableStream);

    users.forEach((user: any) => {
      csvStream.write({
        clientConsumerId: user.id,
        mobileNumber: user.mobile_number,
        name: user.name,
        dob: user.dob,
        gender: user.gender,
        personalEmail: user.personal_email,
        pin: user.pin,
        planId: user.bundle_id,
      });
    });

    csvStream.end();

    writableStream.on("finish", () => {
      console.log(`CSV file successfully written at: ${filePath}`);
    });

    writableStream.on("error", (err) => {
      console.error("Error writing CSV file:", err);
    });
  } catch (error) {
    console.error("Error generating CSV:", error);
  }
};

// export const generateCognitoCSV = async () => {
//   try {
//     const prisma = await getEBPrismaClient();
//     const users = await prisma.employees.findMany({
//       where: { mobile_number: { not: "" } },
//       select: {
//         id: true, // clientConsumerId
//         mobile_number: true,
//         name: true,
//         dob: true,
//         gender: true,
//         personal_email: true,
//         pin: true,
//         bundle_id: true, // Plan ID
//       },
//       distinct: ["mobile_number"],
//     });

//     console.log("Total users fetched: ", users.length);

//     if (users.length === 0) {
//       console.warn("No users found, skipping CSV generation.");
//       return;
//     }

//     const csvFilePath = `${process.env.HOME}/Desktop/cognito_users.csv`; // Saves to Desktop
//     console.log("CSV file path: ", csvFilePath);

//     const writeStream = fs.createWriteStream(csvFilePath);

//     writeStream.on("finish", () => {
//       console.log(`✅ CSV file successfully created: ${csvFilePath}`);
//     });

//     writeStream.on("error", (err) => {
//       console.error("❌ File write error:", err);
//     });

//     const headers = [
//       "profile",
//       "address",
//       "birthdate",
//       "gender",
//       "preferred_username",
//       "updated_at",
//       "website",
//       "picture",
//       "phone_number",
//       "phone_number_verified",
//       "zoneinfo",
//       "custom:firstLogin",
//       "locale",
//       "email",
//       "email_verified",
//       "given_name",
//       "family_name",
//       "middle_name",
//       "name",
//       "nickname",
//       "cognito:mfa_enabled",
//       "cognito:username",
//     ];

//     const csvStream = format({ headers: true });
//     csvStream.pipe(writeStream);

//     users.forEach((user) => {
//       csvStream.write({
//         profile: "",
//         address: "",
//         birthdate: user.dob || "",
//         gender: user.gender || "",
//         preferred_username: "",
//         updated_at: "",
//         website: "",
//         picture: "",
//         phone_number: `+91${user.mobile_number}`,
//         phone_number_verified: "true",
//         zoneinfo: "",
//         "custom:firstLogin": "false",
//         locale: "en-IN",
//         email: user.personal_email || "",
//         email_verified: "true",
//         given_name: user.name?.split(" ")[0] || "",
//         family_name: user.name?.split(" ")[1] || "",
//         middle_name: "",
//         name: user.name,
//         nickname: "",
//         "cognito:mfa_enabled": "false",
//         "cognito:username": user.id,
//       });
//     });

//     csvStream.end();
//   } catch (error) {
//     console.error("Error generating Cognito CSV: ", error);
//   }
// };
