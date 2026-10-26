# Xray Analytics

**Xray Analytics** is a local Manifest V3 Chrome extension that reveals additional daily metrics already returned to the X Analytics page, but not always offered in X's metric picker. It extends the existing Account overview chart instead of replacing it.

> [!NOTE]
> Xray Analytics is an unofficial local browser extension and is not affiliated with, endorsed by, or sponsored by X Corp. It does not make additional X requests, automate account actions, or transmit analytics data. It only visualizes data that X has already delivered to the signed-in user's Account overview page.

> [!IMPORTANT]
> The names and meanings below are informed interpretations of internal X response keys, not definitions published by X. X can rename, repurpose, omit, or remove them at any time. Treat them as exploratory analytics, not official reporting or billing data.

## What it does

- Observes analytics data already requested by the signed-in X Analytics page.
- Adds eligible extended metrics to the two native Account overview pickers.
- Draws them in X's existing blue/green chart and retains its range, chart mode, tooltip, and Verified filter.
- Uses `is_engaging_user_verified` when X provides it.
- Stores records only in `chrome.storage.local`; it sends no analytics data to a server.
- Shows an extended metric only when X supplied at least four distinct daily observations in the active range.

## Where the data comes from

Xray Analytics does not call an external API and does not scrape pixels or rendered bars. A page-world bridge observes the GraphQL response whose URL contains `accountOverviewDailyQuery`, then reads these structures when present:

- `data.viewer_v2.user_results.result.current_time_series` — daily records with `engagement_type`, `count`, timestamp, and sometimes verified-audience data.
- Nested `metric_values` arrays — other timestamped metric series in the same response.
- `author_follower_metrics`, `relationship_counts`, and `verified_follower_count` — follower summaries, when supplied by X.

The bridge normalizes timestamps and forwards records to the extension's local cache. The chart aggregates that cache for the selected X range (`7D`, `2W`, `4W`, `3M`, or `1Y`). Missing calendar dates are drawn as zero to keep the chart continuous; **that does not prove X sent `0`**. X may simply have omitted that date.

## Availability rules

Availability is per account, per response, and per selected range.

- Native X picker metrics are not duplicated as custom choices.
- `Engagements (v2)` and the follower-series key `Follows` are recognized but intentionally hidden because their observed daily history is incomplete.
- `Time spent in feed (recent)` is hidden because it is a distinct short-history series from `Time spent in feed`.
- Any other metric with fewer than four distinct dates in the active range stays hidden. A video metric available for only two days on one account can still appear for another account once X provides enough dates.
- Sparse keys are ambiguous: an absent record can mean no event happened, or that X did not include that day in its response.

## Metric dictionary

Every explicitly named key that Xray Analytics recognizes is listed here. Unknown keys are still retained with a humanized fallback label, but are deliberately not interpreted in this document.

### Core daily metrics

| X key | Xray label | Interpretation — not an official X definition |
| --- | --- | --- |
| `Displayed` | Impressions | Times X reports the content as displayed/impressed. |
| `EngagementRollup` | Engagements | X's aggregate engagement counter. |
| `EngagementRollupV2` | Engagements (v2) | A second internal aggregate; recognized but hidden for unstable history. |
| `Fav` / `Unfav` | Likes / Unlikes | Like events and like removals. |
| `Follow` / `Unfollow` | Follows / Unfollows | Follow and unfollow events attributed by X to the reporting period. |
| `Retweet` / `Unretweet` | Reposts / Unreposts | Repost events and repost-removal/undo events. |
| `Reply` / `Unreply` | Replies / Unreplied posts | Reply events and reply-removal/undo events. |
| `Bookmark` / `Unbookmark` | Bookmarks / Unbookmarks | Bookmark events and bookmark removals. |
| `Share` | Shares | Share events. |
| `TweetCreate` | Posts created | Posts authored by the account. |
| `ProfilePic` | Profile photo views | Likely profile/avatar interaction signal. The related native aggregate is called “Profile visits.” |

### Extended account and engagement actions

| X key | Xray label | Interpretation — not an official X definition |
| --- | --- | --- |
| `HomeLinger` | Time spent in feed | A feed-linger/time-spent signal associated with the account's content; duration-like, not an impression count. |
| `LingerTime` | Time spent in feed (recent) | A separate short-window linger series; recognized but hidden. |
| `QuoteTweet` / `UnquoteTweet` | Quote posts / Unquoted posts | Quote-post engagement events and quote-post removals/undo events. |
| `QuoteCreate` | Quote posts created | Quote posts authored by the account. |
| `ReplyCreate` | Replies created | Replies authored by the account. |
| `NotInterested` | Not interested | “Not interested” feedback associated with the account's content. |
| `Mute` | Mutes | Mute actions attributed by X to the account/content context. |
| `ArchivalFavorite` / `UnarchivalFavorite` | Archived likes / Restored likes | Like events in an internal archival/restoration state. |
| `ArchivalRetweet` / `UnarchivalRetweet` | Archived reposts / Restored reposts | Repost events in an internal archival/restoration state. |

### Click and detail metrics

| X key | Xray label | Interpretation — not an official X definition |
| --- | --- | --- |
| `Detail` | Post detail views | Opens/views of a post's detail surface. |
| `Url` | URL clicks | Clicks on URL entities. |
| `CardUrlClick` | Card URL clicks | Clicks on a card destination URL. |
| `ScreenName` | Username clicks | Clicks on a displayed handle/username. |
| `UserName` | Profile username clicks | A profile-oriented username click signal. |
| `EmbeddedMedia` | Embedded media views | Views/interactions with embedded media. |

### Video metrics

| X key | Xray label | Interpretation — not an official X definition |
| --- | --- | --- |
| `VideoContentPlaybackStart` | Video playback started | Video playback starts. |
| `VideoContentPlayback25` | Video watched 25% | Plays reaching roughly 25% completion. |
| `VideoContentPlayback50` | Video watched 50% | Plays reaching roughly 50% completion. |
| `VideoContentPlayback75` | Video watched 75% | Plays reaching roughly 75% completion. |
| `VideoContentPlayback95` | Video watched 95% | Plays reaching roughly 95% completion. |
| `VideoContentPlaybackComplete` | Video watched completely | Plays reaching the end. |
| `VideoContentViewThreshold` | Video threshold views | Views meeting an internal X threshold. |
| `VideoContentViewV2` | Video views | A newer internal video-view series. |
| `VideoContentMrcView` | MRC video views | Views measured against an MRC-related internal criterion; the exact criterion is not asserted. |
| `VideoContentQualityView` | Video quality views | Views meeting an internal quality criterion; the exact criterion is not asserted. |

### Client-attributed and follower metrics

| X key | Xray label | Interpretation — not an official X definition |
| --- | --- | --- |
| `ClientFav` / `ClientUnfav` | Client likes / Client unlikes | Like events in an internal X client-attributed metric family. |
| `ClientReply` | Client replies | Reply events in that client-attributed family. |
| `ClientQuoteTweet` | Client quote posts | Quote-post events in that client-attributed family. |
| `ClientRetweet` / `ClientUnretweet` | Client reposts / Client unreposts | Repost events and removals in that client-attributed family. |
| `Follows` / `Unfollows` | Follows / Unfollows | A separate follower-series family, distinct from daily `Follow` / `Unfollow` engagement keys. `Follows` is hidden for incomplete history. |
| `followers` | Followers | Summary follower count. |
| `active_followers` | Active followers | Summary count reported by X as active followers. |
| `active_verified_followers` | Active verified followers | Summary count reported by X as active verified followers. |
| `verified_follower_count` | Verified followers | Summary verified-follower count. |

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the cloned repository directory containing `manifest.json`.
6. Open `https://x.com/i/account_analytics/overview` while signed in to X, then reload the page once.

After source changes, use **Reload** on the **Xray Analytics** extension card, then reload the X Analytics tab. Clicking the toolbar icon opens or focuses Account overview.

## Use

Choose a native metric in either Account overview picker, then open that picker to find eligible Xray metrics beneath the native X options. If the second picker is set to **None**, choosing a custom metric automatically initializes its axis. A custom metric already selected on one axis is disabled in the other picker.

The **Verified** control follows X's own filter behavior. When enabled, Xray uses only records that X marks as verified; when disabled, verified, unverified, and unlabelled records are combined.

## If you are an AI coding agent

You are maintaining a local Chrome extension in this repository root. Your job is to extend X Account overview without replacing or imitating the rest of X Analytics. Read the metric caveat and availability rules above before changing parsing, labels, or chart logic.

When you need to test a change:

1. Open `chrome://extensions` and enable **Developer mode** if necessary.
2. Load unpacked from the repository root containing `manifest.json`.
3. After each source change, click **Reload** on the **Xray Analytics** extension card.
4. Reload `https://x.com/i/account_analytics/overview` while signed in to X.
5. Test only Account overview: both metric pickers, `7D` and `2W`, one custom metric, one native metric, **Verified**, and Bar/Line mode.

Keep these constraints:

- Do not transmit, upload, or log analytics records outside the local browser.
- Preserve X's native UI and chart; do not inject controls into unrelated pages, including post analytics.
- Do not present internal X keys or the interpretations in this README as official X definitions.
- Treat a missing date as an absent record, not proof that X reported zero.
- Keep metrics with fewer than four distinct daily observations hidden from the custom picker, but do not delete their captured local records.

## Project layout

- `manifest.json` — Manifest V3 registration and permissions.
- `page-bridge.js` — page-world response observer and normalizer.
- `collector.js` — local `chrome.storage.local` record cache.
- `panel.js` — picker integration, chart series, axes, tooltips, and aggregation.
- `panel.css` — scoped visual styles.
- `background.js` — opens or focuses Account overview from the toolbar icon.

## Privacy, security, and limitations

Xray Analytics needs access to `x.com` only to observe X Analytics responses in the browser session. It has no backend, telemetry, remote configuration, or automatic export. The integration depends on X's DOM, GraphQL response shape, and Recharts output, any of which may change without notice. Review the source and permissions before loading it into a browser profile containing sensitive accounts.

## Compatibility update — 2026-10-26 (1.0.1)

- Supports the current Base UI metric list while retaining the older Radix viewport.
- Closes the metric menu through its keyboard handler so it can reopen normally.
- Recognizes the current active range button styling, including a persisted 2W selection.
- Supports native Line series as well as Bar series for custom metrics.
- Avoids continually rebuilding unchanged axis labels and preserves visible native menu labels.

## Native UI refinement — 2026-10-26 (1.0.2)

Custom metric rows reuse X's native row classes, typography, spacing and trailing checkmark. A custom metric selected on one axis is disabled on the other; selection handlers resolve the active axis at activation and reject duplicates again before committing, including deferred secondary-axis creation. Native selections preserve the other custom series. Arrow keys, Home/End and Enter navigate and activate custom rows. Custom axis labels inherit their typography from the native SVG labels. Tooltip rows use the native layout with the selected metric and exact values. Custom bars reuse native x positions and widths, and redraw when the native chart layout changes.

## Regression checks

Run `node tests/selection.test.cjs` to check independent axis selection, duplicate rejection and chronological bar alignment. No dependencies or account data are needed.

## Pay period correction — 2026-10-26 (1.0.3)

Pay period now sums daily observations into consecutive 14-day buckets aligned to X's native date labels, rather than splitting every month on the 12th and 26th. Changing the visible range preserves the same calendar boundaries; partial periods include only days within that range. Bar positions and tooltip values use these same buckets. The series total is conserved when switching from Daily to Pay period.

Time spent in feed and Impressions represent different signals, and the native chart scales its blue and green axes independently. Taller bars do not imply a larger comparable count, and the extension does not cap one metric to the other.

Run `node tests/periods.test.cjs` to check Pay period boundaries, partial periods and conservation of totals.
