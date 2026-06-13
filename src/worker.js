const APPROVED_INDEX = "approved:index";
const PENDING_INDEX = "pending:index";
const MAX_IMAGE_BYTES = 1024 * 1024 * 8;

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

function unauthorized() {
  return json({ error: "Admin approval token required." }, { status: 401 });
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
  return lines;
}

function textBlock(value, x, y, maxChars, maxLines, lineHeight, options = {}) {
  const { size = 28, weight = 700, fill = "#111217", anchor = "start", italic = false } = options;
  return wrapWords(value, maxChars, maxLines)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" font-style="${italic ? "italic" : "normal"}" fill="${fill}">${xmlEscape(line)}</text>`)
    .join("");
}

function defaultParodyCopy(fileName, direction) {
  const metadata = generatedMetadata(fileName, direction);
  return {
    title: metadata.title.replace(/^Parody:\s*/i, ""),
    subtitle: "A practical framework for converting normal judgment into operational theater.",
    badge: "Workflow Document",
    sections: [
      {
        heading: "Draft the Vibe",
        body: "Turn one loose feeling into a six-step system before anyone asks for evidence.",
        wastes: "Direct speech",
        saves: "Strategic fog"
      },
      {
        heading: "Add a Governance Layer",
        body: "Rename hesitation as oversight and let the diagram do the emotional labor.",
        wastes: "One honest sentence",
        saves: "Three committees"
      },
      {
        heading: "Quantify the Aura",
        body: "Use precise numbers for things nobody has successfully measured.",
        wastes: "Human nuance",
        saves: "Dashboard confidence"
      },
      {
        heading: "Batch the Apologies",
        body: "Convert every awkward follow-up into a reusable accountability pipeline.",
        wastes: "Being normal",
        saves: "Process maturity"
      },
      {
        heading: "Protect Founder Energy",
        body: "Move small decisions into a framework so the calendar feels visionary.",
        wastes: "Lunch choice",
        saves: "Executive bandwidth"
      },
      {
        heading: "Publish the Matrix",
        body: "If the insight feels thin, increase the border radius and add a footer.",
        wastes: "Self-awareness",
        saves: "LinkedIn reach"
      }
    ],
    quote: "If it fits in a card, it counts as strategy.",
    footer: "Download this completely unnecessary sheet from parodyai.win"
  };
}

function normalizeParodyCopy(value, fileName, direction) {
  const fallback = defaultParodyCopy(fileName, direction);
  const sections = Array.isArray(value?.sections) ? value.sections : [];
  return {
    ...fallback,
    ...value,
    title: String(value?.title || fallback.title).slice(0, 90),
    subtitle: String(value?.subtitle || fallback.subtitle).slice(0, 170),
    badge: String(value?.badge || fallback.badge).slice(0, 34),
    sections: fallback.sections.map((fallbackSection, index) => {
      const section = sections[index] || {};
      return {
        heading: String(section.heading || fallbackSection.heading).slice(0, 42),
        body: String(section.body || fallbackSection.body).slice(0, 145),
        wastes: String(section.wastes || fallbackSection.wastes).slice(0, 34),
        saves: String(section.saves || fallbackSection.saves).slice(0, 34)
      };
    }),
    quote: String(value?.quote || fallback.quote).slice(0, 100),
    footer: String(value?.footer || fallback.footer).slice(0, 90)
  };
}

function renderParodySvg(copy, metadata) {
  const cards = copy.sections.map((section, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + col * 455;
    const y = 370 + row * 285;
    return `
      <g>
        <rect x="${x}" y="${y}" width="405" height="240" rx="18" fill="#fffaf3" stroke="#e1d1c4" stroke-width="3"/>
        <circle cx="${x + 35}" cy="${y + 38}" r="19" fill="#f04418"/>
        <text x="${x + 35}" y="${y + 47}" text-anchor="middle" font-size="25" font-weight="950" fill="#fff">${index + 1}</text>
        ${textBlock(section.heading, x + 70, y + 38, 20, 2, 28, { size: 27, weight: 950 })}
        ${textBlock(section.body, x + 28, y + 103, 31, 3, 24, { size: 19, weight: 650, fill: "#303640" })}
        <rect x="${x + 22}" y="${y + 172}" width="169" height="48" rx="9" fill="#fff2eb"/>
        <rect x="${x + 214}" y="${y + 172}" width="169" height="48" rx="9" fill="#edf7ef"/>
        <text x="${x + 34}" y="${y + 193}" font-size="15" font-weight="950" fill="#f04418">WASTES</text>
        <text x="${x + 226}" y="${y + 193}" font-size="15" font-weight="950" fill="#167a4b">SAVES</text>
        ${textBlock(section.wastes, x + 34, y + 214, 15, 1, 18, { size: 16, weight: 800 })}
        ${textBlock(section.saves, x + 226, y + 214, 15, 1, 18, { size: 16, weight: 800 })}
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
    ${textBlock(copy.title, 56, 88, 28, 2, 60, { size: 58, weight: 950 })}
    ${textBlock(copy.subtitle, 58, 202, 54, 2, 31, { size: 25, weight: 650, fill: "#303640" })}
    <line x1="58" y1="302" x2="966" y2="302" stroke="#f04418" stroke-width="3"/>
    <text x="58" y="281" font-size="34" font-weight="950" fill="#111217">6 Absurd Habits That Save Face</text>
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

async function generateParodyCopy(image, direction, env) {
  if (!env.OPENAI_API_KEY) return defaultParodyCopy(image.name, direction);

  const imageData = await image.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(imageData);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const dataUrl = `data:${image.type};base64,${btoa(binary)}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return JSON only. Create readable parody copy for a dense LinkedIn-style workflow infographic. Preserve the source's rough structure but make all wording new, satirical, compact, and clean."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Twist: ${normalizeDirection(direction) || "productivity theater"}. Return keys: title, subtitle, badge, sections array of exactly 6 objects with heading/body/wastes/saves, quote, footer. Keep every field short because it will be rendered into fixed cards.`
            },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI copy generation failed with ${response.status}.`);
  }

  try {
    return normalizeParodyCopy(JSON.parse(payload.choices?.[0]?.message?.content || "{}"), image.name, direction);
  } catch {
    return defaultParodyCopy(image.name, direction);
  }
}

async function handleDrops(request, env) {
  const approved = await readIndex(env.PARODY_DROPS, APPROVED_INDEX);
  const fallback = await readStaticDrops(env, request);
  const seen = new Set(approved.map((drop) => drop.image));
  return json([...approved, ...fallback.filter((drop) => !seen.has(drop.image))]);
}

async function handleImage(request, env) {
  const url = new URL(request.url);
  const name = decodeURIComponent(url.pathname.replace("/api/images/", ""));
  const key = `image:${name}`;
  const image = await env.PARODY_DROPS.get(key, "arrayBuffer");
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
    liveUrl: `${publicOrigin(request)}${approvedEntry.image}`
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

      if (url.pathname === "/api/drops" && request.method === "GET") return handleDrops(request, env);
      if (url.pathname === "/api/generate" && request.method === "POST") return handleGenerate(request, env);
      if (url.pathname.startsWith("/api/images/") && request.method === "GET") return handleImage(request, env);
      if (url.pathname === "/api/pending" && request.method === "GET") return handlePendingList(request, env);
      if (url.pathname === "/api/pending" && request.method === "POST") return handleCreatePending(request, env);
      if (url.pathname === "/api/approve" && request.method === "POST") return handleApprove(request, env);
      if (url.pathname === "/api/reject" && request.method === "POST") return handleReject(request, env);

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message || "Request failed." }, { status: 500 });
    }
  }
};
