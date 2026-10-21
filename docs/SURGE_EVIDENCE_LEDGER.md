# Surge evidence ledger

How Home Base's screenshot-derived surge history maps to original files. Updated October 21, 2026 (v284).

Originals stay private with the owners. This repository stores only the surge fields, file names and SHA-256 hashes. It never stores the images, notification backgrounds, passenger details or trip addresses.

## Sources reviewed

| Source | Status |
|---|---|
| `Home-Base-Surge-Screenshot-Evidence.zip` (Oct 21) | 193 images opened: 57 later screenshots plus 136 in `earlier-screenshots/` |
| Repository history since Sept 23 (all branches) | Searched. No record before Oct 3 had existed. |
| Supabase `nixihmurdtfcbffgvpij` | Trips and earnings Oct 8–12 only; no surge rows |
| Claude chats available to this project | Two Home Base chats (≈Oct 6–17) |
| ChatGPT-era chats ("Driver Router", "Uber Purple Explained", "Home Base Overnight QA", and others) | **Not accessible** to Claude |
| `Home-Base-Driver-Evidence.json`, `Home_Base_Complete_Game_Plan.docx`, `Home-Base-Upgrade-Report.md` | **Not provided** |
| Source-index candidates not in the zip (IMG_3488 aside: IMG_3504–3530, 3550–3571, 3584–3601, IMG_7625/7639/7644) | **Not reviewed** |

**Earliest verified Uber surge capture:** September 11, 2026, 7:55 AM.

**Owner-reported start:** July 28. No original from **July 28 – September 10** has been found yet.

## How capture times were established

Most originals are re-encoded JPEGs without EXIF data, so the method is recorded on each record (`timestamp_method`, `timestamp_confidence`):

- **Filename:** Mac screenshot names such as `Screenshot 2026-09-11 at 7.55.13 AM`, matching the phone clock.
- **Dated Home Base screen:** Home Base screens show the date in the header (e.g. "Tue, Sep 29 · 2:09 PM"). Uber maps next to them in the camera roll take that date, checked against battery level.
- **EXIF:** used where present.
- **Earnings match:** e.g. the Oct 8 8:16 PM map's $27.57 pill equals that evening's trip list.
- **Theme:** the owner confirmed on Oct 21 that the light Uber map theme means daytime. Dark theme appears both day and night (e.g. Sun Sep 27 8:39 AM, Wed Sep 30 4:43 PM), so it is never used to decide AM/PM.
- **Estimated dates** (`timestamp_confidence: low`) count at half weight in predictions.

Upload times are kept separate and are never used as capture times.

## Observed Uber maps imported in v284

| Capture (America/New_York) | Files | Confidence | Record |
|---|---|---|---|
| Fri Sep 11, 7:55 AM | Screenshot 2026-09-11 at 7.55.13 AM | high | `uber-baltimore-20260911-0755` |
| Fri Sep 11, 5:09 PM | Screenshot 2026-09-11 at 5.09.47 PM | high | `uber-baltimore-20260911-1709` |
| Fri Sep 11, 5:14 PM | Screenshot 2026-09-11 at 5.14.15 PM | high | `uber-baltimore-20260911-1714` |
| Thu Sep 25, 3:02 PM | Screenshot 2026-09-25 at 3.02.00 PM | high | `uber-baltimore-20260925-1502` |
| Thu Sep 25, 3:45 PM | IMG_3210 | high | `uber-baltimore-20260925-1545` |
| Fri Sep 18 (estimated), 2:57 PM | IMG_3066 (= 3066(1)) | low: date estimated, half weight | `uber-baltimore-20260918-1457` |
| Sun Sep 27, 8:39 / 8:49 / 9:17 AM | IMG_3264; 3266+3267; 3268+3269 | high | `…20260927-0839/0849/0917` |
| Sun Sep 27, 11:34 AM | IMG_3274 | medium | `uber-baltimore-20260927-1134` |
| Mon Sep 28, 9:50 PM | IMG_3294 | medium | `uber-baltimore-20260928-2150` |
| Mon Sep 28, 11:33 PM | IMG_3297+3298 | medium | `uber-baltimore-20260928-2333` |
| Tue Sep 29, 2:14 / 3:44 / 4:02 PM | IMG_3309+3310; 3312; 3315 | high | `…20260929-1414/1544/1602` |
| Wed Sep 30, 12:26 AM / 4:43 PM / 5:30 PM | IMG_3344; 3349; 3355 (= 3355(1)) | high | `…20260930-0026/1643/1730` |
| Thu Oct 1, 1:54 / 4:08 / 4:36 / 5:06 PM | IMG_3366; 3368+3369; 3370; 3371 | high (light theme = day) | `…20261001-1354/1608/1636/1706` |
| Fri Oct 2, 2:09 / 4:10 PM | IMG_3390; 3393 | high (light theme = day) | `…20261002-1409/1610` |
| Fri Oct 2, 11:52 PM | IMG_3396+3397 | high (promotion banner says 11 PM–12 AM) | `uber-baltimore-20261002-2352` |
| Sat Oct 3, 1:03 AM | IMG_3398 (= 3398(1)) | high | `uber-baltimore-20261003-0103` |
| Sun Oct 4, 8:30 PM | IMG_3488 | high | `uber-baltimore-20261004-2030` |
| Tue Oct 6, 4:11 / 4:41 (cooling) / 5:28 / 6:34 PM | IMG_3574 (= 3574(1)); 3575; 3576; 3581 | high | `…20261006-1611/1641/1728/1834` |
| Thu Oct 8, 2:35 / 5:14 / 5:24 / 8:16 PM | IMG_3607+3608; 3617+3618 (= 3618(1)); 3620; 3623 | high | `…20261008-1435/1714/1724/2016` |

**Corrections to existing records:**
- **IMG_3400:** dated Sat Oct 3, 2:04 AM; its seven badges were placed on the map.
- **IMG_3461/3462:** dated Oct 4, 12:24 AM.
- **IMG_3602:** added the missing +$6.75 and +$2.25 badges.
- **IMG_3604 (Morgan State):** added the "24m ago" $6 notification as a time window, plus four average-surge notices kept as context.

**Already stored before v284 and unchanged:** IMG_3461–3467, 3476/3477, 3545–3549, 3609/3610, 3624/3625, 3632–3634, 3637–3643.

## Awaiting date or AM/PM review (not used for prediction)

| File | Phone clock | Why |
|---|---|---|
| IMG_3362, IMG_3363 (= 3363(1)) | 10:39 | Wed Sep 30, 10:39 PM or Thu Oct 1, 10:39 AM; dark theme doesn't settle it |

## Not demand evidence

- **`homebase-ui-comparisons` (52 files, 44 unique):** Home Base model output. Used here for dates and kept as regression references. Examples: a route repeating Penn Station every hour (Sep 29, Oct 6), and purple modeled heat with "no verified dated listings" (Oct 8, 12:30 AM).
- **`illustrations-not-observed-demand` (32 files, 12 unique):** design references. Their prices and event claims are never trained on.
- **`earnings-context` (4 files):** Gridwise summaries. They show Uber earnings in Jan, Aug and Sep 2026; they are not surge data.
- **Uber trip lists:** "Surge" lines on completed trips are stored as `uber_trip_paid_surge` (Oct 9, 7:21 and 7:35 AM). "Increased" fares and Pro Perks are not surge.
- **"+$4.50/active hour" banners:** promotions. Never stored as surge.

## Searched with no surge screenshots found

- Google Drive (Oct 21): the only July–September images are unrelated security-camera frames (Aug 23).
- OneDrive and the owner's computer: **not searched**. The Microsoft 365 connector isn't fully connected, and the desktop app wasn't linked to this session.

## Still missing

- July 28 – September 10: no originals located.
- September 12–24 and 26: no dated Uber maps besides the estimated Sep 18 capture.
- Any Empower notifications before October 7.
