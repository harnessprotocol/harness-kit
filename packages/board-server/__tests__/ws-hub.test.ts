import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Server } from "node:http";

// ── Mocks ─────────────────────────────────────────────────────

// Store references to handlers and state
let mockWssOnHandlers: Map<string, Function>;
let mockFileWatcherHandlers: Map<string, Function>;
let mockClients: Set<any>;
let mockWssInstance: any;
let mockFileWatcherInstance: any;

// Mock WebSocket and WebSocketServer from ws package
vi.mock("ws", () => {
  const OPEN = 1;

  class MockWebSocket {
    readyState = OPEN;
    send = vi.fn();
    on = vi.fn();

    static OPEN = OPEN;
  }

  class MockWebSocketServer {
    clients: Set<any>;
    on = vi.fn();
    close = vi.fn();

    constructor(options: any) {
      mockClients = new Set();
      this.clients = mockClients;
      mockWssOnHandlers = new Map();
      mockWssInstance = this;

      // Capture event handlers
      this.on = vi.fn((event: string, handler: Function) => {
        mockWssOnHandlers.set(event, handler);
      });
    }
  }

  return {
    WebSocket: MockWebSocket,
    WebSocketServer: MockWebSocketServer,
  };
});

// Mock FileWatcher
vi.mock("../src/store/file-watcher.js", () => {
  class MockFileWatcher {
    on = vi.fn();
    start = vi.fn();
    stop = vi.fn();

    constructor(dir: string, debounce?: number) {
      mockFileWatcherHandlers = new Map();
      mockFileWatcherInstance = this;

      // Capture event handlers
      this.on = vi.fn((event: string, handler: Function) => {
        mockFileWatcherHandlers.set(event, handler);
      });
    }
  }

  return { FileWatcher: MockFileWatcher };
});

// Mock yaml-store
vi.mock("../src/store/yaml-store.js", () => ({
  projectsDir: vi.fn(() => "/mock/projects"),
  readProject: vi.fn(),
}));

// Import after mocks are set up
import { WsHub } from "../src/ws/hub.js";
import type { BoardEvent } from "../src/ws/hub.js";
import { WebSocket } from "ws";
import * as store from "../src/store/yaml-store.js";

// ── Helpers ───────────────────────────────────────────────────

function makeFakeHttpServer(): Server {
  return {} as Server;
}

function makeFakeWebSocket(readyState: number = 1) {
  return {
    readyState,
    send: vi.fn(),
    on: vi.fn(),
  };
}

function makeMockProject(slug: string) {
  return {
    name: `Project ${slug}`,
    slug,
    version: 1 as const,
    next_id: 1,
    epics: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Tests ─────────────────────────────────────────────────────

// Reset module-scope mock state before every test so no state leaks between tests.
beforeEach(() => {
  mockWssOnHandlers = new Map();
  mockFileWatcherHandlers = new Map();
  mockClients = new Set();
});

describe("WsHub constructor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates FileWatcher with projects directory", () => {
    const httpServer = makeFakeHttpServer();
    new WsHub(httpServer);

    expect(store.projectsDir).toHaveBeenCalled();
  });

  it("registers connection handler", () => {
    const httpServer = makeFakeHttpServer();
    new WsHub(httpServer);

    expect(mockWssInstance.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it("registers file watcher change handler", () => {
    const httpServer = makeFakeHttpServer();
    new WsHub(httpServer);

    expect(mockFileWatcherInstance.on).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it("registers file watcher error handler", () => {
    const httpServer = makeFakeHttpServer();
    new WsHub(httpServer);

    expect(mockFileWatcherInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it("starts the file watcher", () => {
    const httpServer = makeFakeHttpServer();
    new WsHub(httpServer);

    expect(mockFileWatcherInstance.start).toHaveBeenCalled();
  });
});

describe("WsHub connection handling", () => {
  let hub: WsHub;

  beforeEach(() => {
    vi.clearAllMocks();
    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("sends welcome message on connection", () => {
    const ws = makeFakeWebSocket();
    const req = {} as any;

    const connectionHandler = mockWssOnHandlers.get('connection')!;
    connectionHandler(ws, req);

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'connected',
      message: 'Harness Board connected'
    });
  });

  it("registers error handler on new connection", () => {
    const ws = makeFakeWebSocket();
    const req = {} as any;

    const connectionHandler = mockWssOnHandlers.get('connection')!;
    connectionHandler(ws, req);

    expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});

describe("WsHub.broadcast", () => {
  let hub: WsHub;

  beforeEach(() => {
    vi.clearAllMocks();
    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("sends event to all OPEN clients", () => {
    const ws1 = makeFakeWebSocket(1); // OPEN
    const ws2 = makeFakeWebSocket(1); // OPEN
    const ws3 = makeFakeWebSocket(1); // OPEN

    mockClients.add(ws1);
    mockClients.add(ws2);
    mockClients.add(ws3);

    const event: BoardEvent = {
      type: 'project_updated',
      slug: 'test-project',
      project: makeMockProject('test-project')
    };

    hub.broadcast(event);

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
    expect(ws3.send).toHaveBeenCalledOnce();
  });

  it("skips clients that are not OPEN", () => {
    const openWs = makeFakeWebSocket(1); // OPEN
    const closedWs = makeFakeWebSocket(3); // CLOSED
    const connectingWs = makeFakeWebSocket(0); // CONNECTING

    mockClients.add(openWs);
    mockClients.add(closedWs);
    mockClients.add(connectingWs);

    const event: BoardEvent = {
      type: 'connected',
      message: 'test'
    };

    hub.broadcast(event);

    expect(openWs.send).toHaveBeenCalledOnce();
    expect(closedWs.send).not.toHaveBeenCalled();
    expect(connectingWs.send).not.toHaveBeenCalled();
  });

  it("sends JSON-serialized payload", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    const event: BoardEvent = {
      type: 'project_updated',
      slug: 'my-project',
      project: makeMockProject('my-project')
    };

    hub.broadcast(event);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it("handles empty client set gracefully", () => {
    const event: BoardEvent = {
      type: 'connected',
      message: 'test'
    };

    // Should not throw with no clients
    expect(() => hub.broadcast(event)).not.toThrow();
  });

  it("broadcasts connected event correctly", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    const event: BoardEvent = {
      type: 'connected',
      message: 'Hello from server'
    };

    hub.broadcast(event);

    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.type).toBe('connected');
    expect(sentData.message).toBe('Hello from server');
  });
});

describe("WsHub.notifyProjectChanged", () => {
  let hub: WsHub;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.readProject).mockReset();

    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("reads project from store", () => {
    vi.mocked(store.readProject).mockReturnValue(makeMockProject('test-project'));

    hub.notifyProjectChanged('test-project');

    expect(store.readProject).toHaveBeenCalledWith('test-project');
  });

  it("broadcasts project_updated event when project exists", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    const project = makeMockProject('test-project');
    vi.mocked(store.readProject).mockReturnValue(project);

    hub.notifyProjectChanged('test-project');

    expect(ws.send).toHaveBeenCalledOnce();
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.type).toBe('project_updated');
    expect(sentData.slug).toBe('test-project');
    expect(sentData.project).toEqual(project);
  });

  it("does nothing when project does not exist", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    vi.mocked(store.readProject).mockReturnValue(null);

    hub.notifyProjectChanged('non-existent');

    expect(ws.send).not.toHaveBeenCalled();
  });

  it("broadcasts to multiple clients", () => {
    const ws1 = makeFakeWebSocket(1);
    const ws2 = makeFakeWebSocket(1);
    mockClients.add(ws1);
    mockClients.add(ws2);

    vi.mocked(store.readProject).mockReturnValue(makeMockProject('test-project'));

    hub.notifyProjectChanged('test-project');

    expect(ws1.send).toHaveBeenCalledOnce();
    expect(ws2.send).toHaveBeenCalledOnce();
  });
});

describe("WsHub file watcher integration", () => {
  let hub: WsHub;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.readProject).mockReset();

    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("broadcasts project update on file change", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    const project = makeMockProject('my-project');
    vi.mocked(store.readProject).mockReturnValue(project);

    // Simulate file change event
    const changeHandler = mockFileWatcherHandlers.get('change')!;
    changeHandler({ filename: 'my-project.yaml' });

    expect(store.readProject).toHaveBeenCalledWith('my-project');
    expect(ws.send).toHaveBeenCalledOnce();

    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.type).toBe('project_updated');
    expect(sentData.slug).toBe('my-project');
  });

  it("strips .yaml extension from filename", () => {
    vi.mocked(store.readProject).mockReturnValue(makeMockProject('another-project'));

    const changeHandler = mockFileWatcherHandlers.get('change')!;
    changeHandler({ filename: 'another-project.yaml' });

    expect(store.readProject).toHaveBeenCalledWith('another-project');
  });

  it("does nothing when project file no longer exists", () => {
    const ws = makeFakeWebSocket(1);
    mockClients.add(ws);

    vi.mocked(store.readProject).mockReturnValue(null);

    const changeHandler = mockFileWatcherHandlers.get('change')!;
    changeHandler({ filename: 'deleted-project.yaml' });

    expect(ws.send).not.toHaveBeenCalled();
  });
});

describe("WsHub.close", () => {
  let hub: WsHub;

  beforeEach(() => {
    vi.clearAllMocks();
    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("stops the file watcher", () => {
    hub.close();

    expect(mockFileWatcherInstance.stop).toHaveBeenCalledOnce();
  });

  it("closes the WebSocket server", () => {
    hub.close();

    expect(mockWssInstance.close).toHaveBeenCalledOnce();
  });

  it("stops watcher before closing server", () => {
    hub.close();

    const stopCallOrder = mockFileWatcherInstance.stop.mock.invocationCallOrder[0];
    const closeCallOrder = mockWssInstance.close.mock.invocationCallOrder[0];

    expect(stopCallOrder).toBeLessThan(closeCallOrder);
  });
});

describe("WsHub error handling", () => {
  let hub: WsHub;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const httpServer = makeFakeHttpServer();
    hub = new WsHub(httpServer);
  });

  it("logs file watcher errors", () => {
    const error = new Error('File system error');
    const errorHandler = mockFileWatcherHandlers.get('error')!;
    errorHandler(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[WsHub] file watcher error:',
      error
    );
  });

  it("logs client WebSocket errors", () => {
    const ws = makeFakeWebSocket(1);
    const req = {} as any;

    const connectionHandler = mockWssOnHandlers.get('connection')!;
    connectionHandler(ws, req);

    // Extract the error handler registered on the WebSocket
    const errorCall = ws.on.mock.calls.find(
      (call: any[]) => call[0] === 'error'
    );
    const clientErrorHandler = errorCall ? errorCall[1] : null;

    expect(clientErrorHandler).toBeDefined();

    const error = new Error('Client error');
    clientErrorHandler(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[WsHub] client error:',
      error
    );
  });
});
