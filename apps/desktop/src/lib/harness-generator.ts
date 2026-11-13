/**
 * The blank harness.yaml the editor opens with. A harness.yaml built from this
 * machine's setup comes from the machine inventory instead
 * (`personal-inventory.ts`, AC-56).
 */
export const HARNESS_TEMPLATE = `version: "1"
metadata:
  name: my-harness
  description: My AI assistant configuration.

# mcp-servers:
#   my-server:
#     transport: stdio
#     command: npx
#     args: [-y, my-mcp-package]

# instructions:
#   operational: |
#     You are a helpful assistant.

# permissions:
#   tools:
#     allow: []
#     deny: []
`;
