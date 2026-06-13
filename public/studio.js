const form = document.querySelector("#studio-form");
const fileInput = form.querySelector('input[name="image"]');
const directionInput = form.querySelector('input[name="direction"]');
const preview = document.querySelector("#preview");
const generateButton = document.querySelector("#generate-button");
const submitButton = document.querySelector("#submit-button");
const studioStatus = document.querySelector("#studio-status");
const result = document.querySelector("#studio-result");
const generatedTitle = document.querySelector("#generated-title");
const generatedCaption = document.querySelector("#generated-caption");
const toast = document.querySelector(".toast");

let generated = null;

function setStatus(message, state = "") {
  studioStatus.textContent = message;
  studioStatus.dataset.state = state;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1600);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  generated = null;
  submitButton.disabled = true;
  result.hidden = true;
  setStatus(file ? "Ready to generate." : "Ready.");

  if (!file) {
    preview.innerHTML = "<span>No image selected</span>";
    return;
  }

  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="Uploaded source image">`;
});

directionInput.addEventListener("input", () => {
  if (!generated) return;
  generated = null;
  submitButton.disabled = true;
  setStatus("Direction changed. Generate again.", "needs-work");
  generatedCaption.textContent = "Direction changed. Generate again before submitting.";
});

generateButton.addEventListener("click", () => {
  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  generateButton.setAttribute("aria-busy", "true");
  submitButton.disabled = true;
  result.hidden = false;
  generatedTitle.textContent = "Generating...";
  generatedCaption.textContent = "Reading the image and applying your twist.";
  setStatus("Generating parody...", "working");
  generate().finally(() => {
    generateButton.disabled = false;
    generateButton.textContent = "Generate";
    generateButton.removeAttribute("aria-busy");
  });
});

async function generate() {
  const file = fileInput.files?.[0];
  if (!file) {
    showToast("Upload an image first");
    setStatus("Upload an image first.", "needs-work");
    result.hidden = true;
    return;
  }

  const payload = new FormData();
  payload.set("image", file);
  payload.set("direction", directionInput.value.trim());
  const response = await fetch("/api/generate", {
    method: "POST",
    body: payload
  });
  const data = await response.json();
  if (!response.ok) {
    showToast(data.error || "Generate failed");
    setStatus(data.error || "Generate failed.", "needs-work");
    return;
  }

  generated = data;

  generatedTitle.textContent = generated.title;
  generatedCaption.textContent = generated.caption;
  result.hidden = false;
  submitButton.disabled = false;
  setStatus("Generated. Review, then submit.", "done");
  showToast("Generated");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file || !generated) {
    showToast("Generate first");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setStatus("Submitting to approval...", "working");

  try {
    const payload = new FormData();
    payload.set("image", file);
    payload.set("direction", directionInput.value.trim());

    const response = await fetch("/api/pending", {
      method: "POST",
      body: payload
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Submit failed");

    showToast("Submitted");
    generatedCaption.textContent = "Submitted to admin approval.";
    setStatus("Submitted to approval.", "done");
  } catch (error) {
    showToast(error.message);
    submitButton.disabled = false;
    setStatus(error.message, "needs-work");
  } finally {
    submitButton.textContent = "Submit";
  }
});
