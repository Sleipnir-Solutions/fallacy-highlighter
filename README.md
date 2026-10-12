# Fallacy Highlighter

A Chrome extension that highlights possible logical fallacies on the page you're reading, explains what's missing in the reasoning, and suggests a question to ask.

Arguments online often lean on moves that feel convincing but don't hold up: attacking the person, offering only two options, treating popularity as proof. Fallacy Highlighter marks those passages in place, names the fallacy family first and the specific fallacy second, and leaves the judgment to you. A flawed argument doesn't make its conclusion false, and every highlight says so.

**Status:** experimental (v0.3.0). Load-unpacked only; not published on the Chrome Web Store. Detection quality depends on the Claude model you choose and hasn't been formally evaluated.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the folder that contains `manifest.json`.
4. The Settings page opens. Paste a Claude API key from <https://console.anthropic.com/settings/keys> and click **Test key**. Settings save automatically. Without a key, the extension uses its built-in pattern matching instead (see below).
5. Pin the extension (puzzle-piece menu → pin) so the button is always visible.

After changing any file, click the reload icon on the extension's card in `chrome://extensions`, then reload the page you're testing.

## Usage

| How | What it does |
| --- | --- |
| Toolbar button → **Analyze this page** | Checks the readable text on the page |
| Toolbar button → **Analyze selected text** | Checks only what you've selected |
| Right-click → *Check this page / selected text for logical fallacies* | Same, from the context menu |
| `Alt+Shift+F` / `Alt+Shift+S` | Page / selection (change at `chrome://extensions/shortcuts`) |

Results appear in a panel at the bottom right. Hover over or click a highlight, or Tab to it and press Enter, for the explanation, a counter-question and a counter-move. Click a list item to scroll to it. Click a family chip to hide that family. **Dismiss** removes a highlight you disagree with. The toolbar badge shows the count for the tab.

Highlight colors: red = relevance, amber = presumption / weak induction, teal = ambiguity, violet = formal. A solid underline means medium or high confidence; a dashed underline means low confidence.

## How detection works

- **Claude (recommended).** Page text is split into parts of about 12,000 characters. Each part goes to Anthropic's Messages API with a prompt built around a 37-entry fallacy catalog, and highlights appear as each part finishes.
  - Context never excuses a fallacy. Quotations, reader comments, ads, satire, hypotheticals and examples on pages that teach fallacies are all checked, and the tooltip says whose reasoning it is.
  - Text that isn't a fallacy at all is left alone: abstract definitions, bare opinions, and sound uses of a pattern (such as citing a real expert consensus).
  - Default model: `claude-sonnet-5-5`. You can also pick Haiku 4.5 (cheaper) or Opus 5.5, or load every model your key can use with **Test key**.
  - The panel shows token use and an approximate cost. A typical long article costs a few cents on Sonnet.
- **Local pattern cues.** About 55 phrase patterns, such as "prove me wrong", "millions of people can't be wrong" and "no true X would". They run entirely in the browser and only match wording, so they miss most fallacies and can misfire. They're labelled *pattern cue* in the tooltip.
- **Auto** (default) uses Claude when a key is set and falls back to local cues if there's no key or the API call fails.

**Sensitivity** sets how confident a finding must be to show on a whole-page check: Fewer flags (≥ 0.70), Balanced (≥ 0.50), or More flags (≥ 0.30). **Analyze selected text** shows everything Claude reports (≥ 0.35), since you asked about that text specifically.

**Empty and failed results:**
- When nothing is found, the panel shows Claude's one-line reason.
- If Claude answers without structured results, the extension asks once more, then shows a warning instead of a silent "0".
- Requests time out if Claude doesn't respond within 90 seconds, or stops sending its answer for 45 seconds.

## Data and privacy

- **Nothing runs until you ask.** Nothing is read or sent until you start an analysis.
- **Access is limited to that tab.** The extension uses `activeTab`, so it can only touch the tab you invoke it on, and it has no standing access to any site.
- **What goes to Anthropic.** When Claude is used, the visible text of the page (or your selection), plus the page title and web address, is sent to `api.anthropic.com` under your API key.
- **Nowhere else.** The extension's Content Security Policy allows no other network destination.
- **What isn't sent.** Password fields, text boxes and editable areas are never read.
- **How the key is stored.** The key is kept in `chrome.storage.local` in your browser profile. It isn't synced, and it's restricted so scripts running inside web pages can't read it. Like all extension storage, it isn't encrypted on disk.
  - Use a key from its own Anthropic Console workspace, with a monthly spend limit.
  - Rotate the key if your computer or browser profile is ever compromised.

## Known limitations

- Fallacy labels are judgment calls. Even trained human annotators disagree on the specific name (MAFALDA benchmark, NAACL 2024), so treat highlights as prompts to look closer.
- Single-page apps that re-render text (some social feeds) can drop highlights. Click **Re-run** after scrolling or loading more.
- The extension can't run on `chrome://` pages, the Chrome Web Store, or Chrome's built-in PDF viewer.
- It reads only the top frame. Text inside iframes, such as some embedded comment widgets, is skipped.
- Very long pages are capped at 50,000 characters by default; change this in Settings.

## Roadmap

- Evaluate accuracy on live pages and public fallacy datasets.
- A per-site "auto-analyze" allow-list and a side-panel history view.
- Optional local tally of dismissed highlights to estimate the false-positive rate.

## Project layout

```
manifest.json                MV3 manifest (activeTab, scripting, storage, contextMenus; CSP limits network to api.anthropic.com)
src/taxonomy.js              Fallacy catalog (37 entries, 4 families), colors, prices, defaults
src/background.js            Service worker: injection, engine choice, streaming, badge
src/engines/claude.js        Prompt, tool schema, streaming, retries, timeouts, chunking, cost
src/engines/local.js         Phrase-pattern scanner
src/content/content.js       Text extraction, quote-to-page matching, highlights, tooltip, panel
src/content/content.css      Highlight styles (panel and tooltip live in a closed shadow root)
src/popup/*                  Toolbar popup
src/options/*                Settings page
icons/*                      16/32/48/128 px icons
tests/*.test.mjs             Unit tests (Node's built-in test runner; no dependencies)
```

## Development

There's no build step and there are no dependencies. To run the tests (Node 20 or later):

```
npm test
```

GitHub Actions runs the same tests on every push and pull request.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security problems privately as described in [SECURITY.md](SECURITY.md).

## AI-assisted development

This extension was designed and written with substantial help from Anthropic's Claude, used in the Claude desktop app's Cowork mode, and reviewed and tested by the maintainer. The fallacy catalog paraphrases standard references (the Internet Encyclopedia of Philosophy, the Purdue OWL and UNC's Writing Center) rather than quoting them.

## License

MIT. See [LICENSE](LICENSE).

## Support

See [SUPPORT.md](SUPPORT.md).
