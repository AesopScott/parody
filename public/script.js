const toast = document.querySelector(".toast");
const postGrid = document.querySelector(".post-grid");
const feedTabs = document.querySelectorAll("[data-feed-filter]");

const posts = [
  {
    title: "Stop Using Claude for Normal Human Tasks",
    tag: "local",
    image: "/drops/claude-uses-parody.png",
    caption: "Replying to sounds good, choosing lunch, and turning vibes into quarterly planning.",
    comments: 42,
    boosts: 318,
    likes: 1200,
    url: "/drops/claude-uses-parody.png"
  },
  {
    title: "The 7-Agent Lunch Decision Stack",
    tag: "trending",
    image: "/drops/claude-uses-parody.png",
    caption: "One planner, one critic, one agent that asks whether soup aligns with the roadmap.",
    comments: 19,
    boosts: 144,
    likes: 864,
    url: "#queue"
  },
  {
    title: "Morning Routine Governance Layer",
    tag: "collections",
    image: "/drops/claude-uses-parody.png",
    caption: "A responsible operating model for toothbrush throughput and pajama deprecation.",
    comments: 27,
    boosts: 201,
    likes: 990,
    url: "#queue"
  },
  {
    title: "Eye Contact at Scale",
    tag: "trending",
    image: "/drops/claude-uses-parody.png",
    caption: "Automated social presence for leaders who need to appear extremely in the room.",
    comments: 33,
    boosts: 256,
    likes: 1100,
    url: "#queue"
  },
  {
    title: "The Personal Brand Incident Review",
    tag: "local",
    image: "/drops/claude-uses-parody.png",
    caption: "A blameless postmortem for the time a normal sentence escaped without a framework.",
    comments: 14,
    boosts: 98,
    likes: 740,
    url: "#queue"
  },
  {
    title: "Collections of Unnecessary Systems",
    tag: "collections",
    image: "/drops/claude-uses-parody.png",
    caption: "Reusable parody formats for screenshots that should have stayed in drafts.",
    comments: 11,
    boosts: 87,
    likes: 603,
    url: "#queue"
  }
];

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
  return Intl.NumberFormat("en", { notation: "compact" }).format(count);
}

function renderPosts(filter = "local") {
  if (!postGrid) return;

  const visiblePosts = posts.filter((post) => filter === "local" ? true : post.tag === filter);

  postGrid.innerHTML = visiblePosts.map((post) => `
    <article class="post-card">
      <a class="post-media" href="${post.url}" aria-label="Open ${post.title}">
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

feedTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    feedTabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    renderPosts(tab.dataset.feedFilter);
  });
});

renderPosts();
