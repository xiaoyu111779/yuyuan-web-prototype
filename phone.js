import { randomId } from './bridge.js';

const session = location.hash.slice(1);
const elements = Object.fromEntries(['name', 'preset', 'hint', 'messages', 'status', 'text', 'send', 'stop', 'consent', 'online', 'offline', 'probe', 'probe-check', 'probe-result'].map(id => [id, document.getElementById(id)]));
let state = null;
let mode = 'offline';
let pending = null;
let transcript = '';
let notice = '';

function post(type, data = {}) {
    parent.postMessage({ channel: 'yuyuan-prototype', session, type, ...data }, location.origin);
}

function controls() {
    const busy = !!pending || state?.busy;
    elements.send.disabled = !state?.supported || busy || !elements.consent.checked;
    elements.probe.disabled = elements.send.disabled;
    elements.stop.disabled = !busy;
    elements.text.disabled = !!pending;
    elements.online.disabled = busy;
    elements.offline.disabled = busy;
}

for (const value of ['online', 'offline']) elements[value].onclick = () => {
    mode = value;
    document.body.classList.toggle('online', mode === 'online');
    for (const item of ['online', 'offline']) elements[item].setAttribute('aria-pressed', String(item === mode));
    elements.hint.textContent = mode === 'online' ? '线上模式临时补充短消息规则；原预设仍参与，可能需要进一步适配。' : '线下模式不添加原型提示词，直接走酒馆正常生成。';
};
elements.consent.onchange = controls;
document.getElementById('back').onclick = () => post('close');
document.getElementById('refresh').onclick = () => post('refresh');
elements.stop.onclick = () => post('stop');
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
            elements['probe-result'].textContent = '';
            elements['probe-check'].textContent = '';
        }
        state = response.state;
        elements.name.textContent = state.name;
        elements.preset.textContent = `存档：${state.chatId || '未选择'} · 预设：${state.preset}`;
        const updated = JSON.stringify(state.messages);
        if (updated !== transcript) {
            const nearBottom = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight < 90;
            const nodes = state.messages.map(message => {
                const article = document.createElement('article');
                article.className = message.system ? 'system' : message.user ? 'user' : 'character';
                const name = document.createElement('small'), content = document.createElement('p');
                name.textContent = message.name; content.textContent = message.text;
                article.append(name, content); return article;
            });
            elements.messages.replaceChildren(...nodes);
            if (nearBottom || !transcript) elements.messages.scrollTop = elements.messages.scrollHeight;
            transcript = updated;
        }
        if (!pending) elements.status.textContent = notice || (state.busy ? '酒馆正在生成…' : state.supported ? '已连接 · 显示最近 100 条，生成上下文由酒馆决定' : '请回酒馆选择单角色存档并连接聊天补全接口。');
    } else if (response.type === 'result' && response.id === pending) {
        pending = null;
        if (response.accepted) elements.text.value = '';
        notice = response.error || '';
        if (response.probe) {
            const result = response.probe;
            elements['probe-result'].textContent = result.reply || '返回了空文本，请检查酒馆的实际请求和连接。';
            elements['probe-check'].textContent = `聊天条数：${result.beforeCount} → ${result.afterCount}；正文/身份/所选回复${result.unchanged ? '未变化' : '发生变化！请停止测试并回酒馆核对'}；酒馆草稿${result.draftUnchanged ? '未变化' : '发生变化！'}。`;
            notice = '静默验证已返回，结果在上方验证区；没有主动保存线上记录。';
            if (!result.unchanged || !result.draftUnchanged) notice = '验证未通过：检测到存档或草稿变化，请截图反馈；原型没有自动删除或恢复任何记录。';
        }
        elements.status.textContent = notice || '酒馆生成已结束，请查看聊天记录。';
    } else if (response.type === 'error') { notice = response.message; elements.status.textContent = notice; }
    controls();
});

if (window.visualViewport) {
    const resize = () => { document.querySelector('main').style.height = `${visualViewport.height}px`; };
    visualViewport.addEventListener('resize', resize);
    resize();
}
post('ready');
