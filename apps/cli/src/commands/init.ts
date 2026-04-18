import { writeFile, access, mkdir } from "node:fs/promises";
import { resolve, basename, join } from "node:path";
import chalk from "chalk";
import { confirm, input, checkbox, Separator } from "@inquirer/prompts";
import { validateSkillName } from "@harness-kit/core";

interface PluginChoice {
  name: string;
  description: string;
}

// Plugin definitions grouped by category, sourced from .claude-plugin/marketplace.json
const PLUGIN_GROUPS: { label: string; plugins: PluginChoice[] }[] = [
  {
    label: "Code Quality",
    plugins: [
      {
        name: "review",
        description:
          "Code review for a branch, PR, or path — structured output with severity labels and cross-file analysis",
      },
      {
        name: "explain",
        description:
          "Structured code explainer — layered explanations of files, functions, directories, or concepts",
      },
      {
        name: "docgen",
        description:
          "Generate or update README, API docs, architecture overview, or changelog — always confirms before writing",
      },
    ],
  },
  {
    label: "DevOps",
    plugins: [
      {
        name: "open-pr",
        description:
          "Pre-flight checks and PR creation workflow: run tests, open a PR, code review, and check CI",
      },
      {
        name: "merge-pr",
        description:
          "PR merge workflow: verify CI and review status, sync with base branch, confirm, squash merge, and clean up",
      },
      {
        name: "pr-sweep",
        description:
          "Cross-repo PR sweep: triage all open PRs, run code reviews, merge what's ready, fix quick CI blockers, and report",
      },
    ],
  },
  {
    label: "Research & Knowledge",
    plugins: [
      {
        name: "research",
        description:
          "Process any source into a structured, compounding knowledge base with refresh capability",
      },
      {
        name: "orient",
        description:
          "Topic-focused session orientation — search graph, knowledge, journal, and research for a specific topic",
      },
      {
        name: "capture",
        description:
          "Capture session information into a staging file for later reflection and knowledge graph processing",
      },
      {
        name: "membrain",
        description:
          "Graph-based agent memory — search, trace, and manage what your agent knows",
      },
    ],
  },
  {
    label: "Productivity",
    plugins: [
      {
        name: "stats",
        description:
          "Interactive dashboard for Claude Code usage — tokens, sessions, models, and activity patterns",
      },
      {
        name: "iterm-notify",
        description:
          "macOS desktop notifications and iTerm2 badge management for Claude Code lifecycle events.",
      },
      {
        name: "board",
        description:
          "Lightweight Kanban board with real-time Claude ↔ web UI two-way sync via MCP.",
      },
      {
        name: "harness-share",
        description:
          "Compile, export, import, and sync harness configurations across Claude Code, Cursor, and GitHub Copilot",
      },
    ],
  },
  {
    label: "Design",
    plugins: [
      {
        name: "frontend-design",
        description:
          "Production-grade frontend design skill that avoids AI slop — specific rules for typography, color (OKLCH), layout, motion, interaction, and UX writing.",
      },
    ],
  },
  {
    label: "Data Engineering",
    plugins: [
      {
        name: "lineage",
        description:
          "Trace column-level data lineage through SQL, Kafka, Spark, and JDBC codebases",
      },
    ],
  },
];

function buildChoices() {
  const choices: (
    | { name: string; value: string; hint?: string }
    | Separator
  )[] = [];

  for (const group of PLUGIN_GROUPS) {
    choices.push(new Separator(`── ${group.label} ──`));
    for (const plugin of group.plugins) {
      choices.push({
        name: plugin.name,
        value: plugin.name,
        hint: plugin.description,
      });
    }
  }

  return choices;
}

function getPluginDescription(name: string): string {
  for (const group of PLUGIN_GROUPS) {
    const found = group.plugins.find((p) => p.name === name);
    if (found) return found.description;
  }
  return "";
}

function buildYaml(
  projectName: string,
  description: string,
  plugins: string[],
): string {
  const metaDescription = description
    ? `\n  description: ${description}`
    : "";

  const pluginsBlock =
    plugins.length === 0
      ? "plugins: []"
      : [
          "plugins:",
          ...plugins.map((name) => {
            const desc = getPluginDescription(name);
            const descLine = desc ? `    description: ${desc}` : "";
            return [
              `  - name: ${name}`,
              `    source: harnessprotocol/harness-kit`,
              descLine,
            ]
              .filter(Boolean)
              .join("\n");
          }),
        ].join("\n");

  return [
    `$schema: https://harnessprotocol.ai/schema/v1/harness.schema.json`,
    `version: "1"`,
    ``,
    `metadata:`,
    `  name: ${projectName}${metaDescription}`,
    ``,
    pluginsBlock,
    ``,
  ].join("\n");
}

// ── Skill scaffold ────────────────────────────────────────────

export function scaffoldSkillMd(name: string): string {
  return [
    "---",
    `name: ${name}`,
    "description: TODO — describe what this skill does and when to use it",
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "Describe when this skill should be invoked.",
    "",
    "## Instructions",
    "Provide step-by-step instructions here.",
    "",
  ].join("\n");
}

export function scaffoldPluginJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      description: "TODO",
      skills: [{ name, path: `skills/${name}` }],
    },
    null,
    2,
  ) + "\n";
}

export async function initSkillCommand(name: string): Promise<void> {
  if (!validateSkillName(name)) {
    console.error(
      chalk.red("Error:") +
        ` Invalid skill name "${name}" — must be lowercase kebab-case (a-z, 0-9, hyphens), max 64 chars, no leading/trailing hyphens.`,
    );
    process.exit(1);
  }

  const skillDir = resolve(`skills/${name}`);
  const skillMdPath = join(skillDir, "SKILL.md");
  const pluginJsonPath = resolve("plugin.json");

  // Check for conflicts
  let skillExists = false;
  try {
    await access(skillMdPath);
    skillExists = true;
  } catch {
    /* not found */
  }

  if (skillExists) {
    const overwrite = await confirm({
      message: `${skillMdPath} already exists. Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      console.log(chalk.dim("Aborted."));
      return;
    }
  }

  await mkdir(skillDir, { recursive: true });
  await writeFile(skillMdPath, scaffoldSkillMd(name), "utf-8");

  // Create or update plugin.json
  let pluginJsonExists = false;
  try {
    await access(pluginJsonPath);
    pluginJsonExists = true;
  } catch {
    /* not found */
  }

  if (!pluginJsonExists) {
    await writeFile(pluginJsonPath, scaffoldPluginJson(name), "utf-8");
    console.log(chalk.green("Created plugin.json"));
  }

  console.log(chalk.green(`Created skills/${name}/SKILL.md`));
  console.log(
    chalk.dim(
      `Edit ${chalk.white(`skills/${name}/SKILL.md`)} to describe your skill, then add it to harness.yaml.`,
    ),
  );
  console.log(
    chalk.yellow("  ⚠") +
      chalk.dim(" Replace ") +
      chalk.white("TODO") +
      chalk.dim(" placeholders in SKILL.md and plugin.json before publishing."),
  );
}

// ── Harness scaffold ──────────────────────────────────────────

export async function initCommand(outputPath: string): Promise<void> {
  const resolved = resolve(outputPath);

  // Check if harness.yaml already exists
  let exists = false;
  try {
    await access(resolved);
    exists = true;
  } catch {
    // File does not exist
  }

  if (exists) {
    const overwrite = await confirm({
      message: "harness.yaml already exists. Overwrite?",
      default: false,
    });
    if (!overwrite) {
      console.log(chalk.dim("Aborted."));
      return;
    }
  }

  // Prompt: project name
  const defaultName = basename(resolve("."));
  const projectName = await input({
    message: "Project name:",
    default: defaultName,
  });

  // Prompt: description (optional)
  const description = await input({
    message: "Description (optional):",
    default: "",
  });

  // Prompt: plugin selection
  const selectedPlugins = await checkbox<string>({
    message: "Select plugins to include:",
    choices: buildChoices(),
  });

  // Write the file
  const yaml = buildYaml(projectName.trim(), description.trim(), selectedPlugins);
  await writeFile(resolved, yaml, "utf-8");

  console.log("");
  console.log(chalk.green("Created harness.yaml"));
  console.log(
    chalk.dim(
      `Run ${chalk.white("harness compile")} to generate platform config files.`,
    ),
  );
}
