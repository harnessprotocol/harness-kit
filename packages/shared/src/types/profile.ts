// ── Profile YAML (harness profile definitions) ─────────────

import type { Author } from "./core.js";

export interface ProfileYaml {
  name: string;
  description: string;
  author: Author;
  components: Array<{
    name: string;
    version: string;
  }>;
  knowledge?: {
    backend: string;
    seed_docs?: Array<{
      topic: string;
      description: string;
    }>;
  };
  rules?: string[];
}
