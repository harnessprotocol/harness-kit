import { describe, it, expect } from "vitest";
import { reverseTranslateServer } from "../src/import/read-mcp.js";

describe("reverseTranslateServer (AC-58)", () => {
  it("reads a command-only entry as stdio", () => {
    expect(reverseTranslateServer({ command: "npx", args: ["-y", "x"], env: { A: "1" } })).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "x"],
      env: { A: "1" },
    });
  });

  it("reads an explicit type stdio entry as stdio", () => {
    expect(reverseTranslateServer({ type: "stdio", command: "node" })).toEqual({
      transport: "stdio",
      command: "node",
    });
  });

  it("reads a url-only entry (Cursor shape, no type) as http, keeping headers", () => {
    expect(
      reverseTranslateServer({ url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" } }),
    ).toEqual({
      transport: "http",
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer x" },
    });
  });

  it("reads url + type http as http", () => {
    expect(reverseTranslateServer({ type: "http", url: "https://a.example/mcp" })).toEqual({
      transport: "http",
      url: "https://a.example/mcp",
    });
  });

  it("reads url + type sse as sse", () => {
    expect(reverseTranslateServer({ type: "sse", url: "https://a.example/sse" })).toEqual({
      transport: "sse",
      url: "https://a.example/sse",
    });
  });

  it("reads url + an unrecognized remote type (streamable-http) as http", () => {
    expect(reverseTranslateServer({ type: "streamable-http", url: "https://a.example/mcp" })).toEqual({
      transport: "http",
      url: "https://a.example/mcp",
    });
  });

  it("with both url and command and no type, command wins (stdio)", () => {
    expect(reverseTranslateServer({ command: "node", url: "https://a.example" })).toEqual({
      transport: "stdio",
      command: "node",
    });
  });

  it("with both url and command, an explicit network type wins", () => {
    expect(reverseTranslateServer({ type: "http", command: "node", url: "https://a.example" })).toEqual({
      transport: "http",
      url: "https://a.example",
    });
  });

  it("returns null for explicit stdio with only a url, and for empty entries", () => {
    expect(reverseTranslateServer({ type: "stdio", url: "https://a.example" })).toBeNull();
    expect(reverseTranslateServer({})).toBeNull();
    expect(reverseTranslateServer({ type: "http" })).toBeNull();
  });
});
