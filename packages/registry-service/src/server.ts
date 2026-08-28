import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { LiveGitHubOAuthProvider } from "./github-oauth.js";
import { createRegistryHttpHandler } from "./http.js";
import { migrate } from "./migrate.js";
import { PostgresRegistryRepository } from "./postgres.js";
import { S3BlobStore } from "./s3.js";
import { RegistryService } from "./service.js";

export async function startRegistryServer(): Promise<ReturnType<typeof createServer>> {
  const databaseUrl = process.env.DATABASE_URL;
  const bucket = process.env.S3_BUCKET;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? "4810"}`;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!bucket) throw new Error("S3_BUCKET is required");
  if (process.env.MIGRATE_ON_START === "true") await migrate(databaseUrl);

  const repository = PostgresRegistryRepository.fromConnectionString(databaseUrl);
  const blobs = new S3BlobStore({
    bucket,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  });
  const service = new RegistryService(repository, blobs, { publicBaseUrl });
  const github = process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? new LiveGitHubOAuthProvider(
        process.env.GITHUB_CLIENT_ID,
        process.env.GITHUB_CLIENT_SECRET,
        `${publicBaseUrl}/v1/auth/github/callback`,
      )
    : undefined;
  const server = createServer(createRegistryHttpHandler(service, {
    github,
    contractBootstrapSecret: process.env.CONTRACT_BOOTSTRAP_SECRET,
    allowedOrigin: process.env.WEB_ORIGIN,
  }));
  const port = Number(process.env.PORT ?? 4810);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  console.log(`Harness Kit registry listening on ${publicBaseUrl}`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRegistryServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
