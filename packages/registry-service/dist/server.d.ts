import { createServer } from 'node:http';

declare function startRegistryServer(): Promise<ReturnType<typeof createServer>>;

export { startRegistryServer };
