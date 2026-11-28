import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../functions/mam-api/[[path]].js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { onRequest } = await import(moduleUrl);
const previewWorker = "https://repair-worker-archive-guards-20261128-odd-sunset-6c83.m-ahmetisildak34.workers.dev";

test("proxy refuses requests when its Preview-only Access credentials are absent", async () => {
  const request = new Request("https://repair-team-identity-history.mam-iphone-preview.pages.dev/mam-api/api/archive/d1-status");
  const response = await onRequest({ request, env: {} });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Preview API proxy is not configured" });
});

test("proxy strips browser identity headers, injects server credentials, and preserves app Bearer auth", async t => {
  let forwarded;
  t.mock.method(globalThis, "fetch", async request => {
    forwarded = request;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const request = new Request("https://repair-team-identity-history.mam-iphone-preview.pages.dev/mam-api/api/auth/check?probe=1", {
    headers: {
      Origin: "https://attacker.invalid",
      Referer: "https://attacker.invalid/page",
      Cookie: "cf_access=browser-cookie",
      "CF-Access-Client-Id": "attacker-id",
      "CF-Access-Client-Secret": "attacker-secret",
      "CF-Access-Token": "attacker-jwt",
      Authorization: "Bearer app-session-token"
    }
  });
  const response = await onRequest({
    request,
    env: {
      MAM_PREVIEW_ACCESS_CLIENT_ID: "server-client-id",
      MAM_PREVIEW_ACCESS_CLIENT_SECRET: "server-client-secret"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(forwarded.url, `${previewWorker}/api/auth/check?probe=1`);
  assert.equal(forwarded.headers.get("origin"), null);
  assert.equal(forwarded.headers.get("referer"), null);
  assert.equal(forwarded.headers.get("cookie"), null);
  assert.equal(forwarded.headers.get("cf-access-token"), null);
  assert.equal(forwarded.headers.get("cf-access-client-id"), "server-client-id");
  assert.equal(forwarded.headers.get("cf-access-client-secret"), "server-client-secret");
  assert.equal(forwarded.headers.get("authorization"), "Bearer app-session-token");
});

test("proxy forwards login request body to the Preview Worker", async t => {
  let forwarded;
  t.mock.method(globalThis, "fetch", async request => {
    forwarded = request;
    return new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
  });
  const loginBody = JSON.stringify({ password: "deliberately-wrong" });
  const request = new Request("https://repair-team-identity-history.mam-iphone-preview.pages.dev/mam-api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: loginBody
  });
  const response = await onRequest({
    request,
    env: {
      MAM_PREVIEW_ACCESS_CLIENT_ID: "server-client-id",
      MAM_PREVIEW_ACCESS_CLIENT_SECRET: "server-client-secret"
    }
  });

  assert.equal(response.status, 401);
  assert.equal(forwarded.url, `${previewWorker}/auth/login`);
  assert.equal(await forwarded.text(), loginBody);
});
