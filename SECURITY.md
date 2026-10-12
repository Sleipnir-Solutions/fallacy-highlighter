# Security Policy

## Reporting a vulnerability

Please don't open a public issue for security problems.

Report privately with GitHub's **Report a vulnerability** button on this repository's **Security → Advisories** page. Include a description, steps to reproduce, the extension version (from `chrome://extensions`) and your Chrome version. Reports are acknowledged as soon as possible.

Please never include a real API key in a report. If you think a key was exposed, revoke it in the Anthropic Console first.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | ✅ |
| < 0.3   | ❌ |

## Scope notes

These areas are especially worth reporting:

- **The user's API key.** It is stored in `chrome.storage.local`, restricted to the extension's own pages and service worker, and sent only to `https://api.anthropic.com` in the `x-api-key` header.
- **Isolation between web pages and the extension.** The content script's panel lives in a closed shadow root. Only trusted clicks can start a paid re-run, and the service worker accepts tab-specific commands from a content script only for that script's own tab.
- **Rendering of model output.** All model text is inserted as text, never as HTML.

Known platform limitation: like all extension storage, `chrome.storage.local` isn't encrypted on disk. Anyone with access to the user's operating-system account can read it.
