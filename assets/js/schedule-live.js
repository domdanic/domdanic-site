(() => {
  const endpoint = "https://domdanic-calendar.domdanic93.workers.dev/events";
  const table = document.querySelector(".schedule-table");
  const tbody = table?.querySelector("tbody");
  const timezoneLabel = document.querySelector("#timezone-label");

  if (!table || !tbody) return;

  const fallbackRows = tbody.innerHTML;
  const locale = navigator.language || undefined;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";

  if (timezoneLabel) {
    timezoneLabel.textContent = timezone.replaceAll("_", " ");
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit"
  });

  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short"
  });

  const sameLocalDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const formatTimeRange = (event, start) => {
    if (event.allDay) return "All day";

    const startText = timeFormatter.format(start);
    if (!event.end) return `${startText} – open ended`;

    const end = new Date(event.end);
    if (Number.isNaN(end.getTime()) || end <= start) {
      return `${startText} – end TBD`;
    }

    const endText = timeFormatter.format(end);
    return sameLocalDay(start, end)
      ? `${startText}–${endText}`
      : `${startText}–${weekdayFormatter.format(end)} ${endText}`;
  };

  const makeCell = (label, className) => {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    if (className) cell.className = className;
    return cell;
  };

  const makeGroupHeading = (title, description) => {
    const heading = document.createElement("div");
    heading.className = "schedule-group-heading";

    const copy = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Schedule";

    const h2 = document.createElement("h2");
    h2.textContent = title;

    copy.append(eyebrow, h2);

    const desc = document.createElement("p");
    desc.className = "schedule-group-description";
    desc.textContent = description;

    heading.append(copy, desc);
    return heading;
  };

  const renderEvents = (targetBody, events, emptyText) => {
    targetBody.replaceChildren();

    if (events.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "schedule-empty";
      cell.textContent = emptyText;
      row.appendChild(cell);
      targetBody.appendChild(row);
      return;
    }

    for (const event of events) {
      const row = document.createElement("tr");
      row.dataset.eventOccurrence = `${event.id || "event"}:${event.start}`;

      const dateCell = makeCell("Local date", "schedule-day");
      dateCell.textContent = dateFormatter.format(event._start);

      const streamCell = makeCell("Stream");
      const title = document.createElement("strong");
      title.className = "schedule-event-title";
      title.textContent = event.title || "Untitled stream";
      streamCell.appendChild(title);

      if (event.description) {
        const description = document.createElement("span");
        description.className = "schedule-event-description";
        description.textContent = event.description;
        streamCell.appendChild(description);
      }

      const timeCell = makeCell("Your local time", "schedule-time");
      timeCell.textContent = formatTimeRange(event, event._start);

      row.append(dateCell, streamCell, timeCell);
      targetBody.appendChild(row);
    }
  };

  const firstHeading = table.querySelector("thead th:first-child");
  if (firstHeading) firstHeading.textContent = "Local date";

  const myHeading = makeGroupHeading(
    "My Streams",
    "Streams happening live on the domdanic channel."
  );
  table.insertAdjacentElement("beforebegin", myHeading);

  const elsewhereGroup = document.createElement("div");
  elsewhereGroup.className = "schedule-group schedule-group-elsewhere";

  const elsewhereHeading = makeGroupHeading(
    "Catch Me Elsewhere",
    "Guest spots and streams hosted on somebody else's channel."
  );

  const elsewhereTable = table.cloneNode(true);
  const elsewhereBody = elsewhereTable.querySelector("tbody");
  if (elsewhereBody) elsewhereBody.replaceChildren();

  elsewhereGroup.append(elsewhereHeading, elsewhereTable);
  table.insertAdjacentElement("afterend", elsewhereGroup);

  const attribution = document.createElement("p");
  attribution.className = "schedule-attribution";
  attribution.innerHTML = 'Powered by <a href="https://schedulehat.xwhitehat.dev/" target="_blank" rel="noreferrer">ScheduleHat <span aria-hidden="true">↗</span></a>';
  elsewhereGroup.insertAdjacentElement("afterend", attribution);

  const status = document.createElement("p");
  status.className = "schedule-live-status";
  status.setAttribute("role", "status");
  status.textContent = "Loading live schedule…";
  myHeading.insertAdjacentElement("beforebegin", status);

  fetch(endpoint, { headers: { Accept: "application/json" } })
    .then(async response => {
      if (!response.ok) throw new Error(`Calendar request failed with ${response.status}`);
      return response.json();
    })
    .then(events => {
      if (!Array.isArray(events)) throw new Error("Calendar response was not an event list");

      const now = new Date();
      const upcoming = events
        .map(event => ({ ...event, _start: new Date(event.start) }))
        .filter(event => !Number.isNaN(event._start.getTime()) && event._start >= now)
        .sort((a, b) => a._start - b._start);

      const mine = upcoming.filter(event => event.type === "mine");
      const elsewhere = upcoming.filter(event => event.type === "elsewhere");
      const classifiedCount = mine.length + elsewhere.length;

      if (upcoming.length > 0 && classifiedCount === 0) {
        throw new Error("ScheduleHat feed has not been updated with category types yet");
      }

      renderEvents(tbody, mine, "Nothing is currently scheduled on my channel. Check back soon.");

      if (elsewhereBody) {
        renderEvents(
          elsewhereBody,
          elsewhere,
          "No guest streams or appearances are currently scheduled."
        );
      }

      status.textContent = "Live schedule synced from ScheduleHat.";
      status.classList.add("is-live");
    })
    .catch(error => {
      console.warn("ScheduleHat calendar unavailable or unclassified; using recurring fallback schedule.", error);
      tbody.innerHTML = fallbackRows;
      if (elsewhereBody) {
        renderEvents(
          elsewhereBody,
          [],
          "Live guest-stream data is temporarily unavailable."
        );
      }
      status.textContent = "Live calendar unavailable — showing the recurring fallback schedule.";
      status.classList.add("is-fallback");
    });
})();