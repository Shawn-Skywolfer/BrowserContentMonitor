const formFields = {
  keywords: document.getElementById('keywords'),
  titleSelectors: document.getElementById('titleSelectors'),
  intervalMinutes: document.getElementById('intervalMinutes'),
  caseSensitive: document.getElementById('caseSensitive'),
  wholeWord: document.getElementById('wholeWord'),
  notifyOnEveryScan: document.getElementById('notifyOnEveryScan')
};
const saveButton = document.getElementById('saveButton');
const statusBox = document.getElementById('status');

loadSettings();
saveButton.addEventListener('click', saveSettings);

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (!response.ok) {
    showStatus(response.error, true);
    return;
  }

  const settings = response.settings;
  formFields.keywords.value = settings.keywords.join('\n');
  formFields.titleSelectors.value = settings.titleSelectors.join('\n');
  formFields.intervalMinutes.value = settings.intervalMinutes;
  formFields.caseSensitive.checked = settings.caseSensitive;
  formFields.wholeWord.checked = settings.wholeWord;
  formFields.notifyOnEveryScan.checked = settings.notifyOnEveryScan;
  showStatus('设置已加载。');
}

async function saveSettings() {
  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings: {
      keywords: formFields.keywords.value,
      titleSelectors: formFields.titleSelectors.value,
      intervalMinutes: formFields.intervalMinutes.value,
      caseSensitive: formFields.caseSensitive.checked,
      wholeWord: formFields.wholeWord.checked,
      notifyOnEveryScan: formFields.notifyOnEveryScan.checked
    }
  });

  if (!response.ok) {
    showStatus(response.error, true);
    return;
  }

  showStatus('设置已保存。正在监控时，新刷新间隔会自动生效。');
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('error', isError);
}
