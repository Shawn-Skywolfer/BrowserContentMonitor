const keywordsInput = document.getElementById('keywords');
const intervalInput = document.getElementById('intervalMinutes');
const caseSensitiveInput = document.getElementById('caseSensitive');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const optionsButton = document.getElementById('optionsButton');
const statusBox = document.getElementById('status');
const matchesBox = document.getElementById('matches');

let currentSettings = null;

init();

startButton.addEventListener('click', async () => {
  await saveCurrentSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({ type: 'START_MONITOR', tabId: tab?.id });
  if (!response.ok) {
    showStatus(response.error, true);
    return;
  }
  await renderState();
});

stopButton.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'STOP_MONITOR' });
  if (!response.ok) {
    showStatus(response.error, true);
    return;
  }
  await renderState();
});

optionsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

async function init() {
  await renderState();
}

async function renderState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (!response.ok) {
    showStatus(response.error, true);
    return;
  }

  currentSettings = response.settings;
  keywordsInput.value = currentSettings.keywords.join('\n');
  intervalInput.value = currentSettings.intervalMinutes;
  caseSensitiveInput.checked = currentSettings.caseSensitive;

  const monitor = response.monitor;
  stopButton.disabled = !monitor.active;
  startButton.disabled = false;

  if (monitor.active) {
    showStatus(`正在后台监控：${monitor.title || monitor.url}\n上次结果：${monitor.statusMessage || '等待扫描。'}`);
  } else {
    showStatus(monitor.statusMessage || '未开始监控。');
  }

  renderMatches(monitor.lastMatches ?? []);
}

async function saveCurrentSettings() {
  const settings = {
    ...currentSettings,
    keywords: keywordsInput.value,
    intervalMinutes: intervalInput.value,
    caseSensitive: caseSensitiveInput.checked
  };
  const response = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  if (!response.ok) {
    throw new Error(response.error);
  }
  currentSettings = response.settings;
}

function renderMatches(matches) {
  if (!matches.length) {
    matchesBox.textContent = '暂无匹配记录。';
    return;
  }

  const items = matches
    .slice(0, 5)
    .map((match) => `<li title="${escapeHtml(match.title)}">${escapeHtml(match.keyword)}：${escapeHtml(match.title)}</li>`)
    .join('');
  matchesBox.innerHTML = `<strong>最近匹配：</strong><ul>${items}</ul>`;
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('error', isError);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
