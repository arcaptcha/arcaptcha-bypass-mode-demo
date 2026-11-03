const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fallbackResult, verifyCaptcha } = require("../src/captcha-service");
const { checkHeartbeat, createHeartbeatMonitor } = require("../src/heartbeat");
const { readConfig } = require("../src/config");

const liveConfig = {
  demoMode: false,
  siteKey: "public-site-key",
  secretKey: "server-only-secret",
  verifyUrl: "https://api.example.test/verify",
  verifyTimeoutMs: 100,
};

test("demo defaults simulate the ARCaptcha heartbeat failure", () => {
  const config = readConfig({});
  assert.equal(config.heartbeatUrl, "https://api.arcaptcha.ir/arcaptcha/api/heartbeat");
  assert.equal(config.heartbeatPollMs, 10_000);
  assert.equal(config.simulateHeartbeatFailure, true);
  assert.equal(config.initialPolicy, "fail-open");
  const productionConfig = readConfig({ DEMO_MODE: "false" });
  assert.equal(productionConfig.simulateHeartbeatFailure, false);
  assert.equal(productionConfig.initialPolicy, "fail-closed");
});

test("client page contains no widget script tag before the heartbeat gate", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../src/server.js"), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=["']https:\/\/(?:n?widget\.)?arcaptcha\./i);
  assert.match(server, /app\.get\("\/api\/captcha\/bootstrap"/);
  assert.match(server, /const loadWidget = status\.OK === true/);
  assert.match(app, /fetch\(window\.DEMO_CONFIG\.captchaBootstrapUrl/);
  assert.match(app, /decision\.loadWidget === true/);
  const failureGate = app.indexOf("if (!loadWidget)");
  const widgetLoad = app.indexOf("loadWidgetScript();", failureGate);
  assert.ok(failureGate >= 0 && widgetLoad > failureGate, "browser follows the server decision before inserting the widget");
});

test("fail-closed is the default behavior for an outage", () => {
  const result = fallbackResult(undefined, "verification-network-error");
  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.success, false);
  assert.equal(result.body.policy, "fail-closed");
});

test("fail-open is explicit and identifies an unverified bypass", () => {
  const result = fallbackResult("fail-open", "verification-timeout");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.mode, "bypass");
  assert.ok(result.body.warning);
});

test("a valid provider token passes in online mode", async () => {
  const result = await verifyCaptcha({
    token: "one-time-token",
    config: liveConfig,
    policy: "fail-closed",
    heartbeatOK: true,
    fetchImpl: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
  });
  assert.equal(result.body.success, true);
  assert.equal(result.body.mode, "online");
});

test("a definitive invalid-token result is rejected even under fail-open", async () => {
  const result = await verifyCaptcha({
    token: "invalid-token",
    config: liveConfig,
    policy: "fail-open",
    heartbeatOK: true,
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
  });
  assert.equal(result.httpStatus, 403);
  assert.equal(result.body.success, false);
  assert.equal(result.body.mode, "online");
});

test("network failure applies the configured fallback policy", async () => {
  const result = await verifyCaptcha({
    token: "token",
    config: liveConfig,
    policy: "fail-open",
    heartbeatOK: true,
    fetchImpl: async () => { throw new TypeError("network down"); },
  });
  assert.equal(result.body.mode, "bypass");
  assert.equal(result.body.success, true);
  assert.equal(result.body.reason, "verification-network-error");
});

test("missing token uses bypass only when the server heartbeat fails", async () => {
  const healthy = await verifyCaptcha({ token: "", config: liveConfig, policy: "fail-open", heartbeatOK: true });
  const unavailable = await verifyCaptcha({ token: "", config: liveConfig, policy: "fail-open", heartbeatOK: false });
  assert.equal(healthy.httpStatus, 400);
  assert.equal(unavailable.body.mode, "bypass");
  assert.equal(unavailable.body.success, true);
});

test("failed heartbeat bypasses before calling token verification", async () => {
  let verifyCalled = false;
  const result = await verifyCaptcha({
    token: "token-from-a-previous-page-load",
    config: liveConfig,
    policy: "fail-open",
    heartbeatOK: false,
    heartbeatReason: "heartbeat-reported-down",
    fetchImpl: async () => { verifyCalled = true; throw new Error("must not verify while heartbeat is down"); },
  });
  assert.equal(verifyCalled, false);
  assert.equal(result.body.mode, "bypass");
  assert.equal(result.body.reason, "heartbeat-reported-down");
});

test("heartbeat request uses GET and requires JSON OK true", async () => {
  const seen = [];
  const heartbeat = await checkHeartbeat({
    url: "https://api.arcaptcha.ir/arcaptcha/api/heartbeat",
    timeoutMs: 100,
    fetchImpl: async (url, options) => {
      seen.push({ url, method: options.method });
      return new Response(JSON.stringify({ OK: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.deepEqual(seen, [{ url: "https://api.arcaptcha.ir/arcaptcha/api/heartbeat", method: "GET" }]);
  assert.equal(heartbeat.OK, true);
});

test("heartbeat monitor caches its initial result for browser and server routes", async () => {
  const monitor = createHeartbeatMonitor({
    url: "https://api.arcaptcha.ir/arcaptcha/api/heartbeat",
    timeoutMs: 100,
    pollMs: 10_000,
    simulateFailure: false,
  }, async () => new Response(JSON.stringify({ OK: true }), { status: 200 }));
  await monitor.start();
  assert.equal(monitor.current().OK, true);
  assert.ok(monitor.current().checkedAt);
  monitor.stop();
});

test("heartbeat false, bad status, invalid JSON, and network errors are unavailable", async (t) => {
  const cases = [
    ["OK false", async () => new Response(JSON.stringify({ OK: false }), { status: 200 })],
    ["HTTP failure", async () => new Response("down", { status: 503 })],
    ["invalid JSON", async () => new Response("not-json", { status: 200 })],
    ["network error", async () => { throw new TypeError("network down"); }],
  ];
  for (const [name, fetchImpl] of cases) {
    await t.test(name, async () => {
      const heartbeat = await checkHeartbeat({
        url: "https://api.arcaptcha.ir/arcaptcha/api/heartbeat",
        timeoutMs: 100,
        fetchImpl,
      });
      assert.equal(heartbeat.OK, false);
    });
  }
});
