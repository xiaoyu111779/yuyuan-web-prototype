import { createBridge, randomId } from './bridge.js';

let contextProvider = null;
let generationCheck = null;
function getContext() {
    if (!contextProvider) throw new Error('酒馆接口尚未就绪，请查看扩展面板的加载状态。');
    return contextProvider();
}
function isGenerating() { return generationCheck ? generationCheck() : true; }

const button = document.createElement('button');
button.type = 'button';
button.textContent = '芋圆网页 · 试用';
button.style.cssText = 'position:fixed;bottom:90px;right:12px;z-index:9999;min-height:44px;padding:10px 14px;border:1px solid #bcacbf;border-radius:22px;background:#f4eef6;color:#443749;font-size:14px';
button.disabled = true;
const panel = document.createElement('div');
panel.id = 'yuyuan-web-prototype-settings';
panel.className = 'extension_container';
panel.innerHTML = '<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>芋圆网页原型 · 0.1.2</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><p data-status role="status">正在连接酒馆接口…</p><button type="button" class="menu_button" data-open disabled style="min-height:44px;width:100%">打开芋圆网页</button><p>先复制测试存档。普通发送仍共用酒馆聊天；0.1.2 新增独立的静默验证按钮，消耗模型额度。</p></div></div>';
const panelStatus = panel.querySelector('[data-status]');
const panelOpen = panel.querySelector('[data-open]');
let frame = null;
let timer = null;
let lastState = '';
let session = '';

function post(data) {
    frame?.contentWindow?.postMessage({ channel: 'yuyuan-prototype', session, ...data }, location.origin);
}

function publish(force = false) {
    if (!frame) return;
    try {
        const state = bridge.snapshot();
        const serialized = JSON.stringify(state);
        if (force || serialized !== lastState) { lastState = serialized; post({ type: 'state', state }); }
    } catch (error) { post({ type: 'error', message: error.message }); }
}

const bridge = createBridge({ getContext, isGenerating, getInput: () => document.getElementById('send_textarea'), notify: () => publish(true) });

button.onclick = () => {
    if (!contextProvider || !generationCheck) return;
    if (frame) return;
    session = randomId();
    frame = document.createElement('iframe');
    frame.title = '芋圆独立网页原型';
    frame.src = new URL(`./phone.html#${session}`, import.meta.url).href;
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#f6f2f7';
    document.body.appendChild(frame);
    button.hidden = true;
    timer = setInterval(publish, 500);
};
panelOpen.onclick = () => button.onclick();

window.addEventListener('message', async event => {
    const request = event.data;
    if (!frame || event.origin !== location.origin || event.source !== frame.contentWindow || request?.channel !== 'yuyuan-prototype' || request.session !== session) return;
    if (request.type === 'ready' || request.type === 'refresh') publish(true);
    else if (request.type === 'close') {
        if (bridge.isBusy() || isGenerating()) { post({ type: 'error', message: '请先等生成结束，或点停止后再返回。' }); return; }
        clearInterval(timer);
        frame.remove(); frame = null; lastState = ''; session = '';
        button.hidden = false; button.focus();
    } else if (request.type === 'stop') bridge.stop();
    else if (request.type === 'send') {
        try {
            const result = await bridge.send(request);
            post({ type: 'result', id: request.id, ...result });
        } catch (error) { post({ type: 'result', id: request.id, accepted: !!error.accepted, error: error.message }); }
        publish(true);
    }
});

document.body.appendChild(button);

function mountPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return false;
    host.appendChild(panel);
    return true;
}
if (!mountPanel()) {
    const observer = new MutationObserver(() => { if (mountPanel()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
}

async function initialize() {
    try {
        if (typeof window.SillyTavern?.getContext === 'function') contextProvider = () => window.SillyTavern.getContext();
        else {
            const extensions = await import('/scripts/extensions.js');
            if (typeof extensions.getContext === 'function') contextProvider = extensions.getContext;
            else {
                const contextModule = await import('/scripts/st-context.js');
                contextProvider = contextModule.getContext;
            }
        }
        const core = await import('/script.js');
        if (typeof core.isGenerating === 'function') generationCheck = () => core.isGenerating();
        else if (typeof core.is_send_press === 'boolean') generationCheck = () => core.is_send_press || !!getContext().streamingProcessor;
        else throw new Error('缺少生成状态接口，已禁止发送以避免并发。');
        const context = getContext();
        if (typeof context.generate !== 'function' || typeof context.setExtensionPrompt !== 'function') throw new Error('当前版本缺少正常生成或提示词接口。');
        button.disabled = false; panelOpen.disabled = false;
        panelStatus.textContent = '已加载。选择单角色测试存档并连接聊天补全接口后，点击下方打开。';
    } catch (error) {
        contextProvider = null; generationCheck = null;
        panelStatus.textContent = '加载失败：' + (error.message || String(error)) + '。请截图此提示，并提供云酒馆版本号。';
        button.textContent = '芋圆网页 · 加载失败';
        console.error('[芋圆网页原型]', error);
    }
}
initialize();
