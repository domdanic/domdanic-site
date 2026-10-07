(() => {
  const API = "https://domdanic-streamiversary-api.domdanic93.workers.dev";
  const app = document.querySelector("#app");
  const token = new URLSearchParams(location.search).get("invite");
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

  const START = new Date("2026-12-11T14:00:00-08:00");
  const SLOT_HOURS = 2;
  const GUARANTEED_HOURS = 24;
  const OVERTIME_HOURS = 12;
  const TOTAL_SLOTS = (GUARANTEED_HOURS + OVERTIME_HOURS) / SLOT_HOURS;

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
    const existing = new Map(
      (data.response?.availability || []).map(row => [row.slot_start_utc, row.status])
    );
    const answers = data.response?.answers || {};

    app.className = "";
    app.innerHTML = `
      <section class="invite-hero">
        <p class="eyebrow">domdanic Streamiversary 2026</p>
        <h1>You're invited, ${esc(data.invitee.display_name)}.</h1>
        <p class="lead">December 11–12 · 24 hours guaranteed · overtime possible.</p>
        <p>Mark when you're available, maybe available, or unavailable. You can come back through this same invite link and change your answers later.</p>

        <div class="summary-grid">
          <div class="summary-card">
            <span class="section-kicker">Starts</span>
            <strong>${esc(dateTime(START))}</strong>
          </div>
          <div class="summary-card">
            <span class="section-kicker">Guaranteed window</span>
            <strong>24 hours</strong>
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
            <p class="muted">Each block is two hours. Leaving a block unanswered means “I don't know yet.”</p>
          </div>
          <div class="timezone-box">
            Times below are shown in <strong>${esc(zoneLabel(localZone))}</strong>.
          </div>
        </div>

        <div class="reference-strip" aria-label="Event start in reference timezones">
          ${referenceTimes()}
        </div>

        ${slotGroup("Guaranteed 24 hours", "The part that is happening no matter how terrible my decisions become.", 0, GUARANTEED_HOURS / SLOT_HOURS, existing)}
        ${slotGroup("Potential overtime", "If the longhouse is still standing, the marathon may keep going.", GUARANTEED_HOURS / SLOT_HOURS, TOTAL_SLOTS, existing)}
      </section>

      <section class="panel">
        <p class="section-kicker">Participation</p>
        <h2>A few useful planning flags.</h2>
        <div class="check-grid">
          ${checkCard("voice_chat", "I'm comfortable joining Discord voice while I'm involved.", !!answers.voice_chat)}
          ${checkCard("own_pov", "I may stream my own POV while I'm participating. (Useful for Stream Together / Shared Chat planning.)", !!answers.own_pov)}
        </div>

        <div class="slot-group">
          <div class="slot-group-heading">
            <h3>Games I'm interested in</h3>
            <p>Pick as many as sound fun. This test list will eventually be editable from the admin page.</p>
          </div>
          <div class="check-grid">
            ${gameCard("Fortnite", answers.games)}
            ${gameCard("Baldur's Gate 3", answers.games)}
            ${gameCard("Party Animals", answers.games)}
            ${gameCard("PANICORE", answers.games)}
            ${gameCard("Jackbox Party Pack", answers.games)}
            ${gameCard("Lethal Company", answers.games)}
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

  function gameCard(game, selectedGames) {
    const selected = Array.isArray(selectedGames) && selectedGames.includes(game);

    return `
      <label class="check-card">
        <input type="checkbox" name="game" value="${esc(game)}" ${selected ? "checked" : ""}>
        <span>${esc(game)}</span>
      </label>
    `;
  }

  function bindAvailability() {
    document.querySelectorAll(".status-button").forEach(button => {
      button.addEventListener("click", () => {
        const group = button.closest(".status-buttons");
        const alreadySelected = button.getAttribute("aria-pressed") === "true";

        group.querySelectorAll(".status-button").forEach(item => {
          item.setAttribute("aria-pressed", "false");
        });

        if (!alreadySelected) {
          button.setAttribute("aria-pressed", "true");
        }
      });
    });
  }

  async function save() {
    const saveButton = document.querySelector("#save");
    const status = document.querySelector("#save-status");

    const availability = [...document.querySelectorAll(".slot")].flatMap(slot => {
      const selected = slot.querySelector('.status-button[aria-pressed="true"]');
      return selected ? [{
        slot_start_utc: slot.dataset.slot,
        status: selected.dataset.status
      }] : [];
    });

    const answers = {
      voice_chat: document.querySelector('input[name="voice_chat"]').checked,
      own_pov: document.querySelector('input[name="own_pov"]').checked,
      games: [...document.querySelectorAll('input[name="game"]:checked')].map(input => input.value)
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
      <p class="eyebrow">Streamiversary 2026</p>
      <h1>${esc(title)}</h1>
      <p>${esc(message)}</p>
    `;
  }
})();