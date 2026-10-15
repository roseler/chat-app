const isBackendPath = (path) =>
  path === "/api" ||
  path.startsWith("/api/") ||
  path === "/socket.io" ||
  path.startsWith("/socket.io/");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isBackendPath(url.pathname)) return env.ASSETS.fetch(request);
    if (!env.BACKEND_URL || !env.PROXY_SECRET) {
      return Response.json(
        { error: "Backend deployment is not configured yet." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    let backend;
    try {
      backend = new URL(env.BACKEND_URL);
      if (
        backend.protocol !== "https:" ||
        backend.origin === url.origin ||
        backend.username ||
        backend.password
      )
        throw new Error();
    } catch {
      return Response.json(
        { error: "Backend URL must be a separate HTTPS origin." },
        { status: 503 },
      );
    }
    backend.pathname = url.pathname;
    backend.search = url.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("forwarded");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-proto");
    headers.set("x-chat-proxy-secret", env.PROXY_SECRET);
    headers.set(
      "x-chat-client-ip",
      request.headers.get("CF-Connecting-IP") || "",
    );
    // Keep the original Origin for the backend's CSRF and socket checks.
    const upstream = new Request(
      backend,
      new Request(request, { headers, redirect: "manual" }),
    );
    try {
      // Returning the upstream response directly preserves cookies and WebSocket upgrades.
      return await fetch(upstream);
    } catch {
      return Response.json(
        { error: "Chat server is unavailable. Please try again shortly." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
};
