// Horizontal bars of regular-session percent change versus previous close.
// The watchlist app calls renderWatchlistChart whenever it applies a snapshot.
(function () {
  var chart = document.getElementById("chart");
  var scaleHost = document.getElementById("chart-scale");
  var timeEl = document.getElementById("chart-time");
  var foot = document.getElementById("chart-foot");

  function finiteNumber(value) {
    if (value == null || value === "") return null;
    var number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  // A missing quote is null, never zero. Zero and negative prints are not prices.
  function price(value) {
    var number = finiteNumber(value);
    return number != null && number > 0 ? number : null;
  }

  function percentVersusPreviousClose(item) {
    var last = price(item && item.last_price);
    var prev = price(item && item.prev_close_price);
    if (last == null || prev == null) return null;
    var pct = ((last - prev) / prev) * 100;
    return Number.isFinite(pct) ? pct : null;
  }

  function tickerOf(code) {
    var text = String(code == null ? "" : code).trim();
    if (!text) return "—";
    return text.replace(/^US\./i, "").replace(/^\.+/, "") || "—";
  }

  function symbolId(code) {
    return "sym-" + String(code == null ? "symbol" : code).replace(/[^A-Za-z0-9]+/g, "_");
  }

  function tone(pct) {
    if (pct > 0) return "up";
    if (pct < 0) return "down";
    return "flat";
  }

  function formatPct(pct) {
    var abs = Math.abs(pct).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (pct > 0) return "+" + abs + "%";
    if (pct < 0) return "\u2212" + abs + "%";
    return abs + "%";
  }

  function formatScale(maxAbs) {
    var abs = maxAbs.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxAbs >= 10 ? 0 : 2,
    });
    return abs + "%";
  }

  function formatWhen(value, timeZone) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { text: value ? String(value) : "time unavailable", iso: "" };
    }
    var zone = timeZone || "America/Toronto";
    var options = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    };
    try {
      return {
        text: new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: zone }, options)).format(date),
        iso: date.toISOString(),
      };
    } catch (error) {
      return {
        text: new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, options)).format(date),
        iso: date.toISOString(),
      };
    }
  }

  function clearChart(message) {
    if (scaleHost) {
      scaleHost.replaceChildren();
      scaleHost.hidden = true;
    }
    if (!chart) return;
    chart.replaceChildren();
    chart.setAttribute("aria-busy", "false");
    if (message) {
      var note = document.createElement("p");
      note.className = "chart-loading";
      note.textContent = message;
      chart.append(note);
    }
  }

  function renderWatchlistChart(data) {
    if (!chart || !timeEl || !foot) return;

    if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
      timeEl.dateTime = "";
      timeEl.textContent = "unavailable";
      foot.textContent = "";
      clearChart("No snapshot to chart yet.");
      return;
    }

    var when = formatWhen(data.fetched_at, data.timezone);
    timeEl.dateTime = when.iso;
    timeEl.textContent = when.text;

    var rows = [];
    var skipped = 0;
    data.items.forEach(function (item) {
      var pct = percentVersusPreviousClose(item);
      if (pct == null) {
        skipped += 1;
        return;
      }
      rows.push({
        pct: pct,
        ticker: tickerOf(item && item.code),
        code: item && item.code,
        name: String((item && item.name) || "").trim(),
        type: String((item && item.stock_type) || "").trim(),
      });
    });

    rows.sort(function (a, b) {
      if (b.pct !== a.pct) return b.pct - a.pct;
      return a.ticker.localeCompare(b.ticker);
    });

    chart.replaceChildren();
    chart.setAttribute("aria-busy", "false");

    if (!rows.length) {
      var empty = skipped
        ? "No symbols with both a last price and a previous close."
        : "This snapshot has no symbols to chart.";
      clearChart(empty);
      foot.textContent = skipped
        ? skipped + (skipped === 1 ? " name was left out" : " names were left out") + " because a price was missing."
        : "";
      return;
    }

    var maxAbs = 0;
    rows.forEach(function (row) {
      maxAbs = Math.max(maxAbs, Math.abs(row.pct));
    });
    var scale = maxAbs > 0 ? maxAbs : 1;

    if (scaleHost) {
      scaleHost.replaceChildren();
      scaleHost.hidden = false;
      var scaleTrack = document.createElement("span");
      scaleTrack.className = "scale-track";
      ["\u2212" + formatScale(scale), "0", "+" + formatScale(scale)].forEach(function (label) {
        var edge = document.createElement("span");
        edge.textContent = label;
        scaleTrack.append(edge);
      });
      scaleHost.append(document.createElement("span"), scaleTrack, document.createElement("span"));
    }

    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) {
      var state = tone(row.pct);
      var link = document.createElement("a");
      link.className = "bar-row";
      link.href = "#" + symbolId(row.code);
      link.setAttribute("role", "listitem");
      var labelName = row.name ? row.name + ", " : "";
      var direction = state === "up" ? "up" : state === "down" ? "down" : "unchanged";
      link.setAttribute(
        "aria-label",
        row.ticker + ", " + labelName + direction + " " + formatPct(row.pct) + " versus previous close",
      );
      link.title = (row.name || row.ticker) + (row.type ? " · " + row.type : "") + " · " + formatPct(row.pct);

      var ticker = document.createElement("span");
      ticker.className = "bar-ticker";
      ticker.textContent = row.ticker;

      var track = document.createElement("span");
      track.className = "bar-track";
      var axis = document.createElement("span");
      axis.className = "bar-axis";
      axis.setAttribute("aria-hidden", "true");
      var bar = document.createElement("span");
      bar.className = "bar " + state;
      // Width is relative to the full track; 50% reaches from the center to one edge.
      if (state !== "flat") bar.style.width = (Math.abs(row.pct) / scale) * 50 + "%";
      track.append(axis, bar);

      var pct = document.createElement("span");
      pct.className = "bar-pct num " + state;
      pct.textContent = formatPct(row.pct);

      link.append(ticker, track, pct);
      fragment.append(link);
    });
    chart.append(fragment);

    var counted = rows.length + " symbol" + (rows.length === 1 ? "" : "s");
    var note = "Sorted from largest gain to largest loss. " + counted + " with a last price and previous close.";
    if (skipped) {
      note +=
        " " +
        skipped +
        (skipped === 1 ? " name left out" : " names left out") +
        " — a missing price is skipped, not drawn as zero.";
    }
    foot.textContent = note;
  }

  window.renderWatchlistChart = renderWatchlistChart;
})();
