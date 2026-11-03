const { normalizePolicy } = require("./config");

function fallbackResult(policy, reason) {
  const normalizedPolicy = normalizePolicy(policy);
  const allowed = normalizedPolicy === "fail-open";
  return {
    httpStatus: allowed ? 200 : 503,
    body: {
      success: allowed,
      mode: "bypass",
      policy: normalizedPolicy,
      reason,
      message: allowed
        ? "Captcha verification was unavailable; request allowed by the configured fail-open policy."
        : "Captcha verification was unavailable; request blocked by the configured fail-closed policy.",
      ...(allowed && { warning: "Request allowed without a verified CAPTCHA token." }),
    },
  };
}

function denial(httpStatus, message, extra = {}) {
  return { httpStatus, body: { success: false, mode: "online", message, ...extra } };
}

async function verifyCaptcha({
  token,
  config,
  policy,
  heartbeatOK = true,
  heartbeatReason = "heartbeat-unavailable",
  fetchImpl = fetch,
}) {
  // A failed heartbeat skips token verification and enters the configured bypass policy.
  if (!heartbeatOK) return fallbackResult(policy, heartbeatReason);

  const cleanToken = typeof token === "string" ? token.trim() : "";
  if (!cleanToken) {
    return denial(400, "A solved ARCaptcha token is required.", { code: "missing-token" });
  }

  if (!config.siteKey || !config.secretKey) {
    if (config.demoMode) {
      const valid = cleanToken === "valid-demo-token";
      return {
        httpStatus: valid ? 200 : 403,
        body: {
          success: valid,
          mode: "demo",
          message: valid
            ? "Demo token accepted. Configure ARCaptcha keys to use live verification."
            : "Demo token rejected. Try valid-demo-token or configure live ARCaptcha keys.",
        },
      };
    }
    return denial(503, "Live ARCaptcha verification is not configured.", {
      code: "missing-server-configuration",
    });
  }

  let response;
  try {
    response = await fetchImpl(config.verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ site_key: config.siteKey, secret_key: config.secretKey, challenge_id: cleanToken }),
      signal: AbortSignal.timeout(config.verifyTimeoutMs),
    });
  } catch (error) {
    return fallbackResult(
      policy,
      error.name === "TimeoutError" ? "verification-timeout" : "verification-network-error",
    );
  }

  if ([408, 429].includes(response.status) || response.status >= 500) {
    return fallbackResult(policy, `verification-http-${response.status}`);
  }
  if (!response.ok) {
    return denial(502, `ARCaptcha verification returned HTTP ${response.status}.`, {
      code: "verification-http-error",
    });
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return fallbackResult(policy, "verification-invalid-response");
  }

  if (result?.success === true) {
    return { httpStatus: 200, body: { success: true, mode: "online", message: "ARCaptcha verified the token." } };
  }

  // An authoritative invalid-token response is never treated as a service outage.
  return denial(403, "ARCaptcha rejected the token.", { code: "invalid-token" });
}

module.exports = { fallbackResult, verifyCaptcha };
