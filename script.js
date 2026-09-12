const BASE_URL = "https://api.orcarouter.ai/v1";
const DEFAULT_MODEL = "free/gemini-3.8-flash";
const API_KEY = "sk-apx0c33fc126db7cd59378fd068f1b9e15de8cbf0551567f3c";

const $ = id => document.getElementById(id);
const chat = $("chat"), input = $("messageInput"), form = $("messageForm");
const sendBtn = $("sendBtn"), status = $("status"), chatList = $("chatList");
const modelSelect = $("modelSelect"), apiKeyInput = $("apiKeyInput");
const systemPrompt = $("systemPrompt"), temperature = $("temperature");
const tempValue = $("tempValue");

let settings = JSON.parse(localStorage.getItem("danialAI_settings") || "null") || {
    apiKey: API_KEY === "YOUR_API_KEY_HERE" ? "" : API_KEY,
    model: DEFAULT_MODEL,
    systemPrompt: "",
    temperature: 0.7
};
let chats = JSON.parse(localStorage.getItem("danialAI_chats") || "[]");
let activeChatId = localStorage.getItem("danialAI_activeChat") || null;
let controller = null;
let generating = false;

if (!chats.length) chats = [newChatObject()];
if (!chats.some(c => c.id === activeChatId)) activeChatId = chats[0].id;

function newChatObject() {
    return { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), title: "New chat", messages: [] };
}
function saveState() {
    localStorage.setItem("danialAI_settings", JSON.stringify(settings));
    localStorage.setItem("danialAI_chats", JSON.stringify(chats));
    localStorage.setItem("danialAI_activeChat", activeChatId);
}
function activeChat() { return chats.find(c => c.id === activeChatId); }

function renderChatList() {
    chatList.innerHTML = "";
    chats.slice().reverse().forEach(c => {
        const row = document.createElement("div");
        row.className = "chat-item" + (c.id === activeChatId ? " active" : "");
        const name = document.createElement("span");
        name.className = "chat-name";
        name.textContent = c.title;
        const del = document.createElement("button");
        del.className = "delete-chat"; del.textContent = "×";
        del.onclick = e => { e.stopPropagation(); deleteChat(c.id); };
        row.onclick = () => switchChat(c.id);
        row.append(name, del);
        chatList.appendChild(row);
    });
}
function renderMessages() {
    chat.innerHTML = "";
    const c = activeChat();
    $("chatTitle").textContent = c.title;
    $("modelLabel").textContent = settings.model;
    if (!c.messages.length) {
        chat.innerHTML = `<div class="empty"><div class="empty-icon">✦</div><h2>How can I help?</h2><p>Real AI responses from your selected model. Markdown, code highlighting, multiple chats and streaming are ready.</p></div>`;
        return;
    }
    c.messages.forEach(m => addMessageElement(m.role, m.content));
    chat.scrollTop = chat.scrollHeight;
}
function addMessageElement(role, content) {
    const wrap = document.createElement("div");
    wrap.className = "message " + role;
    const avatar = document.createElement("div");
    avatar.className = "avatar"; avatar.textContent = role === "user" ? "You" : "✦";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "assistant") renderMarkdown(bubble, content);
    else bubble.textContent = content;
    wrap.append(avatar, bubble);
    chat.appendChild(wrap);
    return bubble;
}
function renderMarkdown(el, text) {
    if (!window.marked) { el.textContent = text; return; }
    marked.setOptions({ breaks: true, gfm: true });
    el.innerHTML = marked.parse(text);
    el.querySelectorAll("pre code").forEach(code => {
        if (window.hljs) hljs.highlightElement(code);
        const pre = code.parentElement;
        const box = document.createElement("div"); box.className = "code-wrap";
        const copy = document.createElement("button"); copy.className = "copy-code"; copy.textContent = "Copy";
        copy.onclick = async () => {
            await navigator.clipboard.writeText(code.textContent);
            copy.textContent = "Copied!";
            setTimeout(() => copy.textContent = "Copy", 1200);
        };
        pre.parentNode.insertBefore(box, pre); box.append(pre, copy);
    });
}
function addUserMessage(text) { activeChat().messages.push({role:"user", content:text}); addMessageElement("user", text); }
function addAssistantPlaceholder() { return addMessageElement("assistant", ""); }

function setGenerating(v) {
    generating = v;
    input.disabled = v;
    sendBtn.disabled = false;
    sendBtn.textContent = v ? "■" : "➤";
    sendBtn.title = v ? "Stop generation" : "Send";
    if (v) status.innerHTML = `<span class="typing">Generating <i></i><i></i><i></i></span>`;
    else { status.textContent = ""; input.disabled = false; input.focus(); }
}

async function sendMessage(text) {
    if (!text.trim() || generating) return;
    if (!settings.apiKey) { openSettings(); return; }

    const userText = text.trim();
    if (!activeChat().messages.length) {
        activeChat().title = userText.slice(0, 38) + (userText.length > 38 ? "…" : "");
    }
    addUserMessage(userText);
    input.value = ""; resizeInput(); renderChatList(); saveState();
    setGenerating(true);

    const bubble = addAssistantPlaceholder();
    const apiMessages = [];
    if (settings.systemPrompt.trim()) apiMessages.push({role:"system", content:settings.systemPrompt.trim()});
    apiMessages.push(...activeChat().messages);

    controller = new AbortController();

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {"Content-Type":"application/json","Authorization":`Bearer ${settings.apiKey}`},
            body: JSON.stringify({
                model: settings.model,
                messages: apiMessages,
                temperature: Number(settings.temperature),
                stream: true
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            let detail = `HTTP ${response.status}`;
            try { const err = await response.json(); detail = err?.error?.message || err?.message || detail; } catch {}
            throw new Error(detail);
        }

        if (!response.body) throw new Error("This browser did not provide a streaming response.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "", full = "";

        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream:true});
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (let line of lines) {
                line = line.trim();
                if (!line || !line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                    const json = JSON.parse(data);
                    const piece = json?.choices?.[0]?.delta?.content || "";
                    if (piece) {
                        full += piece;
                        renderMarkdown(bubble, full);
                        chat.scrollTop = chat.scrollHeight;
                    }
                } catch {}
            }
        }

        if (!full) full = "The model returned an empty response.";
        activeChat().messages.push({role:"assistant", content:full});
        saveState();

    } catch (err) {
        if (err.name === "AbortError") {
            const stopped = bubble.textContent.trim();
            const finalText = stopped ? stopped + "\n\n*Generation stopped.*" : "*Generation stopped.*";
            renderMarkdown(bubble, finalText);
            activeChat().messages.push({role:"assistant", content:finalText});
            saveState();
        } else {
            bubble.textContent = `⚠️ API error: ${err.message}`;
            activeChat().messages.pop(); // remove user message after failed request
            saveState();
        }
    } finally {
        controller = null;
        setGenerating(false);
        renderChatList();
    }
}

function newChat() {
    const c = newChatObject();
    chats.push(c); activeChatId = c.id; saveState(); renderChatList(); renderMessages(); input.focus();
}
function switchChat(id) {
    if (generating) return;
    activeChatId = id; saveState(); renderChatList(); renderMessages();
}
function deleteChat(id) {
    if (chats.length === 1) { chats[0] = newChatObject(); activeChatId = chats[0].id; }
    else { chats = chats.filter(c => c.id !== id); if (activeChatId === id) activeChatId = chats[chats.length - 1].id; }
    saveState(); renderChatList(); renderMessages();
}

function openSettings() {
    apiKeyInput.value = settings.apiKey;
    systemPrompt.value = settings.systemPrompt;
    temperature.value = settings.temperature;
    tempValue.textContent = Number(settings.temperature).toFixed(1);
    populateModels([settings.model, DEFAULT_MODEL].filter(Boolean), settings.model);
    $("settingsModal").classList.add("open");
}
function closeSettings() { $("settingsModal").classList.remove("open"); }
function populateModels(models, selected) {
    const unique = [...new Set(models)];
    modelSelect.innerHTML = "";
    unique.forEach(m => { const o = document.createElement("option"); o.value=m; o.textContent=m; modelSelect.appendChild(o); });
    if (selected && !unique.includes(selected)) {
        const o = document.createElement("option"); o.value=selected; o.textContent=selected; modelSelect.appendChild(o);
    }
    modelSelect.value = selected || unique[0] || DEFAULT_MODEL;
}
async function loadModels() {
    const key = apiKeyInput.value.trim();
    if (!key) { alert("Enter your API key first."); return; }
    $("loadModelsBtn").textContent = "Loading…";
    try {
        const r = await fetch(`${BASE_URL}/models`, {headers:{Authorization:`Bearer ${key}`}});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const ids = (data.data || []).map(x => x.id).filter(Boolean);
        populateModels(ids.length ? ids : [DEFAULT_MODEL], settings.model);
    } catch(e) { alert("Could not load models: " + e.message); }
    finally { $("loadModelsBtn").textContent = "↻ Load models"; }
}

form.addEventListener("submit", e => {
    e.preventDefault();
    if (generating && controller) {
        controller.abort();
        return;
    }
    sendMessage(input.value);
});
input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    if (e.key === "Escape" && generating && controller) controller.abort();
});
input.addEventListener("input", resizeInput);
function resizeInput(){ input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,180)+"px"; }

$("newChatBtn").onclick = newChat;
$("settingsBtn").onclick = openSettings;
$("topSettings").onclick = openSettings;
$("closeSettings").onclick = closeSettings;
$("cancelSettings").onclick = closeSettings;
$("loadModelsBtn").onclick = loadModels;
$("temperature").oninput = () => tempValue.textContent = Number(temperature.value).toFixed(1);
$("saveSettings").onclick = () => {
    settings.apiKey = apiKeyInput.value.trim();
    settings.model = modelSelect.value || DEFAULT_MODEL;
    settings.systemPrompt = systemPrompt.value;
    settings.temperature = Number(temperature.value);
    saveState(); $("modelLabel").textContent = settings.model; closeSettings();
};
$("menuBtn").onclick = () => { $("sidebar").classList.add("open"); $("scrim").classList.add("open"); };
$("scrim").onclick = () => { $("sidebar").classList.remove("open"); $("scrim").classList.remove("open"); };
$("closeSidebar").onclick = () => { $("sidebar").classList.remove("open"); $("scrim").classList.remove("open"); };

document.addEventListener("click", e => {
    if (e.target.id === "sendBtn" && generating && controller) controller.abort();
});

populateModels([settings.model, DEFAULT_MODEL], settings.model);
renderChatList();
renderMessages();
