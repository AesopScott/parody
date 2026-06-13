const form = document.querySelector("#drop-form");
const output = document.querySelector("#studio-output");
const toast = document.querySelector(".toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1600);
}

document.querySelector("#copy-brief")?.addEventListener("click", async () => {
  const data = Object.fromEntries(new FormData(form).entries());
  const brief = [
    `Title: ${data.title || ""}`,
    `Feed caption: ${data.caption || ""}`,
    `LinkedIn caption: ${data.shareCaption || ""}`,
    `Slug: ${data.slug || ""}`
  ].join("\n");

  output.textContent = brief;
  await navigator.clipboard.writeText(brief);
  showToast("Brief copied");
});
