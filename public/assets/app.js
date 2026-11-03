const $ = (selector) => document.querySelector(selector);
const heartbeatBadge = $("#heartbeat-badge");
const heartbeatMessage = $("#heartbeat-message");
const widgetStateIcon = $("#widget-state-icon");
const widgetStateTitle = $("#widget-state-title");
const widgetStateDetail = $("#widget-state-detail");
const captchaSlot = $("#captcha-slot");
const verifyForm = $("#verify-form");
const resultCard = $("#result-card");

function showHeartbeat(ok, detail, simulated = false) {
  heartbeatBadge.className = `badge ${ok ? "badge-up" : "badge-down"}`;
  heartbeatBadge.textContent = simulated ? "SIMULATED FAIL" : ok ? "OK" : "FAIL";
  heartbeatMessage.textContent = detail;
  widgetStateIcon.className = `state-icon ${ok ? "state-up" : "state-down"}`;
  widgetStateIcon.textContent = ok ? "✓" : "×";
  widgetStateTitle.textContent = ok ? "Heartbeat is healthy" : "Heartbeat failed — widget not loaded";
  widgetStateDetail.textContent = ok
    ? "The client may now insert the ARCaptcha widget script."
    : "No ARCaptcha widget script was requested, so no challenge token was created.";
}

function showGateMessage(message) {
  captchaSlot.replaceChildren();
  const notice = document.createElement("p");
  notice.className = "field-help";
  notice.textContent = message;
  captchaSlot.appendChild(notice);
}

function showDemoTokenField() {
  captchaSlot.replaceChildren();
  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = "demo-token";
  label.textContent = "Demo token";
  const input = document.createElement("input");
  input.id = "demo-token";
  input.className = "text-input";
  input.value = "valid-demo-token";
  input.autocomplete = "off";
  const help = document.createElement("span");
  help.className = "field-help";
  help.textContent = "This local-only token is shown after a healthy heartbeat.";
  captchaSlot.append(label, input, help);
}

async function requestHeartbeat() {
  try {
    const response = await fetch(window.DEMO_CONFIG.heartbeatStatusUrl, { cache: "no-store" });
    if (!response.ok) {
      return { OK: false, source: "server", reason: `status-http-${response.status}` };
    }
    return await response.json();
  } catch (error) {
    return {
      OK: false,
      source: "server",
      reason: "status-network-error",
    };
  }
}

function loadWidgetScript() {
  const container = document.createElement("div");
  container.className = "arcaptcha";
  container.setAttribute("data-site-key", window.DEMO_CONFIG.siteKey);
  captchaSlot.replaceChildren(container);

  const script = document.createElement("script");
  script.src = window.DEMO_CONFIG.widgetScriptUrl;
  script.async = true;
  script.onerror = () => {
    showGateMessage("Heartbeat passed, but the widget script failed to load. No CAPTCHA token is available.");
  };
  document.head.appendChild(script);
}

function showResult(result, httpStatus) {
  const allowed = result.success === true;
  resultCard.hidden = false;
  resultCard.className = `result-card ${allowed ? "result-allowed" : "result-blocked"}`;
  $("#result-icon").textContent = allowed ? "✓" : "×";
  $("#result-title").textContent = allowed ? "Business action allowed" : "Business action blocked";
  $("#result-message").textContent = result.message || result.error || `Server response: ${httpStatus}`;
  $("#result-mode").textContent = `mode=${result.mode || "unknown"} · HTTP ${httpStatus}${result.policy ? ` · policy=${result.policy}` : ""}`;
}

async function start() {
  $("#policy-label").textContent = window.DEMO_CONFIG.outagePolicy;
  if (window.DEMO_CONFIG.demo) {
    $("#demo-warning").hidden = false;
    $("#demo-warning").textContent = window.DEMO_CONFIG.simulateHeartbeatFailure
      ? "This run simulates a failed heartbeat. The widget will not load. The server applies the configured demo policy."
      : "Live heartbeat checks are enabled. The widget loads only after an OK: true response.";
  }

  // Do not insert the ARCaptcha script until this heartbeat check succeeds.
  const heartbeat = await requestHeartbeat();
  const healthy = heartbeat.OK === true;
  showHeartbeat(
    healthy,
    healthy
      ? "The server's cached ARCaptcha heartbeat is OK: true. The client-side widget gate is open."
      : `ARCaptcha heartbeat failed (${heartbeat.reason}). The client-side widget gate stays closed.`,
    heartbeat.source === "simulated",
  );

  if (!healthy) {
    showGateMessage("Heartbeat failed. CAPTCHA was not loaded. Submit without a token to see the server's configured bypass policy.");
    return;
  }

  if (window.DEMO_CONFIG.live) loadWidgetScript();
  else if (window.DEMO_CONFIG.demo) showDemoTokenField();
  else showGateMessage("Live verification is not configured on this server.");
}

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(verifyForm);
  const token = formData.get("arcaptcha-token") || $("#demo-token")?.value || "";
  const button = verifyForm.querySelector("button[type=submit]");
  button.disabled = true;
  button.innerHTML = '<span class="button-spinner"></span> Checking on the server…';
  resultCard.hidden = true;
  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    showResult(await response.json(), response.status);
  } catch {
    showResult({ success: false, message: "Could not reach the demo server." }, 0);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submit protected action <span aria-hidden="true">→</span>';
  }
});

start();
