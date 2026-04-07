import { createServer } from './http.js';
import { createWsServer } from './ws.js';
const PORT = Number(process.env.AGENT_SERVER_PORT ?? 4801);
const app = createServer();
const server = app.listen(PORT, () => {
    console.log(`[agent-server] listening on :${PORT}`);
});
createWsServer(server);
