# ARCaptcha Bypass Mode Demo

A small Node.js sample that implements the cached-heartbeat flow:

1. Server periodically checks `GET https://api.arcaptcha.ir/arcaptcha/api/heartbeat` and caches its status in memory.
2. Browser asks `/api/captcha/bootstrap` for the server's `loadWidget` decision.
3. It inserts the widget only when `loadWidget` is `true`; otherwise no widget or token is created.
4. Server uses the same cached status when verifying a protected action and applies the configured bypass policy if heartbeat failed.

The docs guide and simplified flow image are at <https://docs.arcaptcha.co/bypass-mode>.

## Run the simulated outage

Requires Node.js 18 or newer.

```sh
npm install
npm start
```

Open <http://localhost:3030/>. By default, this **local demo** simulates a failed heartbeat and uses fail-open so the bypass result is visible. The widget script is not requested.

To see the safer fail-closed response instead:

```sh
CAPTCHA_FAILURE_POLICY=fail-closed npm start
```

## Check the live heartbeat / widget

Set `SIMULATE_HEARTBEAT_FAILURE=false` to poll the actual ARCaptcha heartbeat. On `OK: true`, the page loads the widget if both credentials are configured.

```sh
SIMULATE_HEARTBEAT_FAILURE=false \
ARCAPTCHA_SITE_KEY=your_site_key \
ARCAPTCHA_SECRET_KEY=your_secret_key \
npm start
```

The secret key remains server-side. Without credentials, a local `valid-demo-token` field is shown only after heartbeat succeeds; this token is for demo testing only and is not an ARCaptcha token.

## Simple code map

- `src/heartbeat.js` — poll ARCaptcha and hold the latest heartbeat result in memory.
- `src/server.js` — serve the page, decide `loadWidget` from cached status, and apply server-side policy.
- `public/assets/app.js` — follow that decision and dynamically load the widget only when allowed.
- `src/captcha-service.js` — validate tokens and apply the failure policy.
- `public/index.html` — one status panel and one protected-action form; no scenario controls.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3030` | HTTP port |
| `ARCAPTCHA_SITE_KEY` | empty | Public site key |
| `ARCAPTCHA_SECRET_KEY` | empty | Private key; server-side only |
| `ARCAPTCHA_VERIFY_URL` | `https://api.arcaptcha.co/arcaptcha/api/verify` | Token verification endpoint |
| `ARCAPTCHA_WIDGET_SCRIPT_URL` | `https://nwidget.arcaptcha.ir/1/api.js` | Widget script inserted after heartbeat success |
| `ARCAPTCHA_HEARTBEAT_URL` | `https://api.arcaptcha.ir/arcaptcha/api/heartbeat` | Heartbeat endpoint; expects JSON `OK: true` |
| `HEARTBEAT_POLL_MS` | `10000` | Background heartbeat polling interval |
| `SIMULATE_HEARTBEAT_FAILURE` | `true` in demo mode | Set `false` to call the real heartbeat |
| `HEARTBEAT_TIMEOUT_MS` | `3500` | Heartbeat timeout |
| `VERIFY_TIMEOUT_MS` | `5000` | Verification timeout |
| `CAPTCHA_FAILURE_POLICY` | `fail-open` in demo mode | `fail-open` or `fail-closed`; production defaults to fail-closed |
| `DEMO_MODE` | `true` | Enables demo token and simulation behavior |

The sample keeps status in process memory to keep the code short. For multiple production instances, store the heartbeat status in shared storage such as Redis so every instance uses the same result. A request-time heartbeat check is an alternative when you do not want to cache status.

## Tests

```sh
npm test
```

This is a teaching sample, not a production security policy. Fail-open allows protected requests without a verified token. Scope it carefully, add rate limits and alerting, and never convert an actual `success: false` verification response into a pass.
