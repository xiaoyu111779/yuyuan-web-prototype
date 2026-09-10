export function randomId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

export function createBridge({ getContext, isGenerating, getInput, notify }) {
    let busy = false;
    let revision = 0;
    let signature = '';
    const seen = new Set();
    const promptKey = `yuyuan-web-${randomId()}`;

    function snapshot() {
        const context = getContext();
        const binding = JSON.stringify([context.characterId, context.characters?.[context.characterId]?.avatar, context.chatId, context.groupId]);
        const current = JSON.stringify([binding, context.chat.map(message => [message.mes, message.is_user, message.is_system, message.swipe_id])]);
        if (signature !== current) { signature = current; revision++; }
        return {
            binding, revision, busy: busy || isGenerating(),
            name: context.name2 || '未选择角色', chatId: context.chatId || '',
            api: context.mainApi,
            preset: context.chatCompletionSettings?.preset_settings_openai || '请在酒馆确认当前预设',
            supported: context.characterId != null && !context.groupId && !!context.chatId && context.mainApi === 'openai' && context.onlineStatus !== 'no_connection',
            messages: context.chat.slice(-100).map(message => ({
                name: message.name || '', text: String(message.mes || ''),
                user: !!message.is_user, system: !!message.is_system,
            })),
        };
    }

    async function send(request) {
        if (!request || typeof request.id !== 'string' || request.id.length > 100 || seen.has(request.id)) throw new Error('重复或无效请求，未再次发送。');
        const state = snapshot();
        if (state.busy) throw new Error('酒馆正在生成，请稍后再发。');
        if (!state.supported) throw new Error('请先在酒馆打开单角色存档，选择聊天补全接口并连接模型。');
        if (request.binding !== state.binding || request.revision !== state.revision) throw new Error('存档或消息已变化，已刷新，请确认后重新发送。');
        if (!['online', 'offline'].includes(request.mode)) throw new Error('无效聊天模式。');
        if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 20000) throw new Error('请输入 1–20000 字的消息。');
        if (request.text.trimStart().startsWith('/')) throw new Error('原型不执行斜杠命令，请回酒馆使用。');
        const input = getInput();
        if (!input || input.value.trim()) throw new Error('酒馆输入框还有草稿，请先保存或清空，原型不会覆盖它。');
        if (input.disabled) throw new Error('酒馆输入框当前不可用。');
        seen.add(request.id);
        if (seen.size > 200) seen.delete(seen.values().next().value);
        busy = true;
        const context = getContext();
        const submitted = request.mode === 'online' ? `【线上·手机消息】\n${request.text.trim()}` : request.text.trim();
        let inputAccepted = false;
        try {
            if (request.mode === 'online') context.setExtensionPrompt(promptKey,
                '本次通过手机远程聊天，不是线下见面。保持当前角色卡、世界书、关系与既有记忆。只回复角色会发来的短消息，自然口语，不写现场动作旁白，不替对方说话；用换行分隔消息。不要求 JSON，不改变人物性格。', 1, 0, false, 0);
            input.value = submitted;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            notify();
            await context.generate('normal');
            inputAccepted = input.value !== submitted;
            if (!inputAccepted) throw new Error('酒馆未接收消息，请返回酒馆查看连接或提示。');
            const fresh = snapshot();
            if (fresh.binding !== state.binding) throw new Error('生成期间存档发生变化，请回酒馆核对结果。');
            return { accepted: true };
        } catch (error) {
            inputAccepted = input.value !== submitted;
            const failure = new Error(`${error.message || '生成失败'}${inputAccepted ? ' 消息可能已写入酒馆，请核对记录，不要盲目重发。' : ''}`);
            failure.accepted = inputAccepted;
            throw failure;
        } finally {
            if (request.mode === 'online') context.setExtensionPrompt(promptKey, '', 1, 0, false, 0);
            if (input.value === submitted) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
            busy = false;
            notify();
        }
    }

    function stop() {
        if (busy) getContext().stopGeneration();
    }

    return { snapshot, send, stop, isBusy: () => busy };
}
