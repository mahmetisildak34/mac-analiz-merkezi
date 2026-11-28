const PREVIEW_WORKER_ORIGIN = "https://repair-worker-archive-guards-20261128-odd-sunset-6c83.m-ahmetisildak34.workers.dev";
const PREFIX = "/mam-api";

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequest({ request, env }) {
  const clientId = env?.MAM_PREVIEW_ACCESS_CLIENT_ID;
  const clientSecret = env?.MAM_PREVIEW_ACCESS_CLIENT_SECRET;
  if (typeof clientId !== "string" || !clientId || typeof clientSecret !== "string" || !clientSecret) {
    return jsonError(503, "Preview API proxy is not configured");
  }

  const incoming = new URL(request.url);
  if (incoming.pathname !== PREFIX && !incoming.pathname.startsWith(`${PREFIX}/`)) {
    return jsonError(404, "Not found");
  }

  const workerPath = incoming.pathname.slice(PREFIX.length) || "/";
  const target = new URL(`${workerPath}${incoming.search}`, PREVIEW_WORKER_ORIGIN);
  const headers = new Headers(request.headers);
  const forbiddenNames = [
    "origin", "referer", "cookie", "host", "x-forwarded-host", "x-forwarded-proto",
    "x-forwarded-for", "cf-connecting-ip", "cf-ray", "cf-worker"
  ];
  for (const name of forbiddenNames) headers.delete(name);
  for (const name of Array.from(headers.keys())) {
    if (name.toLowerCase().startsWith("cf-access-")) headers.delete(name);
  }
  headers.set("cf-access-client-id", clientId);
  headers.set("cf-access-client-secret", clientSecret);

  const method = request.method.toUpperCase();
  const init = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(new Request(target, init));
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (_) {
    return jsonError(502, "Preview API unavailable");
  }
}
