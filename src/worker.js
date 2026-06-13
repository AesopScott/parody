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
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function extensionForType(type) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return ".png";
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
  if (!requireAdmin(request, env)) return unauthorized();

  const form = await request.formData();
  const image = form.get("image");
  const title = String(form.get("title") || "").trim();
  const caption = String(form.get("caption") || "").trim();
  const shareCaption = String(form.get("shareCaption") || caption).trim();
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
    const url = new URL(request.url);

    if (url.pathname === "/api/drops" && request.method === "GET") return handleDrops(request, env);
    if (url.pathname.startsWith("/api/images/") && request.method === "GET") return handleImage(request, env);
    if (url.pathname === "/api/pending" && request.method === "GET") return handlePendingList(request, env);
    if (url.pathname === "/api/pending" && request.method === "POST") return handleCreatePending(request, env);
    if (url.pathname === "/api/approve" && request.method === "POST") return handleApprove(request, env);
    if (url.pathname === "/api/reject" && request.method === "POST") return handleReject(request, env);

    return env.ASSETS.fetch(request);
  }
};
