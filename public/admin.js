const tokenForm = document.querySelector("#token-form");
const pendingGrid = document.querySelector("#pending-grid");
const refreshButton = document.querySelector("#refresh-pending");
const adminStatus = document.querySelector("#admin-status");
const toast = document.querySelector(".toast");

function token() {
  return localStorage.getItem("parodyai-admin-token") || "";
}

function setAdminStatus(message, state = "") {
  adminStatus.textContent = message;
  adminStatus.dataset.state = state;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({ error: "Request failed" }));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(tokenForm);
  localStorage.setItem("parodyai-admin-token", String(form.get("password") || ""));
  setAdminStatus("Checking password...", "working");
  try {
    const count = await loadPending();
    showToast("Logged in");
    setAdminStatus(count ? `Logged in. ${count} submission${count === 1 ? "" : "s"} waiting.` : "Logged in. No pending submissions.", "done");
  } catch (error) {
    localStorage.removeItem("parodyai-admin-token");
    pendingGrid.innerHTML = "<p>Log in to review submissions.</p>";
    showToast(error.message);
    setAdminStatus(error.message, "needs-work");
  }
});

async function approve(id) {
  const result = await api("/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  showToast("Published");
  setAdminStatus("Published. Removed from approval queue.", "done");
  window.open(result.liveUrl, "_blank", "noopener,noreferrer");
  loadPending();
}

async function reject(id) {
  await api("/api/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  showToast("Rejected");
  setAdminStatus("Rejected. Removed from approval queue.", "done");
  loadPending();
}

async function loadPending() {
  if (!token()) {
    pendingGrid.innerHTML = "<p>Log in to review submissions.</p>";
    setAdminStatus("Enter the admin password to view submissions.");
    return 0;
  }

  const items = await api("/api/pending");
  pendingGrid.innerHTML = items.length ? items.map((item) => `
    <article class="approval-item">
      <a class="approval-image" href="${escapeHtml(item.image)}" target="_blank" rel="noreferrer">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">
      </a>
      <div class="approval-copy">
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.caption)}</p>
        <div class="actions compact-actions">
          <button class="button primary" type="button" data-approve="${escapeHtml(item.id)}">Approve</button>
          <button class="button" type="button" data-reject="${escapeHtml(item.id)}">Reject</button>
        </div>
      </div>
    </article>
  `).join("") : "<p>No pending submissions. Generated images appear here after Studio submit.</p>";
  setAdminStatus(items.length ? `Logged in. ${items.length} submission${items.length === 1 ? "" : "s"} waiting.` : "Logged in. No pending submissions.", "done");
  return items.length;
}

pendingGrid.addEventListener("click", (event) => {
  const approveButton = event.target.closest("[data-approve]");
  const rejectButton = event.target.closest("[data-reject]");
  if (approveButton) approve(approveButton.dataset.approve).catch((error) => showToast(error.message));
  if (rejectButton) reject(rejectButton.dataset.reject).catch((error) => showToast(error.message));
});

refreshButton.addEventListener("click", () => {
  setAdminStatus("Refreshing submissions...", "working");
  loadPending().catch((error) => {
    showToast(error.message);
    setAdminStatus(error.message, "needs-work");
  });
});
loadPending().catch((error) => {
  pendingGrid.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  setAdminStatus(error.message, "needs-work");
});
