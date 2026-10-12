# Contributing

Thanks for helping. Bug reports, clearer explanations, catalog improvements, accessibility fixes and test cases are all welcome.

## Development setup

There's no build step and there are no runtime dependencies.

1. Clone the repository.
2. In `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the repository folder.
3. After editing, click the reload icon on the extension's card and reload the page you're testing.

To try the Claude engine you need your own Anthropic API key. Please don't commit keys, screenshots showing keys, or Chrome profile files.

## Running tests

```
npm test
```

This runs Node's built-in test runner (Node 20 or later) over `tests/*.test.mjs`. The tests stub the network, so they need no API key and make no paid calls.

## Style

- Plain modern JavaScript (ES modules in the service worker and settings pages; a classic script for the content script). No frameworks or bundlers.
- Insert model output with `textContent` only, never `innerHTML`.
- Keep the permission set minimal. Discuss any new permission or host in an issue first.

## Pull requests

- For large changes, open an issue first.
- Keep pull requests focused, and describe what changed and why.
- Make sure `npm test` passes, and add a test for behaviour you change.
- Update `CHANGELOG.md` under **Unreleased**.

## Use of AI tools

AI-assisted contributions are welcome under these conditions:

- Say in the pull request which tools you used and for what (for example, "drafted tests with an AI assistant").
- You're responsible for the contribution: you have reviewed, understood and tested all of it.
- Don't submit generated content you couldn't explain or defend in review.

This project itself was built with AI assistance; see the README.
