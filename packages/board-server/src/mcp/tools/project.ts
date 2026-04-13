import { z } from "zod";
import * as store from "../../store/yaml-store.js";

export const projectTools = [
  {
    name: "create_project",
    description: "Create a new Harness Board project",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Optional project description" },
        color: { type: "string", description: "Optional hex color (e.g. #7c3aed)" },
        repo_url: { type: "string", description: "Optional GitHub repository URL" },
      },
      required: ["name"],
    },
    schema: z.object({
      name: z.string(),
      description: z.string().optional(),
      color: z.string().optional(),
      repo_url: z.string().optional(),
    }),
    handler: async (args: {
      name: string;
      description?: string;
      color?: string;
      repo_url?: string;
    }) => {
      const project = store.createProject({
        name: args.name,
        description: args.description,
        color: args.color,
        repo_url: args.repo_url,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(project, null, 2) }] };
    },
  },
  {
    name: "update_project",
    description: "Update an existing Harness Board project",
    inputSchema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Project slug" },
        description: { type: "string", description: "New project description" },
        color: { type: "string", description: "New hex color (e.g. #7c3aed)" },
        repo_url: { type: "string", description: "GitHub repository URL" },
      },
      required: ["slug"],
    },
    schema: z.object({
      slug: z.string(),
      description: z.string().optional(),
      color: z.string().optional(),
      repo_url: z.string().optional(),
    }),
    handler: async (args: {
      slug: string;
      description?: string;
      color?: string;
      repo_url?: string;
    }) => {
      const { slug, ...updates } = args;
      const project = store.updateProject(slug, updates);
      return { content: [{ type: "text" as const, text: JSON.stringify(project, null, 2) }] };
    },
  },
] as const;
