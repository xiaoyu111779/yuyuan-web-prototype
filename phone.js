import { randomId } from './bridge.js';

const session = location.hash.slice(1);
const elements = Object.fromEntries(['name', 'preset', 'hint', 'messages', 'status', 'text', 'send', 'stop', 'consent', 'online', 'offline', 'probe', 'probe-check', 'probe-result'].map(id => [id, document.getElementById(id)]));
let state = null;
let mode = 'offline';
let pending = null;
let transcript = '';
let notice = '';
const drafts = { online: '', offline: '' };

function renderMessages() {
    if (!state) return;
    const records = mode === 'online' ? state.onlineMessages : state.messages;
    const updated = JSON.stringify([mode, records]);
    if (updated === transcript) return;
    const nearBottom = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 90;
    elements.messages.replaceChildren(...records.map(message => {
        const article = document.createElement('article');
        article.className = message.system ? 'system' : message.user ? 'user' : 'character';
        const name = document.createElement('small'), content = document.createElement('p');
        name.textContent = message.name; content.textContent = message.text;
        article.append(name, content); return article;
    }));
    if (!records.length) elements.messages.textContent = mode === 'online' ? '这是此角色、此存档的独立线上记录。以前写进酒馆的试聊不会自动搬过来。' : '暂无线下记录。';
    if (nearBottom || !transcript) elements.messages.scrollTop = elements.messages.scrollHeight;
    transcript = updated;
}

function post(type, data = {}) {
    parent.postMessage({ channel: 'yuyuan-prototype', session, type, ...data }, location.origin);
}

function controls() {
    const busy = !!pending || state?.busy;
    elements.send.disabled = !state?.supported || busy || !elements.consent.checked;
    elements.probe.disabled = elements.send.disabled;
    if (mode === 'online' && state?.onlineError) elements.send.disabled = true;
    elements.stop.disabled = !busy;
    elements.text.disabled = !!pending;
    elements.online.disabled = busy;
    elements.offline.disabled = busy;
}

for (const value of ['online', 'offline']) elements[value].onclick = () => {
    drafts[mode] = elements.text.value;
    mode = value;
    elements.text.value = drafts[mode];
    notice = ''; transcript = '';
    document.body.classList.toggle('online', mode === 'online');
    for (const item of ['online', 'offline']) elements[item].setAttribute('aria-pressed', String(item === mode));
    elements.hint.textContent = mode === 'online' ? '线上独立记录：使用静默生成，最近 20 条线上消息参与本次请求；线下历史仍作为背景。' : '线下模式不添加原型提示词，直接走酒馆正常生成。';
    elements.status.textContent = mode === 'online' ? state?.onlineError || '线上记录单独保存在当前酒馆账号设置中，不写入线下正文。' : '线下发送会写入酒馆当前存档。';
    renderMessages(); controls();
};
elements.consent.onchange = controls;
document.getElementById('back').onclick = () => post('close');
document.getElementById('refresh').onclick = () => post('refresh');
elements.stop.onclick = () => post('stop');
document.getElementById('export-online').onclick = () => { if (state) post('export-online', { binding: state.binding }); };
function submit(requestMode) {
    if (elements.send.disabled || !elements.text.value.trim()) return;
    pending = randomId();
    notice = '';
    post('send', { id: pending, text: elements.text.value, mode: requestMode, binding: state.binding, revision: state.revision });
    elements.status.textContent = '已交给酒馆生成…';
    controls();
}
document.getElementById('composer').onsubmit = event => { event.preventDefault(); submit(mode); };
elements.probe.onclick = () => submit('probe');

window.addEventListener('message', event => {
    const response = event.data;
    if (event.source !== parent || event.origin !== location.origin || response?.channel !== 'yuyuan-prototype' || response.session !== session) return;
    if (response.type === 'state') {
        if (state && state.binding !== response.state.binding) {
            elements.consent.checked = false;
            elements.text.value = '';
            drafts.online = ''; drafts.offline = ''; notice = ''; transcript = '';
            elements['probe-result'].textContent = '';
            elements['probe-check'].textContent = '';
        }
        state = response.state;
        elements.name.textContent = state.name;
        elements.preset.textContent = `存档：${state.chatId || '未选择'} · 预设：${state.preset}`;
        renderMessages();
        if (!pending) elements.status.textContent = notice || (state.busy ? '酒馆正在生成…' : !state.supported ? '请回酒馆选择单角色存档并连接聊天补全接口。' : mode === 'online' ? state.onlineError || '线上独立记录 · 显示最近 100 条 · 账号设置自动保存，请勿立即关闭页面' : '线下记录 · 生成上下文由酒馆决定');
    } else if (response.type === 'result' && response.id === pending) {
        pending = null;
        if (response.accepted) { elements.text.value = ''; drafts[mode] = ''; }
        notice = response.error || '';
        if (response.online) notice = '本轮已写入独立线上记录，并交给酒馆账号设置自动保存；请稍等后再刷新核对。线下正文未变化。';
        if (response.probe) {
            const result = response.probe;
            elements['probe-result'].textContent = result.reply || '返回了空文本，请检查酒馆的实际请求和连接。';
            elements['probe-check'].textContent = `聊天条数：${result.beforeCount} → ${result.afterCount}；正文/身份/所选回复${result.unchanged ? '未变化' : '发生变化！请停止测试并回酒馆核对'}；酒馆草稿${result.draftUnchanged ? '未变化' : '发生变化！'}。`;
            notice = '静默验证已返回，结果在上方验证区；没有主动保存线上记录。';
            if (!result.unchanged || !result.draftUnchanged) notice = '验证未通过：检测到存档或草稿变化，请截图反馈；原型没有自动删除或恢复任何记录。';
        }
        elements.status.textContent = notice || '酒馆生成已结束，请查看聊天记录。';
    } else if (response.type === 'online-export') {
        const url = URL.createObjectURL(new Blob([response.text], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'yuyuan-online-backup.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (response.type === 'error') { notice = response.message; elements.status.textContent = notice; }
    controls();
});

if (window.visualViewport) {
    const resize = () => { document.querySelector('main').style.height = `${visualViewport.height}px`; };
    visualViewport.addEventListener('resize', resize);
    resize();
}
post('ready');
