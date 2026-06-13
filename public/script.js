const toast = document.querySelector(".toast");

async function copyText(selector) {
  const target = document.querySelector(selector);
  if (!target) return;

  await navigator.clipboard.writeText(target.textContent.trim());
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1500);
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copyText(button.dataset.copy));
});
