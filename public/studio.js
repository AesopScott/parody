const form = document.querySelector("#studio-form");
const fileInput = form.querySelector('input[name="image"]');
const directionInput = form.querySelector('input[name="direction"]');
const preview = document.querySelector("#preview");
const generateButton = document.querySelector("#generate-button");
const submitButton = document.querySelector("#submit-button");
const result = document.querySelector("#studio-result");
const generatedTitle = document.querySelector("#generated-title");
const generatedCaption = document.querySelector("#generated-caption");
const toast = document.querySelector(".toast");

let generated = null;

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
  generatedCaption.textContent = "Direction changed. Generate again before submitting.";
});

generateButton.addEventListener("click", () => {
  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  generate().finally(() => {
    generateButton.disabled = false;
    generateButton.textContent = "Generate";
  });
});

async function generate() {
  const file = fileInput.files?.[0];
  if (!file) {
    showToast("Upload an image first");
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
    return;
  }

  generated = data;

  generatedTitle.textContent = generated.title;
  generatedCaption.textContent = generated.caption;
  result.hidden = false;
  submitButton.disabled = false;
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
  } catch (error) {
    showToast(error.message);
    submitButton.disabled = false;
  } finally {
    submitButton.textContent = "Submit";
  }
});
