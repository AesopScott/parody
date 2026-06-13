const toast = document.querySelector(".toast");
const postGrid = document.querySelector(".post-grid");
const feedTabs = document.querySelectorAll("[data-feed-filter]");
const siteOrigin = "https://parodyai.win";

const fallbackPosts = [
  {
    title: "Stop Using Claude for Normal Human Tasks",
    tag: "local",
    image: "/drops/claude-uses-parody.png",
    caption: "Replying to sounds good, choosing lunch, and turning vibes into quarterly planning.",
    shareCaption: "I made a high-res workflow sheet for the most important Claude use cases: replying to \"sounds good,\" choosing lunch, and converting anxiety into roadmaps. Please download before you accidentally trust your instincts.",
    comments: 42,
    boosts: 318,
    likes: 1200,
    url: "/drops/claude-uses-parody.png"
  }
];

let posts = fallbackPosts;
let activeFilter = "local";
const votedPosts = new Set(JSON.parse(localStorage.getItem("parodyai-voted-posts") || "[]"));

function persistVotedPosts() {
  localStorage.setItem("parodyai-voted-posts", JSON.stringify([...votedPosts]));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

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

function formatCount(count) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(count || 0);
}

function postId(post) {
  return post.id || slugify(post.image || post.title);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function shareUrlFor(post) {
  const target = post.image?.startsWith("http")
    ? post.image
    : `${siteOrigin}${post.image || "/"}`;
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(target)}`;
}

function hydrateFeatured(post) {
  if (!post) return;

  const title = document.querySelector("#drops-title");
  const description = document.querySelector("#featured-description");
  const share = document.querySelector("#featured-share");
  const download = document.querySelector("#featured-download");
  const caption = document.querySelector("#caption-1");
  const imageLink = document.querySelector("#featured-image-link");
  const image = document.querySelector("#featured-image");

  if (title) title.textContent = post.title;
  if (description) description.textContent = post.caption;
  if (share) share.href = shareUrlFor(post);
  if (download) download.href = post.image;
  if (caption) caption.textContent = post.shareCaption || post.caption;
  if (imageLink) {
    imageLink.href = post.url || post.image;
    imageLink.setAttribute("aria-label", `Open ${post.title}`);
  }
  if (image) {
    image.src = post.image;
    image.alt = `Satirical infographic titled ${post.title}`;
  }

  const postCount = document.querySelector("#post-count");
  if (postCount) postCount.textContent = posts.length;
}

function renderPosts(filter = "local") {
  if (!postGrid) return;
  activeFilter = filter;

  const visiblePosts = posts.filter((post) => filter === "local" ? true : post.tag === filter);

  postGrid.innerHTML = visiblePosts.map((post) => `
    <article class="post-card" data-post-id="${escapeHtml(postId(post))}">
      <a class="post-media" href="${escapeHtml(post.url || post.image)}" aria-label="Open ${escapeHtml(post.title)}">
        <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}">
        <span class="post-badge">${escapeHtml(post.tag)}</span>
        <span class="post-overlay">
          <span>${formatCount(post.commentCount ?? post.comments)} comments</span>
          <span>${formatCount(post.upvotes ?? post.likes)} upvotes</span>
        </span>
      </a>
      <div class="post-body">
        <div>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.caption)}</p>
        </div>
        <div class="post-actions" aria-label="Post stats">
          <button class="post-action-button" type="button" data-upvote="${escapeHtml(postId(post))}" ${votedPosts.has(postId(post)) ? "disabled" : ""}>
            Upvote <span>${formatCount(post.upvotes ?? post.likes)}</span>
          </button>
          <button class="post-action-button" type="button" data-comments="${escapeHtml(postId(post))}">
            Comments <span>${formatCount(post.commentCount ?? post.comments)}</span>
          </button>
        </div>
        <div class="comment-panel" id="comments-${escapeHtml(postId(post))}" hidden>
          <form class="comment-form" data-comment-form="${escapeHtml(postId(post))}">
            <input name="name" autocomplete="name" maxlength="42" placeholder="Name">
            <textarea name="body" maxlength="420" rows="3" placeholder="Add a comment" required></textarea>
            <button class="button primary" type="submit">Post comment</button>
          </form>
          <div class="comment-list" data-comment-list="${escapeHtml(postId(post))}"></div>
        </div>
      </div>
    </article>
  `).join("");
}

async function upvotePost(id) {
  if (votedPosts.has(id)) return;
  const response = await fetch(`/api/posts/${encodeURIComponent(id)}/upvote`, { method: "POST" });
  const data = await response.json().catch(() => ({ error: "Upvote failed" }));
  if (!response.ok) throw new Error(data.error || "Upvote failed");
  votedPosts.add(id);
  persistVotedPosts();
  await loadPosts(true);
  toast.textContent = "Upvoted";
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1500);
}

function renderComments(id, comments) {
  const list = document.querySelector(`[data-comment-list="${CSS.escape(id)}"]`);
  if (!list) return;
  list.innerHTML = comments.length ? comments.map((comment) => `
    <article class="comment-item">
      <strong>${escapeHtml(comment.name || "Anonymous")}</strong>
      <p>${escapeHtml(comment.body)}</p>
    </article>
  `).join("") : "<p class=\"comment-empty\">No comments yet.</p>";
}

async function loadComments(id) {
  const response = await fetch(`/api/posts/${encodeURIComponent(id)}/comments`, { cache: "no-store" });
  const data = await response.json().catch(() => ({ error: "Could not load comments" }));
  if (!response.ok) throw new Error(data.error || "Could not load comments");
  renderComments(id, data.comments || []);
}

async function toggleComments(id) {
  const panel = document.querySelector(`#comments-${CSS.escape(id)}`);
  if (!panel) return;
  const willOpen = panel.hidden;
  panel.hidden = !panel.hidden;
  if (willOpen) await loadComments(id);
}

async function submitComment(form) {
  const id = form.dataset.commentForm;
  const payload = {
    name: form.elements.name.value,
    body: form.elements.body.value
  };
  const response = await fetch(`/api/posts/${encodeURIComponent(id)}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({ error: "Comment failed" }));
  if (!response.ok) throw new Error(data.error || "Comment failed");
  form.elements.body.value = "";
  renderComments(id, data.comments || []);
  posts = posts.map((post) => postId(post) === id ? { ...post, commentCount: data.commentCount } : post);
  renderPosts(activeFilter);
  const panel = document.querySelector(`#comments-${CSS.escape(id)}`);
  if (panel) panel.hidden = false;
  renderComments(id, data.comments || []);
}

async function loadPosts(shouldRender = true) {
  try {
    const response = await fetch("/api/drops", { cache: "no-store" });
    if (response.ok) {
      posts = await response.json();
    }
  } catch {
    posts = fallbackPosts;
  }

  hydrateFeatured(posts[0]);
  if (shouldRender) renderPosts(activeFilter);
}

feedTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    feedTabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    renderPosts(tab.dataset.feedFilter);
  });
});

postGrid.addEventListener("click", (event) => {
  const upvoteButton = event.target.closest("[data-upvote]");
  const commentsButton = event.target.closest("[data-comments]");
  if (upvoteButton) {
    upvoteButton.disabled = true;
    upvotePost(upvoteButton.dataset.upvote).catch((error) => {
      upvoteButton.disabled = false;
      toast.textContent = error.message;
      toast.classList.add("show");
      window.setTimeout(() => toast.classList.remove("show"), 1500);
    });
  }
  if (commentsButton) {
    toggleComments(commentsButton.dataset.comments).catch((error) => {
      toast.textContent = error.message;
      toast.classList.add("show");
      window.setTimeout(() => toast.classList.remove("show"), 1500);
    });
  }
});

postGrid.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  submitComment(form).catch((error) => {
    toast.textContent = error.message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1500);
  });
});

loadPosts();
