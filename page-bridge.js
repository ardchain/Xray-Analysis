(() => {
  if (window.__xatHomeLingerBridgeInstalled) return;
  window.__xatHomeLingerBridgeInstalled = true;

  const TARGET = "accountOverviewDailyQuery";
  const MESSAGE = "x-analytics-engagement-types";
  const seen = new WeakSet();
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
    QuoteTweet: "Quote posts",
    QuoteCreate: "Quote posts created",
    Reply: "Replies",
    ReplyCreate: "Replies created",
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
    active_followers: "Active followers",
    active_verified_followers: "Active verified followers",
    followers: "Followers",
    verified_follower_count: "Verified followers",
  });

  function humanMetricName(metricKey) {
    if (!metricKey) return "Unknown metric";
    if (METRIC_LABELS[metricKey]) return METRIC_LABELS[metricKey];
    return String(metricKey).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }

  function timestampToMillis(raw) {
    if (raw && typeof raw === "object") raw = raw.iso8601_time || raw.iso8601 || raw.timestamp;
    if (raw === undefined || raw === null || raw === "") return 0;
    if (typeof raw === "number") return raw < 100000000000 ? raw * 1000 : raw;
    const parsed = Date.parse(String(raw));
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? (numeric < 100000000000 ? numeric * 1000 : numeric) : 0;
  }

  function addTimestampFields(fields, raw) {
    const milliseconds = timestampToMillis(raw);
    if (!milliseconds) return;
    fields.timestamp = milliseconds;
    fields.timestamp_iso = new Date(milliseconds).toISOString();
    fields.date = fields.timestamp_iso.slice(0, 10);
  }

  function collect(value, path = "", out = []) {
    if (!value || typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, `${path}[${index}]`, out));
    } else {
      if (typeof value.engagement_type === "string") {
        const item = { engagement_type: value.engagement_type };
        const fields = {};
        for (const [key, field] of Object.entries(value)) {
          if (field === null || ["string", "number", "boolean"].includes(typeof field)) {
            fields[key] = field;
          } else {
            try { fields[key] = JSON.parse(JSON.stringify(field)); } catch (_) {}
          }
        }
        for (const key of ["count", "value", "metric", "date", "timestamp", "created_at", "label", "is_engaging_user_verified", "is_user_verified", "user_is_verified", "user_verified", "verified"]) {
          if (value[key] !== undefined && ["string", "number", "boolean"].includes(typeof value[key])) item[key] = value[key];
        }
        addTimestampFields(fields, value.timestamp ?? value.created_at ?? value.date);
        fields.metric_key = value.engagement_type;
        fields.metric_label = humanMetricName(value.engagement_type);
        Object.assign(item, fields.timestamp ? { timestamp: fields.timestamp, timestamp_iso: fields.timestamp_iso, date: fields.date } : {});
        item.metric_label = fields.metric_label;
        out.push({ path, ...item, fields });
      }
      if (Array.isArray(value.metric_values)) {
        const timestamp = value.timestamp?.iso8601_time || value.timestamp;
        value.metric_values.forEach((metric, index) => {
          if (!metric || typeof metric.metric_type !== "string") return;
          const fields = { ...metric, metric_source: path };
          addTimestampFields(fields, timestamp);
          fields.metric_key = metric.metric_type;
          fields.metric_label = humanMetricName(metric.metric_type);
          out.push({
            path: `${path}.metric_values[${index}]`,
            record_type: "metric_series",
            engagement_type: metric.metric_type,
            metric_type: metric.metric_type,
            ...(metric.metric_value === undefined ? {} : { count: metric.metric_value }),
            fields,
            ...fields,
          });
        });
      }
      Object.entries(value).forEach(([key, child]) => collect(child, path ? `${path}.${key}` : key, out));
    }
    return out;
  }

  function publish(url, payload) {
    if (!String(url).includes(TARGET)) return;
    try {
      const items = collect(payload);
      collectCurrentTimeSeries(payload, items);
      collectSummaryMetrics(payload, items);
      if (items.length) window.postMessage({ source: MESSAGE, url: String(url), items, receivedAt: Date.now() }, "*");
    } catch (_) {}
  }

  function collectSummaryMetrics(payload, out) {
    const result = findUserResult(payload);
    if (!result) return;
    const add = (metricType, value, source) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return;
      out.push({
        path: source,
        record_type: "summary",
        engagement_type: metricType,
        metric_type: metricType,
        count: number,
        metric_label: humanMetricName(metricType),
        fields: { metric_type: metricType, metric_key: metricType, metric_label: humanMetricName(metricType), metric_value: number, source },
      });
    };
    for (const [key, value] of Object.entries(result.author_follower_metrics || {})) add(key, value, "author_follower_metrics." + key);
    for (const [key, value] of Object.entries(result.relationship_counts || {})) add(key, value, "relationship_counts." + key);
    add("verified_follower_count", result.verified_follower_count, "verified_follower_count");
  }

  function collectCurrentTimeSeries(payload, out) {
    const result = findUserResult(payload);
    if (!result) return;
    for (const [index, value] of result.current_time_series.entries()) {
      if (!value || typeof value !== "object" || typeof value.engagement_type !== "string") continue;
      const fields = {};
      for (const [key, field] of Object.entries(value)) {
        if (field === null || ["string", "number", "boolean"].includes(typeof field)) fields[key] = field;
        else {
          try { fields[key] = JSON.parse(JSON.stringify(field)); } catch (_) {}
        }
      }
      addTimestampFields(fields, value.timestamp ?? value.created_at ?? value.date);
      fields.metric_key = value.engagement_type;
      fields.metric_label = humanMetricName(value.engagement_type);
      out.push({
        path: `data.viewer_v2.user_results.result.current_time_series[${index}]`,
        ...value,
        engagement_type: value.engagement_type,
        metric_label: humanMetricName(value.engagement_type),
        ...(fields.timestamp ? { timestamp: fields.timestamp, timestamp_iso: fields.timestamp_iso, date: fields.date } : {}),
        fields,
      });
    }
  }

  function findUserResult(value, visited = new WeakSet()) {
    if (!value || typeof value !== "object" || visited.has(value)) return null;
    visited.add(value);
    if (value.__typename === "User" && Array.isArray(value.current_time_series)) return value;
    if (Array.isArray(value)) {
      for (const child of value) {
        const result = findUserResult(child, visited);
        if (result) return result;
      }
    } else {
      for (const child of Object.values(value)) {
        const result = findUserResult(child, visited);
        if (result) return result;
      }
    }
    return null;
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    if (String(url).includes(TARGET)) {
      response.clone().json().then(data => publish(url, data)).catch(() => {});
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xAnalyticsUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      if (!String(this.__xAnalyticsUrl).includes(TARGET)) return;
      try { publish(this.__xAnalyticsUrl, JSON.parse(this.responseText)); } catch (_) {}
    });
    return originalSend.apply(this, args);
  };
})();
