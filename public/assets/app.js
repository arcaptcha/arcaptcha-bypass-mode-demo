const $ = (selector) => document.querySelector(selector);

function showServerDecision() {
  const page = window.PAGE_CONFIG;
  const allowed = page.loadWidget;

  $("#policy-label").textContent = page.outagePolicy;
  $("#heartbeat-badge").className = `badge ${allowed ? "badge-up" : "badge-down"}`;
  $("#heartbeat-badge").textContent = page.simulatedHeartbeatFailure
    ? "SIMULATED FAIL"
    : allowed ? "OK" : "FAIL";
  $("#heartbeat-message").textContent = allowed
    ? "The server cached a healthy heartbeat and included the widget in this page."
    : `The server cached heartbeat failure (${page.heartbeatReason}) and omitted the widget.`;
  $("#widget-state-icon").className = `state-icon ${allowed ? "state-up" : "state-down"}`;
  $("#widget-state-icon").textContent = allowed ? "✓" : "×";
  $("#widget-state-title").textContent = allowed ? "Server included the widget" : "Server omitted the widget";
  $("#widget-state-detail").textContent = allowed
    ? "The browser displays the server-rendered CAPTCHA."
    : "No widget script or local token was rendered.";

  if (page.demoMode) {
    $("#demo-warning").hidden = false;
    $("#demo-warning").textContent = page.simulatedHeartbeatFailure
      ? "This run simulates heartbeat failure and uses the configured demo policy."
      : "The server is using the live periodic heartbeat. Fail-open is for demo purposes only.";
  }
}

function showResult(result, status) {
  const allowed = result.success === true;
  const card = $("#result-card");
  card.hidden = false;
  card.className = `result-card ${allowed ? "result-allowed" : "result-blocked"}`;
  $("#result-icon").textContent = allowed ? "✓" : "×";
  $("#result-title").textContent = allowed ? "Business action allowed" : "Business action blocked";
  $("#result-message").textContent = result.message || result.error || `Server response: ${status}`;
  $("#result-mode").textContent = `mode=${result.mode || "unknown"} · HTTP ${status}`;
}

$("#verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = new FormData(event.currentTarget).get("arcaptcha-token") || $("#demo-token")?.value || "";
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Checking on the server…";

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
    button.textContent = "Submit protected action →";
  }
});

showServerDecision();
