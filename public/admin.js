const tokenForm = document.querySelector("#token-form");
const dropForm = document.querySelector("#drop-form");
const pendingGrid = document.querySelector("#pending-grid");
const refreshButton = document.querySelector("#refresh-pending");
const toast = document.querySelector(".toast");

function token() {
  return localStorage.getItem("parodyai-admin-token") || "";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(tokenForm);
  localStorage.setItem("parodyai-admin-username", String(form.get("username") || ""));
  localStorage.setItem("parodyai-admin-token", String(form.get("password") || ""));
  showToast("Login saved");
  loadPending();
});

dropForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const form = new FormData(dropForm);
    await api("/api/pending", { method: "POST", body: form });
    dropForm.reset();
    showToast("Submitted for approval");
    loadPending();
  } catch (error) {
    showToast(error.message);
  }
});

async function approve(id) {
  const result = await api("/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  showToast("Published");
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
  loadPending();
}

async function loadPending() {
  try {
    const items = await api("/api/pending");
    pendingGrid.innerHTML = items.length ? items.map((item) => `
      <article class="post-card">
        <a class="post-media" href="${item.image}" target="_blank" rel="noreferrer">
          <img src="${item.image}" alt="${item.title}">
          <span class="post-badge">pending</span>
        </a>
        <div class="post-body">
          <div>
            <h3>${item.title}</h3>
            <p>${item.caption}</p>
          </div>
          <div class="actions compact-actions">
            <button class="button primary" type="button" data-approve="${item.id}">Approve</button>
            <button class="button" type="button" data-reject="${item.id}">Reject</button>
          </div>
        </div>
      </article>
    `).join("") : "<p>No pending drops.</p>";
  } catch (error) {
    pendingGrid.innerHTML = `<p>${error.message}</p>`;
  }
}

pendingGrid.addEventListener("click", (event) => {
  const approveButton = event.target.closest("[data-approve]");
  const rejectButton = event.target.closest("[data-reject]");
  if (approveButton) approve(approveButton.dataset.approve).catch((error) => showToast(error.message));
  if (rejectButton) reject(rejectButton.dataset.reject).catch((error) => showToast(error.message));
});

refreshButton.addEventListener("click", loadPending);
loadPending();
