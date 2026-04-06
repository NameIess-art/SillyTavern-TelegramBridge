import { getRequestHeaders } from '../../../../script.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';

const MODULE_NAME = 'third-party/telegram-bridge';
const API_BASE = '/api/plugins/telegram-bridge';

let availableChats = [];

function splitChatIds(value) {
    return [...new Set(String(value ?? '')
        .split(/[\s,]+/)
        .map(id => id.trim())
        .filter(Boolean))];
}

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
    $('#tg_bridge_save, #tg_bridge_reload, #tg_bridge_reset_history, #tg_bridge_refresh_chats, #tg_bridge_add_mapping').toggleClass('disabled', isBusy);
    $('#tg_bridge_mappings .telegram-bridge-remove-mapping').toggleClass('disabled', isBusy);
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
        $('#tg_bridge_selected_meta').text('No default SillyTavern chat selected.');
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

function updateMappingRowMeta(row) {
    const chatId = String(row.find('.telegram-bridge-chat-id').val() ?? '').trim();
    const selectedChat = getSelectedChatFromValue(row.find('.telegram-bridge-chat-select').val());
    const meta = row.find('.telegram-bridge-mapping-meta');

    if (!chatId && !selectedChat.avatarUrl) {
        meta.text('Telegram chats without a mapping use the default chat.');
        return;
    }

    if (!selectedChat.avatarUrl || !selectedChat.chatFile) {
        meta.text('This Telegram Chat ID has no linked SillyTavern chat yet.');
        return;
    }

    const chat = availableChats.find(item => item.avatarUrl === selectedChat.avatarUrl && item.chatFile === selectedChat.chatFile);
    const chatName = chat?.characterName || selectedChat.avatarUrl;
    meta.text(`Telegram Chat ID ${chatId || '(unset)'} -> ${chatName} / ${selectedChat.chatFile}`);
}

function createMappingRow(chatId = '', selectedChat = null) {
    const row = $(`
        <div class="telegram-bridge-mapping-row">
            <div class="telegram-bridge-mapping-grid">
                <div>
                    <label>Telegram Chat ID</label>
                    <input class="telegram-bridge-chat-id text_pole" type="text" placeholder="123456789" />
                </div>
                <div>
                    <label>Linked SillyTavern Chat</label>
                    <select class="telegram-bridge-chat-select text_pole"></select>
                </div>
                <div>
                    <div class="telegram-bridge-remove-mapping menu_button menu_button_icon" title="Remove mapping">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                </div>
            </div>
            <div class="telegram-bridge-mapping-meta"></div>
        </div>
    `);

    row.find('.telegram-bridge-chat-id').val(chatId);
    appendChatOptions(row.find('.telegram-bridge-chat-select'), selectedChat);
    updateMappingRowMeta(row);

    row.find('.telegram-bridge-chat-id').on('input', () => updateMappingRowMeta(row));
    row.find('.telegram-bridge-chat-select').on('change', () => updateMappingRowMeta(row));
    row.find('.telegram-bridge-remove-mapping').on('click', () => {
        row.remove();
        ensureAtLeastOneEmptyMappingRow();
    });

    return row;
}

function ensureAtLeastOneEmptyMappingRow() {
    if ($('#tg_bridge_mappings .telegram-bridge-mapping-row').length === 0) {
        $('#tg_bridge_mappings').append(createMappingRow());
    }
}

function populateMappings(chatMappings = {}) {
    const container = $('#tg_bridge_mappings');
    container.empty();

    const entries = Object.entries(chatMappings || {}).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) {
        container.append(createMappingRow());
        return;
    }

    for (const [chatId, selectedChat] of entries) {
        container.append(createMappingRow(chatId, selectedChat));
    }
}

function readMappingsFromForm() {
    const mappings = {};

    $('#tg_bridge_mappings .telegram-bridge-mapping-row').each((_, element) => {
        const row = $(element);
        const chatId = String(row.find('.telegram-bridge-chat-id').val() ?? '').trim();
        const selectedChat = getSelectedChatFromValue(row.find('.telegram-bridge-chat-select').val());

        if (!chatId || !selectedChat.avatarUrl || !selectedChat.chatFile) {
            return;
        }

        mappings[chatId] = selectedChat;
    });

    return mappings;
}

function populateDefaultChat(selectedChat) {
    appendChatOptions($('#tg_bridge_chat_select'), selectedChat);
    updateSelectedChatMeta();
}

function populateForm(config) {
    $('#tg_bridge_enabled').prop('checked', !!config.enabled);
    $('#tg_bridge_bot_token').val(String(config.botToken ?? ''));
    $('#tg_bridge_allow_all').prop('checked', !!config.allowAllChats);
    $('#tg_bridge_chat_ids').val(Array.isArray(config.authorizedChatIds) ? config.authorizedChatIds.join('\n') : '');
    populateDefaultChat(config.selectedChat);
    populateMappings(config.chatMappings);
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
            chatMappings: chatsPayload.chatMappings || config.chatMappings || {},
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
            authorizedChatIds: splitChatIds($('#tg_bridge_chat_ids').val()),
            selectedChat: getSelectedChatFromValue($('#tg_bridge_chat_select').val()),
            chatMappings: readMappingsFromForm(),
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
        const chatIds = splitChatIds($('#tg_bridge_chat_ids').val());
        const payload = chatIds.length > 0 ? { chatId: chatIds[0] } : {};
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
    $('#tg_bridge_add_mapping').on('click', () => {
        $('#tg_bridge_mappings').append(createMappingRow());
    });
    $('#tg_bridge_save').on('click', onSaveClick);
    $('#tg_bridge_reload').on('click', loadBridgeState);
    $('#tg_bridge_reset_history').on('click', onResetClick);
    $('#tg_bridge_refresh_chats').on('click', loadBridgeState);

    await loadBridgeState();
});
