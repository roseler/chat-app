import { test, mock } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.mjs";

test("assets and SPA routes use the asset binding without needing a backend", async () => {
  const response = new Response("app shell");
  const env = {
    ASSETS: {
      fetch: async (request) => {
        assert.equal(new URL(request.url).pathname, "/login");
        return response;
      },
    },
  };
  assert.equal(
    await worker.fetch(new Request("https://quiet.example/login"), env),
    response,
  );
});

test("API and socket routes fail clearly until backend secrets are configured", async () => {
  for (const path of [
    "/api",
    "/api/health",
    "/socket.io",
    "/socket.io/?EIO=4&transport=polling",
  ]) {
    const response = await worker.fetch(
      new Request(`https://quiet.example${path}`),
      {},
    );
    assert.equal(response.status, 503);
  }
});

test("proxy preserves the body, cookies, origin, query, and upstream response while replacing spoofed IP headers", async () => {
  const upstream = new Response("saved", {
    headers: {
      "Set-Cookie": "chat_session=example; HttpOnly; Secure; SameSite=Strict",
      "Cache-Control": "no-store",
    },
  });
  const spy = mock.method(globalThis, "fetch", async (request) => {
    assert.equal(
      request.url,
      "https://quiet-api.onrender.com/api/auth/login?next=chat",
    );
    assert.equal(request.headers.get("origin"), "https://quiet.example");
    assert.equal(request.headers.get("cookie"), "chat_session=old");
    assert.equal(
      request.headers.get("x-chat-proxy-secret"),
      "test-only-secret",
    );
    assert.equal(request.headers.get("x-chat-client-ip"), "198.51.100.5");
    assert.equal(request.headers.has("x-forwarded-for"), false);
    assert.equal(request.redirect, "manual");
    assert.deepEqual(await request.json(), {
      username: "alice",
      password: "test-password",
    });
    return upstream;
  });
  try {
    const response = await worker.fetch(
      new Request("https://quiet.example/api/auth/login?next=chat", {
        method: "POST",
        headers: {
          Origin: "https://quiet.example",
          Cookie: "chat_session=old",
          "CF-Connecting-IP": "198.51.100.5",
          "X-Forwarded-For": "spoofed",
          "X-Chat-Client-IP": "spoofed",
          "X-Chat-Proxy-Secret": "spoofed",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "alice", password: "test-password" }),
      }),
      {
        BACKEND_URL: "https://quiet-api.onrender.com",
        PROXY_SECRET: "test-only-secret",
      },
    );
    assert.equal(response, upstream);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  } finally {
    spy.mock.restore();
  }
});

test("WebSocket handshake is returned intact without consuming or recreating its response", async () => {
  const upgrade = { status: 101, webSocket: {} };
  const spy = mock.method(globalThis, "fetch", async (request) => {
    assert.equal(
      request.url,
      "https://quiet-api.onrender.com/socket.io/?EIO=4&transport=websocket",
    );
    assert.equal(request.headers.get("upgrade"), "websocket");
    return upgrade;
  });
  try {
    assert.equal(
      await worker.fetch(
        new Request(
          "https://quiet.example/socket.io/?EIO=4&transport=websocket",
          { headers: { Upgrade: "websocket" } },
        ),
        { BACKEND_URL: "https://quiet-api.onrender.com", PROXY_SECRET: "test" },
      ),
      upgrade,
    );
  } finally {
    spy.mock.restore();
  }
});

test("invalid backend origins are rejected and network errors return a retryable response", async () => {
  const request = () => new Request("https://quiet.example/api/health");
  for (const url of [
    "http://quiet-api.onrender.com",
    "https://quiet.example",
    "not a url",
    "https://user:password@backend.example",
  ]) {
    assert.equal(
      (
        await worker.fetch(request(), {
          BACKEND_URL: url,
          PROXY_SECRET: "test",
        })
      ).status,
      503,
    );
  }
  const spy = mock.method(globalThis, "fetch", async () => {
    throw new Error("upstream failed");
  });
  try {
    assert.equal(
      (
        await worker.fetch(request(), {
          BACKEND_URL: "https://quiet-api.onrender.com",
          PROXY_SECRET: "test",
        })
      ).status,
      502,
    );
  } finally {
    spy.mock.restore();
  }
});
