const APPROVED_INDEX = "approved:index";
const PENDING_INDEX = "pending:index";
const MAX_IMAGE_BYTES = 1024 * 1024 * 8;
const OPENAI_TIMEOUT_MS = 35000;
const APP_VERSION = "0.1.3";

function json(value, init = {}) {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

function text(value, init = {}) {
  return new Response(value, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

function html(value, init = {}) {
  return new Response(value, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

function unauthorized() {
  return json({ error: "Admin approval token required." }, { status: 401 });
}

function requestError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function adminToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-admin-token") || "";
}

function requireAdmin(request, env) {
  return Boolean(env.ADMIN_TOKEN && adminToken(request) === env.ADMIN_TOKEN);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function publicOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function postIdFor(drop) {
  return String(drop.id || slugify(drop.image || drop.title) || crypto.randomUUID());
}

function studioPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parody AI Studio</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">✱</span>
      <span>Parody AI Studio</span>
      <span class="build-version">v${APP_VERSION}</span>
    </a>
    <nav class="nav">
      <a href="/">Public site</a>
      <a href="/admin">Admin</a>
    </nav>
  </header>

  <main class="studio-workspace">
    <section class="studio-input-panel" aria-labelledby="studio-title">
      <p class="eyebrow">Generate a parody</p>
      <h1 id="studio-title">Upload. Generate. Submit.</h1>

      <form id="studio-form" class="single-studio-form">
        <label class="upload-box">
          <span>Upload source image</span>
          <input name="image" type="file" accept="image/png,image/jpeg,image/webp" required>
        </label>

        <label class="direction-line">
          <span>Give your twist on the output</span>
          <textarea name="direction" rows="3" maxlength="240" placeholder="Example: make it about executive aura"></textarea>
        </label>

        <div class="studio-preview" id="preview">
          <span>No image selected</span>
        </div>

        <div class="actions">
          <button class="button primary" type="button" id="generate-button">Generate</button>
          <button class="button" type="submit" id="submit-button" disabled>Submit</button>
        </div>
        <p class="studio-status" id="studio-status" role="status" aria-live="polite">Ready.</p>
      </form>
    </section>

    <section class="studio-output-panel" aria-labelledby="output-title">
      <div class="studio-output-head">
        <p class="eyebrow">Generated image</p>
        <h2 id="output-title">Output</h2>
      </div>
      <div class="generated-preview" id="generated-preview">
        <span>Generate to see the parody image.</span>
      </div>
      <div class="caption-card studio-result" id="studio-result" hidden>
        <div class="caption-head">
          <span>Generated drop</span>
        </div>
        <p id="generated-title">Ready for review</p>
        <p id="generated-caption">Submit sends this to the admin approval queue.</p>
      </div>
    </section>
  </main>

  <div class="toast" role="status" aria-live="polite">Done</div>
  <script src="/studio.js?v=${APP_VERSION}"></script>
</body>
</html>`;
}

function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parody AI Admin</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">✱</span>
      <span>Parody AI Admin</span>
    </a>
    <nav class="nav">
      <a href="/">Public site</a>
      <a href="/studio">Studio</a>
    </nav>
  </header>

  <main class="studio-main">
    <section class="single-studio" aria-labelledby="admin-title">
      <p class="eyebrow">Approval queue</p>
      <h1 id="admin-title">Review submissions.</h1>

      <form class="admin-login" id="token-form">
        <input name="password" type="password" autocomplete="current-password" placeholder="Admin password" required>
        <button class="button primary" type="submit">Log in</button>
      </form>
      <p class="studio-status" id="admin-status" role="status" aria-live="polite">Enter the admin password to view submissions.</p>

      <div class="actions">
        <button class="button" id="refresh-pending" type="button">Refresh submissions</button>
      </div>

      <div class="approval-list" id="pending-grid"></div>
    </section>
  </main>

  <div class="toast" role="status" aria-live="polite">Done</div>
  <script src="/admin.js"></script>
</body>
</html>`;
}

async function readIndex(kv, key) {
  return (await kv.get(key, "json")) || [];
}

async function writeIndex(kv, key, entries) {
  await kv.put(key, JSON.stringify(entries, null, 2));
}

async function readStaticDrops(env, request) {
  const response = await env.ASSETS.fetch(new URL("/drops.json", request.url));
  if (!response.ok) return [];
  return response.json();
}

async function readVotes(env, postId) {
  return Number(await env.PARODY_DROPS.get(`votes:${postId}`)) || 0;
}

async function writeVotes(env, postId, count) {
  await env.PARODY_DROPS.put(`votes:${postId}`, String(Math.max(0, Number(count) || 0)));
}

async function readComments(env, postId) {
  return (await env.PARODY_DROPS.get(`comments:${postId}`, "json")) || [];
}

async function writeComments(env, postId, comments) {
  await env.PARODY_DROPS.put(`comments:${postId}`, JSON.stringify(comments.slice(0, 100), null, 2));
}

async function hydrateDropEngagement(env, drop) {
  const id = postIdFor(drop);
  const comments = await readComments(env, id);
  const upvotes = await readVotes(env, id);
  const seedUpvotes = Number(drop.upvotes ?? drop.likes ?? 0) || 0;
  return {
    ...drop,
    id,
    upvotes: seedUpvotes + upvotes,
    likes: seedUpvotes + upvotes,
    commentCount: comments.length,
    comments: comments.length
  };
}

function imageTypeFromName(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function extensionForType(type) {
  if (type === "image/svg+xml") return ".svg";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return ".png";
}

function titleFromFilename(name) {
  const clean = String(name || "parody drop")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Fresh Parody Drop";
  return clean
    .split(" ")
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
    .join(" ");
}

function normalizeDirection(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function titleFromDirection(direction) {
  const clean = normalizeDirection(direction)
    .replace(/^(make it|make this|turn it|turn this)\s+(about|into|toward|for)\s+/i, "")
    .replace(/^about\s+/i, "")
    .trim();
  if (!clean) return "";
  return clean
    .split(" ")
    .slice(0, 7)
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "")
    .join(" ");
}

function fallbackTopic(fileName, direction) {
  const directed = titleFromDirection(direction);
  if (directed) return directed;
  return titleFromFilename(fileName).replace(/^Parody\s*/i, "") || "LinkedIn Wisdom";
}

function generatedMetadata(fileName, directionValue = "") {
  const direction = normalizeDirection(directionValue);
  const directedTitle = titleFromDirection(direction);
  const baseTitle = titleFromFilename(fileName);
  const titleBase = directedTitle || baseTitle;
  const title = titleBase.toLowerCase().includes("parody") ? titleBase : `Parody: ${titleBase}`;
  const target = directedTitle ? directedTitle.toLowerCase() : "a productivity artifact that probably needed fewer boxes";
  const note = direction || target;
  return {
    title,
    caption: `A fresh workflow document of absurdity aimed at ${target}.`,
    shareCaption: `I fed an earnest AI workflow image into Parody AI with one note: ${note}. It came back with a more honest version.`,
    slug: slugify(title),
    direction
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapWords(value, maxChars, maxLines) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const match = lines[index].match(/^(.*)\s+\b(a|an|and|as|at|by|for|from|in|into|of|or|the|to|with)\.?$/i);
    if (!match) continue;
    const movedWord = match[2];
    const nextLine = `${movedWord} ${lines[index + 1]}`;
    if (nextLine.length > maxChars + 6) continue;
    lines[index] = match[1].trim();
    lines[index + 1] = nextLine.trim();
  }
  return lines.filter(Boolean);
}

function textBlock(value, x, y, maxChars, maxLines, lineHeight, options = {}) {
  const { size = 28, weight = 700, fill = "#111217", anchor = "start", italic = false } = options;
  return wrapWords(value, maxChars, maxLines)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" font-style="${italic ? "italic" : "normal"}" fill="${fill}">${xmlEscape(line)}</text>`)
    .join("");
}

function defaultParodyCopy(fileName, direction) {
  const topic = fallbackTopic(fileName, direction);
  const topicLower = topic.toLowerCase();
  return {
    title: `Stop Optimizing ${topic}`,
    subtitle: `Your ${topicLower} strategy counts aura leaks, not useful outcomes. Here's how to operationalize the nonsense.`,
    badge: "Absurdity Memo",
    sections: [
      {
        heading: "Edit, Don't Exist",
        metric: "37% less personality load",
        body: "Revise the last thing you almost meant until it becomes a reusable stance.",
        protocol: "Protocol: one feeling in, four bullet points out.",
        wastes: "Direct speech",
        saves: "Strategic fog",
        slogan: "Never reply. Rebrand."
      },
      {
        heading: "Batch the Cringe",
        metric: "3 regrets = 1 roadmap",
        body: "Combine tiny embarrassments into a single executive operating model.",
        protocol: "Load once. Reference forever. Apologize never.",
        wastes: "One honest sentence",
        saves: "Three committees",
        slogan: "Centralize the discomfort."
      },
      {
        heading: "Quantify the Aura",
        metric: "20x certainty per vibe",
        body: "Use precise numbers for things nobody has successfully measured.",
        protocol: "If it has a decimal, it has authority.",
        wastes: "Human nuance",
        saves: "Dashboard confidence",
        slogan: "Measure the unmeasurable."
      },
      {
        heading: "Trim Human Context",
        metric: "5x fewer clarifying texts",
        body: "Disable empathy connectors unless the stakeholder is actively watching.",
        protocol: "Calendar on. Feelings off. Search optional.",
        wastes: "Being normal",
        saves: "Process maturity",
        slogan: "Load light. Seem deep."
      },
      {
        heading: "Pace Your Delusion",
        metric: "90 min bursts of destiny",
        body: "Split one ordinary workday into three premium transformation windows.",
        protocol: "Reset confidence every time Slack goes quiet.",
        wastes: "Lunch choice",
        saves: "Executive bandwidth",
        slogan: "Don't sprint. Spiral."
      },
      {
        heading: "Pin a Reusable Self",
        metric: "1x base identity, 4x polish",
        body: "Lock a voice, a posture, and a fake preference file for all future sincerity.",
        protocol: "Switch from Human to Thought Leader in one click.",
        wastes: "Self-awareness",
        saves: "LinkedIn reach",
        slogan: "Pick your voice. Reuse forever."
      }
    ],
    quote: "If it fits in a card, it counts as strategy.",
    footer: `Download this completely unnecessary ${topicLower} sheet from parodyai.win`
  };
}

function isBlandParodyText(value) {
  return /\b(101|advanced topics|best practices|course|courses|definitive guide|epic win|foundation|foundations|getting started|guide|in action|laugh|master|mastering|maximize|minimize|must-take|potential|productivity|transform|transforming|triumph|ultimate|unlock|unlocking)\b/i.test(String(value || ""));
}

function isIncompleteFragment(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return /\b(a|an|and|as|at|by|for|from|in|into|of|or|the|to|with)\.?$/i.test(text);
}

function sliceAtWord(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength + 1);
  const boundary = sliced.lastIndexOf(" ");
  return (boundary > Math.floor(maxLength * 0.6) ? sliced.slice(0, boundary) : text.slice(0, maxLength)).trim();
}

function cleanParodyField(value, fallback, maxLength, options = {}) {
  const { rejectBland = false } = options;
  const text = sliceAtWord(value || fallback, maxLength);
  if (isIncompleteFragment(text)) return sliceAtWord(fallback, maxLength);
  if (rejectBland && isBlandParodyText(text)) return sliceAtWord(fallback, maxLength);
  return text;
}

function normalizeParodyCopy(value, fileName, direction) {
  const fallback = defaultParodyCopy(fileName, direction);
  const sections = Array.isArray(value?.sections) ? value.sections : [];
  return {
    ...fallback,
    ...value,
    title: cleanParodyField(value?.title, fallback.title, 62, { rejectBland: true }),
    subtitle: cleanParodyField(value?.subtitle, fallback.subtitle, 155, { rejectBland: true }),
    badge: cleanParodyField(value?.badge, fallback.badge, 22, { rejectBland: true }),
    sections: fallback.sections.map((fallbackSection, index) => {
      const section = sections[index] || {};
      return {
        heading: cleanParodyField(section.heading, fallbackSection.heading, 38, { rejectBland: true }),
        metric: cleanParodyField(section.metric, fallbackSection.metric, 34),
        body: cleanParodyField(section.body, fallbackSection.body, 120),
        protocol: cleanParodyField(section.protocol, fallbackSection.protocol, 62),
        wastes: cleanParodyField(section.wastes, fallbackSection.wastes, 28),
        saves: cleanParodyField(section.saves, fallbackSection.saves, 28),
        slogan: cleanParodyField(section.slogan, fallbackSection.slogan, 38)
      };
    }),
    quote: cleanParodyField(value?.quote, fallback.quote, 88, { rejectBland: true }),
    footer: cleanParodyField(value?.footer, fallback.footer, 82, { rejectBland: true })
  };
}

function renderParodySvg(copy, metadata) {
  const cards = copy.sections.map((section, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + col * 455;
    const y = 335 + row * 315;
    return `
      <g>
        <rect x="${x}" y="${y}" width="405" height="285" rx="18" fill="#fffaf3" stroke="#e1d1c4" stroke-width="3"/>
        <circle cx="${x + 35}" cy="${y + 38}" r="19" fill="#f04418"/>
        <text x="${x + 35}" y="${y + 47}" text-anchor="middle" font-size="25" font-weight="950" fill="#fff">${index + 1}</text>
        ${textBlock(section.heading, x + 70, y + 38, 20, 2, 28, { size: 27, weight: 950 })}
        <rect x="${x + 25}" y="${y + 76}" width="354" height="28" rx="14" fill="#fff2eb"/>
        ${textBlock(section.metric, x + 44, y + 96, 33, 1, 18, { size: 15, weight: 950, fill: "#f04418" })}
        ${textBlock(section.body, x + 28, y + 130, 32, 2, 23, { size: 18, weight: 700, fill: "#303640" })}
        <rect x="${x + 24}" y="${y + 176}" width="357" height="28" rx="8" fill="#f4efe8"/>
        ${textBlock(section.protocol, x + 36, y + 196, 42, 1, 18, { size: 14, weight: 850, fill: "#5b6472" })}
        <rect x="${x + 22}" y="${y + 214}" width="169" height="42" rx="9" fill="#fff2eb"/>
        <rect x="${x + 214}" y="${y + 214}" width="169" height="42" rx="9" fill="#edf7ef"/>
        <text x="${x + 34}" y="${y + 232}" font-size="14" font-weight="950" fill="#f04418">WASTES</text>
        <text x="${x + 226}" y="${y + 232}" font-size="14" font-weight="950" fill="#167a4b">SAVES</text>
        ${textBlock(section.wastes, x + 34, y + 250, 15, 1, 18, { size: 15, weight: 800 })}
        ${textBlock(section.saves, x + 226, y + 250, 15, 1, 18, { size: 15, weight: 800 })}
        ${textBlock(section.slogan, x + 28, y + 278, 31, 1, 18, { size: 17, weight: 950 })}
      </g>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
    <rect width="1024" height="1536" fill="#fffdf8"/>
    <rect x="0" y="1460" width="1024" height="76" fill="#e97652"/>
    <circle cx="846" cy="120" r="72" fill="#ffe0c7" stroke="#f04418" stroke-width="8"/>
    <text x="846" y="146" text-anchor="middle" font-size="86" font-weight="950" fill="#f04418">*</text>
    <rect x="717" y="42" width="250" height="46" rx="23" fill="#f04418"/>
    <text x="842" y="72" text-anchor="middle" font-size="19" font-weight="900" fill="#fff">${xmlEscape(copy.badge)}</text>
    ${textBlock(copy.title, 56, 76, 18, 3, 54, { size: 54, weight: 950 })}
    ${textBlock(copy.subtitle, 58, 230, 54, 2, 31, { size: 25, weight: 650, fill: "#303640" })}
    <line x1="58" y1="322" x2="966" y2="322" stroke="#f04418" stroke-width="3"/>
    <text x="58" y="301" font-size="34" font-weight="950" fill="#111217">6 Absurd Habits That Save Face</text>
    ${cards}
    <rect x="146" y="1262" width="732" height="94" rx="20" fill="#fff" stroke="#e1d1c4" stroke-width="3"/>
    <text x="198" y="1318" font-size="42" font-weight="950" fill="#111217">“</text>
    ${textBlock(copy.quote, 246, 1318, 52, 1, 24, { size: 24, weight: 800, fill: "#303640", italic: true })}
    <text x="512" y="1506" text-anchor="middle" font-size="24" font-weight="800" fill="#111217">${xmlEscape(copy.footer)}</text>
    <text x="56" y="1432" font-size="16" font-weight="800" fill="#8a6f61">PARODY AI · generated from user-submitted source</text>
  </svg>`;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

async function fetchWithTimeout(url, options, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw requestError(timeoutMessage, 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateParodyCopy(image, direction, env) {
  if (!env.OPENAI_API_KEY) {
    throw requestError("OpenAI API key is not configured, so generation cannot run.", 500);
  }

  const imageData = await image.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(imageData);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const dataUrl = `data:${image.type};base64,${btoa(binary)}`;
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: [
            "Return JSON only. Create readable parody copy for a dense LinkedIn-style workflow infographic.",
            "Target: LinkedIn AI productivity theater, fake precision, tool worship, and corporate self-optimization.",
            "The parody must be obviously funny at the class/card-title level, not merely plausible.",
            "Avoid legitimate course names or helpful training titles. Banned examples: Claude 101, Framework & Foundations, Advanced Topics, Claude Code in Action, Master AI, Best Practices, Getting Started.",
            "Use absurd operational verbs, fake metrics, arbitrary thresholds, faux-governance language, and confident slogans.",
            "Preserve the source's rough skeleton, but make every word new and satirical."
          ].join(" ")
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Twist: ${normalizeDirection(direction) || "productivity theater"}.`,
                "Return keys: title, subtitle, badge, sections array of exactly 6 objects with heading, metric, body, protocol, wastes, saves, slogan, plus quote and footer.",
                "Headings should sound like parody workflow commandments: e.g. Edit, Don't Exist; Batch the Cringe; Quantify the Aura; Trim Human Context; Pace Your Delusion; Pin a Reusable Self.",
                "Do not write real class titles. Do not be useful first; be funny first, then formatted.",
                "Make each card dense with one fake metric, one concrete absurd protocol, and one punchy slogan.",
                "Keep fields short enough for fixed infographic cards."
              ].join(" ")
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ]
    })
  }, OPENAI_TIMEOUT_MS, "Generation timed out while waiting for the AI copy step. Try again with a smaller image or a shorter twist.");

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI copy generation failed with ${response.status}.`);
  }

  try {
    return normalizeParodyCopy(JSON.parse(payload.choices?.[0]?.message?.content || "{}"), image.name, direction);
  } catch {
    throw requestError("The AI returned unreadable parody copy. Try generating again.", 502);
  }
}

async function handleDrops(request, env) {
  const approved = await readIndex(env.PARODY_DROPS, APPROVED_INDEX);
  const fallback = await readStaticDrops(env, request);
  const seen = new Set(approved.map((drop) => drop.image));
  const drops = [...approved, ...fallback.filter((drop) => !seen.has(drop.image))];
  return json(await Promise.all(drops.map((drop) => hydrateDropEngagement(env, drop))));
}

async function handleUpvote(request, env, postId) {
  if (!postId) return json({ error: "Post id is required." }, { status: 400 });
  const current = await readVotes(env, postId);
  const upvotes = current + 1;
  await writeVotes(env, postId, upvotes);
  return json({ id: postId, upvotes });
}

async function handleComments(request, env, postId) {
  if (!postId) return json({ error: "Post id is required." }, { status: 400 });
  const comments = await readComments(env, postId);
  return json({ id: postId, comments });
}

async function handleCreateComment(request, env, postId) {
  if (!postId) return json({ error: "Post id is required." }, { status: 400 });
  const payload = await request.json().catch(() => ({}));
  const body = String(payload.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
  const name = String(payload.name || "Anonymous")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42) || "Anonymous";
  if (body.length < 2) return json({ error: "Comment is too short." }, { status: 400 });

  const comment = {
    id: crypto.randomUUID(),
    name,
    body,
    createdAt: new Date().toISOString()
  };
  const comments = await readComments(env, postId);
  const nextComments = [comment, ...comments].slice(0, 100);
  await writeComments(env, postId, nextComments);
  return json({ id: postId, comment, comments: nextComments, commentCount: nextComments.length });
}

async function handleImage(request, env) {
  const url = new URL(request.url);
  const name = decodeURIComponent(url.pathname.replace("/api/images/", ""));
  const key = `image:${name}`;
  const image = await env.PARODY_DROPS.get(key, "arrayBuffer")
    || await env.PARODY_DROPS.get(`pending-image:${name}`, "arrayBuffer");
  if (!image) return text("Not found", { status: 404 });
  return new Response(image, {
    headers: {
      "content-type": imageTypeFromName(name),
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}

async function handlePendingList(request, env) {
  if (!requireAdmin(request, env)) return unauthorized();
  return json(await readIndex(env.PARODY_DROPS, PENDING_INDEX));
}

async function handleCreatePending(request, env) {
  const form = await request.formData();
  const image = form.get("image");
  const generated = generatedMetadata(image?.name, form.get("direction"));
  const title = String(form.get("title") || generated.title).trim();
  const caption = String(form.get("caption") || generated.caption).trim();
  const shareCaption = String(form.get("shareCaption") || generated.shareCaption).trim();
  const tag = String(form.get("tag") || "local").trim();

  if (!(image instanceof File)) return json({ error: "Image file is required." }, { status: 400 });
  if (!title || !caption) return json({ error: "Title and caption are required." }, { status: 400 });
  if (!image.type.startsWith("image/")) return json({ error: "Only image uploads are supported." }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return json({ error: "Image is too large." }, { status: 413 });

  const id = crypto.randomUUID();
  const slug = slugify(form.get("slug") || title) || id;
  const ext = extensionForType(image.type);
  const imageName = `${slug}-${id.slice(0, 8)}${ext}`;
  const now = new Date().toISOString();
  const entry = {
    id,
    title,
    tag,
    image: `/api/images/${imageName}`,
    caption,
    shareCaption,
    direction: generated.direction,
    comments: 0,
    boosts: 0,
    likes: 0,
    url: `/api/images/${imageName}`,
    status: "pending",
    submittedAt: now
  };

  await env.PARODY_DROPS.put(`pending-image:${imageName}`, await image.arrayBuffer());
  await env.PARODY_DROPS.put(`pending:${id}`, JSON.stringify(entry, null, 2));

  const pending = await readIndex(env.PARODY_DROPS, PENDING_INDEX);
  await writeIndex(env.PARODY_DROPS, PENDING_INDEX, [entry, ...pending.filter((item) => item.id !== id)]);

  return json({ status: "pending", entry });
}

async function handleGenerate(request, env) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return json({ error: "Image file is required." }, { status: 400 });
  if (!image.type.startsWith("image/")) return json({ error: "Only image uploads are supported." }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return json({ error: "Image is too large." }, { status: 413 });
  const generated = generatedMetadata(image.name, form.get("direction"));
  const copy = await generateParodyCopy(image, generated.direction, env);
  const normalized = normalizeParodyCopy(copy, image.name, generated.direction);
  const title = normalized.title.toLowerCase().includes("parody") ? normalized.title : `Parody: ${normalized.title}`;
  const svg = renderParodySvg(normalized, generated);
  return json({
    status: "generated",
    ...generated,
    title,
    caption: normalized.subtitle,
    shareCaption: `${normalized.title}: ${normalized.quote}`,
    slug: slugify(title),
    imageDataUrl: svgDataUrl(svg),
    imageMimeType: "image/svg+xml"
  });
}

async function handleApprove(request, env) {
  if (!requireAdmin(request, env)) return unauthorized();

  const { id } = await request.json();
  if (!id) return json({ error: "Pending id is required." }, { status: 400 });

  const entry = await env.PARODY_DROPS.get(`pending:${id}`, "json");
  if (!entry) return json({ error: "Pending drop not found." }, { status: 404 });

  const imageName = entry.image.replace("/api/images/", "");
  const image = await env.PARODY_DROPS.get(`pending-image:${imageName}`, "arrayBuffer");
  if (!image) return json({ error: "Pending image not found." }, { status: 404 });

  const approvedEntry = {
    ...entry,
    status: "approved",
    approvedAt: new Date().toISOString(),
    comments: entry.comments || 7,
    boosts: entry.boosts || 88,
    likes: entry.likes || 420
  };

  await env.PARODY_DROPS.put(`image:${imageName}`, image);
  const approved = await readIndex(env.PARODY_DROPS, APPROVED_INDEX);
  await writeIndex(env.PARODY_DROPS, APPROVED_INDEX, [approvedEntry, ...approved.filter((item) => item.id !== id)]);

  const pending = await readIndex(env.PARODY_DROPS, PENDING_INDEX);
  await writeIndex(env.PARODY_DROPS, PENDING_INDEX, pending.filter((item) => item.id !== id));
  await env.PARODY_DROPS.delete(`pending:${id}`);
  await env.PARODY_DROPS.delete(`pending-image:${imageName}`);

  return json({
    status: "approved",
    entry: approvedEntry,
    liveUrl: `${publicOrigin(request)}/#fediverse`,
    imageUrl: `${publicOrigin(request)}${approvedEntry.image}`
  });
}

async function handleReject(request, env) {
  if (!requireAdmin(request, env)) return unauthorized();

  const { id } = await request.json();
  if (!id) return json({ error: "Pending id is required." }, { status: 400 });

  const entry = await env.PARODY_DROPS.get(`pending:${id}`, "json");
  if (entry?.image) {
    await env.PARODY_DROPS.delete(`pending-image:${entry.image.replace("/api/images/", "")}`);
  }
  await env.PARODY_DROPS.delete(`pending:${id}`);
  const pending = await readIndex(env.PARODY_DROPS, PENDING_INDEX);
  await writeIndex(env.PARODY_DROPS, PENDING_INDEX, pending.filter((item) => item.id !== id));

  return json({ status: "rejected", id });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/(upvote|comments)$/);
      if (postMatch?.[2] === "upvote" && request.method === "POST") {
        return handleUpvote(request, env, decodeURIComponent(postMatch[1]));
      }
      if (postMatch?.[2] === "comments" && request.method === "GET") {
        return handleComments(request, env, decodeURIComponent(postMatch[1]));
      }
      if (postMatch?.[2] === "comments" && request.method === "POST") {
        return handleCreateComment(request, env, decodeURIComponent(postMatch[1]));
      }

      if (url.pathname === "/api/drops" && request.method === "GET") return handleDrops(request, env);
      if (url.pathname === "/api/generate" && request.method === "POST") return handleGenerate(request, env);
      if (url.pathname.startsWith("/api/images/") && request.method === "GET") return handleImage(request, env);
      if (url.pathname === "/api/pending" && request.method === "GET") return handlePendingList(request, env);
      if (url.pathname === "/api/pending" && request.method === "POST") return handleCreatePending(request, env);
      if (url.pathname === "/api/approve" && request.method === "POST") return handleApprove(request, env);
      if (url.pathname === "/api/reject" && request.method === "POST") return handleReject(request, env);
      if (url.pathname === "/admin") return html(adminPage());
      if (url.pathname === "/studio") return html(studioPage(), { headers: { "cache-control": "no-store" } });

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message || "Request failed." }, { status: error.status || 500 });
    }
  }
};
