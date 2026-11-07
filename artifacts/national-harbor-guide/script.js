// Keep the page wiring in one small, readable place.
const bird = document.getElementById("stateBird");
const birdTrigger = document.getElementById("birdTrigger");

// Adding the animation class restarts the CSS motion each time it is activated.
// The image itself is focusable too, so keyboard users can trigger the same effect.
function liftBird() {
  bird.classList.remove("take-flight");
  // Force a style recalculation so a quick repeat starts the animation again.
  void bird.offsetWidth;
  bird.classList.add("take-flight");
}

function handleBirdKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    liftBird();
  }
}

birdTrigger.addEventListener("click", liftBird);
bird.addEventListener("click", liftBird);
bird.addEventListener("keydown", handleBirdKeydown);

// Remove the animation class when the CSS animation finishes, leaving the bird
// ready to animate again on the next click or key press.
bird.addEventListener("animationend", (event) => {
  if (event.animationName === "take-flight") {
    bird.classList.remove("take-flight");
  }
});

const likeForm = document.getElementById("likeForm");
const likeInput = document.getElementById("likeInput");
const likesList = document.getElementById("likesList");
const emptyNote = document.getElementById("emptyNote");

// This is intentionally an in-memory list: notes live only for this page visit.
const harborLikes = [];

likeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = likeInput.value.trim();

  // Ignore empty or whitespace-only input instead of adding a blank list item.
  if (!entry) {
    likeInput.focus();
    return;
  }

  // Save the new note in memory, then append a text-only list item safely.
  harborLikes.push(entry);
  const listItem = document.createElement("li");
  listItem.textContent = harborLikes[harborLikes.length - 1];
  likesList.appendChild(listItem);
  emptyNote.hidden = true;

  likeInput.value = "";
  likeInput.focus();
});

// The city guide conversation lives in memory for this page visit only.
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatStatus = document.getElementById("chatStatus");
const sendChat = document.getElementById("sendChat");
const clearChat = document.getElementById("clearChat");
const systemPromptText = document.getElementById("systemPromptText");
const temperatureRange = document.getElementById("temperatureRange");
const temperatureValue = document.getElementById("temperatureValue");
const maxTokensRange = document.getElementById("maxTokensRange");
const maxTokensValue = document.getElementById("maxTokensValue");
const topPRange = document.getElementById("topPRange");
const topPValue = document.getElementById("topPValue");
const chatHistory = [];

function addChatMessage(role, text, details = {}) {
  const message = document.createElement("article");
  message.className = `chat-message ${role}${details.error ? " error" : ""}`;

  const speaker = document.createElement("span");
  speaker.className = "message-speaker";
  speaker.textContent = role === "user" ? "YOU" : "YOUR LOCAL GUIDE";
  message.appendChild(speaker);

  const body = document.createElement("p");
  body.textContent = text;
  message.appendChild(body);

  if (details.meta) {
    const meta = document.createElement("p");
    meta.className = "message-meta";
    meta.textContent = details.meta;
    message.appendChild(meta);
  }

  if (details.truncated) {
    const warning = document.createElement("p");
    warning.className = "message-warning";
    warning.textContent =
      "Answer was cut off because it reached the max token limit. Raise Max output tokens for a longer reply.";
    message.appendChild(warning);
  }

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function updatePromptLabLabels() {
  temperatureValue.value = Number(temperatureRange.value).toFixed(1);
  maxTokensValue.value = String(Number(maxTokensRange.value));
  topPValue.value = Number(topPRange.value).toFixed(2);
}

function readChatSettings() {
  return {
    temperature: Number(temperatureRange.value),
    maxOutputTokens: Number(maxTokensRange.value),
    topP: Number(topPRange.value),
  };
}

async function loadSystemPrompt() {
  try {
    const response = await fetch("/api/chat/system-prompt");
    if (!response.ok) throw new Error("Prompt request failed");
    const data = await response.json();
    systemPromptText.textContent =
      typeof data.prompt === "string"
        ? data.prompt
        : "The city guide prompt could not be loaded.";
  } catch {
    systemPromptText.textContent =
      "The city guide prompt is unavailable right now.";
  }
}

if (
  chatForm &&
  chatInput &&
  chatMessages &&
  chatStatus &&
  sendChat &&
  clearChat &&
  systemPromptText &&
  temperatureRange &&
  temperatureValue &&
  maxTokensRange &&
  maxTokensValue &&
  topPRange &&
  topPValue
) {
  temperatureRange.addEventListener("input", updatePromptLabLabels);
  maxTokensRange.addEventListener("input", updatePromptLabLabels);
  topPRange.addEventListener("input", updatePromptLabLabels);
  updatePromptLabLabels();
  loadSystemPrompt();

  clearChat.addEventListener("click", () => {
    chatHistory.length = 0;
    chatMessages.replaceChildren();
    addChatMessage(
      "assistant",
      "Hey, neighbor. Looking for a first bite? Maryland crab cakes are a fine place to start. What would you like to know about the Harbor?",
    );
    chatStatus.textContent = "";
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message || sendChat.disabled) return;

    addChatMessage("user", message);
    chatInput.value = "";
    chatInput.disabled = true;
    sendChat.disabled = true;
    chatStatus.textContent = "Your local guide is thinking…";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatHistory.slice(-20),
          settings: readChatSettings(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        addChatMessage(
          "assistant",
          data.error || "The guide could not answer just now. Please try again.",
          { error: true },
        );
        return;
      }

      const reply = String(data.reply || "");
      const settings = data.settings || readChatSettings();
      const usage = data.usage || {};
      const meta = [
        `Settings · temp ${Number(settings.temperature).toFixed(1)}`,
        `top-p ${Number(settings.topP).toFixed(2)}`,
        `max ${Number(settings.maxOutputTokens)} tokens`,
        `Model · ${data.model || "Gemini"}`,
        `Tokens · ${Number(usage.candidatesTokenCount || 0)} generated / ${Number(usage.totalTokenCount || 0)} total`,
      ].join("  ·  ");

      addChatMessage("assistant", reply, {
        meta,
        truncated: Boolean(data.truncated),
      });
      chatHistory.push(
        { role: "user", content: message },
        { role: "assistant", content: reply },
      );
    } catch {
      addChatMessage(
        "assistant",
        "The chat service is unavailable right now. Please try again in a moment.",
        { error: true },
      );
    } finally {
      chatInput.disabled = false;
      sendChat.disabled = false;
      chatStatus.textContent = "";
      chatInput.focus();
    }
  });
}
