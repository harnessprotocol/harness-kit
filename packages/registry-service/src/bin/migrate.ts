// Process entry point; see bin/server.ts for why it is a separate file.
import { migrate } from "../migrate.js";

migrate().then(() => console.log("Registry migrations complete.")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
