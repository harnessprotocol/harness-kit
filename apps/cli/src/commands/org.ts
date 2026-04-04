import chalk from "chalk";
import { input, confirm } from "@inquirer/prompts";

interface Organization {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const API_BASE_URL = process.env.HARNESS_API_URL || "https://harnessprotocol.io";

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = process.env.HARNESS_API_TOKEN;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Authentication required. Set HARNESS_API_TOKEN with your API token.",
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ||
          `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to make API request");
  }
}

export async function listOrganizations(): Promise<void> {
  try {
    console.log(chalk.dim("Fetching organizations..."));
    console.log("");

    const orgs = await apiRequest<Organization[]>("/api/orgs");

    if (orgs.length === 0) {
      console.log(chalk.dim("No organizations found."));
      console.log("");
      console.log(
        chalk.dim(
          `Create one with ${chalk.white("harness-kit org create")}`,
        ),
      );
      return;
    }

    console.log(chalk.bold(`Organizations (${orgs.length})`));
    console.log("");

    for (const org of orgs) {
      console.log(chalk.cyan(`  ${org.slug}`));
      console.log(chalk.dim(`    ${org.name}`));
      if (org.description) {
        console.log(chalk.dim(`    ${org.description}`));
      }
      console.log("");
    }
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

export async function createOrganization(): Promise<void> {
  try {
    console.log(chalk.bold("Create a new organization"));
    console.log("");

    const slug = await input({
      message: "Organization slug (lowercase, alphanumeric, hyphens only):",
      validate: (value) => {
        if (!value) return "Slug is required";
        if (!/^[a-z0-9-]+$/.test(value)) {
          return "Slug must contain only lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    });

    const name = await input({
      message: "Organization name:",
      validate: (value) => {
        if (!value) return "Name is required";
        return true;
      },
    });

    const description = await input({
      message: "Description (optional):",
      default: "",
    });

    console.log("");
    console.log(chalk.dim("Organization details:"));
    console.log(chalk.dim(`  Slug: ${slug}`));
    console.log(chalk.dim(`  Name: ${name}`));
    if (description) {
      console.log(chalk.dim(`  Description: ${description}`));
    }
    console.log("");

    const shouldCreate = await confirm({
      message: "Create this organization?",
      default: true,
    });

    if (!shouldCreate) {
      console.log(chalk.dim("Aborted."));
      return;
    }

    console.log("");
    console.log(chalk.dim("Creating organization..."));

    const org = await apiRequest<Organization>("/api/orgs", {
      method: "POST",
      body: JSON.stringify({
        slug,
        name,
        description: description || undefined,
      }),
    });

    console.log("");
    console.log(chalk.green("✓ Organization created successfully"));
    console.log("");
    console.log(chalk.dim(`  Slug: ${org.slug}`));
    console.log(chalk.dim(`  Name: ${org.name}`));
    console.log("");
    console.log(
      chalk.dim(
        `View at: ${chalk.white(`${API_BASE_URL}/orgs/${org.slug}`)}`,
      ),
    );
  } catch (error) {
    console.error("");
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

export async function joinOrganization(slug: string): Promise<void> {
  if (!slug) {
    console.error(chalk.red("Error: Organization slug is required"));
    console.log("");
    console.log(chalk.dim("Usage: harness-kit org join <slug>"));
    process.exit(1);
  }

  try {
    console.log(chalk.dim("Fetching organization details..."));

    const orgs = await apiRequest<Organization[]>("/api/orgs");
    const org = orgs.find((o) => o.slug === slug);

    if (!org) {
      console.error("");
      console.error(chalk.red(`Error: Organization "${slug}" not found`));
      process.exit(1);
    }

    console.log("");
    console.log(chalk.bold(`Organization: ${org.name}`));
    if (org.description) {
      console.log(chalk.dim(`  ${org.description}`));
    }
    console.log("");
    console.log(
      chalk.dim("To join this organization, ask an admin to add you as a member."),
    );
    console.log(chalk.dim("Then visit:"));
    console.log(chalk.white(`  ${API_BASE_URL}/orgs/${slug}`));
  } catch (error) {
    console.error("");
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}
