# @harness-kit/chat-relay

Self-hosted WebSocket relay server for the Harness Kit team chat feature. Run it on any machine your team can reach — a shared VM, a developer's laptop, anywhere behind your firewall. No accounts, no cloud dependencies.

## Prerequisites

- Node.js 20+
- Access to the harness-kit monorepo (for building from source)

## Running

### From source (monorepo)

```bash
# Build
pnpm --filter @harness-kit/chat-relay build

# Run
node packages/chat-relay/dist/index.js
```

Or in watch mode during development:

```bash
pnpm --filter @harness-kit/chat-relay dev
```

### Docker

```bash
# Build the image (from repo root after building)
pnpm --filter @harness-kit/chat-relay build
docker build -t harness-kit/chat-relay packages/chat-relay

# Run
docker run -p 4801:4801 harness-kit/chat-relay
```

The relay listens on port **4801** by default.

## Configuration

| Environment variable | Default | Description |
|---------------------|---------|-------------|
| `CHAT_PORT` | `4801` | WebSocket server port |

```bash
CHAT_PORT=9000 node packages/chat-relay/dist/index.js
```

## How it works

The relay is stateless except for in-memory room state. There is no database.

- **Rooms** are identified by a short code (e.g. `HRN-7K2`) generated when a room is created
- **Messages** are held in a ring buffer (last 500 per room) so late joiners get scrollback
- **Rooms expire** 5 minutes after the last member disconnects
- **Nicknames** must be unique within a room, 1–32 characters
- **Room names** are optional, max 64 characters

### Connecting the desktop app

In the Harness Kit desktop app, click the chat icon in the sidebar and enter your relay's URL:

```text
ws://your-server:4801
```

Share the room code with teammates. Anyone who can reach the relay URL can join.

## Protocol

Messages are JSON over WebSocket.

**Client → server:**

| `type` | Fields | Description |
|--------|--------|-------------|
| `create_room` | `nickname`, `name?` | Create a new room and join it |
| `join_room` | `code`, `nickname` | Join an existing room |
| `leave_room` | — | Leave the current room |
| `chat` | `body` | Send a chat message |
| `share` | `action`, `target`, `detail?`, `diff?`, `pullable?` | Announce a config change |
| `typing` | `typing` | Broadcast typing indicator |
| `heartbeat` | — | Keep the room alive |

**Server → client:**

| `type` | Fields | Description |
|--------|--------|-------------|
| `room_created` | `code`, `name?` | Room created successfully |
| `room_joined` | `code`, `name?`, `members`, `history` | Joined room, includes scrollback |
| `room_error` | `error` | Join/create failed (room not found, nickname taken, etc.) |
| `message` | `message` | Broadcast message from another member |
| `presence` | `members` | Updated member list |
| `typing_update` | `nickname`, `typing` | Typing indicator from another member |

Full type definitions: [`packages/shared/src/chat-types.ts`](../shared/src/chat-types.ts)

## Development

```bash
# Run tests
pnpm --filter @harness-kit/chat-relay test

# Type check
pnpm --filter @harness-kit/chat-relay build
```

Tests cover the ring buffer, room state, and WebSocket broadcast logic without requiring a live network connection.
