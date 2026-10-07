(() => {
  const API = "https://domdanic-streamiversary-api.domdanic93.workers.dev";
  const app = document.querySelector("#app");
  const token = new URLSearchParams(location.search).get("invite");
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

  let START = null;
  let SLOT_HOURS = 2;
  let GUARANTEED_HOURS = 24;
  let OVERTIME_HOURS = 0;
  let TOTAL_SLOTS = 0;

  const zoneLabel = zone => zone.replaceAll("_", " ");
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));

  const dateTime = (date, zone = localZone) => new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);

  const shortTime = (date, zone) => new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);

  const slotStart = index => new Date(START.getTime() + index * SLOT_HOURS * 60 * 60 * 1000);
  const slotEnd = index => new Date(slotStart(index).getTime() + SLOT_HOURS * 60 * 60 * 1000);

  if (!token) {
    showError("This invite link is missing its invite token.", "Use the complete link that was sent to you.");
    return;
  }

  load();

  async function load() {
    try {
      const response = await fetch(`${API}/invite?token=${encodeURIComponent(token)}`, {
        headers: { "Accept": "application/json" }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "This invite could not be loaded.");
      }

      renderInvite(data);
    } catch (error) {
      showError("We couldn't load this invite.", error.message || "Please try again.");
    }
  }

  function renderInvite(data) {
    const event = data.event || {};
    START = new Date(event.start_at);
    SLOT_HOURS = Number(event.slot_hours);
    GUARANTEED_HOURS = Number(event.guaranteed_hours);
    OVERTIME_HOURS = Number(event.overtime_hours);
    TOTAL_SLOTS = (GUARANTEED_HOURS + OVERTIME_HOURS) / SLOT_HOURS;

    if (!Number.isFinite(START.getTime()) || !Number.isInteger(TOTAL_SLOTS) || TOTAL_SLOTS <= 0) {
      showError("This event is not configured correctly.", "The event schedule could not be rendered.");
      return;
    }

    const eventName = event.name || "domdanic Streamiversary";
    const eventZone = event.timezone || "America/Los_Angeles";
    const games = Array.isArray(data.games) ? data.games : [];
    const guaranteedSlots = GUARANTEED_HOURS / SLOT_HOURS;
    const durationSummary = GUARANTEED_HOURS + " hours guaranteed" + (OVERTIME_HOURS ? " · up to " + OVERTIME_HOURS + " hours overtime" : "");
    const gameRows = games.length
      ? games.map(game => gamePreferenceRow(game.name, normalizeGamePreferences(data.response?.answers?.games))).join("")
      : '<div class="invite-note">No games have been added to the event yet.</div>';
    const discordButton = event.discord_invite_url
      ? `<a class="discord-button" href="${esc(event.discord_invite_url)}" target="_blank" rel="noopener noreferrer">Join Event Discord Server</a>`
      : "";
    const overtimeSection = OVERTIME_HOURS
      ? slotGroup("Potential overtime", "If the longhouse is still standing, the marathon may keep going.", guaranteedSlots, TOTAL_SLOTS, new Map((data.response?.availability || []).map(row => [row.slot_start_utc, row.status])))
      : "";

    document.title = eventName + " | domdanic";

    const existing = new Map(
      (data.response?.availability || []).map(row => [row.slot_start_utc, row.status])
    );
    const answers = data.response?.answers || {};
    const gamePreferences = normalizeGamePreferences(answers.games);

    app.className = "";
    app.innerHTML = `
      <section class="invite-hero">
        <p class="eyebrow">${esc(eventName)}</p>
        <h1>You're invited, ${esc(data.invitee.display_name)}.</h1>
        <p class="lead">${esc(dateTime(START, eventZone))} · ${esc(durationSummary)}.</p>
        <p>Mark when you're available, maybe available, or unavailable. You can come back through this same invite link and change your answers later.</p>

        ${discordButton}

        <div class="summary-grid">
          <div class="summary-card">
            <span class="section-kicker">Starts</span>
            <strong>${esc(dateTime(START))}</strong>
          </div>
          <div class="summary-card">
            <span class="section-kicker">Guaranteed window</span>
            <strong>${GUARANTEED_HOURS} hours</strong>
          </div>
          <div class="summary-card">
            <span class="section-kicker">Your timezone</span>
            <strong>${esc(zoneLabel(localZone))}</strong>
          </div>
        </div>

        <div class="invite-note">
          This link is unique to you. Treat it like an invite rather than a public page.
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="section-kicker">Availability</p>
            <h2>When can you raid?</h2>
            <p class="muted">Each block is ${SLOT_HOURS} ${SLOT_HOURS === 1 ? "hour" : "hours"}. Leaving a block unanswered means “I don't know yet.”</p>
          </div>
          <div class="timezone-box">
            Times below are shown in <strong>${esc(zoneLabel(localZone))}</strong>.
          </div>
        </div>

        <div class="reference-strip" aria-label="Event start in reference timezones">
          ${referenceTimes()}
        </div>

        ${slotGroup("Guaranteed " + GUARANTEED_HOURS + " hours", "The part that is happening no matter how terrible my decisions become.", 0, guaranteedSlots, existing)}
        ${overtimeSection}
      </section>

      <section class="panel">
        <p class="section-kicker">Participation</p>
        <h2>A few useful planning flags.</h2>
        <div class="check-grid">
          ${checkCard("no_voice_chat", "I'm not comfortable joining Discord voice.", !!answers.no_voice_chat)}
          ${checkCard("own_pov", "I may stream my own POV while I'm participating. (Useful for Stream Together / Shared Chat planning.)", !!answers.own_pov)}
        </div>

        <div class="slot-group">
          <div class="slot-group-heading">
            <h3>Game preferences</h3>
            <p>Tell me what you'd love to play, what sounds fun, and what should absolutely not get scheduled while you're around.</p>
          </div>
          <div class="slot-list">
            ${gameRows}
          </div>
        </div>

        <label class="notes-label" for="notes">
          <span class="section-kicker">Notes</span>
          <textarea id="notes" maxlength="2000" placeholder="Scheduling constraints, game ideas, things I should know, declarations of impending chaos…">${esc(data.response?.notes || "")}</textarea>
        </label>

        <div class="save-row">
          <button id="save" class="save-button" type="button">Save my response</button>
          <span id="save-status" class="save-status" aria-live="polite">
            ${data.response?.submitted_at ? "Your previous response is loaded." : "Nothing has been submitted yet."}
          </span>
        </div>
      </section>
    `;

    bindAvailability();
    document.querySelector("#save").addEventListener("click", save);
  }

  function referenceTimes() {
    const zones = [
      ["Pacific", "America/Los_Angeles"],
      ["Eastern", "America/New_York"],
      ["UK", "Europe/London"],
      ["Sydney", "Australia/Sydney"]
    ];

    return zones.map(([label, zone]) => `
      <div class="reference-time">
        <span>${esc(label)}</span>
        <strong>${esc(shortTime(START, zone))}</strong>
      </div>
    `).join("");
  }

  function slotGroup(title, description, startIndex, endIndex, existing) {
    let rows = "";
    for (let i = startIndex; i < endIndex; i++) {
      const start = slotStart(i);
      const end = slotEnd(i);
      const iso = start.toISOString();
      const status = existing.get(iso) || "";

      rows += `
        <div class="slot" data-slot="${iso}">
          <div class="slot-time">
            <strong>${esc(dateTime(start))}</strong>
            <span>through ${esc(dateTime(end))}</span>
          </div>
          <div class="status-buttons" role="group" aria-label="Availability for ${esc(dateTime(start))}">
            ${statusButton("available", "Available", status)}
            ${statusButton("maybe", "Maybe", status)}
            ${statusButton("unavailable", "Unavailable", status)}
          </div>
        </div>
      `;
    }

    return `
      <div class="slot-group">
        <div class="slot-group-heading">
          <h3>${esc(title)}</h3>
          <p>${esc(description)}</p>
        </div>
        <div class="slot-list">${rows}</div>
      </div>
    `;
  }

  function statusButton(status, label, selected) {
    return `
      <button
        class="status-button"
        type="button"
        data-status="${status}"
        aria-pressed="${selected === status ? "true" : "false"}"
      >${label}</button>
    `;
  }

  function checkCard(name, label, checked) {
    return `
      <label class="check-card">
        <input type="checkbox" name="${name}" ${checked ? "checked" : ""}>
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function normalizeGamePreferences(value) {
    if (Array.isArray(value)) {
      return Object.fromEntries(value.map(game => [game, "interested"]));
    }

    if (value && typeof value === "object") {
      return value;
    }

    return {};
  }

  function gamePreferenceRow(game, preferences) {
    const selected = preferences[game] || "";

    return `
      <div class="slot game-preference" data-game="${esc(game)}">
        <div class="slot-time">
          <strong>${esc(game)}</strong>
          <span>Leave blank for no strong opinion.</span>
        </div>
        <div class="status-buttons" role="group" aria-label="Preference for ${esc(game)}">
          ${gamePreferenceButton("love", "Love to play", selected)}
          ${gamePreferenceButton("interested", "Interested", selected)}
          ${gamePreferenceButton("avoid", "Hell no", selected)}
        </div>
      </div>
    `;
  }

  function gamePreferenceButton(status, label, selected) {
    return `
      <button
        class="status-button game-status-button"
        type="button"
        data-status="${status}"
        aria-pressed="${selected === status ? "true" : "false"}"
      >${label}</button>
    `;
  }

  function bindAvailability() {
    document.querySelectorAll(".status-buttons").forEach(group => {
      group.querySelectorAll(".status-button").forEach(button => {
        button.addEventListener("click", () => {
          const alreadySelected = button.getAttribute("aria-pressed") === "true";

          group.querySelectorAll(".status-button").forEach(item => {
            item.setAttribute("aria-pressed", "false");
          });

          if (!alreadySelected) {
            button.setAttribute("aria-pressed", "true");
          }
        });
      });
    });
  }

  async function save() {
    const saveButton = document.querySelector("#save");
    const status = document.querySelector("#save-status");

    const availability = [...document.querySelectorAll(".slot[data-slot]")].flatMap(slot => {
      const selected = slot.querySelector('.status-button[aria-pressed="true"]');
      return selected ? [{
        slot_start_utc: slot.dataset.slot,
        status: selected.dataset.status
      }] : [];
    });

    const games = Object.fromEntries(
      [...document.querySelectorAll(".game-preference")].flatMap(row => {
        const selected = row.querySelector('.game-status-button[aria-pressed="true"]');
        return selected ? [[row.dataset.game, selected.dataset.status]] : [];
      })
    );

    const answers = {
      no_voice_chat: document.querySelector('input[name="no_voice_chat"]').checked,
      own_pov: document.querySelector('input[name="own_pov"]').checked,
      games
    };

    saveButton.disabled = true;
    status.className = "save-status";
    status.textContent = "Saving…";

    try {
      const response = await fetch(`${API}/invite?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          timezone: localZone,
          answers,
          notes: document.querySelector("#notes").value,
          availability
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "The response could not be saved.");
      }

      status.className = "save-status success";
      status.textContent = "Saved. You can safely close this page and come back later.";
    } catch (error) {
      status.className = "save-status error";
      status.textContent = error.message || "Something went wrong while saving.";
    } finally {
      saveButton.disabled = false;
    }
  }

  function showError(title, message) {
    app.className = "error-panel";
    app.innerHTML = `
      <p class="eyebrow">Private invite</p>
      <h1>${esc(title)}</h1>
      <p>${esc(message)}</p>
    `;
  }
})();