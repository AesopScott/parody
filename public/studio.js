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
const GENERATE_TIMEOUT_MS = 120000;

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetGeneratedOutput(message = "Generate to create an editable Canva design.") {
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

function showCanvaDesign(data) {
  generatedImageBlob = null;
  if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
  generatedImageUrl = "";

  const designUrl = data.canvaDesignUrl || "";
  generatedPreview.dataset.state = "done";
  generatedPreview.innerHTML = `
    <div class="canva-result">
      <strong>Editable Canva design created</strong>
      <p>Open the design, make any final edits, then return here and submit it to approval.</p>
      <div class="canva-actions">
        <a class="button primary" href="${escapeHtml(designUrl)}" target="_blank" rel="noopener">Open in Canva</a>
      </div>
      <small>${escapeHtml(data.canvaDesignId || data.canvaJobId || "Canva import complete")}</small>
    </div>
  `;
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
      <strong>Generating in Canva...</strong>
      <small>Reading the upload, writing the parody, importing an editable design, and waiting for Canva.</small>
    </div>
  `;
  generatedTitle.textContent = "Generating...";
  generatedCaption.textContent = "Reading the image, applying your twist, and creating a Canva design.";
  setStatus("Generating in Canva...", "working");
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
    if (response.status === 401 && data.status === "needs_canva_auth" && data.authUrl) {
      generatedPreview.dataset.state = "working";
      generatedPreview.innerHTML = `
        <div class="output-loading">
          <span></span>
          <strong>Connecting Canva...</strong>
          <small>You will come back to Studio after Canva approves the session.</small>
        </div>
      `;
      setStatus(data.message || "Connect Canva to generate.", "working");
      window.location.assign(data.authUrl);
      return;
    }
    if (!response.ok) {
      showToast(data.error || "Generate failed");
      setStatus(data.error || "Generate failed.", "needs-work");
      resetGeneratedOutput("Generation failed. Try again.");
      return;
    }

    generated = data;
    if (generated.status === "canva_imported") {
      showCanvaDesign(generated);
      generatedTitle.textContent = generated.title;
      generatedCaption.textContent = `${generated.caption} Canva design ${generated.canvaDesignId || generated.canvaJobId || "created"}.`;
      result.hidden = false;
      submitButton.disabled = !generated.canvaDesignId;
      setStatus(generated.canvaDesignId ? "Canva design created. Open it, edit if needed, then submit." : "Canva design created, but no design ID returned.", generated.canvaDesignId ? "done" : "needs-work");
      showToast("Canva design created");
      return;
    }

    if (generated.imageDataUrl) {
      showGeneratedImage(generated.imageDataUrl, generated.title);
      generatedTitle.textContent = generated.title;
      generatedCaption.textContent = `${generated.caption} Build ${generated.generationId || "fresh"}.`;
      result.hidden = false;
      submitButton.disabled = false;
      setStatus("Generated. Review, then submit.", "done");
      showToast("Generated");
      return;
    }

    showToast("No Canva design returned");
    setStatus("No Canva design returned.", "needs-work");
    resetGeneratedOutput("No Canva design returned. Try again.");
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Generation timed out after 120 seconds. Try again, or reconnect Canva if the import was interrupted."
      : "Could not reach the generator. Check the connection and try again.";
    showToast(message);
    setStatus(message, "needs-work");
    resetGeneratedOutput(message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!generated) {
    showToast("Generate first");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  const submitMessage = generated.status === "canva_imported"
    ? "Exporting from Canva to approval..."
    : "Submitting to approval...";
  setStatus(submitMessage, "working");

  try {
    const payload = new FormData();
    if (generated.status === "canva_imported") {
      if (!generated.canvaDesignId) throw new Error("Canva design ID missing. Generate again.");
      payload.set("canvaDesignId", generated.canvaDesignId);
      payload.set("canvaDesignUrl", generated.canvaDesignUrl || "");
    } else {
      if (!generatedImageBlob) throw new Error("Generate first");
      const imageName = `${generated.slug || "parody-output"}.${generatedImageBlob.type === "image/svg+xml" ? "svg" : "png"}`;
      payload.set("image", generatedImageBlob, imageName);
    }
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
    if (response.status === 401 && data.status === "needs_canva_auth" && data.authUrl) {
      setStatus(data.message || "Reconnect Canva before submitting.", "working");
      window.location.assign(data.authUrl);
      return;
    }
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
