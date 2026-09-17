// =============================
// OrcaRouter AI configuration
// =============================

const BASE_URL = "https://api.orcarouter.ai/v1";
const MODEL_NAME = "qwen/qwen3.8-27b-free";

// Paste your OrcaRouter API key between the quotes.
const API_KEY = "YOUR_API_KEY_HERE";

// =============================
// Chat application
// =============================

const chat = document.getElementById("chat");
const form = document.getElementById("messageForm");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const status = document.getElementById("status");
const clearBtn = document.getElementById("clearBtn");

const messages = [];

function removeWelcome() {
    const welcome = document.querySelector(".welcome");
    if (welcome) welcome.remove();
}

function addMessage(role, text) {
    removeWelcome();

    const message = document.createElement("div");
    message.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "You" : "✦";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    message.appendChild(avatar);
    message.appendChild(bubble);
    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;
    return bubble;
}

function setLoading(loading) {
    sendBtn.disabled = loading;
    input.disabled = loading;

    if (loading) {
        status.innerHTML = `
            <div class="typing">
                Thinking
                <span></span><span></span><span></span>
            </div>
        `;
    } else {
        status.textContent = "";
        input.disabled = false;
        input.focus();
    }
}

async function sendMessage(text) {
    if (!text.trim()) return;

    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        addMessage("assistant", "Please put your OrcaRouter API key in script.js first.");
        return;
    }

    const userText = text.trim();

    messages.push({
        role: "user",
        content: userText
    });

    addMessage("user", userText);
    input.value = "";
    autoResize();
    setLoading(true);

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: messages
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data?.error?.message ||
                data?.message ||
                `HTTP ${response.status}`
            );
        }

        const reply =
            data?.choices?.[0]?.message?.content ??
            "The API returned no message.";

        messages.push({
            role: "assistant",
            content: reply
        });

        addMessage("assistant", reply);

    } catch (error) {
        console.error(error);

        // Remove the last user message so a failed request does not
        // remain in the conversation history.
        messages.pop();

        addMessage(
            "assistant",
            `⚠️ API error: ${error.message}`
        );
    } finally {
        setLoading(false);
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (sendBtn.disabled) return;

    sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
    }
});

input.addEventListener("input", autoResize);

function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
}

clearBtn.addEventListener("click", () => {
    messages.length = 0;
    chat.innerHTML = `
        <div class="welcome">
            <div class="welcome-icon">✦</div>
            <h2>How can I help?</h2>
            <p>Ask anything. Your messages are sent to the real Qwen model through OrcaRouter.</p>
        </div>
    `;
    status.textContent = "";
    input.focus();
});
