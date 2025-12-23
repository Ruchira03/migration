import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({ region: "ap-south-1" });

export async function createUserWithPassword({
  userPoolId,
  username,
  tempPassword,
  permanentPassword,
}: {
  userPoolId: string;
  username: string;
  tempPassword: string;
  permanentPassword: string;
}) {
  console.log("Creating user:", username);

  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      TemporaryPassword: tempPassword,
      MessageAction: "SUPPRESS",
    })
  );

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: permanentPassword,
      Permanent: true,
    })
  );

  console.log(`✅ User ${username} created and password set.`);
}

export async function signInWithEmailPassword({
  userPoolId,
  clientId,
  username,
  password,
}: {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
}) {
  const startAuth = new AdminInitiateAuthCommand({
    AuthFlow: "ADMIN_NO_SRP_AUTH",
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  });

  const response = await client.send(startAuth);

  if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
    const respond = new AdminRespondToAuthChallengeCommand({
      UserPoolId: userPoolId,
      ClientId: clientId,
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ChallengeResponses: {
        USERNAME: username,
        NEW_PASSWORD: password,
      },
      Session: response.Session,
    });

    const finalResponse = await client.send(respond);
    console.log("Login successful:", finalResponse);
    return finalResponse;
  }

  console.log("Access Token:", response.AuthenticationResult?.AccessToken);
  return response.AuthenticationResult?.AccessToken;
}

export const pwaTest = async () => {
  const userPoolId = "ap-south-1_fYQbSCaNW";
  const clientId = "1dkkddghpjg4ngnabt4mjn0fte";
  const phone = "+919634567899";
  const tempPassword = "TempPass@123";
  const permPassword = `${phone}@Pwa`;

  await createUserWithPassword({
    userPoolId,
    username: phone,
    tempPassword,
    permanentPassword: permPassword,
  });

  await signInWithEmailPassword({
    userPoolId,
    clientId,
    username: phone,
    password: permPassword,
  });
};
