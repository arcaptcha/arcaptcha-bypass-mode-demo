async function checkHeartbeat({ url, timeoutMs, simulateFailure, fetchImpl = fetch }) {
  if (simulateFailure) {
    return { OK: false, source: "simulated", reason: "simulated-heartbeat-failure" };
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { OK: false, source: "arcaptcha", reason: `heartbeat-http-${response.status}` };

    // Accept only the documented positive heartbeat signal.
    const body = await response.json();
    return body?.OK === true
      ? { OK: true, source: "arcaptcha" }
      : { OK: false, source: "arcaptcha", reason: "heartbeat-reported-down" };
  } catch (error) {
    return {
      OK: false,
      source: "arcaptcha",
      reason: error.name === "TimeoutError" ? "heartbeat-timeout" : "heartbeat-network-or-response-error",
    };
  }
}

function createHeartbeatMonitor(config, fetchImpl = fetch) {
  // This demo keeps one process-local snapshot; use shared storage across instances.
  let state = { OK: false, reason: "checking", checkedAt: null };
  let timer;

  async function refresh() {
    state = {
      ...await checkHeartbeat({ ...config, fetchImpl }),
      checkedAt: new Date().toISOString(),
    };
    return { ...state };
  }

  return {
    current: () => ({ ...state }),
    refresh,
    async start() {
      await refresh();
      timer = setInterval(() => void refresh(), config.pollMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}

module.exports = { checkHeartbeat, createHeartbeatMonitor };
