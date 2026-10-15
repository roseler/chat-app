import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.mjs";

test("SPA routes use static assets", async () => {
  const response = new Response("app shell");
  assert.equal(
    await worker.fetch(new Request("https://quiet.example/login"), {
      ASSETS: { fetch: async () => response },
    }),
    response,
  );
});
test("API and WebSocket paths use the same persistent chat object", async () => {
  for (const path of ["/api/health", "/api/auth/login", "/ws"]) {
    const request = new Request(`https://quiet.example${path}`);
    const response = new Response("chat");
    assert.equal(
      await worker.fetch(request, {
        CHAT: {
          getByName: (name) => {
            assert.equal(name, "quiet-global-v1");
            return {
              fetch: (received) => {
                assert.equal(received, request);
                return response;
              },
            };
          },
        },
      }),
      response,
    );
  }
});
test("missing storage and old Socket.IO clients receive useful errors", async () => {
  assert.equal(
    (await worker.fetch(new Request("https://quiet.example/api/health"), {}))
      .status,
    503,
  );
  assert.equal(
    (await worker.fetch(new Request("https://quiet.example/socket.io/"), {}))
      .status,
    426,
  );
});
