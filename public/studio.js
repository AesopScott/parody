const form = document.querySelector("#studio-form");
const fileInput = form.querySelector('input[name="image"]');
const directionInput = form.querySelector('[name="direction"]');
const preview = document.querySelector("#preview");
const generatedPreview = document.querySelector("#generated-preview");
const generateButton = document.querySelector("#generate-button");
const submitButton = document.querySelector("#submit-button");
const studioStatus = document.querySelector("#studio-status");
const result = document.querySelector("#studio-result");
const generatedTitle = document.querySelector("#generated-title");
const generatedCaption = document.querySelector("#generated-caption");
const toast = document.querySelector(".toast");
const GENERATE_TIMEOUT_MS = 60000;

let generated = null;
let generatedImageBlob = null;
let generatedImageUrl = "";

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

function resetGeneratedOutput(message = "Generate to see the parody image.") {
  generated = null;
  generatedImageBlob = null;
  if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
  generatedImageUrl = "";
  submitButton.disabled = true;
  result.hidden = true;
  generatedPreview.dataset.state = "";
  generatedPreview.innerHTML = `<span>${message}</span>`;
}

function dataUrlToBlob(dataUrl) {
  const [metadata, base64] = dataUrl.split(",");
  const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] || "image/png";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function showGeneratedImage(dataUrl, title) {
  generatedImageBlob = dataUrlToBlob(dataUrl);
  if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
  generatedImageUrl = URL.createObjectURL(generatedImageBlob);
  generatedPreview.dataset.state = "done";
  generatedPreview.innerHTML = `<img src="${generatedImageUrl}" alt="${title || "Generated parody image"}">`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GENERATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  resetGeneratedOutput();
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
  resetGeneratedOutput("Direction changed. Generate again.");
  setStatus("Direction changed. Generate again.", "needs-work");
  generatedCaption.textContent = "Direction changed. Generate again before submitting.";
});

generateButton.addEventListener("click", () => {
  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  generateButton.setAttribute("aria-busy", "true");
  submitButton.disabled = true;
  result.hidden = true;
  generatedPreview.dataset.state = "working";
  generatedPreview.innerHTML = `
    <div class="output-loading">
      <span></span>
      <strong>Generating image...</strong>
      <small>This can take up to a minute. If it stalls, you'll get an error here.</small>
    </div>
  `;
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
  try {
    const file = fileInput.files?.[0];
    if (!file) {
      showToast("Upload an image first");
      setStatus("Upload an image first.", "needs-work");
      resetGeneratedOutput();
      return;
    }

    const payload = new FormData();
    payload.set("image", file);
    payload.set("direction", directionInput.value.trim());
    const response = await fetchWithTimeout("/api/generate", {
      method: "POST",
      body: payload
    });
    const data = await response.json().catch(() => ({ error: "Generate failed" }));
    if (!response.ok) {
      showToast(data.error || "Generate failed");
      setStatus(data.error || "Generate failed.", "needs-work");
      resetGeneratedOutput("Generation failed. Try again.");
      return;
    }

    generated = data;
    if (!generated.imageDataUrl) {
      showToast("No image returned");
      setStatus("No image returned.", "needs-work");
      resetGeneratedOutput("No image returned. Try again.");
      return;
    }

    showGeneratedImage(generated.imageDataUrl, generated.title);
    generatedTitle.textContent = generated.title;
    generatedCaption.textContent = `${generated.caption} Build ${generated.generationId || "fresh"}.`;
    result.hidden = false;
    submitButton.disabled = false;
    setStatus("Generated. Review, then submit.", "done");
    showToast("Generated");
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Generation timed out after 60 seconds. Try a smaller image or a shorter twist."
      : "Could not reach the generator. Check the connection and try again.";
    showToast(message);
    setStatus(message, "needs-work");
    resetGeneratedOutput(message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!generated || !generatedImageBlob) {
    showToast("Generate first");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setStatus("Submitting to approval...", "working");

  try {
    const payload = new FormData();
    const imageName = `${generated.slug || "parody-output"}.${generatedImageBlob.type === "image/svg+xml" ? "svg" : "png"}`;
    payload.set("image", generatedImageBlob, imageName);
    payload.set("direction", directionInput.value.trim());
    payload.set("title", generated.title || "");
    payload.set("caption", generated.caption || "");
    payload.set("shareCaption", generated.shareCaption || "");
    payload.set("slug", generated.slug || "");

    const response = await fetch("/api/pending", {
      method: "POST",
      body: payload
    });
    const data = await response.json().catch(() => ({ error: "Submit failed" }));
    if (!response.ok) throw new Error(data.error || "Submit failed");

    showToast("Submitted");
    generatedCaption.innerHTML = 'Submitted to the admin approval queue. <a href="/admin">Open Admin</a>.';
    setStatus("Submitted to approval.", "done");
  } catch (error) {
    showToast(error.message);
    submitButton.disabled = false;
    setStatus(error.message, "needs-work");
  } finally {
    submitButton.textContent = "Submit";
  }
});
