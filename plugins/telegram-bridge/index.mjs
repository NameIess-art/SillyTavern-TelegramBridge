import fs from 'node:fs';
import path from 'node:path';

import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { DEFAULT_USER, SETTINGS_FILE } from '../../src/constants.js';
import { OPENROUTER_HEADERS, AIMLAPI_HEADERS } from '../../src/constants.js';
import { readSecret, SECRET_KEYS } from '../../src/endpoints/secrets.js';
import { getChatData, trySaveChat } from '../../src/endpoints/chats.js';
import { getUserDirectories } from '../../src/users.js';
import { trimTrailingSlash } from '../../src/util.js';

const PLUGIN_ID = 'telegram-bridge';
const TELEGRAM_API = 'https://api.telegram.org';
const STREAM_EDIT_INTERVAL_MS = 350;
const STREAM_MIN_DELTA_CHARS = 8;
const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    botToken: '',
    allowAllChats: false,
    authorizedChatId: '',
    userHandle: DEFAULT_USER.handle,
    historyLimit: 12,
    requestTimeoutMs: 120000,
    systemPrompt: 'You are replying from a SillyTavern Telegram bridge. Be helpful and stay consistent with the chat context.',
    replyPrefix: '',
    providerOverride: {
        source: '',
        baseUrl: '',
        apiKey: '',
        model: '',
    },
    selectedChat: {
        avatarUrl: '',
        chatFile: '',
    },
});
const DEFAULT_STATE = Object.freeze({
    offset: 0,
    conversations: {},
    updatedAt: '',
});

const SOURCE_CONFIG = Object.freeze({
    openai: {
        baseUrl: 'https://api.openai.com/v1',
        secretKey: SECRET_KEYS.OPENAI,
        modelSetting: 'openai_model',
        reverseProxy: true,
    },
    openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        secretKey: SECRET_KEYS.OPENROUTER,
        modelSetting: 'openrouter_model',
        headers: OPENROUTER_HEADERS,
    },
    custom: {
        baseUrlFromSettings: 'custom_url',
        secretKey: SECRET_KEYS.CUSTOM,
        modelSetting: 'custom_model',
    },
    deepseek: {
        baseUrl: 'https://api.deepseek.com/beta',
        secretKey: SECRET_KEYS.DEEPSEEK,
        modelSetting: 'deepseek_model',
    },
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        secretKey: SECRET_KEYS.GROQ,
        modelSetting: 'groq_model',
    },
    mistralai: {
        baseUrl: 'https://api.mistral.ai/v1',
        secretKey: SECRET_KEYS.MISTRALAI,
        modelSetting: 'mistralai_model',
    },
    xai: {
        baseUrl: 'https://api.x.ai/v1',
        secretKey: SECRET_KEYS.XAI,
        modelSetting: 'xai_model',
    },
    aimlapi: {
        baseUrl: 'https://api.aimlapi.com/v1',
        secretKey: SECRET_KEYS.AIMLAPI,
        modelSetting: 'aimlapi_model',
        headers: AIMLAPI_HEADERS,
    },
    moonshot: {
        baseUrl: 'https://api.moonshot.ai/v1',
        secretKey: SECRET_KEYS.MOONSHOT,
        modelSetting: 'moonshot_model',
        reverseProxy: true,
    },
    fireworks: {
        baseUrl: 'https://api.fireworks.ai/inference/v1',
        secretKey: SECRET_KEYS.FIREWORKS,
        modelSetting: 'fireworks_model',
    },
    siliconflow: {
        secretKey: SECRET_KEYS.SILICONFLOW,
        modelSetting: 'siliconflow_model',
        baseUrlResolver: (settings) => settings.siliconflow_endpoint === 'cn'
            ? 'https://api.siliconflow.cn/v1'
            : 'https://api.siliconflow.com/v1',
    },
    electronhub: {
        baseUrl: 'https://api.electronhub.ai/v1',
        secretKey: SECRET_KEYS.ELECTRONHUB,
        modelSetting: 'electronhub_model',
    },
    nanogpt: {
        baseUrl: 'https://nano-gpt.com/api/v1',
        secretKey: SECRET_KEYS.NANOGPT,
        modelSetting: 'nanogpt_model',
    },
});

function ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function toInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function compactObject(object) {
    return Object.fromEntries(
        Object.entries(object).filter(([, value]) => {
            if (value === undefined || value === null) {
                return false;
            }

            if (typeof value === 'number' && Number.isNaN(value)) {
                return false;
            }

            return true;
        }),
    );
}

function maskSecret(value) {
    if (!value) {
        return '';
    }

    if (value.length <= 8) {
        return '*'.repeat(8);
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isMaskedSecret(value) {
    return typeof value === 'string' && value.includes('...');
}

function normalizeChatId(chatId) {
    return String(chatId ?? '').trim();
}

function normalizeSelectedChat(selectedChat = {}) {
    return {
        avatarUrl: String(selectedChat?.avatarUrl ?? '').trim(),
        chatFile: String(selectedChat?.chatFile ?? '').trim(),
    };
}

function normalizeConfig(rawConfig = {}) {
    const providerOverride = typeof rawConfig.providerOverride === 'object' && rawConfig.providerOverride !== null
        ? rawConfig.providerOverride
        : {};
    const fallbackAuthorizedChatId = Array.isArray(rawConfig.authorizedChatIds)
        ? String(rawConfig.authorizedChatIds[0] ?? '').trim()
        : '';
    const authorizedChatId = normalizeChatId(rawConfig.authorizedChatId || fallbackAuthorizedChatId);
    const fallbackMappedChat = authorizedChatId
        && rawConfig.chatMappings
        && typeof rawConfig.chatMappings === 'object'
        && !Array.isArray(rawConfig.chatMappings)
        ? rawConfig.chatMappings[authorizedChatId]
        : null;
    const selectedChat = normalizeSelectedChat(rawConfig.selectedChat?.avatarUrl || rawConfig.selectedChat?.chatFile
        ? rawConfig.selectedChat
        : fallbackMappedChat);

    return {
        enabled: Boolean(rawConfig.enabled),
        botToken: String(rawConfig.botToken ?? '').trim(),
        allowAllChats: Boolean(rawConfig.allowAllChats),
        authorizedChatId,
        userHandle: String(rawConfig.userHandle ?? DEFAULT_CONFIG.userHandle).trim() || DEFAULT_CONFIG.userHandle,
        historyLimit: Math.max(2, toInteger(rawConfig.historyLimit, DEFAULT_CONFIG.historyLimit)),
        requestTimeoutMs: Math.max(10000, toInteger(rawConfig.requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs)),
        systemPrompt: String(rawConfig.systemPrompt ?? DEFAULT_CONFIG.systemPrompt),
        replyPrefix: String(rawConfig.replyPrefix ?? ''),
        providerOverride: {
            source: String(providerOverride.source ?? '').trim(),
            baseUrl: String(providerOverride.baseUrl ?? '').trim(),
            apiKey: String(providerOverride.apiKey ?? '').trim(),
            model: String(providerOverride.model ?? '').trim(),
        },
        selectedChat,
    };
}

function normalizeState(rawState = {}) {
    const conversations = typeof rawState.conversations === 'object' && rawState.conversations !== null
        ? rawState.conversations
        : {};
    const normalizedConversations = {};

    for (const [chatId, messages] of Object.entries(conversations)) {
        if (!Array.isArray(messages)) {
            continue;
        }

        normalizedConversations[String(chatId)] = messages
            .filter(message => message && typeof message.role === 'string' && typeof message.content === 'string')
            .map(message => ({
                role: message.role,
                content: message.content,
            }));
    }

    return {
        offset: Math.max(0, toInteger(rawState.offset, 0)),
        conversations: normalizedConversations,
        updatedAt: typeof rawState.updatedAt === 'string' ? rawState.updatedAt : '',
    };
}

function splitTelegramMessage(text, limit = 4000) {
    const chunks = [];
    let remaining = String(text ?? '');

    while (remaining.length > limit) {
        let splitAt = remaining.lastIndexOf('\n', limit);
        if (splitAt < limit * 0.5) {
            splitAt = remaining.lastIndexOf(' ', limit);
        }
        if (splitAt < limit * 0.5) {
            splitAt = limit;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks.length > 0 ? chunks : [''];
}

function escapeTelegramHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function isDialogueParagraph(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
        return false;
    }

    return (
        /^[“"][\s\S]*[”"]$/u.test(trimmed)
        || /^[「『][\s\S]*[」』]$/u.test(trimmed)
    );
}

function isActionParagraph(text) {
    const trimmed = String(text ?? '').trim();
    if (trimmed.length < 3) {
        return false;
    }

    return /^\*[\s\S]*\*$/u.test(trimmed) && !/^\*\*[\s\S]*\*\*$/u.test(trimmed);
}

function stripActionMarkers(text) {
    return String(text ?? '').trim().replace(/^\*([\s\S]*)\*$/u, '$1').trim();
}

function formatTelegramInlineText(text) {
    const placeholders = [];
    let working = String(text ?? '').replace(/\r\n/g, '\n');

    const reserve = (rendered) => {
        const token = `\uE000${placeholders.length}\uE001`;
        placeholders.push(rendered);
        return token;
    };

    working = working.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, language, code) => {
        const languageLabel = String(language ?? '').trim();
        const safeCode = escapeTelegramHtml(code).replace(/^\n+|\n+$/g, '');
        const safeLanguage = escapeTelegramHtml(languageLabel);
        const content = safeLanguage
            ? `<pre><code class="language-${safeLanguage}">${safeCode}</code></pre>`
            : `<pre><code>${safeCode}</code></pre>`;
        return reserve(content);
    });

    working = working.replace(/`([^`\n]+)`/g, (_, code) => reserve(`<code>${escapeTelegramHtml(code)}</code>`));

    working = escapeTelegramHtml(working);
    working = working.replace(/\*\*([^\n*][\s\S]*?[^\n*])\*\*/g, '<b>$1</b>');
    working = working.replace(/(^|\n)\*([^\n][^\n]*?)\*(?=\n|$)/g, '$1<i>$2</i>');
    working = working.replace(/(^|[\s([{'"“‘])\*([^*\n][^*\n]*?)\*(?=[$\s)\]}.,!?:;'"”’]|$)/g, '$1<i>$2</i>');

    return working.replace(/\uE000(\d+)\uE001/g, (_, index) => placeholders[Number(index)] ?? '');
}

function formatTelegramText(text) {
    const normalized = String(text ?? '').replace(/\r\n/g, '\n');
    const paragraphs = normalized.split(/\n{2,}/u);
    const rendered = paragraphs.map(paragraph => {
        const rawParagraph = String(paragraph ?? '');
        const trimmed = rawParagraph.trim();

        if (!trimmed) {
            return '';
        }

        if (isActionParagraph(trimmed)) {
            const actionText = stripActionMarkers(trimmed);
            const inlineActionHtml = formatTelegramInlineText(actionText);
            return `<i>${inlineActionHtml}</i>`;
        }

        const inlineHtml = formatTelegramInlineText(rawParagraph);
        if (isDialogueParagraph(trimmed)) {
            return `<blockquote>${inlineHtml}</blockquote>`;
        }

        return inlineHtml;
    });

    return rendered.join('\n\n');
}

function shouldRetryTelegramWithoutFormatting(payload) {
    const description = String(payload?.description ?? '').toLowerCase();
    return description.includes('can\'t parse entities')
        || description.includes('unsupported start tag')
        || description.includes('unsupported end tag')
        || description.includes('tag') && description.includes('entity');
}

function extractTextParts(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .map(part => {
                if (typeof part === 'string') {
                    return part;
                }

                if (typeof part?.text === 'string') {
                    return part.text;
                }

                if (typeof part?.content === 'string') {
                    return part.content;
                }

                return '';
            })
            .join('');
    }

    return '';
}

function extractTextFromStreamEvent(data) {
    const choice = data?.choices?.[0];

    if (!choice || typeof choice !== 'object') {
        return '';
    }

    const delta = choice.delta ?? {};

    return (
        extractTextParts(delta.content)
        || extractTextParts(delta.text)
        || extractTextParts(choice.text)
        || extractTextParts(choice.message?.content)
        || extractTextParts(data?.content?.[0]?.text)
        || ''
    );
}

function extractTextFromResponse(data) {
    const content = data?.choices?.[0]?.message?.content;
    const refusal = data?.choices?.[0]?.message?.refusal;
    const reasoning = data?.choices?.[0]?.message?.reasoning;

    if (typeof refusal === 'string' && refusal.trim()) {
        return refusal.trim();
    }

    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        const text = content
            .map(part => {
                if (typeof part === 'string') {
                    return part;
                }

                if (typeof part?.text === 'string') {
                    return part.text;
                }

                return '';
            })
            .join('\n')
            .trim();

        if (text) {
            return text;
        }
    }

    if (typeof data?.choices?.[0]?.text === 'string') {
        return data.choices[0].text.trim();
    }

    if (typeof data?.content?.[0]?.text === 'string') {
        return data.content[0].text.trim();
    }

    if (typeof reasoning === 'string' && reasoning.trim()) {
        return `Model returned reasoning only, without assistant text.\n\n${reasoning.trim().slice(0, 1500)}`;
    }

    return '';
}

function extractErrorMessage(status, rawText, parsed) {
    const details = parsed?.error?.message
        || parsed?.message
        || parsed?.error
        || rawText;

    return `HTTP ${status}: ${String(details || 'Unknown upstream error').slice(0, 1000)}`;
}

function listJsonlFilesRecursive(directoryPath) {
    const results = [];

    if (!fs.existsSync(directoryPath)) {
        return results;
    }

    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        const fullPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            results.push(...listJsonlFilesRecursive(fullPath));
            continue;
        }

        if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.jsonl') {
            results.push(fullPath);
        }
    }

    return results;
}

class TelegramBridgeManager {
    constructor() {
        this.dataDirectory = path.join(globalThis.DATA_ROOT, '_plugins', PLUGIN_ID);
        this.configPath = path.join(this.dataDirectory, 'config.json');
        this.statePath = path.join(this.dataDirectory, 'state.json');
        this.running = false;
        this.loopPromise = null;
        this.lastError = '';
    }

    ensurePaths() {
        ensureDirectory(this.dataDirectory);
    }

    readConfig() {
        this.ensurePaths();
        if (!fs.existsSync(this.configPath)) {
            this.writeConfig(DEFAULT_CONFIG);
        }

        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        return normalizeConfig({ ...DEFAULT_CONFIG, ...raw });
    }

    writeConfig(config) {
        this.ensurePaths();
        writeFileAtomicSync(this.configPath, JSON.stringify(normalizeConfig(config), null, 4), 'utf8');
    }

    readState() {
        this.ensurePaths();
        if (!fs.existsSync(this.statePath)) {
            this.writeState(DEFAULT_STATE);
        }

        const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        return normalizeState(raw);
    }

    writeState(state) {
        this.ensurePaths();
        const normalized = normalizeState(state);
        normalized.updatedAt = new Date().toISOString();
        writeFileAtomicSync(this.statePath, JSON.stringify(normalized, null, 4), 'utf8');
    }

    getPublicConfig() {
        const config = this.readConfig();
        return {
            ...config,
            botToken: maskSecret(config.botToken),
            providerOverride: {
                ...config.providerOverride,
                apiKey: maskSecret(config.providerOverride.apiKey),
            },
        };
    }

    async init(router) {
        router.get('/status', async (_, response) => {
            const config = this.readConfig();
            const state = this.readState();
            let runtime = null;
            let runtimeError = '';

            try {
                runtime = this.resolveRuntime(config);
            } catch (error) {
                runtimeError = error.message;
            }

            response.send({
                running: this.running,
                lastError: this.lastError,
                config: this.getPublicConfig(),
                conversations: Object.keys(state.conversations).length,
                runtime: runtime ? {
                    source: runtime.source,
                    model: runtime.model,
                    userHandle: runtime.userHandle,
                    baseUrl: runtime.baseUrl,
                } : null,
                runtimeError,
            });
        });

        router.get('/config', async (_, response) => {
            response.send(this.getPublicConfig());
        });

        router.get('/chats', async (_, response) => {
            const config = this.readConfig();
            response.send({
                selectedChat: config.selectedChat,
                chats: this.listAvailableChats(config.userHandle),
            });
        });

        router.post('/config', async (request, response) => {
            const current = this.readConfig();
            const next = normalizeConfig({
                ...current,
                ...request.body,
                providerOverride: {
                    ...current.providerOverride,
                    ...(request.body?.providerOverride ?? {}),
                },
            });

            if (isMaskedSecret(next.botToken)) {
                next.botToken = current.botToken;
            }

            if (isMaskedSecret(next.providerOverride.apiKey)) {
                next.providerOverride.apiKey = current.providerOverride.apiKey;
            }

            if (next.selectedChat?.avatarUrl || next.selectedChat?.chatFile) {
                this.resolveSelectedChat(next.userHandle, next.selectedChat, true);
            }

            this.writeConfig(next);
            await this.restart();
            response.send({ ok: true, config: this.getPublicConfig() });
        });

        router.post('/select-chat', async (request, response) => {
            const current = this.readConfig();
            const selectedChat = {
                avatarUrl: String(request.body?.avatarUrl ?? '').trim(),
                chatFile: String(request.body?.chatFile ?? '').trim(),
            };

            this.resolveSelectedChat(current.userHandle, selectedChat, true);

            this.writeConfig({
                ...current,
                selectedChat,
            });

            response.send({ ok: true, config: this.getPublicConfig() });
        });

        router.post('/reset', async (request, response) => {
            const state = this.readState();
            const chatId = request.body?.chatId ? String(request.body.chatId) : '';

            if (chatId) {
                delete state.conversations[chatId];
            } else {
                state.conversations = {};
            }

            this.writeState(state);
            response.send({ ok: true });
        });

        await this.startFromDisk();
    }

    async startFromDisk() {
        const config = this.readConfig();

        if (!config.enabled || !config.botToken) {
            this.running = false;
            return;
        }

        if (this.running) {
            return;
        }

        this.running = true;
        this.lastError = '';
        this.loopPromise = this.pollLoop();
    }

    async stop() {
        this.running = false;

        if (this.loopPromise) {
            try {
                await this.loopPromise;
            } catch {
                // Ignore shutdown errors.
            } finally {
                this.loopPromise = null;
            }
        }
    }

    async restart() {
        await this.stop();
        await this.startFromDisk();
    }

    async pollLoop() {
        while (this.running) {
            const config = this.readConfig();

            if (!config.enabled || !config.botToken) {
                this.running = false;
                return;
            }

            try {
                await this.fetchAndHandleUpdates(config);
            } catch (error) {
                this.lastError = error.message;
                console.error(`[${PLUGIN_ID}]`, error);
                await this.delay(5000);
            }
        }
    }

    async delay(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchAndHandleUpdates(config) {
        const state = this.readState();
        const response = await this.fetchWithTimeout(
            this.telegramUrl(config.botToken, 'getUpdates'),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    offset: state.offset,
                    timeout: 25,
                    allowed_updates: ['message'],
                }),
            },
            Math.max(config.requestTimeoutMs, 35000),
        );

        const payload = await response.json();

        if (!response.ok || payload?.ok !== true) {
            throw new Error(`Telegram getUpdates failed: ${extractErrorMessage(response.status, JSON.stringify(payload), payload)}`);
        }

        const updates = Array.isArray(payload.result) ? payload.result : [];
        if (updates.length === 0) {
            return;
        }

        updates.sort((left, right) => left.update_id - right.update_id);

        for (const update of updates) {
            state.offset = Math.max(state.offset, Number(update.update_id) + 1);
            await this.handleUpdate(config, state, update);
        }

        this.writeState(state);
    }

    async handleUpdate(config, state, update) {
        const message = update?.message;
        if (!message?.chat?.id || !message?.text || message?.from?.is_bot) {
            return;
        }

        const chatId = String(message.chat.id);
        const text = String(message.text).trim();

        if (text.startsWith('/')) {
            await this.handleCommand(config, state, chatId, text);
            return;
        }

        if (!this.isAuthorized(config, chatId)) {
            await this.sendTelegramMessage(config.botToken, chatId, `This chat is not authorized for the SillyTavern bridge.\nChat ID: ${chatId}`);
            return;
        }

        await this.sendChatAction(config.botToken, chatId, 'typing');

        const initialReply = `${config.replyPrefix}...`;
        const [initialMessage] = await this.sendTelegramMessage(config.botToken, chatId, initialReply);
        const streamState = this.createTelegramStreamState({
            message_id: initialMessage.message_id,
            text: initialReply,
        });

        try {
            const reply = await this.generateReply(
                config,
                state,
                chatId,
                text,
                async (partialReply) => {
                    await this.renderTelegramStream(
                        config.botToken,
                        chatId,
                        streamState,
                        `${config.replyPrefix}${partialReply}`,
                    );
                },
            );

            await this.renderTelegramStream(
                config.botToken,
                chatId,
                streamState,
                `${config.replyPrefix}${reply}`,
                true,
            );

            this.lastError = '';
        } catch (error) {
            if (!this.lastError || this.lastError === 'Upstream returned no assistant text.') {
                this.lastError = error.message;
            }
            await this.renderTelegramStream(
                config.botToken,
                chatId,
                streamState,
                `Bridge error: ${error.message}`,
                true,
            );
        }
    }

    async handleCommand(config, state, chatId, rawText) {
        const parts = rawText.trim().split(/\s+/u);
        const command = parts[0].split('@')[0].toLowerCase();
        const args = parts.slice(1);

        if (command === '/start' || command === '/help') {
            await this.sendTelegramMessage(
                config.botToken,
                chatId,
                [
                    'SillyTavern Telegram bridge is online.',
                    `Authorized: ${this.isAuthorized(config, chatId) ? 'yes' : 'no'}`,
                    `Chat ID: ${chatId}`,
                    'Commands: /help, /whoami, /status, /currentchat, /chats, /bind <number>, /unbind, /reset',
                ].join('\n'),
            );
            return;
        }

        if (command === '/whoami') {
            await this.sendTelegramMessage(config.botToken, chatId, `Chat ID: ${chatId}`);
            return;
        }

        if (command === '/status') {
            let statusText;
            try {
                const runtime = this.resolveRuntime(config);
                const currentChatLabel = this.getSelectedChatLabel(config);
                statusText = [
                    `Running: ${this.running ? 'yes' : 'no'}`,
                    `Authorized: ${this.isAuthorized(config, chatId) ? 'yes' : 'no'}`,
                    `Source: ${runtime.source}`,
                    `Model: ${runtime.model}`,
                    `User handle: ${runtime.userHandle}`,
                    `Linked chat: ${currentChatLabel}`,
                ].join('\n');
            } catch (error) {
                statusText = `Bridge is loaded, but runtime resolution failed: ${error.message}`;
            }

            await this.sendTelegramMessage(config.botToken, chatId, statusText);
            return;
        }

        if (command === '/currentchat') {
            const currentChatLabel = this.getSelectedChatLabel(config);
            await this.sendTelegramMessage(
                config.botToken,
                chatId,
                [
                    `Linked chat: ${currentChatLabel}`,
                    `Telegram Chat ID: ${chatId}`,
                ].join('\n'),
            );
            return;
        }

        if (command === '/chats') {
            const availableChats = this.listAvailableChats(config.userHandle);
            if (availableChats.length === 0) {
                await this.sendTelegramMessage(config.botToken, chatId, 'No SillyTavern chats are available to bind.');
                return;
            }

            const lines = ['Available SillyTavern chats:'];
            availableChats.forEach((chat, index) => {
                lines.push(`${index + 1}. ${chat.characterName} | ${chat.chatFile}`);
            });
            lines.push('');
            lines.push('Use /bind <number> to switch the linked SillyTavern chat.');

            await this.sendTelegramMessage(config.botToken, chatId, lines.join('\n'));
            return;
        }

        if (command === '/bind') {
            if (args.length === 0) {
                await this.sendTelegramMessage(config.botToken, chatId, 'Usage: /bind <number>\nUse /chats first to see the available chat numbers.');
                return;
            }

            const chatNumber = Number.parseInt(args[0], 10);
            const availableChats = this.listAvailableChats(config.userHandle);
            if (!Number.isFinite(chatNumber) || chatNumber < 1 || chatNumber > availableChats.length) {
                await this.sendTelegramMessage(config.botToken, chatId, 'Invalid chat number. Use /chats first, then /bind <number>.');
                return;
            }

            const selectedChat = normalizeSelectedChat(availableChats[chatNumber - 1]);
            const nextConfig = normalizeConfig({
                ...config,
                selectedChat,
            });

            this.writeConfig(nextConfig);
            Object.assign(config, nextConfig);

            await this.sendTelegramMessage(
                config.botToken,
                chatId,
                [
                    'Linked SillyTavern chat updated.',
                    `Linked chat: ${this.getSelectedChatLabel(config)}`,
                ].join('\n'),
            );
            return;
        }

        if (command === '/unbind') {
            const nextConfig = normalizeConfig({
                ...config,
                selectedChat: {
                    avatarUrl: '',
                    chatFile: '',
                },
            });

            this.writeConfig(nextConfig);
            Object.assign(config, nextConfig);

            await this.sendTelegramMessage(
                config.botToken,
                chatId,
                [
                    'Linked SillyTavern chat cleared.',
                    `Linked chat: ${this.getSelectedChatLabel(config)}`,
                ].join('\n'),
            );
            return;
        }

        if (command === '/reset') {
            delete state.conversations[chatId];
            this.writeState(state);
            await this.sendTelegramMessage(config.botToken, chatId, 'Conversation history cleared for this Telegram chat.');
            return;
        }

        await this.sendTelegramMessage(config.botToken, chatId, 'Unknown command. Use /help.');
    }

    isAuthorized(config, chatId) {
        return config.allowAllChats || normalizeChatId(config.authorizedChatId) === normalizeChatId(chatId);
    }

    listAvailableChats(userHandle) {
        const directories = getUserDirectories(userHandle || DEFAULT_USER.handle);
        const files = listJsonlFilesRecursive(directories.chats);

        return files.map(filePath => {
            const relative = path.relative(directories.chats, filePath);
            const segments = relative.split(path.sep);
            const avatarStem = segments[0] || '';
            const chatFile = path.basename(filePath);
            const chatData = getChatData(filePath);
            const firstAssistant = chatData.find(message => message && message.is_user === false && !message.chat_metadata);
            const characterName = String(firstAssistant?.name || avatarStem || 'Character');
            const updatedAt = fs.statSync(filePath).mtime.toISOString();

            return {
                avatarUrl: `${avatarStem}.png`,
                chatFile,
                characterName,
                updatedAt,
                filePath,
            };
        }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }

    resolveSelectedChat(userHandle, selectedChat, throwOnMissing = false) {
        const avatarUrl = String(selectedChat?.avatarUrl ?? '').trim();
        const chatFile = String(selectedChat?.chatFile ?? '').trim();

        if (!avatarUrl || !chatFile) {
            if (throwOnMissing) {
                throw new Error('No SillyTavern chat selected.');
            }
            return null;
        }

        const directories = getUserDirectories(userHandle || DEFAULT_USER.handle);
        const avatarStem = avatarUrl.replace(/\.png$/i, '');
        const fullPath = path.join(directories.chats, avatarStem, chatFile);

        if (!fs.existsSync(fullPath)) {
            if (throwOnMissing) {
                throw new Error(`Selected chat file not found: ${chatFile}`);
            }
            return null;
        }

        return {
            avatarUrl: `${avatarStem}.png`,
            avatarStem,
            chatFile,
            fullPath,
            directories,
        };
    }

    getSelectedChatLabel(config) {
        const selectedChat = normalizeSelectedChat(config.selectedChat);
        if (!selectedChat.avatarUrl || !selectedChat.chatFile) {
            return 'No SillyTavern chat selected';
        }

        const chat = this.listAvailableChats(config.userHandle)
            .find(item => item.avatarUrl === selectedChat.avatarUrl && item.chatFile === selectedChat.chatFile);

        if (chat) {
            return `${chat.characterName} | ${chat.chatFile}`;
        }

        return `${selectedChat.avatarUrl} | ${selectedChat.chatFile}`;
    }

    getLinkedChatContext(config) {
        const selection = this.resolveSelectedChat(config.userHandle, config.selectedChat, false);
        if (!selection) {
            return null;
        }

        const settingsPath = path.join(selection.directories.root, SETTINGS_FILE);
        const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
        const chatData = getChatData(selection.fullPath);

        if (!Array.isArray(chatData) || chatData.length === 0) {
            throw new Error(`Selected chat is empty: ${selection.chatFile}`);
        }

        const firstAssistant = chatData.find(message => message && message.is_user === false && !message.chat_metadata);
        const userName = String(settings.username || 'User');
        const characterName = String(firstAssistant?.name || selection.avatarStem || 'Character');

        return {
            ...selection,
            settings,
            chatData,
            userName,
            characterName,
        };
    }

    resolveRuntime(config) {
        const userHandle = config.userHandle || DEFAULT_USER.handle;
        const directories = getUserDirectories(userHandle);
        const settingsPath = path.join(directories.root, SETTINGS_FILE);

        if (!fs.existsSync(settingsPath)) {
            throw new Error(`settings.json not found for user "${userHandle}"`);
        }

        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const oaiSettings = settings.oai_settings ?? {};
        const override = config.providerOverride ?? {};
        const source = String(override.source || oaiSettings.chat_completion_source || 'openrouter').trim().toLowerCase();
        const sourceConfig = SOURCE_CONFIG[source];

        if (!sourceConfig) {
            throw new Error(`Unsupported chat completion source for Telegram bridge: ${source}`);
        }

        const model = String(
            override.model
            || oaiSettings[sourceConfig.modelSetting]
            || oaiSettings.openrouter_model
            || oaiSettings.openai_model
            || '',
        ).trim();

        if (!model) {
            throw new Error(`No model configured for source "${source}"`);
        }

        let baseUrl = String(override.baseUrl).trim();
        if (!baseUrl) {
            if (sourceConfig.baseUrlResolver) {
                baseUrl = sourceConfig.baseUrlResolver(oaiSettings);
            } else if (sourceConfig.baseUrlFromSettings) {
                baseUrl = String(oaiSettings[sourceConfig.baseUrlFromSettings] ?? '').trim();
            } else {
                baseUrl = sourceConfig.baseUrl;
            }
        }

        if (!baseUrl) {
            throw new Error(`No base URL configured for source "${source}"`);
        }

        let apiKey = String(override.apiKey).trim();
        if (!apiKey && sourceConfig.secretKey) {
            apiKey = readSecret(directories, sourceConfig.secretKey) || '';
        }

        if (!apiKey && sourceConfig.reverseProxy && oaiSettings.reverse_proxy) {
            baseUrl = String(oaiSettings.reverse_proxy).trim();
            apiKey = String(oaiSettings.proxy_password ?? '').trim();
        }

        if (!apiKey && source !== 'custom') {
            throw new Error(`No API key available for source "${source}"`);
        }

        return {
            source,
            model,
            baseUrl,
            apiKey,
            userHandle,
            directories,
            oaiSettings,
            headers: cloneJson(sourceConfig.headers ?? {}),
        };
    }

    buildRequestBody(runtime, config, state, chatId, input) {
        const settings = runtime.oaiSettings;
        const messages = [];
        const linkedChat = this.getLinkedChatContext(config);
        let history = [];

        if (linkedChat) {
            history = linkedChat.chatData
                .slice(1)
                .filter(message => message && !message.chat_metadata && !message.is_system && typeof message.mes === 'string')
                .map(message => ({
                    role: message.is_user ? 'user' : 'assistant',
                    content: message.extra?.display_text || message.mes || '',
                }))
                .filter(message => message.content)
                .slice(-Math.max(2, config.historyLimit) * 2);
        } else {
            history = Array.isArray(state.conversations[chatId]) ? state.conversations[chatId] : [];
        }

        if (config.systemPrompt.trim()) {
            messages.push({
                role: 'system',
                content: config.systemPrompt.trim(),
            });
        }

        messages.push(...history);
        messages.push({
            role: 'user',
            content: input,
        });

        const body = {
            model: runtime.model,
            messages,
            temperature: toNumber(settings.temp_openai, 1),
            frequency_penalty: toNumber(settings.freq_pen_openai, 0),
            presence_penalty: toNumber(settings.pres_pen_openai, 0),
            top_p: toNumber(settings.top_p_openai, 1),
            max_tokens: toInteger(settings.openai_max_tokens, 600),
            stream: false,
        };

        if (runtime.source === 'openrouter') {
            const provider = Array.isArray(settings.openrouter_providers) ? settings.openrouter_providers : [];
            const quantizations = Array.isArray(settings.openrouter_quantizations) ? settings.openrouter_quantizations : [];
            body.transforms = settings.openrouter_middleout === 'on' ? ['middle-out'] : [];
            body.reasoning = {
                exclude: !Boolean(settings.show_thoughts),
            };
            if (settings.reasoning_effort && settings.reasoning_effort !== 'auto') {
                body.reasoning.effort = settings.reasoning_effort;
            }
            if (settings.verbosity && settings.verbosity !== 'auto') {
                body.verbosity = settings.verbosity;
            }
            if (toNumber(settings.min_p_openai, 0) > 0) {
                body.min_p = toNumber(settings.min_p_openai, 0);
            }
            if (toNumber(settings.top_a_openai, 0) > 0) {
                body.top_a = toNumber(settings.top_a_openai, 0);
            }
            if (toNumber(settings.repetition_penalty_openai, 1) !== 1) {
                body.repetition_penalty = toNumber(settings.repetition_penalty_openai, 1);
            }
            if (provider.length > 0 || quantizations.length > 0) {
                body.provider = compactObject({
                    allow_fallbacks: settings.openrouter_allow_fallbacks ?? true,
                    order: provider.length > 0 ? provider : undefined,
                    quantizations: quantizations.length > 0 ? quantizations : undefined,
                });
            }
        }

        if (runtime.source === 'deepseek' && !body.top_p) {
            body.top_p = Number.EPSILON;
        }

        if (/^(o1|o3|o4)/.test(runtime.model)) {
            body.max_completion_tokens = body.max_tokens;
            delete body.max_tokens;
            delete body.temperature;
            delete body.top_p;
            delete body.frequency_penalty;
            delete body.presence_penalty;
        }

        if (/gpt-5/.test(runtime.model)) {
            body.max_completion_tokens = body.max_tokens;
            delete body.max_tokens;
        }

        return compactObject(body);
    }

    async appendToLinkedChat(config, runtime, chatId, userInput, assistantReply) {
        const linkedChat = this.getLinkedChatContext(config);
        if (!linkedChat) {
            return false;
        }

        const nowIso = new Date().toISOString();
        const userAvatar = String(linkedChat.settings.user_avatar || 'user-default.png');
        const chatData = linkedChat.chatData.slice();

        chatData.push({
            name: linkedChat.userName,
            is_user: true,
            is_system: false,
            send_date: nowIso,
            mes: userInput,
            extra: {
                isSmallSys: false,
            },
            force_avatar: `/thumbnail?type=persona&file=${userAvatar}`,
        });

        chatData.push({
            name: linkedChat.characterName,
            is_user: false,
            is_system: false,
            send_date: new Date().toISOString(),
            mes: assistantReply,
            title: '',
            gen_started: nowIso,
            gen_finished: new Date().toISOString(),
            swipes: [assistantReply],
            swipe_id: 0,
            swipe_info: [{
                send_date: new Date().toISOString(),
                gen_started: nowIso,
                gen_finished: new Date().toISOString(),
                extra: {
                    api: runtime.source,
                    model: runtime.model,
                    reasoning: '',
                    reasoning_duration: null,
                    reasoning_signature: null,
                    time_to_first_token: null,
                },
            }],
            extra: {
                api: runtime.source,
                model: runtime.model,
                reasoning: '',
                reasoning_duration: null,
                reasoning_signature: null,
                time_to_first_token: null,
            },
        });

        await trySaveChat(
            chatData,
            linkedChat.fullPath,
            false,
            runtime.userHandle,
            linkedChat.avatarStem,
            linkedChat.directories.backups,
        );

        return true;
    }

    updateConversation(state, chatId, userInput, assistantReply, historyLimit) {
        const history = Array.isArray(state.conversations[chatId]) ? state.conversations[chatId] : [];
        history.push({ role: 'user', content: userInput });
        history.push({ role: 'assistant', content: assistantReply });
        state.conversations[chatId] = history.slice(-Math.max(2, historyLimit) * 2);
    }

    async generateReply(config, state, chatId, input, onProgress = async () => { }) {
        const runtime = this.resolveRuntime(config);
        const endpoint = `${trimTrailingSlash(runtime.baseUrl)}/chat/completions`;
        const body = this.buildRequestBody(runtime, config, state, chatId, input);
        const headers = {
            'Content-Type': 'application/json',
            ...runtime.headers,
        };

        if (runtime.apiKey) {
            headers.Authorization = `Bearer ${runtime.apiKey}`;
        }

        body.stream = true;

        const response = await this.fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            },
            config.requestTimeoutMs,
        );

        if (!response.ok) {
            const rawText = await response.text();
            let parsed = {};

            if (rawText) {
                try {
                    parsed = JSON.parse(rawText);
                } catch {
                    parsed = {};
                }
            }

            throw new Error(extractErrorMessage(response.status, rawText, parsed));
        }

        const assistantReply = await this.collectStreamedReply(response, onProgress);
        if (!assistantReply) {
            this.lastError = 'Upstream returned no assistant text from the streaming response.';
            throw new Error('Upstream returned no assistant text.');
        }

        const persistedToStChat = await this.appendToLinkedChat(config, runtime, chatId, input, assistantReply);
        if (!persistedToStChat) {
            this.updateConversation(state, chatId, input, assistantReply, config.historyLimit);
            this.writeState(state);
        }

        return assistantReply;
    }

    async collectStreamedReply(response, onProgress) {
        if (!response.body || typeof response.body.getReader !== 'function') {
            const rawText = await response.text();
            let parsed = {};

            if (rawText) {
                try {
                    parsed = JSON.parse(rawText);
                } catch {
                    parsed = {};
                }
            }

            return extractTextFromResponse(parsed);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantReply = '';
        let lastProgressText = '';

        const flushEventBlock = async (eventBlock) => {
            const dataLines = eventBlock
                .split(/\r?\n/u)
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart());

            if (dataLines.length === 0) {
                return false;
            }

            const payload = dataLines.join('\n').trim();
            if (!payload) {
                return false;
            }

            if (payload === '[DONE]') {
                return true;
            }

            let parsed = {};
            try {
                parsed = JSON.parse(payload);
            } catch {
                return false;
            }

            const deltaText = extractTextFromStreamEvent(parsed);
            if (deltaText) {
                assistantReply += deltaText;
                if (assistantReply !== lastProgressText) {
                    await onProgress(assistantReply);
                    lastProgressText = assistantReply;
                }
            }

            return parsed?.choices?.[0]?.finish_reason != null;
        };

        try {
            while (true) {
                const { value, done } = await reader.read();

                if (done) {
                    buffer += decoder.decode();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                let boundaryIndex = buffer.search(/\r?\n\r?\n/u);
                while (boundaryIndex !== -1) {
                    const eventBlock = buffer.slice(0, boundaryIndex);
                    const separatorLength = buffer.startsWith('\r\n\r\n', boundaryIndex) ? 4 : 2;
                    buffer = buffer.slice(boundaryIndex + separatorLength);

                    const shouldStop = await flushEventBlock(eventBlock);
                    if (shouldStop) {
                        if (assistantReply && assistantReply !== lastProgressText) {
                            await onProgress(assistantReply);
                        }
                        return assistantReply.trim();
                    }

                    boundaryIndex = buffer.search(/\r?\n\r?\n/u);
                }
            }

            if (buffer.trim()) {
                await flushEventBlock(buffer);
            }
        } finally {
            reader.releaseLock();
        }

        if (assistantReply) {
            await onProgress(assistantReply);
        }

        return assistantReply.trim();
    }

    telegramUrl(botToken, method) {
        return `${TELEGRAM_API}/bot${botToken}/${method}`;
    }

    async sendChatAction(botToken, chatId, action) {
        await this.fetchWithTimeout(
            this.telegramUrl(botToken, 'sendChatAction'),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    action,
                }),
            },
            15000,
        );
    }

    async sendTelegramMessage(botToken, chatId, text) {
        const chunks = splitTelegramMessage(text);
        const messages = [];
        for (const chunk of chunks) {
            let response = await this.fetchWithTimeout(
                this.telegramUrl(botToken, 'sendMessage'),
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: formatTelegramText(chunk),
                        parse_mode: 'HTML',
                        disable_web_page_preview: true,
                    }),
                },
                30000,
            );

            let payload = await response.json();
            if ((!response.ok || payload?.ok !== true) && shouldRetryTelegramWithoutFormatting(payload)) {
                response = await this.fetchWithTimeout(
                    this.telegramUrl(botToken, 'sendMessage'),
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: chunk,
                            disable_web_page_preview: true,
                        }),
                    },
                    30000,
                );
                payload = await response.json();
            }

            if (!response.ok || payload?.ok !== true) {
                throw new Error(`Telegram sendMessage failed: ${extractErrorMessage(response.status, JSON.stringify(payload), payload)}`);
            }

            messages.push(payload.result);
        }

        return messages;
    }

    async editTelegramMessage(botToken, chatId, messageId, text) {
        let response = await this.fetchWithTimeout(
            this.telegramUrl(botToken, 'editMessageText'),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: formatTelegramText(text),
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                }),
            },
            30000,
        );

        let payload = await response.json();
        if ((!response.ok || payload?.ok !== true) && shouldRetryTelegramWithoutFormatting(payload)) {
            response = await this.fetchWithTimeout(
                this.telegramUrl(botToken, 'editMessageText'),
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text,
                        disable_web_page_preview: true,
                    }),
                },
                30000,
            );
            payload = await response.json();
        }

        if (payload?.description && String(payload.description).includes('message is not modified')) {
            return payload.result ?? null;
        }

        if (!response.ok || payload?.ok !== true) {
            throw new Error(`Telegram editMessageText failed: ${extractErrorMessage(response.status, JSON.stringify(payload), payload)}`);
        }

        return payload.result;
    }

    createTelegramStreamState(initialMessage) {
        return {
            messageIds: [initialMessage.message_id],
            chunkTexts: [String(initialMessage.text ?? '')],
            lastRenderedText: String(initialMessage.text ?? ''),
            lastFlushAt: 0,
        };
    }

    shouldFlushTelegramStream(state, fullText, force) {
        if (force) {
            return true;
        }

        if (!fullText || fullText === state.lastRenderedText) {
            return false;
        }

        const now = Date.now();
        const deltaChars = Math.abs(fullText.length - state.lastRenderedText.length);
        return deltaChars >= STREAM_MIN_DELTA_CHARS || (now - state.lastFlushAt) >= STREAM_EDIT_INTERVAL_MS;
    }

    async renderTelegramStream(botToken, chatId, streamState, fullText, force = false) {
        if (!this.shouldFlushTelegramStream(streamState, fullText, force)) {
            return;
        }

        const chunks = splitTelegramMessage(fullText);

        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];

            if (index < streamState.messageIds.length) {
                if (streamState.chunkTexts[index] !== chunk) {
                    await this.editTelegramMessage(botToken, chatId, streamState.messageIds[index], chunk);
                    streamState.chunkTexts[index] = chunk;
                }
                continue;
            }

            const [message] = await this.sendTelegramMessage(botToken, chatId, chunk);
            streamState.messageIds.push(message.message_id);
            streamState.chunkTexts.push(chunk);
        }

        streamState.lastRenderedText = fullText;
        streamState.lastFlushAt = Date.now();
    }

    async fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }
    }
}

const manager = new TelegramBridgeManager();

export const info = {
    id: PLUGIN_ID,
    name: 'Telegram Bridge',
    description: 'Telegram bot bridge that relays messages through SillyTavern server-side settings.',
};

export async function init(router) {
    await manager.init(router);
}

export async function exit() {
    await manager.stop();
}
