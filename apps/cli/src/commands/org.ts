import chalk from "chalk";
import { confirm, input } from "@inquirer/prompts";
import { REGISTRY_API_BASE, registryRequest } from "../registry-client.js";

interface Organization {
  id: string;
  slug: string;
  name: string;
  privateArtifactsByDefault: true;
}

export async function listOrganizations(): Promise<void> {
  const organizations = await registryRequest<Organization[]>("/v1/organizations");
  if (organizations.length === 0) {
    console.log(chalk.dim("No organizations found. Create one with harness-kit org create."));
    return;
  }
  console.log(chalk.bold(`Organizations (${organizations.length})`));
  for (const organization of organizations) console.log(`  ${chalk.cyan(organization.slug)}  ${organization.name}`);
}

export async function createOrganization(): Promise<void> {
  const slug = await input({
    message: "Organization slug:",
    validate: (value) => /^[a-z0-9-]+$/.test(value) || "Use lowercase letters, numbers, and hyphens.",
  });
  const name = await input({ message: "Organization name:", validate: (value) => Boolean(value) || "Name is required." });
  if (!(await confirm({ message: `Create ${name} (${slug})?`, default: true }))) return;
  const organization = await registryRequest<Organization>("/v1/organizations", {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
  console.log(chalk.green(`Created ${organization.name}.`));
  console.log(chalk.dim(`${REGISTRY_API_BASE}/organizations/${organization.id}`));
}

export async function joinOrganization(slug: string): Promise<void> {
  const organizations = await registryRequest<Organization[]>("/v1/organizations");
  const organization = organizations.find((candidate) => candidate.slug === slug);
  if (!organization) {
    console.log(chalk.dim(`You are not yet a member of '${slug}'. Ask an administrator to add your GitHub identity.`));
    return;
  }
  console.log(chalk.green(`Already enrolled in ${organization.name}.`));
}
