import { z } from "zod";
import * as store from "../../store/yaml-store.js";
import type { EpicStatus } from "../../types.js";

export const epicTools = [
  {
    name: "create_epic",
    description: "Create a new epic under a project",
    inputSchema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Project slug" },
        name: { type: "string", description: "Epic name" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["project", "name"],
    },
    schema: z.object({
      project: z.string(),
      name: z.string(),
      description: z.string().optional(),
    }),
    handler: async (args: { project: string; name: string; description?: string }) => {
      const epic = store.createEpic(args.project, args.name, args.description);
      return { content: [{ type: "text" as const, text: JSON.stringify(epic, null, 2) }] };
    },
  },
] as const;
