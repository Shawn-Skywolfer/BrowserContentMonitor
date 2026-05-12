(() => {
  if (window.__forumKeywordMonitorLoaded) {
    window.__forumKeywordMonitorRunScan?.();
    return;
  }
  window.__forumKeywordMonitorLoaded = true;

  const HIGHLIGHT_CLASS = 'forum-keyword-monitor-highlight';
  const STYLE_ID = 'forum-keyword-monitor-style';

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'RUN_SCAN') {
      return false;
    }

    runScan()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  window.__forumKeywordMonitorRunScan = runScan;
  runScan();

  async function runScan() {
    const { settings, monitor, isMonitoredTab } = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (!monitor?.active || !isMonitoredTab) {
      clearHighlights();
      return { matches: [] };
    }

    const keywords = settings.keywords ?? [];
    if (!keywords.length) {
      clearHighlights();
      await chrome.runtime.sendMessage({
        type: 'SCAN_RESULTS',
        matches: [],
        url: location.href,
        title: document.title
      });
      return { matches: [] };
    }

    ensureStyle();
    clearHighlights();

    const candidates = collectTitleCandidates(settings.titleSelectors ?? []);
    const matches = [];

    for (const element of candidates) {
      const text = normalizeWhitespace(element.textContent);
      if (!text) {
        continue;
      }

      const keyword = findMatchingKeyword(text, keywords, settings);
      if (!keyword) {
        continue;
      }

      element.classList.add(HIGHLIGHT_CLASS);
      element.setAttribute('data-forum-keyword-monitor-keyword', keyword);
      matches.push({
        title: text,
        keyword,
        href: element.href || element.closest('a')?.href || location.href,
        key: buildMatchKey(text, element.href || element.closest('a')?.href || location.href, keyword)
      });
    }

    await chrome.runtime.sendMessage({
      type: 'SCAN_RESULTS',
      matches,
      url: location.href,
      title: document.title
    });

    return { matches };
  }

  function collectTitleCandidates(selectors) {
    const elements = new Set();
    const selectorList = selectors.length ? selectors : ['a', 'h1', 'h2', 'h3'];

    for (const selector of selectorList) {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (isVisible(element) && normalizeWhitespace(element.textContent).length >= 2) {
            elements.add(element);
          }
        });
      } catch (error) {
        console.warn(`Forum Keyword Monitor ignored invalid selector "${selector}"`, error);
      }
    }

    if (elements.size === 0) {
      document.querySelectorAll('a, h1, h2, h3').forEach((element) => {
        if (isVisible(element) && normalizeWhitespace(element.textContent).length >= 2) {
          elements.add(element);
        }
      });
    }

    return [...elements];
  }

  function findMatchingKeyword(text, keywords, settings) {
    const haystack = settings.caseSensitive ? text : text.toLocaleLowerCase();

    return keywords.find((rawKeyword) => {
      const keyword = String(rawKeyword).trim();
      if (!keyword) {
        return false;
      }

      const needle = settings.caseSensitive ? keyword : keyword.toLocaleLowerCase();
      if (!settings.wholeWord) {
        return haystack.includes(needle);
      }

      const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const flags = settings.caseSensitive ? 'u' : 'iu';
      return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedNeedle}($|[^\\p{L}\\p{N}_])`, flags).test(text);
    });
  }

  function buildMatchKey(title, href, keyword) {
    return `${keyword}\n${href}\n${title}`.slice(0, 1000);
  }

  function normalizeWhitespace(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background: #000 !important;
        color: #fff !important;
        filter: invert(1) hue-rotate(180deg) contrast(1.25) !important;
        outline: 3px solid #facc15 !important;
        outline-offset: 2px !important;
        border-radius: 3px !important;
      }
      .${HIGHLIGHT_CLASS} * {
        color: inherit !important;
      }
      .${HIGHLIGHT_CLASS}::after {
        content: " keyword match";
        margin-left: .5em;
        border-radius: 999px;
        padding: .15em .45em;
        background: #facc15;
        color: #111827;
        filter: invert(1) hue-rotate(180deg);
        font: 700 11px/1 system-ui, sans-serif;
        vertical-align: middle;
      }
    `;
    document.documentElement.append(style);
  }

  function clearHighlights() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
      element.classList.remove(HIGHLIGHT_CLASS);
      element.removeAttribute('data-forum-keyword-monitor-keyword');
    });
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
})();
