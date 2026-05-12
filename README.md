# Forum Keyword Monitor

Forum Keyword Monitor is a Chrome Manifest V3 extension that keeps watching one forum tab in the background. It periodically refreshes the tab you choose, scans visible post-title elements for your keywords, highlights matching titles with an inverse high-contrast style, and sends a browser notification when new matching titles appear.

## Features

- Monitor the forum tab where you click **Start monitoring**, even after you switch to another tab.
- Refresh the monitored tab on a configurable interval from 1 to 1440 minutes.
- Match one or more keywords, entered one per line or comma-separated.
- Highlight every matching post title on the page with a high-contrast inverse style.
- Send Chrome notifications when newly matched titles are found.
- Configure CSS selectors for forums with custom post-title markup.
- Optional case-sensitive matching, whole-word matching, and repeated notifications on every scan.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Pin **Forum Keyword Monitor** from the extension menu if desired.


## Downloadable zip package

Run the packaging script to create a Chrome-loadable zip file:

```bash
./scripts/build-zip.sh
```

The generated file is written to `dist/forum-keyword-monitor-<version>.zip`. To install it manually, unzip the package to a folder, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the unzipped folder.

## Downloadable CRX package

Run the CRX packaging script to create a signed CRX3 file:

```bash
./scripts/build-crx.sh
```

The generated file is written to `dist/forum-keyword-monitor-<version>.crx`. The script creates `dist/forum-keyword-monitor.pem` on first run and reuses it later so the extension ID stays stable. Keep that private key safe; passing another key path as the first argument builds with that key instead.

Chrome commonly requires **Developer mode** for local CRX installs. If Chrome refuses a local CRX, use the unpacked or zip workflow above.

## Public release download

When this repository is hosted on GitHub, maintainers can publish a public zip download by either pushing a version tag such as `v0.1.0` or running the **Publish extension zip** workflow manually. The workflow builds `dist/forum-keyword-monitor-<version>.zip` and attaches it to a GitHub Release, producing a direct release-asset download link.

## Usage

1. Open the forum page you want to monitor.
2. Click the extension icon.
3. Enter the keywords you care about.
4. Choose a refresh interval.
5. Click **开始监控当前页**.
6. You may switch to another tab. The extension will continue refreshing the chosen forum tab in the background.

When matching titles are found, the extension highlights them directly on the monitored page and creates a Chrome notification. By default, notifications are de-duplicated so the same title/link/keyword combination only notifies once per monitoring session.

## Advanced selector setup

The extension scans elements that look like forum topic titles. The default selectors include common thread/topic links and headings. If a forum uses special markup, open **高级设置** and add CSS selectors that point exactly at the title elements.

Examples:

```css
.thread-title a
tbody[id^="normalthread"] a.s.xst
.topic-list .subject a
h3 a
```

## Project structure

```text
manifest.json          Chrome extension manifest
src/background.js      Monitor state, alarms, tab refreshes, notifications
src/contentScript.js   Page scanning, keyword matching, highlighting
src/popup.html/js      Quick start/stop UI
src/options.html/js    Advanced settings UI
src/shared.css         Shared popup/options styles
icons/icon.svg         Text-based notification icon source
scripts/build-zip.sh    Creates dist/forum-keyword-monitor-<version>.zip
scripts/build-crx.sh    Creates signed dist/forum-keyword-monitor-<version>.crx
.github/workflows/release.yml Publishes the zip as a GitHub Release asset
```

## Limitations

- Chrome must be running for scheduled refreshes and notifications to happen.
- The monitored tab must stay open. Closing it stops monitoring.
- Some forums require login or anti-bot checks; this extension refreshes the existing tab and does not bypass site protections.
- Background refreshes use Chrome's extension APIs and may be throttled by browser or OS power-saving policies.
- The repository intentionally avoids committed binary assets; Chrome will use its generic toolbar icon unless you add PNG manifest icons locally.
