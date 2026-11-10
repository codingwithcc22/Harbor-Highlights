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

// Shared table constants: reject oversize originals, then send a resized copy.
const MAX_DISH_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DISH_IMAGE_EDGE = 1280;
const acceptedDishImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const dishUploadForm = document.getElementById("dishUploadForm");
const dishTitleInput = document.getElementById("dishTitle");
const dishCaptionInput = document.getElementById("dishCaption");
const dishImageInput = document.getElementById("dishImage");
const dishUploadButton = document.getElementById("dishUploadButton");
const dishUploadStatus = document.getElementById("dishUploadStatus");
const dishGallery = document.getElementById("dishGallery");
const dishPhotoCount = document.getElementById("dishPhotoCount");
let dishPhotos = [];

function setDishUploadStatus(message, isError = false) {
  dishUploadStatus.textContent = message;
  dishUploadStatus.classList.toggle("is-error", isError);
}

function updateDishPhotoCount(count) {
  dishPhotoCount.textContent = `${count} ${count === 1 ? "photo" : "photos"}`;
}

function createDishPhotoCard(photo) {
  const card = document.createElement("article");
  card.className = "dish-photo-card";

  const image = document.createElement("img");
  image.className = "dish-photo-image";
  image.src = photo.imageUrl;
  image.alt = `${photo.title} at National Harbor`;
  image.loading = "lazy";
  image.decoding = "async";
  card.appendChild(image);

  const content = document.createElement("div");
  content.className = "dish-photo-content";

  const metadata = document.createElement("div");
  metadata.className = "dish-photo-meta";
  const date = new Date(photo.createdAt);
  const time = document.createElement("time");
  if (!Number.isNaN(date.getTime())) {
    time.dateTime = date.toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } else {
    time.textContent = "Recently shared";
  }
  metadata.appendChild(time);
  metadata.appendChild(document.createTextNode("COMMUNITY TABLE"));
  content.appendChild(metadata);

  const title = document.createElement("h3");
  title.textContent = photo.title;
  content.appendChild(title);

  if (photo.caption) {
    const caption = document.createElement("p");
    caption.textContent = photo.caption;
    content.appendChild(caption);
  }

  card.appendChild(content);
  return card;
}

function renderDishPhotos() {
  dishGallery.replaceChildren();
  updateDishPhotoCount(dishPhotos.length);

  if (dishPhotos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dish-gallery-empty";
    empty.textContent = "The album is ready for its first Harbor favorite.";
    dishGallery.appendChild(empty);
    return;
  }

  for (const photo of dishPhotos) {
    dishGallery.appendChild(createDishPhotoCard(photo));
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("This photo could not be resized. Try another image."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("This photo could not be prepared for upload."));
    };
    reader.onerror = () => reject(new Error("This photo could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function resizeDishPhoto(file) {
  if (!acceptedDishImageTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo. GIF images are not supported.");
  }
  if (file.size > MAX_DISH_IMAGE_BYTES) {
    throw new Error("This file is over 3 MB. Choose a smaller photo.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot resize the photo. Try a newer browser.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const initialScale = Math.min(1, MAX_DISH_IMAGE_EDGE / longestEdge);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This photo could not be prepared for upload.");

    // JPEG has no transparency, so make transparent PNG areas white.
    for (const scale of [initialScale, initialScale * 0.8]) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.86, 0.76, 0.66]) {
        const resized = await canvasToBlob(canvas, quality);
        if (resized.size <= MAX_DISH_IMAGE_BYTES) {
          return blobToDataUrl(resized);
        }
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error("This photo is still too large after resizing. Choose another image.");
}

async function loadDishPhotos() {
  try {
    const response = await fetch("/api/dishes");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The photo album could not be loaded.");
    }
    dishPhotos = Array.isArray(data) ? data : [];
    renderDishPhotos();
  } catch {
    dishPhotoCount.textContent = "Unavailable";
    const message = document.createElement("p");
    message.className = "dish-gallery-empty is-error";
    message.textContent = "The photo album could not load. Please refresh to try again.";
    dishGallery.replaceChildren(message);
  }
}

if (
  dishUploadForm &&
  dishTitleInput &&
  dishCaptionInput &&
  dishImageInput &&
  dishUploadButton &&
  dishUploadStatus &&
  dishGallery &&
  dishPhotoCount
) {
  loadDishPhotos();

  dishUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = dishTitleInput.value.trim();
    const file = dishImageInput.files?.[0];
    if (!title) {
      setDishUploadStatus("Add a short title for your dish photo.", true);
      dishTitleInput.focus();
      return;
    }
    if (!file) {
      setDishUploadStatus("Choose a JPEG, PNG, or WebP photo to share.", true);
      dishImageInput.focus();
      return;
    }

    dishUploadButton.disabled = true;
    dishUploadStatus.setAttribute("aria-live", "polite");
    setDishUploadStatus("Resizing your photo…");

    try {
      const image = await resizeDishPhoto(file);
      setDishUploadStatus("Adding your photo to the album…");
      const response = await fetch("/api/dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          caption: dishCaptionInput.value.trim() || undefined,
          image,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The photo could not be saved. Please try again.");
      }

      dishPhotos = [data, ...dishPhotos.filter((photo) => photo.id !== data.id)];
      renderDishPhotos();
      dishUploadForm.reset();
      setDishUploadStatus("Your photo is in the album. Thanks for sharing!");
    } catch (error) {
      setDishUploadStatus(
        error instanceof Error
          ? error.message
          : "The photo could not be saved. Please try again.",
        true,
      );
    } finally {
      dishUploadButton.disabled = false;
    }
  });
}
