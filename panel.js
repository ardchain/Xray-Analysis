(() => {
  if (window.__xatHomeLingerPanelInstalled) return;
  window.__xatHomeLingerPanelInstalled = true;

  const MESSAGE = "x-analytics-engagement-types";
  const METRIC_LABELS = Object.freeze({
    Displayed: "Impressions",
    HomeLinger: "Time spent in feed",
    EngagementRollup: "Engagements",
    EngagementRollupV2: "Engagements (v2)",
    Fav: "Likes",
    Unfav: "Unlikes",
    Follow: "Follows",
    Unfollow: "Unfollows",
    Retweet: "Reposts",
    Unretweet: "Unreposts",
    QuoteTweet: "Quote posts",
    UnquoteTweet: "Unquoted posts",
    QuoteCreate: "Quote posts created",
    Reply: "Replies",
    ReplyCreate: "Replies created",
    Unreply: "Unreplied posts",
    Bookmark: "Bookmarks",
    Unbookmark: "Unbookmarks",
    Share: "Shares",
    TweetCreate: "Posts created",
    ProfilePic: "Profile photo views",
    Detail: "Post detail views",
    Url: "URL clicks",
    ScreenName: "Username clicks",
    UserName: "Profile username clicks",
    EmbeddedMedia: "Embedded media views",
    LingerTime: "Time spent in feed (recent)",
    CardUrlClick: "Card URL clicks",
    NotInterested: "Not interested",
    Mute: "Mutes",
    ArchivalFavorite: "Archived likes",
    UnarchivalFavorite: "Restored likes",
    ArchivalRetweet: "Archived reposts",
    UnarchivalRetweet: "Restored reposts",
    VideoContentPlaybackStart: "Video playback started",
    VideoContentPlayback25: "Video watched 25%",
    VideoContentPlayback50: "Video watched 50%",
    VideoContentPlayback75: "Video watched 75%",
    VideoContentPlayback95: "Video watched 95%",
    VideoContentPlaybackComplete: "Video watched completely",
    VideoContentViewThreshold: "Video threshold views",
    VideoContentViewV2: "Video views",
    VideoContentMrcView: "MRC video views",
    VideoContentQualityView: "Video quality views",
    ClientFav: "Client likes",
    ClientReply: "Client replies",
    ClientQuoteTweet: "Client quote posts",
    ClientRetweet: "Client reposts",
    ClientUnfav: "Client unlikes",
    ClientUnretweet: "Client unreposts",
    Follows: "Follows",
    Unfollows: "Unfollows",
    active_followers: "Active followers",
    active_verified_followers: "Active verified followers",
    followers: "Followers",
    verified_follower_count: "Verified followers",
  });
  const NATIVE_METRICS = new Set([
    "Displayed", "EngagementRollup", "Fav", "Follow", "Unfollow", "TweetCreate",
    "ProfilePic", "Reply", "Retweet", "Bookmark", "Share"
  ]);
  const HIDDEN_METRICS = new Set(["LingerTime"]);
  const SHORT_HISTORY_METRICS = new Set(["EngagementRollupV2", "Follows"]);
  const MINIMUM_HISTORY_DAYS = 4;
  const days = new Map();
  const metricDays = new Map();
  const receivedItems = new Map();
  const receivedRecords = new Map();
  const extraMetrics = new Map();
  let root;
  let homeEnabled = true;
  let extraMetric = "HomeLinger";
  const selectedExtraBySlot = [null, null];
  let verifiedOnly = false;
  let lastMessage;
  let chartState;
  let hoverDay;
  let tooltipFrame;
  let maintenanceFrame;
  let rangeWaitTimer;
  let rangeRequestId = 0;
  let pendingRangeKey = "";
  let selectedRangeKey = "";

  function isExtraMetric(metric) {
    return Boolean(metric) && !NATIVE_METRICS.has(metric) && !HIDDEN_METRICS.has(metric);
  }

  function hasEnoughHistory(metric) {
    if (SHORT_HISTORY_METRICS.has(metric)) return false;
    const window = getDateWindow();
    const dates = new Set();
    for (const record of receivedRecords.values()) {
      if (record.engagement_type !== metric || !record.time) continue;
      if (window && (record.time < window.start || record.time > window.end)) continue;
      dates.add(new Date(record.time).toISOString().slice(0, 10));
    }
    return dates.size >= MINIMUM_HISTORY_DAYS;
  }

  function showSelectionNotice(message) {
    let notice = document.querySelector("#xat-selection-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "xat-selection-notice";
      document.documentElement.appendChild(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(showSelectionNotice.timer);
    showSelectionNotice.timer = setTimeout(() => { notice.hidden = true; }, 3200);
  }

  function ensurePanel() {
    document.querySelector("#xat-panel")?.remove();
    document.querySelector("#xat-advanced-view")?.remove();
    root = null;
  }

  function normalizeRecord(item) {
    const fields = item.fields && typeof item.fields === "object" ? { ...item.fields } : { ...item };
    const source = { ...fields, ...item };
    const metricKey = source.engagement_type || source.metric_type || "";
    const record = {
      ...item,
      fields,
      engagement_type: metricKey,
      metric_label: humanMetricName(metricKey),
      time: getTimestamp(source),
      verified: getVerified(source),
      amount: getAmount(source),
    };
    fields.engagement_type = record.engagement_type;
    fields.metric_key = metricKey;
    fields.metric_label = record.metric_label;
    return record;
  }

  function syncAdvancedButton() {
    if (!root) return;
    const button = root.querySelector("#xat-advanced-open");
    if (!button) return;
    const rangeKey = selectedRangeKey || getRangeKey(getRangeControls().find(control =>
      control.className.includes("bg-text") || control.getAttribute("aria-pressed") === "true" || control.getAttribute("aria-checked") === "true"));
    button.hidden = false;
  }

  function openAdvancedView() {
    let view = document.querySelector("#xat-advanced-view");
    if (!view) {
      view = document.createElement("section");
      view.id = "xat-advanced-view";
      document.documentElement.appendChild(view);
    }
    view.hidden = false;
    renderAdvancedView(view);
    positionAdvancedView(view);
  }

  function positionAdvancedView(view) {
    const target = findAccountOverviewTarget();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    view.style.left = `${Math.max(8, rect.left)}px`;
    view.style.top = `${Math.max(8, rect.top)}px`;
    view.style.width = `${Math.max(420, rect.width)}px`;
    view.style.height = `${Math.max(360, Math.min(window.innerHeight - Math.max(8, rect.top) - 8, rect.height))}px`;
  }

  function findAccountOverviewTarget() {
    const chart = document.querySelector("main .recharts-wrapper");
    if (!chart) return null;
    let candidate = chart.parentElement;
    for (let depth = 0; candidate && depth < 8; depth++, candidate = candidate.parentElement) {
      const rect = candidate.getBoundingClientRect();
      const text = candidate.textContent || "";
      if (rect.width >= 500 && rect.height >= 260 && rect.height <= 760 && /Account overview/i.test(text)) return candidate;
    }
    return chart.parentElement;
  }

  function renderAdvancedView(view) {
    const defaultWindow = getDateWindow();
    const from = view.dataset.from || toInputDate(defaultWindow.start);
    const to = view.dataset.to || toInputDate(defaultWindow.end);
    view.dataset.from = from;
    view.dataset.to = to;
    const records = [...receivedRecords.values()]
      .filter(record => inDateRange(record.time, from, to))
      .sort((a, b) => b.time - a.time || a.engagement_type.localeCompare(b.engagement_type));
    const columns = ["engagement_type", "metric_label", "date", "timestamp", "count", "is_engaging_user_verified"];
    for (const record of records) {
      for (const key of Object.keys(record.fields)) if (!columns.includes(key)) columns.push(key);
    }
    const rangeKey = view.dataset.advancedRange || selectedRangeKey || getRangeKey(getRangeControls().find(control =>
      control.className.includes("bg-text") || control.getAttribute("aria-pressed") === "true" || control.getAttribute("aria-checked") === "true")) || "7D";
    const types = [...new Set(records.map(record => record.engagement_type))].sort();
    const primary = view.dataset.primary || findType(types, /display|impression|view/i) || types[0] || "";
    const secondary = view.dataset.secondary || findType(types, /engagement|bookmark|like/i, primary) || types[1] || "";
    view.dataset.primary = primary;
    view.dataset.secondary = secondary;
    const metricOptions = (selected) => types.map(type => `<option value="${escapeAttr(type)}"${type === selected ? " selected" : ""}>${escapeHtml(humanMetricName(type))}</option>`).join("");
    view.innerHTML = `
      <div class="xat-advanced-card">
        <div class="xat-dashboard-top"><div class="xat-analytics-title"><span class="xat-eyebrow">XRAY ANALYTICS</span><strong>Account overview</strong></div><div class="xat-dashboard-actions"><span class="xat-live-dot"></span><span>Live data</span><button class="xat-advanced-close" title="Close">×</button></div></div>
        <nav class="xat-analytics-tabs"><span class="active">Overview</span><span>Audience</span><span>Content</span><span>Video</span><span>Live</span><span>Spaces</span></nav>
        <div class="xat-dashboard-toolbar"><div class="xat-analytics-periods">${["7D", "2W", "4W", "3M", "1Y"].map(key => `<button class="xat-advanced-period${key === rangeKey ? " active" : ""}" data-range="${key}">${key}</button>`).join("")}</div><span class="xat-analytics-source">${records.length} records · ${types.length} metrics</span></div>
        <section class="xat-analytics-main-card">
          <div class="xat-card-heading"><div><strong>Performance</strong><span>Daily metric comparison</span></div><div class="xat-analytics-controls"><label class="xat-metric-select blue"><select class="xat-advanced-primary">${metricOptions(primary)}</select></label><label class="xat-metric-select green"><select class="xat-advanced-secondary">${metricOptions(secondary)}</select></label><label class="xat-pay-period"><select class="xat-chart-mode"><option value="bar">▥ Bars</option><option value="line">⌁ Lines</option></select></label></div></div>
          <div class="xat-advanced-chart-frame"><div class="xat-chart-axis left"></div><div class="xat-advanced-chart"></div><div class="xat-chart-axis right"></div></div>
        </section>
        <div class="xat-analytics-secondary-grid"><section class="xat-analytics-small-card"><div><strong>Activity over time</strong><span>last ${rangeKey}</span></div><div class="xat-mini-chart"></div></section><section class="xat-analytics-small-card"><div><strong>Secondary metric</strong><span>${escapeHtml(humanMetricName(secondary))}</span></div><div class="xat-mini-chart green"></div></section></div>
        <div class="xat-section-label">Snapshot</div>
        <div class="xat-analytics-metric-grid">${types.slice(0, 10).map(type => `<div><span>${escapeHtml(humanMetricName(type))}</span><b>${formatNumber(sumRecords(records, type))}</b></div>`).join("")}</div>
        <div class="xat-section-label xat-raw-label"><span>Data explorer</span><small>${records.length} rows</small></div>
        <div class="xat-advanced-toolbar">
          <label>From <input class="xat-advanced-from" type="date" value="${escapeAttr(from)}"></label>
          <label>To <input class="xat-advanced-to" type="date" value="${escapeAttr(to)}"></label>
          <button class="xat-advanced-apply">Apply</button>
          <input class="xat-advanced-search" type="search" placeholder="Search values…">
          <select class="xat-advanced-type"><option value="">All engagement types</option>${types.map(type => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`).join("")}</select>
        </div>
        <div class="xat-advanced-table-wrap">
          <table class="xat-advanced-table"><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${records.map(record => `<tr data-type="${escapeAttr(record.engagement_type)}" data-search="${escapeAttr(JSON.stringify(record.fields).toLowerCase())}">${columns.map(column => `<td>${formatField(record.fields[column])}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </div>
        <div class="xat-advanced-empty" hidden>No records match the current filter.</div>
      </div>`;
    view.querySelector(".xat-advanced-close").onclick = () => { view.hidden = true; };
    view.querySelector(".xat-advanced-apply").onclick = () => {
      view.dataset.from = view.querySelector(".xat-advanced-from").value;
      view.dataset.to = view.querySelector(".xat-advanced-to").value;
      renderAdvancedView(view);
    };
    view.querySelector(".xat-advanced-primary").onchange = event => { view.dataset.primary = event.target.value; renderAdvancedView(view); };
    view.querySelector(".xat-advanced-secondary").onchange = event => { view.dataset.secondary = event.target.value; renderAdvancedView(view); };
    for (const button of view.querySelectorAll(".xat-advanced-period")) {
      button.onclick = () => {
        const length = { "7D": 7, "2W": 14, "4W": 28, "3M": 90, "1Y": 365 }[button.dataset.range];
        const end = new Date();
        end.setUTCHours(0, 0, 0, 0);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - length + 1);
        view.dataset.from = toInputDate(start);
        view.dataset.to = toInputDate(end);
        view.dataset.advancedRange = button.dataset.range;
        renderAdvancedView(view);
      };
    }
    const chartMode = view.querySelector(".xat-chart-mode");
    chartMode.value = view.dataset.chartMode || "bar";
    chartMode.onchange = event => { view.dataset.chartMode = event.target.value; renderAdvancedChart(view, records, view.querySelector(".xat-advanced-primary").value, view.querySelector(".xat-advanced-secondary").value); };
    renderAdvancedChart(view, records, view.querySelector(".xat-advanced-primary").value, view.querySelector(".xat-advanced-secondary").value);
    renderMiniChart(view.querySelectorAll(".xat-mini-chart")[0], records, view.querySelector(".xat-advanced-primary").value);
    renderMiniChart(view.querySelectorAll(".xat-mini-chart")[1], records, view.querySelector(".xat-advanced-secondary").value);
    positionAdvancedView(view);
    const search = view.querySelector(".xat-advanced-search");
    const type = view.querySelector(".xat-advanced-type");
    const filter = () => {
      const needle = search.value.trim().toLowerCase();
      let visible = 0;
      for (const row of view.querySelectorAll("tbody tr")) {
        const matches = (!needle || row.dataset.search.includes(needle)) && (!type.value || row.dataset.type === type.value);
        row.hidden = !matches;
        if (matches) visible++;
      }
      view.querySelector(".xat-advanced-empty").hidden = visible !== 0;
    };
    search.oninput = filter;
    type.onchange = filter;
  }

  function renderAdvancedChart(view, records, primary = "", secondary = "") {
    const series = [primary, secondary].filter((type, index, values) => type && values.indexOf(type) === index);
    const byDay = aggregateByDay(records, series);
    const points = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const primaryMax = Math.max(...points.map(([, values]) => values[primary] || 0), 1);
    const secondaryMax = Math.max(...points.map(([, values]) => values[secondary] || 0), 1);
    const chart = view.querySelector(".xat-advanced-chart");
    const mode = view.dataset.chartMode || "bar";
    chart.innerHTML = points.length ? `<div class="xat-grid-lines"><i></i><i></i><i></i><i></i><i></i></div><div class="xat-chart-points ${mode}">${points.map(([day, values]) => `
      <div class="xat-advanced-point" title="${escapeAttr(`${day}: ${series.map(type => `${humanMetricName(type)} ${formatNumber(values[type] || 0)}`).join(" · ")}`)}">
        <div class="xat-advanced-bars">${series.map((type, index) => { const max = index ? secondaryMax : primaryMax; return `<div class="xat-advanced-bar ${index ? "green" : "blue"}" style="height:${Math.max(2, (values[type] || 0) / max * 100)}%"></div>`; }).join("")}</div>
        <span>${escapeHtml(day.slice(5))}</span>
      </div>`).join("")}</div>` : `<div class="xat-advanced-chart-empty">No numeric count/value/metric field is available for charting.</div>`;
    const leftAxis = view.querySelector(".xat-chart-axis.left");
    const rightAxis = view.querySelector(".xat-chart-axis.right");
    const ticks = [1, .75, .5, .25, 0];
    if (leftAxis) leftAxis.innerHTML = ticks.map(ratio => `<span>${formatNumber(primaryMax * ratio)}</span>`).join("");
    if (rightAxis) rightAxis.innerHTML = ticks.map(ratio => `<span>${formatNumber(secondaryMax * ratio)}</span>`).join("");
  }

  function renderMiniChart(element, records, type) {
    if (!element) return;
    const byDay = aggregateByDay(records, type ? [type] : []);
    const points = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(...points.map(([, values]) => values[type] || 0), 1);
    element.innerHTML = points.map(([day, values]) => `<i title="${escapeAttr(`${day}: ${formatNumber(values[type] || 0)}`)}" style="height:${Math.max(2, (values[type] || 0) / max * 100)}%"></i>`).join("");
  }

  function aggregateByDay(records, series) {
    const byDay = new Map();
    for (const record of records) {
      if (series.length && !series.includes(record.engagement_type)) continue;
      const day = record.time ? new Date(record.time).toISOString().slice(0, 10) : "No date";
      const value = Number(record.fields.count ?? record.fields.value ?? record.fields.metric);
      if (!Number.isFinite(value)) continue;
      const current = byDay.get(day) || {};
      current[record.engagement_type] = (current[record.engagement_type] || 0) + value;
      byDay.set(day, current);
    }
    return byDay;
  }

  function sumRecords(records, type) {
    return records.filter(record => record.engagement_type === type).reduce((sum, record) => {
      const value = Number(record.fields.count ?? record.fields.value ?? record.fields.metric);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function findType(types, pattern, exclude = "") {
    return types.find(type => type !== exclude && pattern.test(type)) || "";
  }

  function humanMetricName(metricKey) {
    if (!metricKey) return "Unknown metric";
    if (METRIC_LABELS[metricKey]) return METRIC_LABELS[metricKey];
    return String(metricKey)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/([A-Z])(\d)/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inDateRange(time, from, to) {
    if (!time) return true;
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T23:59:59.999Z`);
    return (!Number.isFinite(start) || time >= start) && (!Number.isFinite(end) || time <= end);
  }

  function toInputDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatField(value) {
    if (value === undefined) return `<span class="xat-field-empty">—</span>`;
    if (value === null) return `<span class="xat-field-null">null</span>`;
    if (typeof value === "object") return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
    return escapeHtml(String(value));
  }

  function render(message) {
    if (!isAccountOverviewPage()) {
      if (root) root.hidden = true;
      cleanupCustomChartArtifacts();
      chartState = null;
      return;
    }
    ensurePanel();
    lastMessage = message;
    selectedExtraBySlot.forEach((metric, slot) => {
      if (!isExtraMetric(metric)) selectedExtraBySlot[slot] = null;
    });
    for (const item of message.items) {
      const record = normalizeRecord(item);
      if (!record.engagement_type) continue;
      if (record.time && isExtraMetric(record.engagement_type)) extraMetrics.set(record.engagement_type, record.metric_label || humanMetricName(record.engagement_type));
      const key = [record.engagement_type, record.time || record.fields.date || "no-date", record.verified === null ? "unknown" : record.verified, record.amount].join("|");
      receivedRecords.set(key, record);
    }
    const canonicalRecords = new Map();
    for (const record of receivedRecords.values()) {
      const key = [record.engagement_type, record.time || record.fields.date || "no-date", record.verified === null ? "unknown" : record.verified, record.amount].join("|");
      canonicalRecords.set(key, record);
    }
    receivedRecords.clear();
    for (const [key, record] of canonicalRecords) receivedRecords.set(key, record);
    const allRecords = [...canonicalRecords.values()];
    const preferred = allRecords.some(record => record.engagement_type === "HomeLinger")
      ? "HomeLinger"
      : extraMetrics.has(extraMetric) && allRecords.some(record => record.engagement_type === extraMetric)
        ? extraMetric
        : allRecords.map(record => record.engagement_type).find(type => isExtraMetric(type));
    if (preferred) extraMetric = preferred;
    receivedItems.clear();
    for (const record of allRecords) if (record.engagement_type === extraMetric) receivedItems.set([
      record.engagement_type,
      record.time || record.fields.date || "no-date",
      record.verified === null ? "unknown" : record.verified,
      record.amount
    ].join("|"), record);
    const dateWindow = getDateWindow();
    metricDays.clear();
    const rangedItems = buildMetricDays(extraMetric, allRecords, dateWindow, days);
    for (const metric of selectedExtraBySlot.filter(Boolean)) {
      if (metric === extraMetric) continue;
      const metricMap = new Map();
      buildMetricDays(metric, allRecords, dateWindow, metricMap);
      metricDays.set(metric, metricMap);
    }
    metricDays.set(extraMetric, new Map(days));
    const sorted = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    renderHomeSeries();
  }

  function buildMetricDays(metric, records, dateWindow, target) {
    target.clear();
    const items = records.filter(record => record.engagement_type === metric).sort((a, b) => b.time - a.time);
    const rangedItems = items.filter(item => !dateWindow || (item.time >= dateWindow.start && item.time <= dateWindow.end));
    for (const item of rangedItems) {
      const day = item.time ? new Date(item.time).toISOString().slice(0, 10) : "No date";
      const current = target.get(day) || { verified: 0, unverified: 0, unknown: 0, items: [] };
      if (item.verified === true) current.verified += item.amount;
      else if (item.verified === false) current.unverified += item.amount;
      else current.unknown += item.amount;
      current.items.push(item);
      target.set(day, current);
    }
    if (dateWindow) {
      for (let cursor = new Date(dateWindow.start); cursor <= dateWindow.end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const day = cursor.toISOString().slice(0, 10);
        if (!target.has(day)) target.set(day, { verified: 0, unverified: 0, unknown: 0, items: [] });
      }
    }
    return rangedItems;
  }

  function renderHomeSeries() {
    if (!isAccountOverviewPage()) {
      cleanupCustomChartArtifacts();
      chartState = null;
      return;
    }
    let activeSlots = selectedExtraBySlot.map((metric, slot) => metric ? { metric, slot } : null).filter(Boolean);
    if (!homeEnabled || !activeSlots.length) {
      clearReplacement();
      chartState = null;
      return;
    }
    const svg = document.querySelector("main .recharts-wrapper svg.recharts-surface");
    if (!svg) return;
    svg.querySelectorAll(".xat-home-linger-series").forEach(group => group.remove());
    svg.querySelectorAll(".xat-replaced-native").forEach(group => group.classList.remove("xat-replaced-native"));
    const wrapper = svg.parentElement;
    const lineMode = Boolean(svg.querySelector("g.recharts-line"));
    const nativeGroups = svg.querySelectorAll("g.recharts-layer.recharts-bar, g.recharts-layer.recharts-line");
    const orphanedSlots = activeSlots.filter(({ slot }) => {
      if (nativeGroups[slot]) return false;
      const triggerText = getMetricTriggers()[slot]?.textContent.trim();
      return !["None", "Select secondary metric"].includes(triggerText);
    });
    if (orphanedSlots.length) {
      for (const { slot } of orphanedSlots) {
        selectedExtraBySlot[slot] = null;
        setMetricTriggerLabel(getMetricTriggers()[slot], "None");
      }
      activeSlots = activeSlots.filter(({ slot }) => nativeGroups[slot]);
      clearReplacement();
      chartState = null;
      if (!activeSlots.length) return;
    }
    if (!chartState || chartState.svg !== svg) {
      chartState?.groups?.forEach(group => group.remove());
      chartState = { svg, wrapper, groups: [], axisLabels: new Map(), axisMaxBySlot: [1, 1] };
    }
    chartState.groups?.forEach(group => group.remove());
    chartState.groups = [];
    const period = getChartPeriod();
    const primaryChartMap = aggregateMetricMap(days, period);
    const chartMaps = new Map([["__primary__", primaryChartMap]]);
    const sorted = [...primaryChartMap.keys()].filter(day => day !== "No date").sort();
    if (!sorted.length) return;
    chartState.chartDays = sorted;
    const layout = getNativeLayout(svg, sorted.length);
    if (!layout) return;
    for (const { metric, slot } of activeSlots) {
      const metricMap = metricDays.get(metric) || days;
      const chartMap = aggregateMetricMap(metricMap, period);
      chartMaps.set(metric, chartMap);
      const values = sorted.map(day => {
        const data = chartMap.get(day) || { verified: 0, unverified: 0, unknown: 0 };
        return verifiedOnly ? data.verified : data.verified + data.unverified + data.unknown;
      });
      const axisMax = niceAxisMax(Math.max(...values, 1));
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "xat-home-linger-series");
      group.setAttribute("aria-label", `${humanMetricName(metric)}${verifiedOnly ? " Verified" : ""}`);
      const color = slot === 0 ? "#1d9bf0" : "#00ba7c";
      if (nativeGroups[slot]) nativeGroups[slot].classList.add("xat-replaced-native");
      group.dataset.xatSlot = String(slot);
      const totalWidth = layout.seriesCount * layout.barWidth + (layout.seriesCount - 1) * layout.gap;
      if (lineMode) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", values.map((value, index) => {
          const x = layout.left + layout.slot * sorted.length * index / Math.max(1, sorted.length - 1);
          const y = layout.bottom - value / axisMax * layout.plotHeight;
          return `${index ? "L" : "M"}${x},${y}`;
        }).join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "2");
        group.appendChild(path);
      } else values.forEach((value, index) => {
        const slotStart = layout.left + layout.slot * index + (layout.slot - totalWidth) / 2;
        const x = layout.nativeXsBySeries[slot]?.[index] ?? (slotStart + slot * (layout.barWidth + layout.gap));
        const height = value ? Math.max(3, Math.min(layout.plotHeight, value / axisMax * layout.plotHeight)) : 0;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "xat-home-linger-bar");
        rect.setAttribute("fill", color);
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(layout.bottom - height));
        rect.setAttribute("width", String(layout.barWidth));
        rect.setAttribute("height", String(height));
        rect.setAttribute("rx", "2");
        rect.setAttribute("data-day", sorted[index]);
        rect.setAttribute("data-value", String(value));
        rect.style.setProperty("--xat-series-color", color);
        rect.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = `${sorted[index]} · ${humanMetricName(metric)}: ${formatNumber(value)}`;
        group.appendChild(rect);
      });
      svg.appendChild(group);
      chartState.groups.push(group);
      chartState.metricMaps = chartMaps;
      chartState.period = period;
      chartState.lineMode = lineMode;
      chartState.axisMaxBySlot[slot] = axisMax;
      updateReplacementAxis(svg, axisMax, slot);
    }
    chartState.layoutSignature = getChartLayoutSignature(svg);
    updateReplacementTrigger();
    installTooltipBridge(svg, wrapper);
  }

  function updateReplacementTrigger() {
    const triggers = getMetricTriggers();
    selectedExtraBySlot.forEach((metric, slot) => {
      if (!metric) return;
      const trigger = triggers[slot];
      if (trigger && trigger.textContent.trim() !== humanMetricName(metric)) {
        setMetricTriggerLabel(trigger, humanMetricName(metric));
      }
    });
  }

  function getMetricTriggers() {
    const candidates = [...document.querySelectorAll('[role="combobox"]')].filter(isVisible);
    return candidates.slice(0, 2);
  }

  function isMetricMenuOpen(trigger) {
    const id = trigger?.getAttribute("aria-controls");
    return Boolean(
      trigger?.getAttribute("aria-expanded") === "true" ||
      (id && document.getElementById(id)?.getAttribute("role") === "listbox")
    );
  }

  function bindCustomMetricTriggerRecovery() {
    getMetricTriggers().forEach((trigger, slot) => {
      if (trigger.dataset.xatCustomTriggerBound) return;
      trigger.dataset.xatCustomTriggerBound = "true";
      trigger.addEventListener("pointerdown", () => {
        // Replacing the visible Radix label leaves X's internal Select value
        // native. In that state X can consume the first click (and sometimes
        // the second) without leaving its menu open. Retry only if the menu
        // is still closed, so normal native Select behaviour is untouched.
        if (!selectedExtraBySlot[slot] || trigger.dataset.xatOpeningRecovery) return;
        let attempts = 0;
        const recover = () => {
          if (isMetricMenuOpen(trigger) || attempts++ >= 2) return;
          if (attempts === 1) {
            // Radix's keyboard path is deterministic here: unlike the
            // pointer path it does not spend a click just restoring focus
            // after we have replaced the visible value.
            trigger.focus({ preventScroll: true });
            trigger.dispatchEvent(new KeyboardEvent("keydown", {
              key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true
            }));
            setTimeout(recover, 45);
            return;
          }
          trigger.dataset.xatOpeningRecovery = "true";
          trigger.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true
          }));
          trigger.dispatchEvent(new PointerEvent("pointerup", {
            bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true
          }));
          trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          trigger.dataset.xatOpeningRecovery = "";
          setTimeout(recover, 90);
        };
        setTimeout(recover, 90);
      }, true);
    });
  }

  function setMetricTriggerLabel(trigger, text) {
    const span = trigger?.querySelector("span");
    if (span) span.textContent = text;
  }

  function clearReplacement() {
    chartState?.groups?.forEach(group => group.remove());
    chartState?.svg?.querySelectorAll(".xat-replaced-native").forEach(group => group.classList.remove("xat-replaced-native"));
    chartState?.svg?.querySelectorAll(".xat-custom-axis-labels").forEach(group => group.remove());
    chartState?.svg?.querySelectorAll(".xat-generated-axis-labels").forEach(group => group.remove());
    if (chartState?.svg && chartState.axisLabels) {
      for (const [labelGroup, labels] of chartState.axisLabels) {
        getAxisTicks(labelGroup).forEach((tick, index) => {
          tick.style.visibility = "visible";
          if (labels[index] !== undefined) tick.textContent = labels[index];
        });
      }
    }
  }

  function cleanupCustomChartArtifacts() {
    document.querySelectorAll(".xat-home-linger-series, .xat-custom-axis-labels, .xat-generated-axis-labels").forEach(node => node.remove());
    document.querySelectorAll(".xat-replaced-native").forEach(node => node.classList.remove("xat-replaced-native"));
  }

  function isAccountOverviewPage() {
    return location.pathname === "/i/account_analytics" || /^\/i\/account_analytics\/overview\/?$/.test(location.pathname);
  }

  function updateReplacementAxis(svg, max, slot) {
    let labelGroup = getAxisLabelGroups(svg)[slot];
    // When the native chart has only one series (the None state), X does not
    // render a secondary y-axis at all. Create the same Recharts label group
    // shape at the right plot edge so the custom series has a real aligned
    // scale instead of bars floating without an axis.
    if (!labelGroup && slot === 1) {
      const leftGroup = getAxisLabelGroups(svg)[0];
      if (leftGroup) {
        labelGroup = leftGroup.cloneNode(true);
        labelGroup.classList.add("xat-generated-axis-labels");
        const rightX = Math.max(0, Number(svg.getAttribute("width")) - 30);
        labelGroup.querySelectorAll("text, tspan").forEach(node => {
          node.setAttribute("x", String(rightX));
          node.setAttribute("text-anchor", "start");
          node.setAttribute("orientation", "right");
        });
        svg.appendChild(labelGroup);
      }
    }
    if (!labelGroup) return;
    const axisTicks = getAxisTicks(labelGroup);
    if (chartState && !chartState.axisLabels.has(labelGroup)) {
      chartState.axisLabels.set(labelGroup, axisTicks.map(tick => tick.textContent));
    }
    const ticks = axisTicks;
    const niceMax = niceAxisMax(max);
    const signature = JSON.stringify([niceMax, slot, ticks.map(tick =>
      ["x", "y", "dx", "dy", "text-anchor"].map(name => tick.getAttribute(name)))]);
    const existingLabels = labelGroup.querySelector(".xat-custom-axis-labels");
    if (existingLabels?.dataset.xatSignature === signature && ticks.every(tick => tick.style.visibility === "hidden")) return;
    existingLabels?.remove();
    const labelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelsGroup.setAttribute("class", "xat-custom-axis-labels");
    labelsGroup.dataset.xatSignature = signature;
    labelsGroup.style.pointerEvents = "none";
    const yPositions = ticks.map(tick => Number(tick.getAttribute("y")));
    const finiteY = yPositions.filter(Number.isFinite);
    const topY = finiteY.length ? Math.min(...finiteY) : 0;
    const bottomY = finiteY.length ? Math.max(...finiteY) : Math.max(1, ticks.length - 1);
    ticks.forEach((tick, index) => {
      const y = yPositions[index];
      const ratio = Number.isFinite(y)
        ? 1 - [...finiteY].sort((a, b) => a - b).indexOf(y) / Math.max(1, ticks.length - 1)
        : index / Math.max(1, ticks.length - 1);
      const value = niceMax * Math.max(0, Math.min(1, ratio));
      const label = formatAxisNumber(value);
      if (tick.textContent !== label) tick.textContent = label;
      const replacement = document.createElementNS("http://www.w3.org/2000/svg", "text");
      for (const attribute of ["x", "y", "dx", "dy", "text-anchor", "dominant-baseline"]) {
        const raw = tick.getAttribute(attribute);
        if (raw !== null) replacement.setAttribute(attribute, raw);
      }
      replacement.setAttribute("class", `${tick.getAttribute("class") || ""} xat-custom-axis-label`);
      const tickStyle = getComputedStyle(tick);
      replacement.style.font = tickStyle.font;
      replacement.style.letterSpacing = tickStyle.letterSpacing;
      replacement.setAttribute("fill", slot === 0 ? "#1d9bf0" : "#00ba7c");
      replacement.textContent = label;
      labelsGroup.appendChild(replacement);
      tick.style.visibility = "hidden";
    });
    labelGroup.appendChild(labelsGroup);
  }

  function getAxisTicks(axis) {
    return [...axis.querySelectorAll("text")].filter(tick => !tick.closest(".xat-custom-axis-labels"));
  }

  function getAxisLabelGroups(svg) {
    return [...svg.querySelectorAll("g.recharts-yAxis-tick-labels")].slice(0, 2);
  }

  function getYAxisForSlot(svg, slot) {
    const axes = [...svg.querySelectorAll(".recharts-yAxis")];
    if (axes.length < 2) return axes[0];
    const positioned = axes.map(axis => {
      const ctmX = axis.getCTM?.()?.e;
      const transform = axis.getAttribute("transform") || "";
      const translatedX = Number(transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)/)?.[1]);
      const xs = getAxisTicks(axis).map(tick => Number(tick.getAttribute("x"))).filter(Number.isFinite);
      const x = Number.isFinite(ctmX) ? ctmX : Number.isFinite(translatedX) ? translatedX : xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0;
      return { axis, x };
    }).sort((a, b) => a.x - b.x);
    return positioned[slot]?.axis || axes[slot];
  }

  function niceAxisMax(value) {
    const safe = Math.max(Number(value) || 0, 1);
    const power = 10 ** Math.floor(Math.log10(safe));
    const fraction = safe / power;
    const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return step * power;
  }

  function formatAxisNumber(value) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  const selectionRequests = [0, 0];

  function canSelectExtraMetric(slot, metric) {
    return (slot === 0 || slot === 1) && isExtraMetric(metric) && selectedExtraBySlot[1 - slot] !== metric;
  }

  function commitExtraMetricSelection(slot, metric) {
    if (!canSelectExtraMetric(slot, metric)) return false;
    selectedExtraBySlot[slot] = metric;
    return true;
  }

  function selectExtraMetric(viewport, option, event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const slot = getOpenMetricSlot(viewport);
    const metric = option.dataset.xatExtraMetric;
    if (!canSelectExtraMetric(slot, metric) || option.getAttribute("aria-disabled") === "true") return;
    const request = ++selectionRequests[slot];
    const nativeGroups = () => document.querySelector("main .recharts-wrapper svg.recharts-surface")
      ?.querySelectorAll("g.recharts-layer.recharts-bar, g.recharts-layer.recharts-line") || [];
    const finish = () => {
      if (selectionRequests[slot] !== request || !commitExtraMetricSelection(slot, metric)) return;
      render(lastMessage || { items: [] });
    };
    if (nativeGroups()[slot]) {
      closeMetricMenu(slot);
      finish();
      return;
    }
    // A secondary axis set to None needs a native series before we can replace it.
    const fallback = [...viewport.querySelectorAll('[role="option"]:not(.xat-extra-option)')]
      .find(item => item.textContent.trim() !== "None" && !item.hasAttribute("data-disabled") && item.getAttribute("aria-disabled") !== "true");
    if (!fallback) return;
    fallback.click();
    // The native selection handler invalidates pending requests; this one starts afterwards.
    const pendingRequest = ++selectionRequests[slot];
    closeMetricMenu(slot);
    let attempts = 0;
    const waitForSeries = () => {
      if (selectionRequests[slot] !== pendingRequest) return;
      if (nativeGroups()[slot]) {
        if (commitExtraMetricSelection(slot, metric)) render(lastMessage || { items: [] });
      } else if (++attempts < 15) setTimeout(waitForSeries, 80);
    };
    setTimeout(waitForSeries, 0);
  }

  function injectExtraMetricOptions() {
    if (!isAccountOverviewPage()) return;
    const listbox = [...document.querySelectorAll('[role="listbox"]')].find(isVisible);
    const viewport = listbox?.querySelector('[data-radix-select-viewport]') || listbox;
    if (!viewport || !extraMetrics.size) return;
    const slot = getOpenMetricSlot(viewport);
    if (slot !== 0 && slot !== 1) return;
    const nativeOptions = [...viewport.querySelectorAll('[role="option"]:not(.xat-extra-option)')];
    const template = nativeOptions.find(item => !item.hasAttribute("data-disabled")) || nativeOptions[0];
    if (!template) return;
    const nativeLabels = new Set(nativeOptions.map(option => option.textContent.trim()));
    const checkTemplate = viewport.querySelector('[data-icon="icon-checkmark"], [data-radix-select-item-indicator] svg');
    for (const option of nativeOptions) {
      if (option.dataset.xatNativeBound) continue;
      option.dataset.xatNativeBound = "true";
      const resetNativeSlot = () => {
        const targetSlot = getOpenMetricSlot(viewport);
        if (targetSlot !== 0 && targetSlot !== 1 || option.hasAttribute("data-disabled") || option.getAttribute("aria-disabled") === "true") return;
        ++selectionRequests[targetSlot];
        selectedExtraBySlot[targetSlot] = null;
        clearReplacement();
        chartState = null;
        setTimeout(() => {
          if (!selectedExtraBySlot[targetSlot]) setMetricTriggerLabel(getMetricTriggers()[targetSlot], option.textContent.trim());
          renderHomeSeries();
        }, 0);
      };
      option.addEventListener("click", resetNativeSlot, true);
      option.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") resetNativeSlot();
      }, true);
    }
    for (const [metric, metricLabel] of extraMetrics) {
      if (!isExtraMetric(metric) || !hasEnoughHistory(metric) || nativeLabels.has(metricLabel)) continue;
      let option = viewport.querySelector(`[data-xat-extra-metric="${CSS.escape(metric)}"]`);
      if (!option) {
        option = document.createElement("div");
        option.className = `${template.className} xat-extra-option`;
        option.setAttribute("role", "option");
        option.setAttribute("tabindex", "-1");
        option.dataset.xatExtraMetric = metric;
        // Reuse the host's typography and layout, including its active theme.
        const style = getComputedStyle(template);
        option.style.font = style.font;
        option.style.letterSpacing = style.letterSpacing;
        option.style.padding = style.padding;
        option.style.borderRadius = style.borderRadius;
        const label = document.createElement("div");
        label.className = "flex-1 xat-extra-label";
        label.textContent = metricLabel;
        option.appendChild(label);
        const check = checkTemplate?.cloneNode(true) || document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.removeAttribute("style");
        check.classList.add("xat-extra-check");
        check.setAttribute("aria-hidden", "true");
        if (!checkTemplate) {
          check.setAttribute("viewBox", "0 0 24 24");
          check.setAttribute("fill", "currentColor");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "M19.4 6.32 9.64 18.95 4.1 14.1l1.32-1.5 3.95 3.46L17.82 5.1z");
          check.appendChild(path);
        }
        option.appendChild(check);
        option.addEventListener("pointerdown", event => selectExtraMetric(viewport, option, event), true);
        option.addEventListener("click", event => {
          // Keyboard and accessibility activation may emit click without pointerdown.
          if (event.detail === 0) selectExtraMetric(viewport, option, event);
          else { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
        viewport.appendChild(option);
      }
      const disabled = selectedExtraBySlot[1 - slot] === metric;
      option.setAttribute("aria-disabled", String(disabled));
      option.toggleAttribute("data-disabled", disabled);
      option.setAttribute("aria-selected", String(selectedExtraBySlot[slot] === metric));
    }
    for (const option of nativeOptions) {
      // Hide only the old native selection marker; retain hover, focus and icons.
      option.classList.toggle("xat-native-selection-replaced", Boolean(selectedExtraBySlot[slot]));
      if (selectedExtraBySlot[slot]) option.setAttribute("aria-selected", "false");
    }
    if (!listbox.dataset.xatKeyboardBound) {
      listbox.dataset.xatKeyboardBound = "true";
      listbox.addEventListener("keydown", event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
        const options = [...viewport.querySelectorAll('[role="option"]')]
          .filter(item => !item.hasAttribute("data-disabled") && item.getAttribute("aria-disabled") !== "true");
        const active = document.activeElement?.closest('[role="option"]');
        let index = options.indexOf(active);
        if (event.key === "Enter" || event.key === " ") {
          if (!active) return;
          event.preventDefault(); event.stopImmediatePropagation();
          active.click();
          return;
        }
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "Home") index = 0;
        else if (event.key === "End") index = options.length - 1;
        else index = (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[index]?.focus({ preventScroll: true });
        options[index]?.scrollIntoView({ block: "nearest" });
      }, true);
    }
  }

  function closeMetricMenu(slot) {
    // Let the select component update its own open state and remove its portal.
    // Removing the listbox directly leaves Base UI's trigger stuck expanded.
    const trigger = getMetricTriggers()[slot];
    trigger?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", bubbles: true, cancelable: true
    }));
  }

  function getOpenMetricSlot(viewport) {
    const triggers = [...document.querySelectorAll('[role="combobox"]')].filter(isVisible);
    const listbox = viewport.closest('[role="listbox"]');
    const listboxId = listbox?.id;
    const linked = triggers.findIndex(trigger => listboxId && trigger.getAttribute("aria-controls") === listboxId);
    const slot = linked >= 0 ? linked : triggers.findIndex(trigger => trigger.getAttribute("aria-expanded") === "true");
    // The third combobox is X's chart-mode picker. It uses the same Radix
    // listbox markup, so guard it explicitly before adding metric options.
    const triggerText = slot >= 0 ? triggers[slot]?.textContent.trim() : "";
    const nonMetricValues = new Set(["Bar", "Line", "Daily", "Weekly", "Pay period", "Monthly"]);
    if (nonMetricValues.has(triggerText) || slot > 1) return -1;
    return slot;
  }

  function getChartLayoutSignature(svg) {
    if (!svg) return "";
    const elements = [svg, ...svg.querySelectorAll(".recharts-cartesian-grid-horizontal line, g.recharts-bar .recharts-rectangle")];
    return JSON.stringify(elements.map(element =>
      ["width", "height", "x", "y", "x1", "x2", "y1", "y2"].map(name => element.getAttribute(name))));
  }

  function getNativeLayout(svg, count) {
    const grid = svg.querySelector(".recharts-cartesian-grid-horizontal line");
    if (!grid) return null;
    const x1 = Number(grid.getAttribute("x1"));
    const x2 = Number(grid.getAttribute("x2"));
    const gridLines = [...svg.querySelectorAll(".recharts-cartesian-grid-horizontal line")];
    const yValues = gridLines.flatMap(line => [Number(line.getAttribute("y1")), Number(line.getAttribute("y2"))]).filter(Number.isFinite);
    const top = Math.min(...yValues);
    const bottom = Math.max(...yValues);
    const firstAxisLabels = getAxisLabelGroups(svg)[0];
    const yTicks = firstAxisLabels ? getAxisTicks(firstAxisLabels).map(tick => parseCompact(tick.textContent.trim())) : [];
    const series = [...svg.querySelectorAll("g.recharts-layer.recharts-bar")]
      .map(group => [...group.querySelectorAll(".recharts-rectangle")]
        .map(rect => ({
          x: Number(rect.getAttribute("x")),
          width: Number(rect.getAttribute("width")),
        }))
        .filter(rect => Number.isFinite(rect.x) && Number.isFinite(rect.width))
        // X emits recent days first in the DOM; values are chronological.
        .sort((a, b) => a.x - b.x))
      .filter(group => group.length);
    const firstSeries = series[0] || [];
    const barWidth = firstSeries[0]?.width || Math.max(1, ((x2 - x1) / count) * .22);
    const nativeXs = firstSeries.map(rect => rect.x);
    const nativeGap = series[1]?.[0] ? series[1][0].x - firstSeries[0].x - barWidth : barWidth * .25;
    return {
      left: x1,
      slot: (x2 - x1) / count,
      bottom,
      plotHeight: bottom - top,
      max: Math.max(...yTicks.filter(Number.isFinite), 1),
      barWidth,
      nativeXs,
      nativeXsBySeries: series.map(group => group.map(rect => rect.x)),
      gap: Math.max(2, nativeGap),
      seriesCount: Math.max(1, series.length),
    };
  }

  function installTooltipBridge(svg, wrapper) {
    if (svg.dataset.xatTooltipBound) return;
    svg.dataset.xatTooltipBound = "true";
    svg.addEventListener("mousemove", event => {
      if (!homeEnabled || !chartState?.groups?.length) return;
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      const x = (event.clientX - rect.left) / rect.width * viewBox.width;
      const daysList = chartState?.chartDays || [...days.keys()].filter(day => day !== "No date").sort();
      const grid = svg.querySelector(".recharts-cartesian-grid-horizontal line");
      if (!grid || !daysList.length) return;
      const left = Number(grid.getAttribute("x1"));
      const right = Number(grid.getAttribute("x2"));
      const fraction = (x - left) / Math.max(1, right - left);
      const index = Math.max(0, Math.min(daysList.length - 1, chartState.lineMode
        ? Math.round(fraction * (daysList.length - 1)) : Math.floor(fraction * daysList.length)));
      hoverDay = daysList[index];
      if (!tooltipFrame) {
        tooltipFrame = requestAnimationFrame(() => {
          tooltipFrame = 0;
          decorateNativeTooltip(wrapper);
        });
      }
    }, true);
  }

  function decorateNativeTooltip(wrapper) {
    const tooltip = wrapper.querySelector(".recharts-tooltip-wrapper");
    if (!tooltip || !hoverDay || getComputedStyle(tooltip).visibility === "hidden") return;
    const content = tooltip.firstElementChild || tooltip;
    const rowsHost = content.querySelector("div.grid") || content;
    const nativeRows = [...rowsHost.children].filter(row => !row.classList.contains("xat-home-tooltip-row"));
    selectedExtraBySlot.forEach((metric, slot) => {
      if (!metric) return;
      const replacement = nativeRows[slot];
      if (!replacement) return;
      const label = replacement.querySelector("span.text-secondary, span.text-gray-600");
      const value = replacement.querySelector("span.font-mono, span.text-text");
      const swatch = replacement.querySelector("div.shrink-0");
      const metricLabel = humanMetricName(metric);
      const metricValue = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(getDayValue(hoverDay, metric));
      if (label && label.textContent !== metricLabel) label.textContent = metricLabel;
      if (value && value.textContent !== metricValue) value.textContent = metricValue;
      if (swatch) swatch.style.backgroundColor = slot === 0 ? "#1d9bf0" : "#00ba7c";
    });
  }

  function getDayValue(day, metric = extraMetric) {
    const chartMap = chartState?.metricMaps?.get(metric) || aggregateMetricMap(metricDays.get(metric) || days, getChartPeriod());
    const data = chartMap.get(day);
    if (!data) return 0;
    return verifiedOnly ? data.verified : data.verified + data.unverified + data.unknown;
  }

  function getChartPeriod() {
    const controls = [...document.querySelectorAll('[role="combobox"]')].filter(isVisible);
    return controls[2]?.textContent.trim() || "Daily";
  }

  function aggregateMetricMap(source, period) {
    if (period === "Daily") return new Map(source);
    const result = new Map();
    for (const [day, data] of source.entries()) {
      if (day === "No date") continue;
      const bucket = getPeriodBucket(day, period);
      const current = result.get(bucket) || { verified: 0, unverified: 0, unknown: 0, items: [] };
      current.verified += data.verified;
      current.unverified += data.unverified;
      current.unknown += data.unknown;
      current.items.push(...(data.items || []));
      result.set(bucket, current);
    }
    return result;
  }

  function getPeriodBucket(day, period) {
    const date = new Date(`${day}T00:00:00Z`);
    if (period === "Monthly") return `${day.slice(0, 7)}-01`;
    if (period === "Pay period") {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const start = date.getUTCDate() >= 12 && date.getUTCDate() < 26 ? 12 : 26;
      const bucketMonth = date.getUTCDate() < 12 ? month - 1 : month;
      return toInputDate(new Date(Date.UTC(year, bucketMonth, start)));
    }
    if (period === "Weekly") {
      const dayOfWeek = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() + (7 - dayOfWeek) % 7);
      return toInputDate(date);
    }
    return day;
  }

  function getDateWindow() {
    const rangeKey = pendingRangeKey || getActiveRangeKey() || selectedRangeKey || "7D";
    const length = { "7D": 7, "2W": 14, "4W": 28, "3M": 90, "1Y": 365 }[rangeKey] || 7;
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - length + 1);
    return { start, end };
  }

  function watchVerifiedButton() {
    const button = [...document.querySelectorAll("button")].find(button => {
      const label = button.getAttribute("aria-label") || button.textContent.trim();
      return (/^Verified$/.test(label) || label === "Verified only") && isVisible(button);
    });
    if (!button || button.dataset.xatVerifiedBound) return;
    button.dataset.xatVerifiedBound = "true";
    verifiedOnly = button.getAttribute("aria-pressed") === "true";
    button.addEventListener("click", () => setTimeout(() => {
      verifiedOnly = button.getAttribute("aria-pressed") === "true";
      renderHomeSeries();
    }, 0), true);
  }

  function watchRangeButtons() {
    for (const button of getRangeControls()) {
      if (button.dataset.xatRangeBound) continue;
      button.dataset.xatRangeBound = "true";
      button.addEventListener("click", () => {
        selectedRangeKey = getRangeKey(button);
        pendingRangeKey = selectedRangeKey;
        const requestId = ++rangeRequestId;
        clearTimeout(rangeWaitTimer);
        clearReplacement();
        chartState = null;
        const startedAt = Date.now();
        const waitForNativeRange = () => {
          if (requestId !== rangeRequestId) return;
          const active = getActiveRangeKey();
          if (active === selectedRangeKey || Date.now() - startedAt > 1800) {
            pendingRangeKey = "";
            if (lastMessage) render(lastMessage);
            return;
          }
          rangeWaitTimer = setTimeout(waitForNativeRange, 50);
        };
        rangeWaitTimer = setTimeout(waitForNativeRange, 50);
      }, true);
    }
  }

  function watchChartPeriod() {
    const control = [...document.querySelectorAll('[role="combobox"]')].filter(isVisible)[2];
    if (!control || control.dataset.xatPeriodBound) return;
    control.dataset.xatPeriodBound = "true";
    control.addEventListener("click", () => setTimeout(() => {
      if (selectedExtraBySlot.some(Boolean)) renderHomeSeries();
    }, 250), true);
  }

  function getRangeControls() {
    return [...document.querySelectorAll("button,[role=button]")].filter(button =>
      !button.closest("#xat-advanced-view") && isVisible(button) && getRangeKey(button));
  }

  function getActiveRangeKey() {
    const active = getRangeControls().find(button =>
      button.getAttribute("aria-pressed") === "true" ||
      button.getAttribute("aria-checked") === "true" ||
      button.getAttribute("data-state") === "on" ||
      button.className.includes("bg-text") || button.classList.contains("bg-btn-primary"));
    return getRangeKey(active);
  }

  function getRangeKey(button) {
    if (!button) return "";
    const text = [button.textContent, button.getAttribute("aria-label"), button.getAttribute("title")]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toUpperCase();
    const exact = text.match(/\b(7D|2W|4W|3M|1Y)\b/);
    if (exact) return exact[1];
    if (/\b(7\s*DAYS?|ONE\s*WEEK)\b/.test(text)) return "7D";
    if (/\b(2\s*WEEKS?)\b/.test(text)) return "2W";
    if (/\b(4\s*WEEKS?)\b/.test(text)) return "4W";
    if (/\b(3\s*MONTHS?)\b/.test(text)) return "3M";
    if (/\b(1\s*YEAR)\b/.test(text)) return "1Y";
    return "";
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getTimestamp(item) {
    const raw = item.timestamp ?? item.created_at ?? item.date;
    if (raw === undefined || raw === null || raw === "") return 0;
    if (raw && typeof raw === "object") return getTimestamp({ timestamp: raw.iso8601_time ?? raw.iso8601 ?? raw.timestamp });
    if (typeof raw === "number") return raw < 100000000000 ? raw * 1000 : raw;
    const parsed = Date.parse(String(raw));
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? (numeric < 100000000000 ? numeric * 1000 : numeric) : 0;
  }

  function getVerified(item) {
    const raw = item.is_engaging_user_verified;
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === "false") return raw === "true";
    return null;
  }

  function getAmount(item) {
    const number = Number(item.count);
    return Number.isFinite(number) ? number : 0;
  }

  function parseCompact(value) {
    const match = String(value).replace(/,/g, "").match(/^([\d.]+)([KMB])?$/i);
    if (!match) return Number(value);
    return Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[String(match[2] || "").toLowerCase()] || 1);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  window.addEventListener("message", event => {
    if (event.source === window && event.data?.source === MESSAGE) render(event.data);
  });
  const observer = new MutationObserver(() => {
    if (maintenanceFrame) return;
    maintenanceFrame = requestAnimationFrame(() => {
      maintenanceFrame = 0;
      if (!isAccountOverviewPage()) {
        cleanupCustomChartArtifacts();
        if (root) root.hidden = true;
        chartState = null;
        return;
      }
      if (root) root.hidden = false;
      watchVerifiedButton();
      watchRangeButtons();
      watchChartPeriod();
      bindCustomMetricTriggerRecovery();
      injectExtraMetricOptions();
      updateReplacementTrigger();
      syncAdvancedButton();
      if (chartState?.svg?.isConnected && chartState.axisMaxBySlot) {
        selectedExtraBySlot.forEach((metric, slot) => {
          if (metric) updateReplacementAxis(chartState.svg, chartState.axisMaxBySlot[slot], slot);
        });
      }
      const periodChanged = chartState?.period && chartState.period !== getChartPeriod();
      const modeChanged = chartState && chartState.lineMode !== Boolean(chartState.svg?.querySelector("g.recharts-line"));
      const layoutChanged = chartState && chartState.layoutSignature !== getChartLayoutSignature(chartState.svg);
      if (chartState?.wrapper) decorateNativeTooltip(chartState.wrapper);
      if (homeEnabled && (periodChanged || modeChanged || layoutChanged || !chartState?.groups?.some(group => group.isConnected) || !document.querySelector("main .recharts-wrapper svg.recharts-surface"))) renderHomeSeries();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "x", "y", "x1", "x2", "y1", "y2"] });
  window.addEventListener("resize", () => {
    renderHomeSeries();
    const view = document.querySelector("#xat-advanced-view:not([hidden])");
    if (view) positionAdvancedView(view);
  });
  window.addEventListener("scroll", () => {
    const view = document.querySelector("#xat-advanced-view:not([hidden])");
    if (view) positionAdvancedView(view);
  }, { passive: true });
  ensurePanel();
  watchVerifiedButton();
  watchRangeButtons();
  watchChartPeriod();
  chrome.storage.local.get({ records: [] }, data => {
    if (Array.isArray(data.records) && data.records.length) render({ items: data.records });
  });
})();
