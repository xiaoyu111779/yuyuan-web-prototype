import { getContext } from '/scripts/st-context.js';
import { isGenerating } from '/script.js';
import { createBridge, randomId } from './bridge.js';

const button = document.createElement('button');
button.type = 'button';
button.textContent = '芋圆网页 · 试用';
button.style.cssText = 'position:fixed;bottom:90px;right:12px;z-index:9999;min-height:44px;padding:10px 14px;border:1px solid #bcacbf;border-radius:22px;background:#f4eef6;color:#443749;font-size:14px';
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
