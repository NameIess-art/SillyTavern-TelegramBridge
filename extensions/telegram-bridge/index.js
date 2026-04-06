import { getRequestHeaders } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';

const MODULE_NAME = 'third-party/telegram-bridge';
const API_BASE = '/api/plugins/telegram-bridge';

let availableChats = [];

function makeChatValue(selectedChat) {
    if (!selectedChat?.avatarUrl || !selectedChat?.chatFile) {
        return '';
    }

    return `${selectedChat.avatarUrl}::${selectedChat.chatFile}`;
}

function getChatByValue(value) {
    return availableChats.find(item => makeChatValue(item) === String(value ?? '')) || null;
}

function getSelectedChatFromValue(value) {
    const chat = getChatByValue(value);
    return chat
        ? {
            avatarUrl: String(chat.avatarUrl ?? ''),
            chatFile: String(chat.chatFile ?? ''),
        }
        : {
            avatarUrl: '',
            chatFile: '',
        };
}

function setBusy(isBusy) {
    $('#tg_bridge_save, #tg_bridge_reload, #tg_bridge_reset_history, #tg_bridge_refresh_chats').toggleClass('disabled', isBusy);
}

function setStatus(status) {
    const badge = $('#tg_bridge_status_badge');
    const runtimeText = status?.runtime
        ? `${status.runtime.source} / ${status.runtime.model}`
        : (status?.runtimeError || 'No runtime available');

    badge
        .text(status?.running ? 'Running' : 'Stopped')
        .toggleClass('is-running', !!status?.running)
        .toggleClass('is-stopped', !status?.running);

    $('#tg_bridge_runtime').text(runtimeText);

    const errorText = String(status?.lastError || status?.runtimeError || '').trim();
    $('#tg_bridge_last_error')
        .text(errorText)
        .toggleClass('displayNone', !errorText);
}

function formatChatLabel(chat) {
    const updatedAt = chat?.updatedAt ? new Date(chat.updatedAt).toLocaleString() : 'Unknown time';
    const characterName = String(chat?.characterName || chat?.avatarUrl || 'Chat');
    return `${characterName} | ${chat.chatFile} | ${updatedAt}`;
}

function appendChatOptions(select, selectedChat = null) {
    const selectedValue = makeChatValue(selectedChat);
    select.empty();
    select.append('<option value="">No chat selected</option>');

    for (const chat of availableChats) {
        const option = $('<option></option>')
            .val(makeChatValue(chat))
            .text(formatChatLabel(chat));
        select.append(option);
    }

    if (selectedValue && !availableChats.some(chat => makeChatValue(chat) === selectedValue)) {
        const missingOption = $('<option></option>')
            .val(selectedValue)
            .text(`[Missing] ${selectedChat.avatarUrl} / ${selectedChat.chatFile}`);
        select.append(missingOption);
    }

    select.val(selectedValue);
}

function updateSelectedChatMeta() {
    const selected = getSelectedChatFromValue($('#tg_bridge_chat_select').val());
    if (!selected.avatarUrl || !selected.chatFile) {
        $('#tg_bridge_selected_meta').text('No SillyTavern chat selected. You can also switch later with /bind inside Telegram.');
        return;
    }

    const chat = availableChats.find(item => item.avatarUrl === selected.avatarUrl && item.chatFile === selected.chatFile);
    if (!chat) {
        $('#tg_bridge_selected_meta').text(`${selected.avatarUrl} / ${selected.chatFile}`);
        return;
    }

    const updatedAt = chat.updatedAt ? new Date(chat.updatedAt).toLocaleString() : 'Unknown time';
    $('#tg_bridge_selected_meta').text(`Character: ${chat.characterName} | Updated: ${updatedAt}`);
}

function populateForm(config) {
    $('#tg_bridge_enabled').prop('checked', !!config.enabled);
    $('#tg_bridge_bot_token').val(String(config.botToken ?? ''));
    $('#tg_bridge_allow_all').prop('checked', !!config.allowAllChats);
    $('#tg_bridge_chat_id').val(String(config.authorizedChatId ?? ''));
    appendChatOptions($('#tg_bridge_chat_select'), config.selectedChat);
    updateSelectedChatMeta();
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: options.method || 'GET',
        headers: {
            ...getRequestHeaders(),
            ...(options.headers || {}),
        },
        body: options.body,
    });

    const rawText = await response.text();
    let payload = {};

    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = { message: rawText };
        }
    }

    if (!response.ok) {
        throw new Error(String(payload?.error || payload?.message || `HTTP ${response.status}`));
    }

    return payload;
}

async function loadBridgeState() {
    setBusy(true);

    try {
        const [config, chatsPayload, status] = await Promise.all([
            apiRequest('/config'),
            apiRequest('/chats'),
            apiRequest('/status'),
        ]);

        availableChats = Array.isArray(chatsPayload.chats) ? chatsPayload.chats : [];
        populateForm({
            ...config,
            selectedChat: chatsPayload.selectedChat || config.selectedChat,
        });
        setStatus(status);
    } catch (error) {
        toastr.error(error.message || 'Failed to load Telegram bridge settings.', 'Telegram Bridge');
        setStatus({
            running: false,
            runtimeError: error.message || 'Failed to load Telegram bridge settings.',
        });
    } finally {
        setBusy(false);
    }
}

async function onSaveClick() {
    setBusy(true);

    try {
        const payload = {
            enabled: $('#tg_bridge_enabled').prop('checked'),
            botToken: String($('#tg_bridge_bot_token').val() ?? '').trim(),
            allowAllChats: $('#tg_bridge_allow_all').prop('checked'),
            authorizedChatId: String($('#tg_bridge_chat_id').val() ?? '').trim(),
            selectedChat: getSelectedChatFromValue($('#tg_bridge_chat_select').val()),
        };

        await apiRequest('/config', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        toastr.success('Telegram bridge settings saved.', 'Telegram Bridge');
        await loadBridgeState();
    } catch (error) {
        toastr.error(error.message || 'Failed to save Telegram bridge settings.', 'Telegram Bridge');
    } finally {
        setBusy(false);
    }
}

async function onResetClick() {
    setBusy(true);

    try {
        const chatId = String($('#tg_bridge_chat_id').val() ?? '').trim();
        const payload = chatId ? { chatId } : {};
        await apiRequest('/reset', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        toastr.success('Telegram bridge conversation state reset.', 'Telegram Bridge');
        await loadBridgeState();
    } catch (error) {
        toastr.error(error.message || 'Failed to reset bridge state.', 'Telegram Bridge');
    } finally {
        setBusy(false);
    }
}

jQuery(async () => {
    if ($('#telegram_bridge_settings').length) {
        return;
    }

    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    $('#extensions_settings2').append(html);

    $('#tg_bridge_chat_select').on('change', updateSelectedChatMeta);
    $('#tg_bridge_save').on('click', onSaveClick);
    $('#tg_bridge_reload').on('click', loadBridgeState);
    $('#tg_bridge_reset_history').on('click', onResetClick);
    $('#tg_bridge_refresh_chats').on('click', loadBridgeState);

    await loadBridgeState();
});
