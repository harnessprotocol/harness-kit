// Process entry point. Kept apart from server.ts because a bundler that splits
// shared code moves an `argv[1] === import.meta.url` guard into a chunk, where
// it never matches.
import { startRegistryServer } from "../server.js";

startRegistryServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
