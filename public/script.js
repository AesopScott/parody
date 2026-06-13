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

  const visiblePosts = posts.filter((post) => filter === "local" ? true : post.tag === filter);

  postGrid.innerHTML = visiblePosts.map((post) => `
    <article class="post-card">
      <a class="post-media" href="${post.url || post.image}" aria-label="Open ${post.title}">
        <img src="${post.image}" alt="${post.title}">
        <span class="post-badge">${post.tag}</span>
        <span class="post-overlay">
          <span>${formatCount(post.comments)} comments</span>
          <span>${formatCount(post.likes)} likes</span>
        </span>
      </a>
      <div class="post-body">
        <div>
          <h3>${post.title}</h3>
          <p>${post.caption}</p>
        </div>
        <div class="post-actions" aria-label="Post stats">
          <span title="Comments">Reply ${formatCount(post.comments)}</span>
          <span title="Boosts">Boost ${formatCount(post.boosts)}</span>
          <span title="Likes">Like ${formatCount(post.likes)}</span>
        </div>
      </div>
    </article>
  `).join("");
}

async function loadPosts() {
  try {
    const response = await fetch("/api/drops", { cache: "no-store" });
    if (response.ok) {
      posts = await response.json();
    }
  } catch {
    posts = fallbackPosts;
  }

  hydrateFeatured(posts[0]);
  renderPosts();
}

feedTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    feedTabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    renderPosts(tab.dataset.feedFilter);
  });
});

loadPosts();
