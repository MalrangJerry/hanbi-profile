const CALENDAR_ID = "imhanbily%40gmail.com";
const ICS_URL = `https://calendar.google.com/calendar/ical/${CALENDAR_ID}/public/basic.ics`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const start = startParam ? new Date(`${startParam}T00:00:00+09:00`) : new Date();
  const end = endParam ? new Date(`${endParam}T23:59:59+09:00`) : new Date(Date.now() + 60 * 86400000);

  try {
    const icsRes = await fetch(ICS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 HanbiCalendarWorker"
      },
      cf: { cacheTtl: 300, cacheEverything: true }
    });

    if (!icsRes.ok) {
      return json({ ok: false, error: `ICS fetch failed: ${icsRes.status}` }, 502);
    }

    const ics = await icsRes.text();
    if (!ics.includes("BEGIN:VCALENDAR")) {
      return json({ ok: false, error: "Invalid ICS response" }, 502);
    }

    const rawEvents = parseICS(ics);
    const events = expandEvents(rawEvents, start, end)
      .filter(ev => ev.start && new Date(ev.start) <= end && new Date(ev.end || ev.start) >= start)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    return json({
      ok: true,
      source: "google-calendar-ics",
      calendarId: decodeURIComponent(CALENDAR_ID),
      range: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      count: events.length,
      events
    }, 200);
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120"
    }
  });
}

function unfoldICS(text) {
  return text
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/);
}

function parseICS(text) {
  const lines = unfoldICS(text);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }

    if (!current) continue;

    const idx = line.indexOf(":");
    if (idx < 0) continue;

    const left = line.slice(0, idx);
    const value = unescapeICS(line.slice(idx + 1));
    const [name, ...paramParts] = left.split(";");
    const key = name.toUpperCase();
    const params = {};
    for (const part of paramParts) {
      const [pKey, pVal] = part.split("=");
      if (pKey && pVal) params[pKey.toUpperCase()] = pVal;
    }

    if (key === "UID") current.uid = value;
    if (key === "SUMMARY") current.summary = value;
    if (key === "DESCRIPTION") current.description = value;
    if (key === "LOCATION") current.location = value;
    if (key === "DTSTART") current.dtstart = { value, params };
    if (key === "DTEND") current.dtend = { value, params };
    if (key === "RRULE") current.rrule = parseRRule(value);
  }

  return events;
}

function unescapeICS(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDateField(field) {
  if (!field || !field.value) return null;
  const v = field.value;
  const isDateOnly = field.params && field.params.VALUE === "DATE";

  if (isDateOnly || /^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return new Date(Date.UTC(y, m, d, -9, 0, 0)); // Seoul midnight converted to UTC
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;

  const [, yy, mo, dd, hh, mi, ss, z] = m;
  if (z === "Z") {
    return new Date(Date.UTC(+yy, +mo - 1, +dd, +hh, +mi, +ss));
  }

  // Treat floating/TZID times as Asia/Seoul.
  return new Date(Date.UTC(+yy, +mo - 1, +dd, +hh - 9, +mi, +ss));
}

function parseRRule(value) {
  const out = {};
  value.split(";").forEach(part => {
    const [k, v] = part.split("=");
    out[k] = v;
  });
  return out;
}

function expandEvents(events, rangeStart, rangeEnd) {
  const result = [];

  for (const ev of events) {
    const start = parseDateField(ev.dtstart);
    const end = parseDateField(ev.dtend) || (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
    if (!start) continue;

    const duration = end ? end.getTime() - start.getTime() : 60 * 60 * 1000;

    if (!ev.rrule) {
      result.push(formatEvent(ev, start, new Date(start.getTime() + duration)));
      continue;
    }

    const expanded = expandRRule(ev, start, duration, rangeStart, rangeEnd);
    result.push(...expanded);
  }

  return result;
}

function expandRRule(ev, firstStart, duration, rangeStart, rangeEnd) {
  const r = ev.rrule || {};
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL || 1));
  const countLimit = Math.min(Number(r.COUNT || 500), 500);
  const until = r.UNTIL ? parseUntil(r.UNTIL) : rangeEnd;
  const hardEnd = new Date(Math.min(until.getTime(), rangeEnd.getTime()));
  const out = [];

  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) {
    out.push(formatEvent(ev, firstStart, new Date(firstStart.getTime() + duration)));
    return out;
  }

  let cursor = new Date(firstStart);
  let count = 0;

  while (cursor <= hardEnd && count < countLimit) {
    const instanceEnd = new Date(cursor.getTime() + duration);
    if (instanceEnd >= rangeStart && cursor <= rangeEnd) {
      out.push(formatEvent(ev, cursor, instanceEnd));
    }

    count++;

    if (freq === "DAILY") {
      cursor = addDays(cursor, interval);
    } else if (freq === "WEEKLY") {
      cursor = addDays(cursor, interval * 7);
    } else if (freq === "MONTHLY") {
      cursor = addMonths(cursor, interval);
    }
  }

  return out;
}

function parseUntil(v) {
  const field = { value: v, params: {} };
  const d = parseDateField(field);
  return d || new Date(Date.now() + 365 * 86400000);
}

function addDays(d, days) {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function addMonths(d, months) {
  const n = new Date(d);
  n.setUTCMonth(n.getUTCMonth() + months);
  return n;
}

function formatEvent(ev, start, end) {
  return {
    uid: ev.uid || "",
    summary: ev.summary || "제목 없음",
    description: ev.description || "",
    location: ev.location || "",
    start: start.toISOString(),
    end: end ? end.toISOString() : null
  };
}
