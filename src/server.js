const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { readConfig } = require("./config");
const { createHeartbeatMonitor } = require("./heartbeat");
const { verifyCaptcha } = require("./captcha-service");

const config = readConfig();
const publicDir = path.resolve(__dirname, "../public");
const heartbeat = createHeartbeatMonitor({
  url: config.heartbeatUrl,
  timeoutMs: config.heartbeatTimeoutMs,
  pollMs: config.heartbeatPollMs,
  simulateFailure: config.simulateHeartbeatFailure,
});
const app = express();

app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "default-src 'self' https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' https: 'unsafe-inline'; font-src 'self' https: data:; img-src 'self' data:; connect-src 'self' https:");
  next();
});
app.use("/assets", express.static(path.join(publicDir, "assets"), { maxAge: "5m" }));

function inlineJson(value) {
  // Keep environment values safe inside the page's inline configuration.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

app.get("/", async (req, res, next) => {
  try {
    const html = (await fs.readFile(path.join(publicDir, "index.html"), "utf8"))
      .replace("__LIVE_MODE__", String(Boolean(config.siteKey && config.secretKey)))
      .replace("__DEMO_MODE__", String(config.demoMode))
      .replace("__SITE_KEY_JSON__", inlineJson(config.siteKey))
      .replace("__WIDGET_SCRIPT_URL_JSON__", inlineJson(config.widgetScriptUrl))
      .replace("__HEARTBEAT_STATUS_URL_JSON__", inlineJson("/api/heartbeat-status"))
      .replace("__OUTAGE_POLICY__", config.initialPolicy)
      .replace("__SIMULATE_HEARTBEAT_FAILURE__", String(config.simulateHeartbeatFailure));
    res.set("Cache-Control", "no-store").type("html").send(html);
  } catch (error) {
    next(error);
  }
});

// The client reads this cached status before loading the CAPTCHA widget.
app.get("/api/heartbeat-status", (req, res) => {
  res.set("Cache-Control", "no-store").json(heartbeat.current());
});

app.post("/api/verify", async (req, res, next) => {
  try {
    // Use server-owned cached status; never trust a client heartbeat flag.
    const status = heartbeat.current();
    const result = await verifyCaptcha({
      token: req.body.token,
      config,
      policy: config.initialPolicy,
      heartbeatOK: status.OK,
      heartbeatReason: status.reason,
    });

    if (result.body.mode === "bypass") {
      console.warn(JSON.stringify({
        event: "captcha_bypass_decision",
        policy: result.body.policy,
        reason: result.body.reason,
        allowed: result.body.success,
        at: new Date().toISOString(),
      }));
    }
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  res.status(status).json({ success: false, error: status === 500 ? "Internal server error" : error.message });
});

async function start() {
  await heartbeat.start();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`ARCaptcha bypass demo: http://localhost:${config.port}`);
    console.log(`Heartbeat: ${config.simulateHeartbeatFailure ? "simulated failure" : heartbeat.current().OK ? "OK" : "unavailable"}; policy: ${config.initialPolicy}`);
  });

  function shutdown() {
    heartbeat.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Could not start bypass demo:", error.message);
  process.exitCode = 1;
});
