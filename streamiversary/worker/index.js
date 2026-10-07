const ALLOWED_ORIGINS = new Set([
  "https://domdanic.com",
  "https://www.domdanic.com"
]);

const INVITE_BASE_URL = "https://domdanic.com/streamiversary/?invite=";
const TOKEN_BYTES = 32;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(request, null, 204);
    }

    if (url.pathname === "/") {
      return json(request, {
        ok: true,
        service: "domdanic Streamiversary API"
      });
    }

    if (url.pathname === "/invite" && request.method === "GET") {
      return getInvite(request, env, url);
    }

    if (url.pathname === "/invite" && request.method === "POST") {
      return saveInvite(request, env, url);
    }

    if (url.pathname.startsWith("/admin/")) {
      const denied = authorizeAdmin(request, env);
      if (denied) return denied;
    }

    if (url.pathname === "/admin/event" && request.method === "GET") {
      return getAdminEvent(request, env);
    }

    if (url.pathname === "/admin/event" && request.method === "POST") {
      return saveAdminEvent(request, env);
    }

    if (url.pathname === "/admin/games" && request.method === "GET") {
      return getAdminGames(request, env);
    }

    if (url.pathname === "/admin/games" && request.method === "POST") {
      return addAdminGame(request, env);
    }

    if (url.pathname === "/admin/games" && request.method === "DELETE") {
      return clearAdminGames(request, env);
    }

    if (url.pathname === "/admin/responses" && request.method === "GET") {
      return getAdminResponses(request, env);
    }

    if (url.pathname === "/admin/responses" && request.method === "DELETE") {
      return clearAllAdminResponses(request, env);
    }

    const gameMatch = url.pathname.match(/^\/admin\/games\/(\d+)$/);

    if (gameMatch && request.method === "PATCH") {
      return updateAdminGame(request, env, Number(gameMatch[1]));
    }

    if (gameMatch && request.method === "DELETE") {
      return deleteAdminGame(request, env, Number(gameMatch[1]));
    }

    if (url.pathname === "/admin/invitees" && request.method === "GET") {
      return getAdminInvitees(request, env);
    }

    if (url.pathname === "/admin/invitees" && request.method === "POST") {
      return addAdminInvitee(request, env);
    }

    if (url.pathname === "/admin/invitees" && request.method === "DELETE") {
      return clearAdminInvitees(request, env);
    }

    const inviteeLinkMatch = url.pathname.match(/^\/admin\/invitees\/(\d+)\/link$/);

    if (inviteeLinkMatch && request.method === "GET") {
      return getAdminInviteLink(request, env, Number(inviteeLinkMatch[1]));
    }

    const inviteeRecoverMatch = url.pathname.match(/^\/admin\/invitees\/(\d+)\/recover-link$/);

    if (inviteeRecoverMatch && request.method === "POST") {
      return recoverAdminInviteLink(request, env, Number(inviteeRecoverMatch[1]));
    }

    const inviteeResponseMatch = url.pathname.match(/^\/admin\/invitees\/(\d+)\/response$/);

    if (inviteeResponseMatch && request.method === "DELETE") {
      return clearAdminInviteeResponse(request, env, Number(inviteeResponseMatch[1]));
    }

    const inviteeMatch = url.pathname.match(/^\/admin\/invitees\/(\d+)$/);

    if (inviteeMatch && request.method === "PATCH") {
      return updateAdminInvitee(request, env, Number(inviteeMatch[1]));
    }

    if (inviteeMatch && request.method === "DELETE") {
      return deleteAdminInvitee(request, env, Number(inviteeMatch[1]));
    }

    return json(request, {
      ok: false,
      error: "Not found."
    }, 404);
  }
};

async function getInvite(request, env, url) {
  const token = url.searchParams.get("token");

  if (!token) {
    return json(request, { ok: false, error: "Missing invite token." }, 400);
  }

  const invitee = await findInvitee(env, token);

  if (!invitee) {
    return json(request, { ok: false, error: "Invalid or inactive invite." }, 404);
  }

  const event = await getEventConfig(env);

  if (!event) {
    return json(request, { ok: false, error: "Event configuration is missing." }, 500);
  }

  const { results: games } = await env.DB.prepare("\n    SELECT id, name, sort_order\n    FROM games\n    WHERE event_id = 1\n      AND active = 1\n    ORDER BY sort_order, id\n  ").all();

  const response = await env.DB.prepare("\n    SELECT timezone, answers_json, notes, submitted_at, updated_at\n    FROM responses\n    WHERE invitee_id = ?\n    LIMIT 1\n  ").bind(invitee.id).first();

  const { results: availability } = await env.DB.prepare("\n    SELECT slot_start_utc, status\n    FROM availability\n    WHERE invitee_id = ?\n    ORDER BY slot_start_utc\n  ").bind(invitee.id).all();

  return json(request, {
    ok: true,
    event: publicEvent(event),
    games,
    invitee: {
      handle: invitee.handle,
      display_name: invitee.display_name
    },
    response: {
      timezone: response?.timezone ?? null,
      answers: safeJsonParse(response?.answers_json, {}),
      notes: response?.notes ?? "",
      submitted_at: response?.submitted_at ?? null,
      updated_at: response?.updated_at ?? null,
      availability
    }
  });
}

async function saveInvite(request, env, url) {
  const token = url.searchParams.get("token");

  if (!token) {
    return json(request, { ok: false, error: "Missing invite token." }, 400);
  }

  const invitee = await findInvitee(env, token);

  if (!invitee) {
    return json(request, { ok: false, error: "Invalid or inactive invite." }, 404);
  }

  const event = await getEventConfig(env);

  if (!event) {
    return json(request, { ok: false, error: "Event configuration is missing." }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const timezone = typeof body.timezone === "string"
    ? body.timezone.trim().slice(0, 100)
    : null;

  if (timezone && !isValidTimeZone(timezone)) {
    return json(request, { ok: false, error: "Invalid timezone." }, 400);
  }

  const notes = typeof body.notes === "string"
    ? body.notes.slice(0, 2000)
    : "";

  const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
    ? body.answers
    : {};

  if (JSON.stringify(answers).length > 20000) {
    return json(request, { ok: false, error: "Answers are too large." }, 400);
  }

  const availability = Array.isArray(body.availability)
    ? body.availability
    : [];

  const startMs = Date.parse(event.start_at);
  const slotMs = event.slot_hours * 60 * 60 * 1000;
  const totalHours = event.guaranteed_hours + event.overtime_hours;
  const totalSlots = totalHours / event.slot_hours;

  if (!Number.isInteger(totalSlots) || totalSlots <= 0) {
    return json(request, { ok: false, error: "Event slot configuration is invalid." }, 500);
  }

  if (availability.length > totalSlots) {
    return json(request, { ok: false, error: "Too many availability slots." }, 400);
  }

  const seen = new Set();
  const cleanedAvailability = [];

  for (const row of availability) {
    if (
      !row ||
      typeof row.slot_start_utc !== "string" ||
      !["available", "maybe", "unavailable"].includes(row.status)
    ) {
      return json(request, { ok: false, error: "Invalid availability entry." }, 400);
    }

    const timestamp = Date.parse(row.slot_start_utc);
    const offset = timestamp - startMs;

    if (
      !Number.isFinite(timestamp) ||
      offset < 0 ||
      offset >= totalSlots * slotMs ||
      offset % slotMs !== 0
    ) {
      return json(request, {
        ok: false,
        error: "Availability contains an invalid time slot."
      }, 400);
    }

    const normalized = new Date(timestamp).toISOString();

    if (seen.has(normalized)) {
      return json(request, {
        ok: false,
        error: "Availability contains a duplicate time slot."
      }, 400);
    }

    seen.add(normalized);
    cleanedAvailability.push({
      slot_start_utc: normalized,
      status: row.status
    });
  }

  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare("\n      INSERT INTO responses (\n        invitee_id,\n        timezone,\n        answers_json,\n        notes,\n        submitted_at,\n        updated_at\n      )\n      VALUES (?, ?, ?, ?, ?, ?)\n      ON CONFLICT(invitee_id) DO UPDATE SET\n        timezone = excluded.timezone,\n        answers_json = excluded.answers_json,\n        notes = excluded.notes,\n        submitted_at = excluded.submitted_at,\n        updated_at = excluded.updated_at\n    ").bind(
      invitee.id,
      timezone,
      JSON.stringify(answers),
      notes,
      now,
      now
    ),
    env.DB.prepare("\n      DELETE FROM availability\n      WHERE invitee_id = ?\n    ").bind(invitee.id)
  ];

  for (const row of cleanedAvailability) {
    statements.push(
      env.DB.prepare("\n        INSERT INTO availability (\n          invitee_id,\n          slot_start_utc,\n          status,\n          updated_at\n        )\n        VALUES (?, ?, ?, ?)\n      ").bind(
        invitee.id,
        row.slot_start_utc,
        row.status,
        now
      )
    );
  }

  await env.DB.batch(statements);

  return json(request, {
    ok: true,
    saved_at: now
  });
}

async function getAdminEvent(request, env) {
  const event = await getEventConfig(env);

  if (!event) {
    return json(request, { ok: false, error: "Event configuration is missing." }, 404);
  }

  return json(request, { ok: true, event });
}

async function saveAdminEvent(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const startAtMs = Date.parse(body.start_at);
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  const guaranteedHours = Number(body.guaranteed_hours);
  const overtimeHours = Number(body.overtime_hours);
  const slotHours = Number(body.slot_hours);
  const discordInviteUrl = normalizeOptionalHttpsUrl(body.discord_invite_url);

  if (!name || name.length > 120) {
    return json(request, {
      ok: false,
      error: "Event name is required and must be 120 characters or fewer."
    }, 400);
  }

  if (!Number.isFinite(startAtMs)) {
    return json(request, { ok: false, error: "Invalid event start time." }, 400);
  }

  if (!isValidTimeZone(timezone)) {
    return json(request, { ok: false, error: "Invalid event timezone." }, 400);
  }

  if (!Number.isInteger(guaranteedHours) || guaranteedHours < 1 || guaranteedHours > 168) {
    return json(request, {
      ok: false,
      error: "Guaranteed hours must be a whole number from 1 to 168."
    }, 400);
  }

  if (!Number.isInteger(overtimeHours) || overtimeHours < 0 || overtimeHours > 168) {
    return json(request, {
      ok: false,
      error: "Overtime hours must be a whole number from 0 to 168."
    }, 400);
  }

  if (!Number.isInteger(slotHours) || slotHours < 1 || slotHours > 12) {
    return json(request, {
      ok: false,
      error: "Slot hours must be a whole number from 1 to 12."
    }, 400);
  }

  if (guaranteedHours % slotHours !== 0 || overtimeHours % slotHours !== 0) {
    return json(request, {
      ok: false,
      error: "Guaranteed and overtime hours must divide evenly into the selected slot size."
    }, 400);
  }

  if (body.discord_invite_url && discordInviteUrl === false) {
    return json(request, {
      ok: false,
      error: "Discord invite URL must be a valid HTTPS URL."
    }, 400);
  }

  const now = new Date().toISOString();
  const startAt = new Date(startAtMs).toISOString();

  await env.DB.prepare("\n    UPDATE event_config\n    SET\n      name = ?,\n      start_at = ?,\n      timezone = ?,\n      guaranteed_hours = ?,\n      overtime_hours = ?,\n      slot_hours = ?,\n      discord_invite_url = ?,\n      updated_at = ?\n    WHERE id = 1\n  ").bind(
    name,
    startAt,
    timezone,
    guaranteedHours,
    overtimeHours,
    slotHours,
    discordInviteUrl || null,
    now
  ).run();

  const event = await getEventConfig(env);

  return json(request, { ok: true, event });
}

async function getAdminGames(request, env) {
  const { results: games } = await env.DB.prepare("\n    SELECT id, name, sort_order, active\n    FROM games\n    WHERE event_id = 1\n    ORDER BY sort_order, id\n  ").all();

  return json(request, { ok: true, games });
}

async function addAdminGame(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 100) {
    return json(request, {
      ok: false,
      error: "Game name is required and must be 100 characters or fewer."
    }, 400);
  }

  const existing = await env.DB.prepare("\n    SELECT id\n    FROM games\n    WHERE event_id = 1\n      AND lower(name) = lower(?)\n    LIMIT 1\n  ").bind(name).first();

  if (existing) {
    return json(request, { ok: false, error: "That game already exists." }, 409);
  }

  const row = await env.DB.prepare("\n    SELECT COALESCE(MAX(sort_order), 0) AS max_sort\n    FROM games\n    WHERE event_id = 1\n  ").first();

  const sortOrder = Number(row?.max_sort || 0) + 10;

  const result = await env.DB.prepare("\n    INSERT INTO games (event_id, name, sort_order, active)\n    VALUES (1, ?, ?, 1)\n  ").bind(name, sortOrder).run();

  return json(request, {
    ok: true,
    game: {
      id: result.meta.last_row_id,
      name,
      sort_order: sortOrder,
      active: 1
    }
  }, 201);
}

async function updateAdminGame(request, env, gameId) {
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return json(request, { ok: false, error: "Invalid game id." }, 400);
  }

  const current = await env.DB.prepare("\n    SELECT id, name, sort_order, active\n    FROM games\n    WHERE id = ?\n      AND event_id = 1\n    LIMIT 1\n  ").bind(gameId).first();

  if (!current) {
    return json(request, { ok: false, error: "Game not found." }, 404);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const name = body.name === undefined ? current.name : String(body.name).trim();
  const sortOrder = body.sort_order === undefined ? current.sort_order : Number(body.sort_order);
  const active = body.active === undefined ? current.active : body.active ? 1 : 0;

  if (!name || name.length > 100) {
    return json(request, {
      ok: false,
      error: "Game name is required and must be 100 characters or fewer."
    }, 400);
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    return json(request, { ok: false, error: "Invalid sort order." }, 400);
  }

  const duplicate = await env.DB.prepare("\n    SELECT id\n    FROM games\n    WHERE event_id = 1\n      AND lower(name) = lower(?)\n      AND id <> ?\n    LIMIT 1\n  ").bind(name, gameId).first();

  if (duplicate) {
    return json(request, {
      ok: false,
      error: "Another game already uses that name."
    }, 409);
  }

  await env.DB.prepare("\n    UPDATE games\n    SET name = ?, sort_order = ?, active = ?\n    WHERE id = ?\n      AND event_id = 1\n  ").bind(name, sortOrder, active, gameId).run();

  return json(request, {
    ok: true,
    game: {
      id: gameId,
      name,
      sort_order: sortOrder,
      active
    }
  });
}

async function deleteAdminGame(request, env, gameId) {
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return json(request, { ok: false, error: "Invalid game id." }, 400);
  }

  const result = await env.DB.prepare("\n    DELETE FROM games\n    WHERE id = ?\n      AND event_id = 1\n  ").bind(gameId).run();

  if (!result.meta.changes) {
    return json(request, { ok: false, error: "Game not found." }, 404);
  }

  return json(request, { ok: true });
}

async function clearAdminGames(request, env) {
  const result = await env.DB.prepare(`
    DELETE FROM games
    WHERE event_id = 1
  `).run();

  return json(request, {
    ok: true,
    deleted: Number(result.meta.changes || 0)
  });
}

async function getAdminResponses(request, env) {
  const event = await getEventConfig(env);

  if (!event) {
    return json(request, { ok: false, error: "Event configuration is missing." }, 404);
  }

  const { results: games } = await env.DB.prepare(`
    SELECT id, name, sort_order
    FROM games
    WHERE event_id = 1
      AND active = 1
    ORDER BY sort_order, id
  `).all();

  const { results: rows } = await env.DB.prepare(`
    SELECT
      i.id AS invitee_id,
      i.handle,
      i.display_name,
      i.active,
      r.timezone,
      r.answers_json,
      r.notes,
      r.submitted_at,
      r.updated_at
    FROM invitees i
    LEFT JOIN responses r
      ON r.invitee_id = i.id
    ORDER BY lower(i.display_name), lower(i.handle), i.id
  `).all();

  const { results: availabilityRows } = await env.DB.prepare(`
    SELECT invitee_id, slot_start_utc, status
    FROM availability
    ORDER BY invitee_id, slot_start_utc
  `).all();

  const availabilityByInvitee = new Map();

  for (const row of availabilityRows) {
    if (!availabilityByInvitee.has(row.invitee_id)) {
      availabilityByInvitee.set(row.invitee_id, []);
    }

    availabilityByInvitee.get(row.invitee_id).push({
      slot_start_utc: row.slot_start_utc,
      status: row.status
    });
  }

  const responses = rows.map(row => ({
    invitee_id: row.invitee_id,
    handle: row.handle,
    display_name: row.display_name,
    active: row.active,
    timezone: row.timezone,
    answers: safeJsonParse(row.answers_json, {}),
    notes: row.notes ?? "",
    submitted_at: row.submitted_at ?? null,
    updated_at: row.updated_at ?? null,
    availability: availabilityByInvitee.get(row.invitee_id) || []
  }));

  return json(request, {
    ok: true,
    event: publicEvent(event),
    games,
    responses
  });
}

async function clearAllAdminResponses(request, env) {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM availability
    `),
    env.DB.prepare(`
      DELETE FROM responses
    `)
  ]);

  return json(request, { ok: true });
}

async function getAdminInvitees(request, env) {
  const { results: invitees } = await env.DB.prepare("\n    SELECT\n      i.id,\n      i.handle,\n      i.display_name,\n      i.active,\n      CASE WHEN i.token_encrypted IS NULL THEN 0 ELSE 1 END AS has_saved_link,\n      i.created_at,\n      i.updated_at,\n      CASE WHEN r.invitee_id IS NULL THEN 0 ELSE 1 END AS has_response,\n      r.submitted_at,\n      r.updated_at AS response_updated_at\n    FROM invitees i\n    LEFT JOIN responses r\n      ON r.invitee_id = i.id\n    ORDER BY lower(i.display_name), lower(i.handle), i.id\n  ").all();

  return json(request, { ok: true, invitees });
}

async function addAdminInvitee(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const handle = normalizeInviteeField(body.handle, 80);
  const displayName = normalizeInviteeField(body.display_name, 100) || handle;

  if (!handle) {
    return json(request, {
      ok: false,
      error: "Invitee handle is required and must be 80 characters or fewer."
    }, 400);
  }

  if (!displayName) {
    return json(request, {
      ok: false,
      error: "Display name is required and must be 100 characters or fewer."
    }, 400);
  }

  const duplicate = await env.DB.prepare("\n    SELECT id\n    FROM invitees\n    WHERE lower(handle) = lower(?)\n    LIMIT 1\n  ").bind(handle).first();

  if (duplicate) {
    return json(request, { ok: false, error: "That invitee handle already exists." }, 409);
  }

  const token = generateInviteToken();
  const tokenHash = await sha256(token);
  const tokenEncrypted = await encryptToken(token, env);
  const now = new Date().toISOString();

  const result = await env.DB.prepare("\n    INSERT INTO invitees (\n      handle,\n      display_name,\n      token_hash,\n      token_encrypted,\n      active,\n      created_at,\n      updated_at\n    )\n    VALUES (?, ?, ?, ?, 1, ?, ?)\n  ").bind(
    handle,
    displayName,
    tokenHash,
    tokenEncrypted,
    now,
    now
  ).run();

  return json(request, {
    ok: true,
    invitee: {
      id: result.meta.last_row_id,
      handle,
      display_name: displayName,
      active: 1,
      has_saved_link: 1,
      has_response: 0,
      submitted_at: null,
      created_at: now,
      updated_at: now
    },
    invite_url: inviteUrl(token)
  }, 201);
}

async function updateAdminInvitee(request, env, inviteeId) {
  if (!Number.isInteger(inviteeId) || inviteeId <= 0) {
    return json(request, { ok: false, error: "Invalid invitee id." }, 400);
  }

  const current = await env.DB.prepare("\n    SELECT id, handle, display_name, active\n    FROM invitees\n    WHERE id = ?\n    LIMIT 1\n  ").bind(inviteeId).first();

  if (!current) {
    return json(request, { ok: false, error: "Invitee not found." }, 404);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const handle = body.handle === undefined
    ? current.handle
    : normalizeInviteeField(body.handle, 80);

  const displayName = body.display_name === undefined
    ? current.display_name
    : normalizeInviteeField(body.display_name, 100);

  let active = current.active;

  if (body.active !== undefined) {
    if (body.active === true || body.active === 1) {
      active = 1;
    } else if (body.active === false || body.active === 0) {
      active = 0;
    } else {
      return json(request, { ok: false, error: "Active must be true or false." }, 400);
    }
  }

  if (!handle) {
    return json(request, {
      ok: false,
      error: "Invitee handle is required and must be 80 characters or fewer."
    }, 400);
  }

  if (!displayName) {
    return json(request, {
      ok: false,
      error: "Display name is required and must be 100 characters or fewer."
    }, 400);
  }

  const duplicate = await env.DB.prepare("\n    SELECT id\n    FROM invitees\n    WHERE lower(handle) = lower(?)\n      AND id <> ?\n    LIMIT 1\n  ").bind(handle, inviteeId).first();

  if (duplicate) {
    return json(request, { ok: false, error: "Another invitee already uses that handle." }, 409);
  }

  const now = new Date().toISOString();

  await env.DB.prepare("\n    UPDATE invitees\n    SET handle = ?, display_name = ?, active = ?, updated_at = ?\n    WHERE id = ?\n  ").bind(handle, displayName, active, now, inviteeId).run();

  const row = await getAdminInviteeRow(env, inviteeId);

  return json(request, { ok: true, invitee: row });
}

async function getAdminInviteLink(request, env, inviteeId) {
  if (!Number.isInteger(inviteeId) || inviteeId <= 0) {
    return json(request, { ok: false, error: "Invalid invitee id." }, 400);
  }

  const row = await env.DB.prepare("\n    SELECT id, token_encrypted\n    FROM invitees\n    WHERE id = ?\n    LIMIT 1\n  ").bind(inviteeId).first();

  if (!row) {
    return json(request, { ok: false, error: "Invitee not found." }, 404);
  }

  if (!row.token_encrypted) {
    return json(request, {
      ok: false,
      error: "This invite predates encrypted link storage and needs to be recovered once.",
      needs_recovery: true
    }, 409);
  }

  try {
    const token = await decryptToken(row.token_encrypted, env);

    return json(request, {
      ok: true,
      invite_url: inviteUrl(token)
    });
  } catch {
    return json(request, {
      ok: false,
      error: "The stored invite link could not be decrypted with the current encryption key."
    }, 500);
  }
}

async function recoverAdminInviteLink(request, env, inviteeId) {
  if (!Number.isInteger(inviteeId) || inviteeId <= 0) {
    return json(request, { ok: false, error: "Invalid invitee id." }, 400);
  }

  const row = await env.DB.prepare("\n    SELECT id, token_hash\n    FROM invitees\n    WHERE id = ?\n    LIMIT 1\n  ").bind(inviteeId).first();

  if (!row) {
    return json(request, { ok: false, error: "Invitee not found." }, 404);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON." }, 400);
  }

  const token = extractInviteToken(body);

  if (!token) {
    return json(request, {
      ok: false,
      error: "Paste the existing invite URL or token."
    }, 400);
  }

  const tokenHash = await sha256(token);

  if (tokenHash !== row.token_hash) {
    return json(request, {
      ok: false,
      error: "That invite link does not match this invitee."
    }, 400);
  }

  const tokenEncrypted = await encryptToken(token, env);
  const now = new Date().toISOString();

  await env.DB.prepare("\n    UPDATE invitees\n    SET token_encrypted = ?, updated_at = ?\n    WHERE id = ?\n  ").bind(tokenEncrypted, now, inviteeId).run();

  return json(request, {
    ok: true,
    invite_url: inviteUrl(token)
  });
}

async function clearAdminInviteeResponse(request, env, inviteeId) {
  if (!Number.isInteger(inviteeId) || inviteeId <= 0) {
    return json(request, { ok: false, error: "Invalid invitee id." }, 400);
  }

  const exists = await env.DB.prepare(`
    SELECT id
    FROM invitees
    WHERE id = ?
    LIMIT 1
  `).bind(inviteeId).first();

  if (!exists) {
    return json(request, { ok: false, error: "Invitee not found." }, 404);
  }

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM availability
      WHERE invitee_id = ?
    `).bind(inviteeId),
    env.DB.prepare(`
      DELETE FROM responses
      WHERE invitee_id = ?
    `).bind(inviteeId)
  ]);

  return json(request, { ok: true });
}

async function deleteAdminInvitee(request, env, inviteeId) {
  if (!Number.isInteger(inviteeId) || inviteeId <= 0) {
    return json(request, { ok: false, error: "Invalid invitee id." }, 400);
  }

  const exists = await env.DB.prepare(`
    SELECT id
    FROM invitees
    WHERE id = ?
    LIMIT 1
  `).bind(inviteeId).first();

  if (!exists) {
    return json(request, { ok: false, error: "Invitee not found." }, 404);
  }

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM availability
      WHERE invitee_id = ?
    `).bind(inviteeId),
    env.DB.prepare(`
      DELETE FROM responses
      WHERE invitee_id = ?
    `).bind(inviteeId),
    env.DB.prepare(`
      DELETE FROM invitees
      WHERE id = ?
    `).bind(inviteeId)
  ]);

  return json(request, { ok: true });
}

async function clearAdminInvitees(request, env) {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM availability
    `),
    env.DB.prepare(`
      DELETE FROM responses
    `),
    env.DB.prepare(`
      DELETE FROM invitees
    `)
  ]);

  return json(request, { ok: true });
}

async function getAdminInviteeRow(env, inviteeId) {
  return env.DB.prepare("\n    SELECT\n      i.id,\n      i.handle,\n      i.display_name,\n      i.active,\n      CASE WHEN i.token_encrypted IS NULL THEN 0 ELSE 1 END AS has_saved_link,\n      i.created_at,\n      i.updated_at,\n      CASE WHEN r.invitee_id IS NULL THEN 0 ELSE 1 END AS has_response,\n      r.submitted_at,\n      r.updated_at AS response_updated_at\n    FROM invitees i\n    LEFT JOIN responses r\n      ON r.invitee_id = i.id\n    WHERE i.id = ?\n    LIMIT 1\n  ").bind(inviteeId).first();
}

async function getEventConfig(env) {
  return env.DB.prepare("\n    SELECT\n      id,\n      name,\n      start_at,\n      timezone,\n      guaranteed_hours,\n      overtime_hours,\n      slot_hours,\n      discord_invite_url,\n      updated_at\n    FROM event_config\n    WHERE id = 1\n    LIMIT 1\n  ").first();
}

function publicEvent(event) {
  return {
    name: event.name,
    start_at: event.start_at,
    timezone: event.timezone,
    guaranteed_hours: event.guaranteed_hours,
    overtime_hours: event.overtime_hours,
    slot_hours: event.slot_hours,
    discord_invite_url: event.discord_invite_url
  };
}

async function findInvitee(env, token) {
  const tokenHash = await sha256(token);

  return env.DB.prepare("\n    SELECT id, handle, display_name\n    FROM invitees\n    WHERE token_hash = ?\n      AND active = 1\n    LIMIT 1\n  ").bind(tokenHash).first();
}

function authorizeAdmin(request, env) {
  if (!env.ADMIN_API_KEY) {
    return json(request, {
      ok: false,
      error: "Admin API key is not configured."
    }, 500);
  }

  const header = request.headers.get("Authorization") || "";
  const expected = "Bearer " + env.ADMIN_API_KEY;

  if (header !== expected) {
    return json(request, { ok: false, error: "Unauthorized." }, 401);
  }

  return null;
}

function normalizeInviteeField(value, maxLength) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : "";
}

function generateInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return base64UrlEncode(bytes);
}

function inviteUrl(token) {
  return INVITE_BASE_URL + encodeURIComponent(token);
}

function extractInviteToken(body) {
  if (typeof body?.token === "string" && body.token.trim()) {
    return body.token.trim();
  }

  if (typeof body?.invite_url !== "string" || !body.invite_url.trim()) {
    return "";
  }

  const value = body.invite_url.trim();

  try {
    const parsed = new URL(value);
    return parsed.searchParams.get("invite")?.trim() || "";
  } catch {
    return value;
  }
}

async function encryptionKey(env) {
  if (!env.INVITE_ENCRYPTION_KEY) {
    throw new Error("INVITE_ENCRYPTION_KEY is not configured.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.INVITE_ENCRYPTION_KEY)
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(token, env) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(token);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  return [
    "v1",
    base64UrlEncode(iv),
    base64UrlEncode(new Uint8Array(ciphertext))
  ].join(".");
}

async function decryptToken(value, env) {
  const parts = String(value).split(".");

  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted token format.");
  }

  const key = await encryptionKey(env);
  const iv = base64UrlDecode(parts[1]);
  const ciphertext = base64UrlDecode(parts[2]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isValidTimeZone(value) {
  if (!value) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeOptionalHttpsUrl(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "";
  }

  try {
    const url = new URL(String(value).trim());
    return url.protocol === "https:" ? url.toString() : false;
  } catch {
    return false;
  }
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(request, data, status = 200) {
  return corsResponse(
    request,
    JSON.stringify(data, null, 2),
    status,
    {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  );
}

function corsResponse(request, body, status = 200, extraHeaders = {}) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    ...extraHeaders,
    "Vary": "Origin"
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return new Response(body, { status, headers });
}
