# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-12

First public release.

### Added
- MIT license, security policy, contributing guide (with an AI-use policy), support guide.
- Unit tests (`npm test`, Node's built-in runner) and a GitHub Actions workflow with pinned actions and read-only permissions.
- Screen-reader announcements for analysis progress and results.
- Keyboard support for the details tooltip: focus moves into it, Tab stays inside it, and Escape returns to the highlight or results-list item that opened it.

### Changed
- Requests to Claude time out after 90 seconds without a response, or 45 seconds without new data, and retry once.
- The Settings page reflows at narrow widths. Result-list focus is clearly visible, family filter chips meet the 24-pixel minimum target size, and the spinner respects reduced-motion settings.
- The privacy statement now says that the page title and web address are sent along with the text.

### Removed
- The Settings "API endpoint" option. The extension now talks only to `api.anthropic.com`.
- The Settings test bench and its sample data.

### Security
- The results panel uses a closed shadow root, and only trusted clicks can start a paid re-run. Re-runs from the page panel are limited to one every 5 seconds per tab.
- The API key is restricted so code running inside web pages can't read it (`chrome.storage.local` access level set to trusted contexts).
- A Content Security Policy limits the extension's network access to `api.anthropic.com`.
- Content-script messages can act only on their own tab.
- Model-supplied labels can't match built-in object properties.

## [0.2.0] - 2026-10-08

### Changed
- Context never excuses a fallacy. Quotations, comments, ads, satire, hypotheticals and teaching examples are all checked, and the tooltip says whose reasoning it is.
- Selected text shows every finding Claude reports (≥ 0.35 confidence).
- Up to 25 findings per part of a page.
- The catalog adds "Moral equivalence", widens "Begging the question" and "Bandwagon", and recognises common alternative names (either/or, circular argument, ad populum).

### Added
- Claude's one-line reason is shown when nothing is found. Text-only replies are retried once, then reported as a warning.

## [0.1.0] - 2026-10-03

### Added
- First version: on-demand page and selection checks, the Claude engine with a local pattern fallback, highlights with explanations and counter-questions, results panel, settings, context menu and keyboard shortcuts.

