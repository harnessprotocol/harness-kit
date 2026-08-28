import chalk from "chalk";
import {
  AUTH_PATH,
  clearStoredAuth,
  readStoredAuth,
  registryRequest,
  writeStoredAuth,
} from "../registry-client.js";

interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

interface DeviceTokenResult {
  status: "authorization_pending" | "approved";
  accessToken?: string;
  expiresIn?: number;
}

export async function authLoginCommand(): Promise<void> {
  const authorization = await registryRequest<DeviceAuthorization>("/v1/auth/device", {
    method: "POST",
    body: JSON.stringify({ clientName: "Harness Kit CLI" }),
  });
  console.log(`Open ${chalk.cyan(authorization.verificationUri)} and enter ${chalk.bold(authorization.userCode)}.`);
  console.log(chalk.dim("Waiting for authorization…"));
  while (Date.now() < new Date(authorization.expiresAt).getTime()) {
    await new Promise((resolve) => setTimeout(resolve, authorization.interval * 1000));
    const result = await registryRequest<DeviceTokenResult>("/v1/auth/device/token", {
      method: "POST",
      body: JSON.stringify({ deviceCode: authorization.deviceCode }),
    });
    if (result.status !== "approved" || !result.accessToken) continue;
    await writeStoredAuth(result.accessToken, result.expiresIn ?? 900);
    console.log(chalk.green(`Authorized. Short-lived session stored at ${AUTH_PATH}.`));
    return;
  }
  throw new Error("Device authorization expired before it was approved.");
}

export async function authStatusCommand(): Promise<void> {
  const auth = await readStoredAuth();
  if (!auth && !process.env.HARNESS_API_TOKEN) {
    console.log("Not authenticated. Run harness-kit auth login.");
    return;
  }
  console.log(process.env.HARNESS_API_TOKEN ? "Authenticated with HARNESS_API_TOKEN." : `Authenticated until ${auth!.expiresAt}.`);
}

export async function authLogoutCommand(): Promise<void> {
  await clearStoredAuth();
  console.log("Local registry session removed.");
}
