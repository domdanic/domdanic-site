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

  let adminKey = "";
  let games = [];

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

  async function loadAdmin() {
    const values = await Promise.all([
      api("/admin/event"),
      api("/admin/games")
    ]);

    populateEvent(values[0].event);
    games = values[1].games || [];
    drawGames();
    setStatus(loginStatus, "");
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
          '<button class="button secondary game-save" type="button">Save</button>' +
          '<button class="button danger game-delete" type="button">Delete</button>' +
        '</div>';
      })
      .join("");

    gamesList.querySelectorAll(".game-row").forEach(row => {
      row.querySelector(".game-save").addEventListener("click", () => saveGame(row));
      row.querySelector(".game-delete").addEventListener("click", () => deleteGame(row));
    });
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
      setStatus(gamesStatus, "Game deleted.", "success");
    } catch (error) {
      setStatus(gamesStatus, error.message || "Unable to delete game.", "error");
      button.disabled = false;
    }
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