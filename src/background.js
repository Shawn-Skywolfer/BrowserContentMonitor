const DEFAULT_SETTINGS = {
  keywords: [],
  intervalMinutes: 3,
  titleSelectors: [
    'a[href*="thread"]',
    'a[href*="topic"]',
    '.thread-title',
    '.topic-title',
    'h1 a',
    'h2 a',
    'h3 a'
  ],
  caseSensitive: false,
  wholeWord: false,
  notifyOnEveryScan: false
};

const ALARM_NAME = 'forum-keyword-monitor-refresh';
const MAX_SEEN_MATCHES = 500;

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.sync.get('settings');
  if (!settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) {
    return;
  }
  await refreshMonitoredTab();
});


chrome.notifications.onClicked.addListener(async () => {
  const { monitor } = await chrome.storage.local.get('monitor');
  if (!monitor?.tabId) {
    return;
  }

  try {
    const tab = await chrome.tabs.get(monitor.tabId);
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    await chrome.tabs.update(monitor.tabId, { active: true });
  } catch (_error) {
    // The tab may have been closed before the notification was clicked.
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { monitor } = await chrome.storage.local.get('monitor');
  if (monitor?.active && monitor.tabId === tabId) {
    await stopMonitor('The monitored tab was closed.');
  }
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'GET_STATE':
      return getState(sender.tab?.id);
    case 'SAVE_SETTINGS':
      return saveSettings(message.settings);
    case 'START_MONITOR':
      return startMonitor(message.tabId ?? sender.tab?.id);
    case 'STOP_MONITOR':
      return stopMonitor('Monitoring stopped.');
    case 'SCAN_RESULTS':
      return handleScanResults(message, sender.tab?.id);
    default:
      return { ok: false, error: 'Unknown message type.' };
  }
}

async function getState(requestingTabId = null) {
  const [{ settings }, { monitor }] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get('monitor')
  ]);
  return {
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    monitor: monitor ?? { active: false },
    isMonitoredTab: Boolean(monitor?.active && requestingTabId && monitor.tabId === requestingTabId)
  };
}

async function saveSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set({ settings: normalized });

  const { monitor } = await chrome.storage.local.get('monitor');
  if (monitor?.active) {
    await scheduleAlarm(normalized.intervalMinutes);
  }

  return { ok: true, settings: normalized };
}

function normalizeSettings(settings) {
  const keywords = normalizeList(settings.keywords);
  const titleSelectors = normalizeList(settings.titleSelectors);
  const intervalMinutes = Number(settings.intervalMinutes);

  return {
    keywords,
    titleSelectors: titleSelectors.length ? titleSelectors : DEFAULT_SETTINGS.titleSelectors,
    intervalMinutes: Number.isFinite(intervalMinutes) ? Math.min(Math.max(intervalMinutes, 1), 1440) : DEFAULT_SETTINGS.intervalMinutes,
    caseSensitive: Boolean(settings.caseSensitive),
    wholeWord: Boolean(settings.wholeWord),
    notifyOnEveryScan: Boolean(settings.notifyOnEveryScan)
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  return String(value ?? '')
    .split(/\r?\n|,/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function startMonitor(tabId) {
  if (!tabId) {
    return { ok: false, error: 'No active tab is available to monitor.' };
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !/^https?:/u.test(tab.url)) {
    return { ok: false, error: 'Please open an HTTP or HTTPS forum page before starting the monitor.' };
  }

  const { settings } = await getState();
  const monitor = {
    active: true,
    tabId,
    url: tab.url,
    title: tab.title ?? tab.url,
    startedAt: Date.now(),
    lastRefreshAt: null,
    lastScanAt: null,
    lastMatchCount: 0,
    lastMatches: [],
    seenKeys: [],
    statusMessage: 'Monitoring started.'
  };

  await chrome.storage.local.set({ monitor });
  await scheduleAlarm(settings.intervalMinutes);
  await requestScan(tabId);
  return { ok: true, monitor };
}

async function scheduleAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes
  });
}

async function refreshMonitoredTab() {
  const { monitor } = await chrome.storage.local.get('monitor');
  if (!monitor?.active) {
    return;
  }

  try {
    await chrome.tabs.reload(monitor.tabId, { bypassCache: true });
    await chrome.storage.local.set({
      monitor: {
        ...monitor,
        lastRefreshAt: Date.now(),
        statusMessage: 'Refresh requested.'
      }
    });
  } catch (error) {
    await stopMonitor(`Monitoring stopped because the tab could not be refreshed: ${error.message}`);
  }
}

async function requestScan(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'RUN_SCAN' });
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/contentScript.js']
    });
    await chrome.tabs.sendMessage(tabId, { type: 'RUN_SCAN' });
  }
}

async function handleScanResults(message, senderTabId) {
  const [{ monitor }, { settings }] = await Promise.all([
    chrome.storage.local.get('monitor'),
    chrome.storage.sync.get('settings')
  ]);

  if (!monitor?.active || monitor.tabId !== senderTabId) {
    return { ok: true, ignored: true };
  }

  const normalizedSettings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const matches = Array.isArray(message.matches) ? message.matches : [];
  const previousSeen = new Set(monitor.seenKeys ?? []);
  const newMatches = matches.filter((match) => !previousSeen.has(match.key));
  const nextSeen = [...previousSeen, ...newMatches.map((match) => match.key)].slice(-MAX_SEEN_MATCHES);

  const updatedMonitor = {
    ...monitor,
    url: message.url ?? monitor.url,
    title: message.title ?? monitor.title,
    lastScanAt: Date.now(),
    lastMatchCount: matches.length,
    lastMatches: matches.slice(0, 20),
    seenKeys: nextSeen,
    statusMessage: matches.length ? `${matches.length} matching title(s) found.` : 'No matching titles found.'
  };
  await chrome.storage.local.set({ monitor: updatedMonitor });

  const shouldNotify = normalizedSettings.notifyOnEveryScan ? matches.length > 0 : newMatches.length > 0;
  if (shouldNotify) {
    await createNotification(normalizedSettings.notifyOnEveryScan ? matches : newMatches, updatedMonitor);
  }

  return { ok: true, matches: matches.length, newMatches: newMatches.length };
}

async function createNotification(matches, monitor) {
  const first = matches[0];
  const more = matches.length > 1 ? ` and ${matches.length - 1} more` : '';
  await chrome.notifications.create(`forum-keyword-monitor-${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon.svg'),
    title: `Forum keyword match${matches.length > 1 ? 'es' : ''}`,
    message: `Matched "${first.keyword}" in "${first.title}"${more}.`,
    contextMessage: monitor.title || monitor.url,
    priority: 2
  });
}

async function stopMonitor(statusMessage) {
  await chrome.alarms.clear(ALARM_NAME);
  const { monitor } = await chrome.storage.local.get('monitor');
  const stoppedMonitor = {
    ...(monitor ?? {}),
    active: false,
    statusMessage,
    stoppedAt: Date.now()
  };
  await chrome.storage.local.set({ monitor: stoppedMonitor });
  return { ok: true, monitor: stoppedMonitor };
}
