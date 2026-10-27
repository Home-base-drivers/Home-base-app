# Surge evidence ledger

How Home Base's screenshot-derived surge history maps to original files. Updated October 21, 2026 (v285).

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

## OneDrive camera-roll sync imported in v285 (Oct 21)

Source: the owner's OneDrive Photos after the phone camera roll finished syncing. 759 phone screenshots dated Jul 28 – Oct 21 were reviewed; 465 are Uber or Empower. Records already in the 193-image zip (34 Uber maps, matched within 5 minutes) and Empower alerts already stored were skipped. Capture times come from each file's UTC name (`YYYYMMDD_HHMMSS000_iOS.png`) converted to Eastern, and match the phone clock shown in the image.

| Capture (America/New_York) | Record | Areas |
|---|---|---|
| Fri Aug 28, 4:38 PM | `uber-baltimore-20260828-1638` | 4 |
| Sat Sep 12, 9:19 PM | `uber-baltimore-20260912-2119` | 11 |
| Mon Sep 21, 11:35 PM | `uber-baltimore-20260921-2335` | 8 |
| Tue Sep 22, 2:34 PM | `uber-baltimore-20260922-1434` | 9 |
| Wed Sep 23, 7:05 AM | `uber-baltimore-20260923-0705` | 12 |
| Wed Sep 23, 9:23 PM | `uber-baltimore-20260923-2123` | 3 |
| Thu Sep 24, 7:33 AM | `uber-baltimore-20260924-0733` | 10 |
| Sat Sep 26, 6:27 AM | `uber-baltimore-20260926-0627` | 10 |
| Sun Sep 27, 11:20 AM | `uber-baltimore-20260927-1120` | 3 |
| Sun Sep 27, 11:34 PM | `uber-baltimore-20260927-2334` | 4 |
| Tue Sep 29, 7:12 PM | `uber-baltimore-20260929-1912` | 4 |
| Wed Sep 30, 11:17 AM | `uber-baltimore-20260930-1117` | 3 |
| Wed Sep 30, 10:39 PM | `uber-baltimore-20260930-2239` | 6 |
| Sat Oct 3, 9:25 PM | `uber-baltimore-20261003-2125` | 2 |
| Sun Oct 4, 10:18 AM | `uber-baltimore-20261004-1018` | 7 |
| Sun Oct 4, 5:34 PM | `uber-baltimore-20261004-1734` | 1 |
| Thu Oct 8, 4:17 PM | `uber-baltimore-20261008-1617` | 4 |
| Thu Oct 8, 4:42 PM | `empower-baltimore-20261008-1642-downtown` | 1 |
| Thu Oct 8, 4:49 PM | `empower-baltimore-20261008-1649-downtown` | 1 |
| Thu Oct 8, 10:19 PM | `empower-baltimore-20261008-2219-downtown` | 1 |
| Fri Oct 9, 6:45 AM | `empower-baltimore-20261009-0645-mondawmin-frankford-broadway` | 3 |
| Fri Oct 9, 7:45 AM | `empower-baltimore-20261009-0745-union-broadway-rosemont-mondawmin-frankford` | 5 |
| Fri Oct 9, 2:57 PM | `uber-baltimore-20261009-1457` | 12 |
| Sat Oct 10, 3:28 PM | `uber-baltimore-20261010-1528` | 1 |
| Sat Oct 10, 4:33 PM | `uber-baltimore-20261010-1633` | 4 |
| Sat Oct 10, 7:48 PM | `uber-baltimore-20261010-1948` | 1 |
| Sat Oct 10, 9:11 PM | `uber-baltimore-20261010-2111` | 2 |
| Sat Oct 10, 10:18 PM | `uber-baltimore-20261010-2218` | 23 |
| Sat Oct 10, 10:19 PM | `uber-baltimore-20261010-2219` | 5 |
| Sun Oct 11, 12:35 PM | `uber-baltimore-20261011-1235` | 6 |
| Tue Oct 13, 7:31 AM | `empower-baltimore-20261013-0731-frankford` | 1 |
| Tue Oct 13, 7:35 AM | `empower-baltimore-20261013-0735-belair-edison` | 1 |
| Tue Oct 13, 7:45 AM | `empower-baltimore-20261013-0745-mondawmin` | 1 |
| Tue Oct 13, 7:49 AM | `empower-baltimore-20261013-0749-mount-broadway` | 2 |
| Tue Oct 13, 7:52 AM | `empower-baltimore-20261013-0752-mondawmin` | 1 |
| Tue Oct 13, 7:55 AM | `empower-baltimore-20261013-0755-mount-broadway` | 2 |
| Tue Oct 13, 8:56 AM | `empower-baltimore-20261013-0856-mount` | 1 |
| Tue Oct 13, 4:44 PM | `empower-baltimore-20261013-1644-mount-downtown` | 2 |
| Tue Oct 13, 4:49 PM | `empower-baltimore-20261013-1649-downtown` | 1 |
| Tue Oct 13, 7:55 PM | `uber-baltimore-20261013-1955` | 4 |
| Tue Oct 13, 8:18 PM | `uber-baltimore-20261013-2018` | 4 |
| Tue Oct 13, 8:36 PM | `uber-baltimore-20261013-2036` | 1 |
| Tue Oct 13, 8:49 PM | `uber-baltimore-20261013-2049` | 1 |
| Tue Oct 13, 11:10 PM | `uber-baltimore-20261013-2310` | 2 |
| Tue Oct 13, 11:11 PM | `uber-baltimore-20261013-2311` | 4 |
| Wed Oct 14, 8:19 AM | `uber-baltimore-20261014-0819` | 10 |
| Wed Oct 14, 8:22 AM | `uber-baltimore-20261014-0822` | 7 |
| Wed Oct 14, 8:24 AM | `uber-baltimore-20261014-0824` | 3 |
| Wed Oct 14, 8:26 AM | `uber-baltimore-20261014-0826` | 6 |
| Wed Oct 14, 8:28 AM | `uber-baltimore-20261014-0828` | 2 |
| Wed Oct 14, 8:34 AM | `uber-baltimore-20261014-0834` | 1 |
| Wed Oct 14, 8:41 AM | `uber-baltimore-20261014-0841` | 4 |
| Wed Oct 14, 8:43 AM | `uber-baltimore-20261014-0843` | 3 |
| Wed Oct 14, 2:46 PM | `uber-baltimore-20261014-1446` | 9 |
| Wed Oct 14, 5:23 PM | `uber-baltimore-20261014-1723` | 5 |
| Wed Oct 14, 5:26 PM | `uber-baltimore-20261014-1726` | 6 |
| Wed Oct 14, 5:27 PM | `uber-baltimore-20261014-1727` | 5 |
| Wed Oct 14, 5:51 PM | `uber-baltimore-20261014-1751` | 3 |
| Thu Oct 15, 8:38 AM | `uber-baltimore-20261015-0838` | 1 |
| Thu Oct 15, 8:53 AM | `uber-baltimore-20261015-0853` | 5 |
| Thu Oct 15, 3:00 PM | `uber-baltimore-20261015-1500` | 9 |

**Resolved:** IMG_3362/3363 (phone clock 10:39) are OneDrive files `20261001_023915000_iOS.png` and `20261001_023927000_iOS.png`, i.e. **Wed Sep 30, 10:39 PM**. Stored as `uber-baltimore-20260930-2239`.

**Earliest verified Uber surge capture is now Fri Aug 28, 2026, 4:38 PM** (`20260828_203826000_iOS.png`). No Uber or Empower screenshot dated Jul 28 – Aug 27 exists in OneDrive.

**Not demand evidence (skipped):** Home Base app screens, Uber earnings/trip-activity screens (64), Empower earnings screens (6), a Miami Home Base map, and a New Jersey (Mahwah/Ramsey) map.

**Still missing after OneDrive:** Sep 1–10 and Sep 13–20 have no Uber maps; Empower notifications before Oct 7 were not captured.

## October 21–22 Empower alerts (v286)

Lock-screen captures taken Thu Oct 22, 9:12–9:14 PM (EXIF), so "Yesterday" is Wed Oct 21.

- **Wed Oct 21:** exact times for the morning wave (Rosemont $5–7, Mondawmin $5, Mt. Vernon $5, 7:27–7:58 AM), Downtown $5 at 3:30 PM, Towson $5 at 3:42 PM, Downtown $6 at 6:11 PM, plus 22 average-surge notices. The earlier "3h ago" Oct 21 window is kept but marked superseded, so those alerts are not counted twice.
- **Thu Oct 22:** the largest Empower morning wave on record, 6:38–8:42 AM: Broadway E. $10 (6:59), Belair-Edison $10 (7:53), Frankford $10 (7:56), Rosemont $8 (7:36), Mondawmin and Union Sq. $6. Afternoon: Downtown $5 (1:47, 4:00, 4:05 PM), Broadway E. $5 (3:51, 3:56 PM), Charles Village $6 (4:39 PM). The overnight average reached $4 (3:42, 4:14, 4:52 AM) and $5 at 6:52 AM.

## October 24–25 bar close and Sunday morning (v289)

Lock-screen and Uber captures Sun Oct 25, 1:57–2:02 AM and 7:09–8:16 AM (EXIF). "Yesterday" on the 2:02 AM capture is Sat Oct 24.

- **Empower bar close, Sun 12:03–2:27 AM:** 29 alerts across Federal Hill, Camden Yards, Fells Point and Downtown. Peak at 1:53–2:00 AM: Camden Yards $24, Federal Hill $21, Downtown $11; Fells Point $8–11 from 1:16 to 2:10 AM. Alerts from 1:03 to 1:50 AM use relative ages (±1 minute); the eight "1h ago" alerts (12:03–1:02 AM) are one low-confidence record.
- **Uber bar close, 1:59–2:01 AM:** purple across the city and east side. Cockeysville +$15, Park Heights +$14, Pigtown +$9, Highlandtown +$8.75, Hamilton/Belair-Edison +$8.25, Edgemere and Curtis Bay +$7.50, Brooklyn Park +$7; Annapolis/Broadneck +$2–4.25; western Howard +$2–5.75. One record (`uber-baltimore-20261025-0200`).
- **Sunday morning:** Uber red shading at 7:09 and 8:12 AM (north county, west side, east side, BWI), stored as shading only. Empower citywide average stayed $1 Saturday evening, then built to $5 around 6:15–7:15 AM Sunday.
- **Second upload, Sat 10:33 PM – Sun 1:52 AM (8 Uber records):** Sat 10:33 PM Southern Maryland (Waldorf/St. Charles up to +$6.25, Indian Head +$4.75); 10:34 PM west side (Park Heights +$5, Woodlawn +$4.50); 10:53 PM Annapolis +$15 with Edgewater/Crofton/Annapolis Neck +$5–5.75. Bar-close build: 1:07 AM shading only, 1:41 AM Annapolis +$15, Cockeysville +$12, Pigtown +$9.25, Overlea +$8.25; 1:51 AM Cockeysville +$15, Annapolis Neck +$12, Allendale/Edmondson +$11, Belair-Edison +$7.75, Towson +$7.25.
- **Third upload, Sat Oct 24 daytime/evening (7 Uber records):** 10:55 AM and 11:03 AM light maps (BWI +$1, Reisterstown +$2.25, shading); 3:18 and 4:06 PM red shading citywide; 5:42–5:47 PM purple downtown/Pigtown/harbor (Pigtown +$4.25), Annapolis +$3–3.75, an unidentified Uber "Event" pin near 33rd St/Hillen Rd; 5:55 PM small bonuses (BWI +$2, Annapolis +$2.75, Westminster +$1.50); 10:32–10:33 PM White Marsh +$6.25, Perry Hall +$5.25, Edgewater/Mayo +$5.25.
- **Fourth upload — Fri Oct 23 Empower (lock screens Sat 9:19–9:21 AM):** Towson **$19** at 12:44 and 12:49 AM (Thursday-night bar close); morning wave Belair-Edison $11 (6:45), Mondawmin $5–6 (6:42–7:25), Broadway E. $5 (7:40, 7:47); afternoon Broadway E. $5–6 (2:03, 2:08, 3:49), Charles Village $6 (3:25), Mt. Vernon $5 (3:39, 4:00), Downtown $5–6 (3:42, 4:13, 4:18), Towson $5 (4:27). Sat Oct 24 Downtown $5–6 at 12:32, 12:37 and 2:11 AM. Citywide averages Thu evening – Sat morning stored as unlocated context.
- **Fourth upload — Uber:** Fri 10:33 PM Annapolis +$1.75; 10:46 PM small bonuses (Lansdowne +$2.50, Sparks +$2.25); Sat 12:51–12:53 AM western Howard +$6.75, Shady Side +$6.50, Millersville +$5.25, Annapolis +$5, Indian Head +$1.75; 2:55 AM shading only; 8:39 AM Cockeysville +$2.50; 9:18 AM shading only.
- **Already stored:** the Sat 9:21 AM Empower lock screens show Thu Oct 22 alerts (Frankford, Rosemont, Mondawmin, Downtown, Broadway E.) recorded in v286.
- **Skipped:** Uber earnings/trip screens (private trip addresses) and two fuel receipts (payment details).

### Upload audit (Oct 25)

Every upload was matched by EXIF capture time and file contents (112 files, 107 distinct images; 5 byte-identical repeats).
- **Fixed:** Fri Oct 23 10:32:58–10:33:25 PM had the same clock times as three Sat Oct 24 captures and had been treated as repeats. EXIF dates and pixels differ, so they are now stored as `uber-baltimore-20261023-2232` (Cockeysville +$7, Timonium east +$6.50, Columbia +$5.75, Cheswolde +$5.50).
- **Added:** Sat 3:17 AM shading (`uber-baltimore-20261024-0317`), Sun 8:26 AM shading, and the Sun 10:36–10:46 AM purple wave (East Baltimore +$9.75, Annapolis west +$8, Towson +$7.75, Overlea +$7).
- **Skipped on purpose (13):** 11 Uber earnings screens (passenger streets), 2 fuel receipts; plus one Home Base app screen.
- **Result:** every other distinct image maps to a stored record.
- **Later upload:** Fri Oct 23 9:34–9:35 PM Uber views outside Baltimore — Elkton east +$7, Easton and St. Michaels +$7.50, Cambridge +$1.50, Princess Anne +$3.25 (3 records). The 11 Empower lock screens in the same upload are byte-identical to the Thu Oct 22 9:12–9:14 PM captures already stored in v286.
- **Sun Oct 25 11:56 AM Empower capture:** Mt. Vernon $5 at about 11:11 AM; exact Sunday-morning averages 6:48 AM $4, 6:51 $5, 6:55 $3, 6:58 $2.
- **Earnings:** trip pay from the Oct 23–25 Uber Earnings Activity screens is stored in the private earnings database (not in this public repo).
- **Sun Oct 25 afternoon/evening (9 Uber records):** 1:50 PM northwest (Owings Mills +$6.50, Cockeysville +$6.25); 2:41 PM Monkton +$7.75, Butler +$7.50; 4:28 PM west side and harbor (Allendale/Edmondson +$16, Arbutus +$11, Inner Harbor +$9.50); 4:56 PM Inner Harbor +$10, White Marsh +$9.50; 5:08 PM BWI +$2.75; 5:56 PM downtown all purple with an Uber "Event" pin (Federal Hill/stadiums +$14, Westport +$10); 6:07 PM Inner Harbor +$9.25; 6:39 PM Annapolis +$14; 8:50 PM shading only.
- **Event link:** the Oct 25 2:41 PM–8:50 PM Uber records are linked to Bengals at Ravens (M&T Bank Stadium, 1:00 PM kickoff). That game calibrates the stadium let-out profile; see `docs/EVENT_HEAT_EXAMPLE.md`.
- **Mon Oct 26 9:52 AM Empower capture:**
  - Sunday game let-out, all exact times and linked to the game: Fed Hill/Camden Yards/Union Sq. $5–8 from 4:06 to 5:51 PM, peaking with Camden Yards $8 at 4:29.
  - Sunday night: Downtown $6 at 10:42 PM and $5 at 11:10 PM.
  - Monday morning wave, 5:52–8:52 AM, timed by bucket order with low timestamp confidence: Rosemont up to **$17** (with $13 and $11), Mondawmin $5–7, Broadway E. $5–7, Frankford $5–6, Belair-Edison $5, Union Sq. $5–6.

## Weighting update (v290)

- **"1h ago" alerts count fully.** An alert shown only as "1h/2h/3h ago" belongs to that hour's surge window. It now matches any minute in the hour at full weight, instead of half weight pinned to one estimated minute. Records whose date itself is estimated still count at half weight.
- **Bigger dollars weigh more.** Each date keeps its largest amount. Amounts up to $8 are neutral, scaling to 1.6× at $18 or more. Because the boost multiplies the date-count cap, big amounts repeated on different days build the strongest patterns. The pattern ceiling rises from 0.45 to 0.72 so the boost can show.
- **Effect next Monday:** Rosemont at 7:30 AM rises 0.37 → 0.42 (its $17, $13 and $11 days). Mondawmin and Broadway East have mostly $5–7 days, so they are unchanged.

## Mon Oct 26 (6:08 PM Empower capture + Uber maps 12:18 PM–6:07 PM)

- **Monday morning wave now has exact times** (lock screen shows clock times on this later capture), replacing the bucket-timed copies from the 9:52 AM capture (those are kept but superseded): Rosemont $5 at 6:35, **$11 at 6:42**, $7–8 from 6:53 to 7:50, **$13 at 7:56, $17 at 8:03**; Broadway E. $5–7 from 6:50 to 8:03; Mondawmin $5–7 from 7:28 to 7:56; Frankford $5–6 at 7:26–7:32; Belair-Edison $5 at 7:28; Union Sq. $5–6 at 8:31–8:37.
- **Average suggested surge, exact:** $1–2 overnight; **$3–4 at 4:37–4:45 AM** (early shifts); $3–4 at 6:33–6:46 AM; $2 in the afternoon; $1 by 5:11 PM.
- **Monday afternoon (school dismissal), from "3h/2h ago":** Union Sq., Mondawmin and Broadway E. $5 between 2:08 and 3:08 PM; Mount Vernon $5 twice in that hour and again 3:08–4:08 PM.
- **Uber, same afternoon:**
  - 12:18 PM: calm, no bonuses.
  - 2:11 PM: city core red with 1–2 min pickups.
  - **2:36 PM peak:** Pikesville +$8, Back River Neck +$7.75, Owings Mills and Reisterstown +$4.75, Middle River +$4.50, Dundalk +$3.25, Perry Hall +$2.75.
  - 2:44–2:45 PM: Reisterstown +$4.25; **two red 1–2 min badges at Broening Hwy (Amazon BWI2) and purple at Sparrows Point (Route 151, Tradepoint Atlantic Amazon) 15 minutes before the 3 PM Amazon shift change.**
  - 6:07 PM: evening commute shading only.
