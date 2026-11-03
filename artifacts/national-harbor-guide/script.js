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
