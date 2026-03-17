const settingConfigs = {
    'botName': { type: 'text', label: '두레이 알림 봇 이름' },
    'doorayUrl': { type: 'text', label: '두레이 연동 URL' },
    'textTemplate': { type: 'text', label: '알림 메시지 템플릿' },
    'menuAlarmEnabled': { type: 'boolean', label: '점심/저녁 메뉴 알림(12시, 18시30분)' },
    'packedOnly': { type: 'boolean', label: '도시락만 표시(알림 포함)' },
};

document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save');

    // 설정 필드 생성
    for (const [key, config] of Object.entries(settingConfigs)) {
        addSettingField(key, config);
    }

    // 저장된 설정 불러오기
    chrome.storage.local.get(null, (items) => {
        for (const [key, value] of Object.entries(items)) {
            if (settingConfigs[key]) {
                setFieldValue(key, value);
            }
        }
    });

    saveButton.addEventListener('click', saveSettings);
});

function addSettingField(key = '', config = {}) {
    const settingsDiv = document.getElementById('settings');
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'setting-item';

    let inputHtml;
    switch (config.type) {
        case 'boolean':
            inputHtml = `<div class="checkbox-wrapper"><input type="checkbox" id="${key}" name="${key}"></div>`;
            break;
        case 'number':
            inputHtml = `<input type="number" id="${key}" name="${key}">`;
            break;
        case 'text':
        default:
            inputHtml = `<input type="text" id="${key}" name="${key}">`;
            break;
    }

    fieldDiv.innerHTML = `
        <label for="${key}">${config.label}:</label>
        ${inputHtml}
    `;
    settingsDiv.appendChild(fieldDiv);
}

function setFieldValue(key, value) {
    const field = document.getElementById(key);
    if (field) {
        if (settingConfigs[key].type === 'boolean') {
            field.checked = value;
        } else {
            field.value = value;
        }
    }
}


function saveSettings() {
    const settings = {};
    for (const [key, config] of Object.entries(settingConfigs)) {
        const field = document.getElementById(key);
        if (field) {
            settings[key] = config.type === 'boolean' ? field.checked : field.value;
        }
    }

    chrome.storage.local.set(settings, () => {
        alert('Settings saved!');
    });
}
