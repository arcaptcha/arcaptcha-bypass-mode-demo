function escapeAttribute(value) {
  return String(value).replace(/[&"<>']/g, (char) => ({
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
  })[char]);
}

function renderCaptchaSlot({ heartbeatOK, live, demo, siteKey, widgetScriptUrl }) {
  if (!heartbeatOK) {
    return {
      markup: '<p class="field-help">The server skipped CAPTCHA loading because heartbeat is unavailable.</p>',
      script: "",
    };
  }

  if (live) {
    return {
      markup: `<div class="arcaptcha" data-site-key="${escapeAttribute(siteKey)}"></div>`,
      script: `<script src="${escapeAttribute(widgetScriptUrl)}" async defer></script>`,
    };
  }

  if (demo) {
    return {
      markup: '<label class="field-label" for="demo-token">Demo token</label><input id="demo-token" class="text-input" value="valid-demo-token" autocomplete="off"><span class="field-help">Use valid-demo-token for a simulated pass.</span>',
      script: "",
    };
  }

  return {
    markup: '<p class="field-help">Live verification is not configured on this server.</p>',
    script: "",
  };
}

module.exports = { renderCaptchaSlot };
