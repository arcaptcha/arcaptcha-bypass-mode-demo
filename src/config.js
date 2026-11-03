const DEFAULT_VERIFY_URL = "https://api.arcaptcha.co/arcaptcha/api/verify";
const DEFAULT_HEARTBEAT_URL = "https://api.arcaptcha.ir/arcaptcha/api/heartbeat";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePolicy(value) {
  return value === "fail-open" ? "fail-open" : "fail-closed";
}

function readConfig(env = process.env) {
  const demoMode = env.DEMO_MODE !== "false";
  return {
    port: positiveInteger(env.PORT, 3030),
    siteKey: env.ARCAPTCHA_SITE_KEY || "",
    secretKey: env.ARCAPTCHA_SECRET_KEY || "",
    verifyUrl: env.ARCAPTCHA_VERIFY_URL || DEFAULT_VERIFY_URL,
    widgetScriptUrl: env.ARCAPTCHA_WIDGET_SCRIPT_URL || "https://nwidget.arcaptcha.ir/1/api.js",
    heartbeatUrl: env.ARCAPTCHA_HEARTBEAT_URL || DEFAULT_HEARTBEAT_URL,
    heartbeatTimeoutMs: positiveInteger(env.HEARTBEAT_TIMEOUT_MS, 3_500),
    heartbeatPollMs: positiveInteger(env.HEARTBEAT_POLL_MS, 10_000),
    verifyTimeoutMs: positiveInteger(env.VERIFY_TIMEOUT_MS, 5_000),
    initialPolicy: env.CAPTCHA_FAILURE_POLICY
      ? normalizePolicy(env.CAPTCHA_FAILURE_POLICY)
      : demoMode ? "fail-open" : "fail-closed",
    simulateHeartbeatFailure: demoMode && env.SIMULATE_HEARTBEAT_FAILURE !== "false",
    demoMode,
  };
}

module.exports = { DEFAULT_HEARTBEAT_URL, DEFAULT_VERIFY_URL, normalizePolicy, readConfig };
