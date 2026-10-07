(() => {
  const API = "https://domdanic-streamiversary-api.domdanic93.workers.dev";

  const loginPanel = document.querySelector("#login-panel");
  const loginForm = document.querySelector("#login-form");
  const keyInput = document.querySelector("#admin-key");
  const loginStatus = document.querySelector("#login-status");
  const adminApp = document.querySelector("#admin-app");
  const eventForm = document.querySelector("#event-form");
  const eventStatus = document.querySelector("#event-status");
  const gamesStatus = document.querySelector("#games-status");
  const gamesList = document.querySelector("#games-list");
  const addGameForm = document.querySelector("#add-game-form");
  const inviteesStatus = document.querySelector("#invitees-status");
  const inviteesList = document.querySelector("#invitees-list");
  const addInviteeForm = document.querySelector("#add-invitee-form");
  const responsesStatus = document.querySelector("#responses-status");
  const availabilityMatrix = document.querySelector("#availability-matrix");
  const gamesMatrix = document.querySelector("#games-matrix");
  const responseDetails = document.querySelector("#response-details");
  const dangerStatus = document.querySelector("#danger-status");

  let adminKey = "";
  let games = [];
  let invitees = [];
  let responseData = null;

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    adminKey = keyInput.value;

    if (!adminKey) return;

    setStatus(loginStatus, "Checking password…");

    try {
      await loadAdmin();
      keyInput.value = "";
      loginPanel.hidden = true;
      adminApp.hidden = false;
    } catch (error) {
      adminKey = "";
      setStatus(loginStatus, error.message || "Unable to unlock admin.", "error");
    }
  });

  document.querySelector("#lock-button").addEventListener("click", () => {
    adminKey = "";
    adminApp.hidden = true;
    loginPanel.hidden = false;
    keyInput.value = "";
    keyInput.focus();
    setStatus(loginStatus, "Admin locked.");
  });

  eventForm.addEventListener("submit", saveEvent);
  addGameForm.addEventListener("submit", addGame);
  addInviteeForm.addEventListener("submit", addInvitee);
  document.querySelector("#refresh-responses").addEventListener("click", loadResponses);
  document.querySelector("#clear-all-responses").addEventListener("click", clearAllResponses);
  document.querySelector("#clear-all-games").addEventListener("click", clearAllGames);
  document.querySelector("#clear-all-invitees").addEventListener("click", clearAllInvitees);

  async function loadAdmin() {
    const values = await Promise.all([
      api("/admin/event"),
      api("/admin/games"),
      api("/admin/invitees")
    ]);

    populateEvent(values[0].event);
    games = values[1].games || [];
    invitees = values[2].invitees || [];
    drawGames();
    drawInvitees();
    setStatus(loginStatus, "");

    loadResponses().catch(error => {
      setStatus(
        responsesStatus,
        error.message || "Response matrix is unavailable until the Worker update is deployed.",
        "error"
      );
    });
  }

  function populateEvent(event) {
    document.querySelector("#event-name").value = event.name || "";
    document.querySelector("#event-timezone").value = event.timezone || "America/Los_Angeles";
    document.querySelector("#event-start").value = utcToLocalInput(event.start_at, event.timezone);
    document.querySelector("#guaranteed-hours").value = event.guaranteed_hours;
    document.querySelector("#overtime-hours").value = event.overtime_hours;
    document.querySelector("#slot-hours").value = event.slot_hours;
    document.querySelector("#discord-url").value = event.discord_invite_url || "";
  }

  async function saveEvent(event) {
    event.preventDefault();

    const button = document.querySelector("#save-event");
    const timezone = document.querySelector("#event-timezone").value.trim();
    const localStart = document.querySelector("#event-start").value;

    let startAt;
    try {
      startAt = zonedLocalToUtc(localStart, timezone).toISOString();
    } catch {
      setStatus(eventStatus, "Check the start date/time and timezone.", "error");
      return;
    }

    const payload = {
      name: document.querySelector("#event-name").value.trim(),
      start_at: startAt,
      timezone: timezone,
      guaranteed_hours: Number(document.querySelector("#guaranteed-hours").value),
      overtime_hours: Number(document.querySelector("#overtime-hours").value),
      slot_hours: Number(document.querySelector("#slot-hours").value),
      discord_invite_url: document.querySelector("#discord-url").value.trim()
    };

    button.disabled = true;
    setStatus(eventStatus, "Saving…");

    try {
      const data = await api("/admin/event", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      populateEvent(data.event);
      setStatus(eventStatus, "Event settings saved.", "success");
    } catch (error) {
      setStatus(eventStatus, error.message || "Unable to save event.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function addGame(event) {
    event.preventDefault();

    const input = document.querySelector("#new-game-name");
    const name = input.value.trim();
    if (!name) return;

    const button = addGameForm.querySelector("button");
    button.disabled = true;
    setStatus(gamesStatus, "Adding game…");

    try {
      const data = await api("/admin/games", {
        method: "POST",
        body: JSON.stringify({ name: name })
      });
      games.push(data.game);
      games.sort(gameSort);
      input.value = "";
      drawGames();
      loadResponses().catch(() => {});
      setStatus(gamesStatus, "Game added.", "success");
    } catch (error) {
      setStatus(gamesStatus, error.message || "Unable to add game.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function drawGames() {
    if (!games.length) {
      gamesList.innerHTML = '<div class="empty">No games configured.</div>';
      return;
    }

    gamesList.innerHTML = games
      .slice()
      .sort(gameSort)
      .map(game => {
        return '<div class="game-row" data-game-id="' + game.id + '">' +
          '<label class="field">' +
            '<span>Game</span>' +
            '<input class="game-name" type="text" maxlength="100" value="' + esc(game.name) + '">' +
          '</label>' +
          '<label class="field">' +
            '<span>Order</span>' +
            '<input class="game-order" type="number" min="0" max="100000" step="1" value="' + game.sort_order + '">' +
          '</label>' +
          '<label class="game-active">' +
            '<input class="game-enabled" type="checkbox" ' + (game.active ? "checked" : "") + '>' +
            '<span>Active</span>' +
          '</label>' +
          '<button class="button secondary game-save" type="button">Save game</button>' +
          '<button class="button danger game-delete" type="button">Delete</button>' +
        '</div>';
      })
      .join("");

    gamesList.querySelectorAll(".game-row").forEach(row => {
      row.querySelector(".game-save").addEventListener("click", () => saveGame(row));
      row.querySelector(".game-delete").addEventListener("click", () => deleteGame(row));
      row.querySelector(".game-enabled").addEventListener("change", () => saveGameActive(row));
    });
  }

  async function saveGameActive(row) {
    const id = Number(row.dataset.gameId);
    const checkbox = row.querySelector(".game-enabled");
    const desiredState = checkbox.checked;

    checkbox.disabled = true;
    setStatus(
      gamesStatus,
      desiredState ? "Activating game…" : "Deactivating game…"
    );

    try {
      await api("/admin/games/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          active: desiredState
        })
      });

      const refreshed = await api("/admin/games");
      games = refreshed.games || [];
      drawGames();
      loadResponses().catch(() => {});

      setStatus(
        gamesStatus,
        desiredState ? "Game activated." : "Game deactivated.",
        "success"
      );
    } catch (error) {
      checkbox.checked = !desiredState;
      checkbox.disabled = false;
      setStatus(
        gamesStatus,
        error.message || "Unable to change game status.",
        "error"
      );
    }
  }

  async function saveGame(row) {
    const id = Number(row.dataset.gameId);
    const button = row.querySelector(".game-save");
    button.disabled = true;
    setStatus(gamesStatus, "Saving game…");

    const payload = {
      name: row.querySelector(".game-name").value.trim(),
      sort_order: Number(row.querySelector(".game-order").value),
      active: row.querySelector(".game-enabled").checked
    };

    try {
      const data = await api("/admin/games/" + id, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      const index = games.findIndex(game => Number(game.id) === id);
      if (index !== -1) games[index] = data.game;

      games.sort(gameSort);
      drawGames();
      loadResponses().catch(() => {});
      setStatus(gamesStatus, "Game saved.", "success");
    } catch (error) {
      setStatus(gamesStatus, error.message || "Unable to save game.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function deleteGame(row) {
    const id = Number(row.dataset.gameId);
    const name = row.querySelector(".game-name").value.trim();

    if (!confirm('Delete "' + name + '" from this event?')) return;

    const button = row.querySelector(".game-delete");
    button.disabled = true;
    setStatus(gamesStatus, "Deleting game…");

    try {
      await api("/admin/games/" + id, { method: "DELETE" });
      games = games.filter(game => Number(game.id) !== id);
      drawGames();
      loadResponses().catch(() => {});
      setStatus(gamesStatus, "Game deleted.", "success");
    } catch (error) {
      setStatus(gamesStatus, error.message || "Unable to delete game.", "error");
      button.disabled = false;
    }
  }

  async function addInvitee(event) {
    event.preventDefault();

    const handleInput = document.querySelector("#new-invitee-handle");
    const displayInput = document.querySelector("#new-invitee-display");
    const handle = handleInput.value.trim();
    const displayName = displayInput.value.trim();

    if (!handle) return;

    const button = addInviteeForm.querySelector("button");
    button.disabled = true;
    setStatus(inviteesStatus, "Creating invite…");

    try {
      const data = await api("/admin/invitees", {
        method: "POST",
        body: JSON.stringify({
          handle: handle,
          display_name: displayName
        })
      });

      invitees.push(data.invitee);
      invitees.sort(inviteeSort);
      handleInput.value = "";
      displayInput.value = "";
      drawInvitees();
      loadResponses().catch(() => {});
      setStatus(inviteesStatus, "Invitee added. Use Copy Invite Link when you're ready to send it.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to add invitee.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function drawInvitees() {
    if (!invitees.length) {
      inviteesList.innerHTML = '<div class="empty">No invitees configured.</div>';
      return;
    }

    inviteesList.innerHTML = invitees
      .slice()
      .sort(inviteeSort)
      .map(invitee => {
        const responseText = invitee.has_response
          ? '<span class="response-yes"><strong>Response:</strong> Submitted</span>'
          : '<span class="response-no"><strong>Response:</strong> Not submitted</span>';

        const linkButton = invitee.has_saved_link
          ? '<button class="button secondary invitee-copy" type="button">Copy invite link</button>'
          : '<button class="button secondary invitee-recover-toggle" type="button">Recover existing link</button>';

        return '<div class="invitee-row" data-invitee-id="' + invitee.id + '">' +
          '<div class="invitee-main">' +
            '<label class="field">' +
              '<span>Handle</span>' +
              '<input class="invitee-handle" type="text" maxlength="80" value="' + esc(invitee.handle) + '">' +
            '</label>' +
            '<label class="field">' +
              '<span>Display name</span>' +
              '<input class="invitee-display" type="text" maxlength="100" value="' + esc(invitee.display_name) + '">' +
            '</label>' +
            '<label class="invitee-active">' +
              '<input class="invitee-enabled" type="checkbox" ' + (invitee.active ? "checked" : "") + '>' +
              '<span>Active</span>' +
            '</label>' +
            '<button class="button secondary invitee-save" type="button">Save</button>' +
            linkButton +
          '</div>' +
          '<div class="invitee-meta">' +
            responseText +
            '<span><strong>Link:</strong> ' + (invitee.has_saved_link ? "Stored securely" : "Needs one-time recovery") + '</span>' +
          '</div>' +
          '<div class="invitee-actions">' +
            (invitee.has_response ? '<button class="button secondary invitee-clear-response" type="button">Clear response</button>' : '') +
            '<button class="button danger invitee-delete" type="button">Delete invitee</button>' +
          '</div>' +
          (!invitee.has_saved_link
            ? '<div class="recovery-box" hidden>' +
                '<input class="invitee-recovery-value" type="text" autocomplete="off" placeholder="Paste the saved invite URL or token">' +
                '<button class="button invitee-recover" type="button">Save existing link</button>' +
              '</div>'
            : '') +
        '</div>';
      })
      .join("");

    inviteesList.querySelectorAll(".invitee-row").forEach(row => {
      row.querySelector(".invitee-save").addEventListener("click", () => saveInvitee(row));
      row.querySelector(".invitee-enabled").addEventListener("change", () => saveInvitee(row));

      const clearResponseButton = row.querySelector(".invitee-clear-response");
      if (clearResponseButton) {
        clearResponseButton.addEventListener("click", () => clearInviteeResponse(row));
      }

      row.querySelector(".invitee-delete").addEventListener("click", () => deleteInvitee(row));

      const copyButton = row.querySelector(".invitee-copy");
      if (copyButton) {
        copyButton.addEventListener("click", () => copyInviteLink(row));
      }

      const recoverToggle = row.querySelector(".invitee-recover-toggle");
      if (recoverToggle) {
        recoverToggle.addEventListener("click", () => {
          const box = row.querySelector(".recovery-box");
          box.hidden = !box.hidden;
          if (!box.hidden) row.querySelector(".invitee-recovery-value").focus();
        });
      }

      const recoverButton = row.querySelector(".invitee-recover");
      if (recoverButton) {
        recoverButton.addEventListener("click", () => recoverInviteLink(row));
      }
    });
  }

  async function saveInvitee(row) {
    const id = Number(row.dataset.inviteeId);
    const button = row.querySelector(".invitee-save");
    button.disabled = true;
    setStatus(inviteesStatus, "Saving invitee…");

    const payload = {
      handle: row.querySelector(".invitee-handle").value.trim(),
      display_name: row.querySelector(".invitee-display").value.trim(),
      active: row.querySelector(".invitee-enabled").checked
    };

    try {
      const data = await api("/admin/invitees/" + id, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      const index = invitees.findIndex(invitee => Number(invitee.id) === id);
      if (index !== -1) invitees[index] = data.invitee;

      drawInvitees();
      loadResponses().catch(() => {});
      setStatus(inviteesStatus, "Invitee saved.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to save invitee.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function copyInviteLink(row) {
    const id = Number(row.dataset.inviteeId);
    const button = row.querySelector(".invitee-copy");
    button.disabled = true;
    setStatus(inviteesStatus, "Loading invite link…");

    try {
      const data = await api("/admin/invitees/" + id + "/link");
      await copyText(data.invite_url);
      setStatus(inviteesStatus, "Invite link copied.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to copy invite link.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function recoverInviteLink(row) {
    const id = Number(row.dataset.inviteeId);
    const input = row.querySelector(".invitee-recovery-value");
    const value = input.value.trim();

    if (!value) {
      setStatus(inviteesStatus, "Paste the existing invite link first.", "error");
      return;
    }

    const button = row.querySelector(".invitee-recover");
    button.disabled = true;
    setStatus(inviteesStatus, "Verifying and encrypting existing link…");

    try {
      await api("/admin/invitees/" + id + "/recover-link", {
        method: "POST",
        body: JSON.stringify({
          invite_url: value
        })
      });

      const index = invitees.findIndex(invitee => Number(invitee.id) === id);
      if (index !== -1) invitees[index].has_saved_link = 1;

      input.value = "";
      drawInvitees();
      setStatus(inviteesStatus, "Existing invite link recovered and stored securely.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to recover invite link.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function loadResponses() {
    setStatus(responsesStatus, "Loading responses…");

    const data = await api("/admin/responses");
    responseData = data;
    drawResponseMatrix();

    const rows = data.responses || [];
    const submitted = rows.filter(row => row.submitted_at).length;

    setStatus(
      responsesStatus,
      submitted + " of " + rows.length + " invitees have submitted.",
      "success"
    );
  }

  function drawResponseMatrix() {
    const data = responseData || {};
    const event = data.event || {};
    const rows = Array.isArray(data.responses) ? data.responses : [];
    const activeGames = Array.isArray(data.games) ? data.games : [];

    if (!rows.length) {
      const empty = '<div class="empty">No invitees are on the guest roster.</div>';
      availabilityMatrix.innerHTML = empty;
      gamesMatrix.innerHTML = empty;
      responseDetails.innerHTML = empty;
      return;
    }

    drawAvailabilityMatrix(rows, event);
    drawGamesMatrix(rows, activeGames);
    drawResponseDetails(rows);
  }

  function drawAvailabilityMatrix(rows, event) {
    const start = new Date(event.start_at);
    const slotHours = Number(event.slot_hours);
    const totalHours = Number(event.guaranteed_hours) + Number(event.overtime_hours);
    const totalSlots = totalHours / slotHours;
    const timezone = event.timezone || "America/Los_Angeles";

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isInteger(slotHours) ||
      slotHours <= 0 ||
      !Number.isInteger(totalSlots) ||
      totalSlots <= 0
    ) {
      availabilityMatrix.innerHTML = '<div class="empty">The event schedule is not configured correctly.</div>';
      return;
    }

    const slots = Array.from({ length: totalSlots }, (_, index) =>
      new Date(start.getTime() + index * slotHours * 60 * 60 * 1000).toISOString()
    );

    const headers = slots.map(slot =>
      '<th title="' + esc(slot) + '">' + esc(matrixSlotLabel(slot, timezone)) + '</th>'
    ).join("");

    const body = rows.map(row => {
      const availability = new Map(
        (row.availability || []).map(item => [item.slot_start_utc, item.status])
      );

      const cells = slots.map(slot => {
        const status = availability.get(slot) || "";
        const label =
          status === "available" ? "A" :
          status === "maybe" ? "M" :
          status === "unavailable" ? "X" :
          "—";

        return '<td class="matrix-cell ' + (status || "blank") + '">' + label + '</td>';
      }).join("");

      return '<tr>' +
        '<td><strong>' + esc(row.display_name || row.handle) + '</strong></td>' +
        cells +
      '</tr>';
    }).join("");

    availabilityMatrix.innerHTML =
      '<table class="matrix-table">' +
        '<thead><tr><th>Invitee</th>' + headers + '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table>';
  }

  function drawGamesMatrix(rows, activeGames) {
    if (!activeGames.length) {
      gamesMatrix.innerHTML = '<div class="empty">No active games are configured.</div>';
      return;
    }

    const headers = activeGames
      .map(game => '<th>' + esc(game.name) + '</th>')
      .join("");

    const body = rows.map(row => {
      const preferences = normalizeAdminGamePreferences(row.answers?.games);

      const cells = activeGames.map(game => {
        const status = preferences[game.name] || "";
        const label =
          status === "love" ? "Love" :
          status === "interested" ? "Interested" :
          status === "avoid" ? "Hell no" :
          "—";

        return '<td class="matrix-cell ' + (status || "blank") + '">' + esc(label) + '</td>';
      }).join("");

      return '<tr>' +
        '<td><strong>' + esc(row.display_name || row.handle) + '</strong></td>' +
        cells +
      '</tr>';
    }).join("");

    gamesMatrix.innerHTML =
      '<table class="matrix-table">' +
        '<thead><tr><th>Invitee</th>' + headers + '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table>';
  }

  function drawResponseDetails(rows) {
    const body = rows.map(row => {
      const submitted = !!row.submitted_at;
      const noVoice = !!row.answers?.no_voice_chat;
      const ownPov = !!row.answers?.own_pov;

      return '<tr>' +
        '<td><strong>' + esc(row.display_name || row.handle) + '</strong></td>' +
        '<td>' + (submitted ? "Submitted" : "—") + '</td>' +
        '<td>' + (submitted ? (noVoice ? "No voice" : "Voice OK") : "—") + '</td>' +
        '<td>' + (submitted ? (ownPov ? "May stream POV" : "No POV flag") : "—") + '</td>' +
        '<td>' + esc(row.timezone || "—") + '</td>' +
        '<td class="matrix-note">' + esc(row.notes || "—") + '</td>' +
      '</tr>';
    }).join("");

    responseDetails.innerHTML =
      '<table class="matrix-table">' +
        '<thead><tr>' +
          '<th>Invitee</th>' +
          '<th>Status</th>' +
          '<th>Discord</th>' +
          '<th>Streaming</th>' +
          '<th>Timezone</th>' +
          '<th>Notes</th>' +
        '</tr></thead>' +
        '<tbody>' + body + '</tbody>' +
      '</table>';
  }

  function matrixSlotLabel(iso, timeZone) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(iso));
  }

  function normalizeAdminGamePreferences(value) {
    if (Array.isArray(value)) {
      return Object.fromEntries(value.map(game => [game, "interested"]));
    }

    if (value && typeof value === "object") {
      return value;
    }

    return {};
  }

  async function clearInviteeResponse(row) {
    const id = Number(row.dataset.inviteeId);
    const name = row.querySelector(".invitee-display").value.trim() ||
      row.querySelector(".invitee-handle").value.trim();

    if (!confirm('Clear the saved response for "' + name + '"? Their invite link will stay valid, but every answer will return to blank.')) {
      return;
    }

    setStatus(inviteesStatus, "Clearing response…");

    try {
      await api("/admin/invitees/" + id + "/response", { method: "DELETE" });

      const invitee = invitees.find(item => Number(item.id) === id);
      if (invitee) {
        invitee.has_response = 0;
        invitee.submitted_at = null;
        invitee.response_updated_at = null;
      }

      drawInvitees();
      await loadResponses();
      setStatus(inviteesStatus, "Response cleared. Their invite now opens blank.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to clear response.", "error");
    }
  }

  async function deleteInvitee(row) {
    const id = Number(row.dataset.inviteeId);
    const name = row.querySelector(".invitee-display").value.trim() ||
      row.querySelector(".invitee-handle").value.trim();

    if (!confirm('Permanently delete "' + name + '" from the guest roster? This also deletes their response and makes their invite link invalid.')) {
      return;
    }

    setStatus(inviteesStatus, "Deleting invitee…");

    try {
      await api("/admin/invitees/" + id, { method: "DELETE" });
      invitees = invitees.filter(item => Number(item.id) !== id);
      drawInvitees();
      await loadResponses();
      setStatus(inviteesStatus, "Invitee permanently deleted.", "success");
    } catch (error) {
      setStatus(inviteesStatus, error.message || "Unable to delete invitee.", "error");
    }
  }

  async function clearAllResponses() {
    if (!confirm("Clear every saved response and every availability selection? Guest names and invite links will remain.")) {
      return;
    }

    setStatus(dangerStatus, "Clearing all responses…");

    try {
      await api("/admin/responses", { method: "DELETE" });

      invitees.forEach(invitee => {
        invitee.has_response = 0;
        invitee.submitted_at = null;
        invitee.response_updated_at = null;
      });

      drawInvitees();
      await loadResponses();
      setStatus(dangerStatus, "All responses cleared. Existing invites now open with blank answers.", "success");
    } catch (error) {
      setStatus(dangerStatus, error.message || "Unable to clear responses.", "error");
    }
  }

  async function clearAllGames() {
    const phrase = window.prompt('This permanently deletes every game. Type DELETE GAMES to continue.');

    if (phrase !== "DELETE GAMES") return;

    setStatus(dangerStatus, "Deleting all games…");

    try {
      await api("/admin/games", { method: "DELETE" });
      games = [];
      drawGames();
      await loadResponses();
      setStatus(dangerStatus, "All games deleted.", "success");
    } catch (error) {
      setStatus(dangerStatus, error.message || "Unable to delete games.", "error");
    }
  }

  async function clearAllInvitees() {
    const phrase = window.prompt('This permanently deletes the entire guest roster, all invite links, and all responses. Type DELETE GUESTS to continue.');

    if (phrase !== "DELETE GUESTS") return;

    setStatus(dangerStatus, "Deleting guest roster…");

    try {
      await api("/admin/invitees", { method: "DELETE" });
      invitees = [];
      drawInvitees();
      await loadResponses();
      setStatus(dangerStatus, "Guest roster deleted.", "success");
    } catch (error) {
      setStatus(dangerStatus, error.message || "Unable to delete guest roster.", "error");
    }
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    window.prompt("Copy this invite link:", value);
  }

  function inviteeSort(a, b) {
    return String(a.display_name || a.handle || "").localeCompare(
      String(b.display_name || b.handle || ""),
      undefined,
      { sensitivity: "base" }
    );
  }

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": "Bearer " + adminKey,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      if (response.status === 401) {
        throw new Error("Incorrect admin password.");
      }
      throw new Error(data.error || "Request failed (" + response.status + ").");
    }

    return data;
  }

  function gameSort(a, b) {
    return Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id);
  }

  function setStatus(element, message, type = "") {
    element.textContent = message;
    element.className = ("status " + type).trim();
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[char]));
  }

  function utcToLocalInput(iso, timeZone) {
    const date = new Date(iso);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      })
        .formatToParts(date)
        .filter(part => part.type !== "literal")
        .map(part => [part.type, part.value])
    );

    return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":" + parts.minute;
  }

  function zonedLocalToUtc(value, timeZone) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      throw new Error("Invalid local date/time.");
    }

    const pieces = value.split("T");
    const datePart = pieces[0];
    const timePart = pieces[1];
    const dateBits = datePart.split("-").map(Number);
    const timeBits = timePart.split(":").map(Number);
    const year = dateBits[0];
    const month = dateBits[1];
    const day = dateBits[2];
    const hour = timeBits[0];
    const minute = timeBits[1];

    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    let stamp = target;

    for (let i = 0; i < 4; i++) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23"
        })
          .formatToParts(new Date(stamp))
          .filter(part => part.type !== "literal")
          .map(part => [part.type, part.value])
      );

      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );

      stamp += target - represented;
    }

    return new Date(stamp);
  }
})();