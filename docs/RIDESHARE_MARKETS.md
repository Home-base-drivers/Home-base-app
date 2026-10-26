# Rideshare markets (Uber, Lyft and other apps)

`config/rideshare-markets.json` lists **833 driver markets**: 326 US markets (all 50 states, DC and Puerto Rico) and 507 major cities in 119 other countries. `npm run build:service-areas` (`scripts/build-service-areas.mjs`) turns it into `dist/homebase-service-areas.js`, and a test fails if the two drift apart.

## How the app uses it
- **Choosing the market.** Each driver's market is the one they pick in onboarding, Profile or Settings; all three use a searchable list of every market. With no pick, the nearest market to their location is used.
- **Working area.** A place, event or route stop counts only if it is:
  - within the market's working radius (50 mi for large metros, 35 mi for smaller ones — an app heuristic, not an Uber or Lyft figure); and
  - in the US, inside one of the market's **pickup states**; elsewhere, inside the market's **country**.
- **Region lookup.** `dist/homebase-regions.js` (US Census and Natural Earth shapes, built by `npm run build:regions`) resolves a point's state or country offline. A point whose region can't be resolved is decided by the radius alone.
- **Units.** Miles in the US, US territories and the UK (also Liberia and Myanmar); km elsewhere.
- **Server.** The live refresh applies the same rule to the events it publishes for each configured search market.
- **What gets searched.** Only areas inside a driver's market are ever searched or shown. A neighbor state is excluded unless an official Uber or Lyft page confirms that drivers can pick up there, so unconfirmed cross-state events never appear. Baltimore uses the owner-confirmed DMV rule (MD, DC, Northern VA; not PA or DE), which Uber's DMV statement supports.

### US: Counts

| Metric | Value |
|---|---|
| Markets | **326** (50 states + DC + PR) |
| Lyft-listed markets | 317 (one per top-level region in Lyft's official driver city index, https://www.lyft.com/driver/cities) |
| Uber presence confirmed per market | 135 (the other 191 are `uber: true` but marked "not individually verified" in `uberEvidence`) |
| Uber-only additions | 9 (Dothan AL, Hot Springs AR, Visalia CA, Pueblo CO, Durango CO, Wilmington DE, Peoria IL, Carbondale IL, Salina KS) |
| Confidence | high 53, medium 209, low 64 |
| Markets with verified cross-state pickups | 5 (DC, Baltimore, Cincinnati, Portland OR, Parkersburg WV) |

How to read the dataset:
- **Home state.** Every market includes its own state as a pickup state.
- **Other states.** A neighboring state is listed only when an official Uber or Lyft page supports it. The supporting text is quoted in `crossStatePickup`.
- **Unknown means not workable.** If `crossStatePickup` is "unknown", treat the neighboring state as not workable until it is confirmed.
- **Radius.** `typicalRadiusMi` is an app heuristic, not an Uber or Lyft figure: 50 mi for large metros, 35 mi for smaller ones.

### US: Lyft statewide approvals (verified on Lyft driver-requirement pages)

These pages say "Once you're approved, you'll also be able to drive anywhere in <state>":
- **Statewide:** CA, CO, FL, GA, IL, LA, MA, NV, NJ, PA, TN, TX.
- **Partial:**
  - Lyft Seattle approvals cover "greater Seattle/Tacoma area".
  - Lyft NYC approvals cover "New York City".
- **Effectively statewide by Lyft's region list:** New Jersey, New Hampshire (Manchester region, about 80 towns), Vermont (Greater Vermont) and Wyoming (Cheyenne region covers every listed WY town). Montana is split into Western and Eastern regions.

### US: Multi-state metros: verified cross-state pickups

| Market | Pickup states | Source quote |
|---|---|---|
| **Washington DC / MD / Northern VA** (high) | DC, MD, VA (both apps) | **Uber:** "Drivers in the DMV area are able to pick up riders in all three states once they meet the requirements for each state." / "If you only meet the requirements for one of the states (e.g., only Maryland), you will only be able to accept trip requests within the boundaries of that state." (https://www.uber.com/us/en/blog/dmv-area-regulations/). **Lyft:** "Once you're approved, you'll also be able to drive anywhere in Virginia, Maryland,* or Washington, DC." / "Drivers without a Washington DC, Maryland, or Virginia driver's license will not be dispatched for pickups in DC proper." (https://www.lyft.com/driver/cities/washington-dc/driver-application-requirements) |
| **Baltimore** (medium) | Lyft: MD + DC. Uber: MD only (DC/VA unknown) | **Lyft:** "Once you're approved, you'll also be able to drive anywhere in Maryland and Washington DC." (https://www.lyft.com/driver-application-requirements/maryland). Virginia is not included for Lyft. |
| **Cincinnati** (medium) | Uber: OH + KY. Lyft: OH only (KY unknown) | **Uber:** "If you wish to drive in Kentucky, including CVG Airport, you are required by Kentucky regulations" to take an annual driver safety course, which is "not required to drive in Cincinnati" (https://www.uber.com/us/en/drive/cincinnati/vehicle-requirements) |
| **Portland OR / Vancouver WA** (medium) | Lyft: OR + WA. Uber: OR only (WA unknown) | **Lyft:** its driver city index lists Vancouver (WA) under the `portland-or` region (https://www.lyft.com/driver/cities). This is a region listing, not an explicit pickup statement. |
| **Parkersburg WV / Marietta OH** (medium) | Lyft: WV + OH. Uber: WV only | **Lyft:** its driver city index lists Marietta (OH) under the `parkersburg-wv` region. This is a region listing only. |

Related partial facts that are not cross-state pickup permissions:
- **New Jersey (Uber).** "Your NJ trips that drop off into NYC will now include a $7.50 surcharge to help cover your costs returning to New Jersey" (https://www.uber.com/us/en/blog/nj-driver-surcharge). NJ drivers may **drop off** in NYC. NYC pickups are not stated.
- **Louisville (Uber).** "you won't be eligible to receive trip requests in Kentucky using the Uber app until you upload a certificate" (https://www.uber.com/us/en/drive/louisville/vehicle-requirements). Indiana is not named, so Southern Indiana pickups remain unknown.
- **NYC (Uber).** "New York City drivers using Uber's Driver app are required to have a TLC Driver License."
- **NYC (Lyft).** Lyft says you can "still apply to drive in the rest of New York State and New Jersey". These are separate applications.

### US: Facts that could not be verified (recorded as unknown, confidence low)

**Named multi-state metros where no official page states the pickup rule:**
- **NYC vs NJ.** NYC/TLC drivers picking up in NJ, and NJ drivers picking up in NYC.
- **Philadelphia vs South Jersey and Delaware.** Lyft Philadelphia approvals are "anywhere in the state of Pennsylvania", and Lyft lists Camden and Cherry Hill under its NJ region.
- **Kansas City MO/KS.** Lyft lists Kansas City KS under a separate Lawrence KS region.
- **St. Louis MO / Metro East IL.**
- **Louisville KY / Southern Indiana.** Lyft runs a separate Jeffersonville IN region.
- **Chicago / NW Indiana.** Lyft Chicago approvals are "anywhere in Illinois", and Lyft runs a separate Gary IN region.
- **Memphis TN/AR/MS.**
- **Omaha NE / Council Bluffs IA.**
- **Quad Cities IA/IL.** Uber names a "Quad Cities" region, but its page names no states.
- **Charlotte NC / York County SC.**
- **Cincinnati on Lyft** (KY/CVG), and the Indiana side of Cincinnati on both apps.
- **Baltimore on Uber** (DC/VA).
- **Portland on Uber** (Vancouver WA).
- **Wilmington DE.** Lyft has no Wilmington DE region in its index, and PA/NJ/MD pickups are not stated.

**Other border markets flagged low** (a neighboring state is within the radius, with no statement found): Lake Havasu City, Yuma, Lake Tahoe, Reno, Hartford, Bridgeport/Stamford, Norwich, Westchester, Tallahassee, Pensacola, Augusta, Columbus GA, Savannah, Northern Georgia, Coeur d'Alene, Spokane, Rockford, Evansville, South Bend, Dubuque, Sioux City, Shreveport, Western Maryland, Eastern Shore MD, Minneapolis-St. Paul, Duluth, Springfield MO, New Hampshire, Las Cruces, El Paso, Fargo, Grand Forks, Toledo, Youngstown, Allentown, Providence, Myrtle Beach, Chattanooga, Clarksville, Johnson City, St. George, Virginia Beach, Longview, Pullman, Huntington WV, Morgantown, Martinsburg, La Crosse, Janesville, Wyoming.

**Other gaps:**
- **Uber's city index was not fully read.**
  - www.uber.com/us/en/cities/ could not be fetched (proxy/permission).
  - The Uber driver-city index (https://www.uber.com/us/zh/e/drive/cities) was cut off after Kansas.
  - As a result, Uber presence was not individually confirmed for 191 markets, mostly in KY through WY.
- **Pages that could not be fetched (permission timeout):**
  - The Lyft help-center state articles (help.lyft.com, e.g. the Kentucky and Portland driver information pages).
  - Several constructed Lyft and Uber URLs.
- **Lyft statewide wording is per page.** Each "drive anywhere in <state>" quote comes from one city's requirement page, such as Nashville for Tennessee. The dataset applies it to that state's other Lyft regions.
- **Coordinates** are approximate main-city centers.
- **Uber per-city "driver jobs" pages** exist even for very small towns. They show sign-up coverage, not trip demand.

## Outside the US


**Generated:** 2026-10-26. **Data file:** `global-rideshare-markets.json`, with 508 city markets in 120 countries.

## How to read the data
- `platforms` is `true` when the app operates in or around that city.
- `unverifiedPlatforms` lists flags that were confirmed only at country level or by a secondary source, not on an official per-city page. Treat them as likely, not guaranteed. Examples: inDrive's official 49-country list, and Uber's official 74-country list for countries whose city page was not checked.
- `confidence` (high / medium / low) applies to the **primary (first-listed) platform** for that market.
- `typicalRadiusKm` is an **app heuristic, not an operator boundary**: 50 km for large or sprawling metros, 35 km for smaller cities. Replace it with real geofence polygons when you have them.
- `units`: `mi` only in GB and Myanmar in this set. Everything else is `km`. US territories, including Puerto Rico, are excluded and treated as US.

Confidence mix: **371 high, 125 medium, 12 low.**

## Counts per app (city entries)
| App | Cities | Of which city-level unverified | Verification basis |
|---|---|---|---|
| Uber | 371 | 153 | Official 74-country list, plus per-country city pages for BR, JP, CA, SA, MX, DE, AU, CO, EG, NG, ZA, BD, KR, ES, AR, IN, TW, plus a UK blog, a Nepal newsroom post, and secondary sources for IT, TR, NZ |
| inDrive | 189 | 180 | Official country list (49). The cities page names only Cairo, Alexandria, Karachi, Lahore, Lima, Arequipa, Bogotá, Medellín |
| Bolt | 160 | 1 | Official bolt.eu/en/cities list, plus Auckland (2025) |
| DiDi | 86 | 47 | 20 China metros, 8 Latin American countries, Australia (28 cities, names not given), Auckland, Japan (taxi), Hong Kong |
| FREENOW (Lyft) | 53 | 0 | Official FREENOW cities page (9 countries) |
| Ola | 32 | 25 | India only |
| Rapido | 32 | 26 | India only (100+ cities) |
| Yandex Go | 30 | 19 | Wikipedia (Russia/CIS, Serbia) |
| Yango | 29 | 15 | Wikipedia (Africa, Gulf, LatAm, Nordics) |
| Grab | 29 | 20 | Grab country locations pages (blocked to crawl, so only country-level confirmation) |
| 99 (DiDi Brazil) | 28 | 24 | About 500 Brazilian cities |
| Cabify | 26 | 0 | Official Cabify help-centre city list |
| Careem (Uber-owned) | 22 | 12 | bento.travel and Wikipedia |
| Heetch | 18 | 3 | Official Heetch support city list |
| Lyft (Canada) | 14 | 4 | Lyft Québec launch blog |
| Gojek | 10 | 8 | Indonesia and Singapore only |
| Kakao T (Korea leader) | 9 | 0 | Secondary source (TechCrunch, antitrust coverage) |
| GO (Japan taxi app) | 10 | 10 | Secondary source only |
| Pathao | 7 | 1 | Wikipedia (Bangladesh, Nepal) |
| Snapp (Iran, ~85% share) | 6 | 5 | Wikipedia |
| Xanh SM / Be (Vietnam) | 5 / 5 | 3 / 4 | Q2-2025 market-share report |
| Gett (Israel) | 3 | 2 | Globes |
| PickMe (Sri Lanka) | 2 | 1 | PickMe investor site |

## Countries covered (120)
- **Uber's official country list:** all 73 non-US countries are covered.
- **Major non-Uber markets:** China, Russia, Belarus, Kazakhstan, Uzbekistan, Kyrgyzstan, Tajikistan, Armenia, Georgia, Azerbaijan, Moldova, Serbia, Bulgaria, Latvia, Cyprus, Indonesia, Malaysia, Singapore, Philippines, Thailand, Vietnam, Cambodia, Myanmar, Laos, Pakistan, Iran, Iraq, Israel, Morocco, Algeria, Tunisia, Côte d'Ivoire, Senegal, Mali, Cameroon, DRC, Angola, Ethiopia, Tanzania, Zambia, Zimbabwe, Mozambique, Namibia, Botswana, Madagascar, Nicaragua, Oman.

## Notable exits and ownership changes
- **Uber** sold out of **China** to DiDi (2016), **Russia/CIS** to Yandex (2017 JV, stake later sold), and **Southeast Asia** to Grab (2018). It shut **Pakistan** in 2022; Careem remained until it too exited ride-hailing there in July 2025. Uber is **not** on its official list for Morocco, Israel, Kazakhstan, Cyprus, Bulgaria, Serbia or Pakistan. Uber **launched in Nepal** (Kathmandu) in June 2026.
- **Careem**: Uber acquired it in 2020, and the ride-hailing business is wholly Uber-owned (e& holds a majority of the Super App). It exited **Qatar** (Feb 2023) and **Pakistan ride-hailing** (July 2025).
- **FREENOW**: acquired by **Lyft** in July 2025. It left Portugal, Romania and Sweden in 2022.
- **Ola**: shut its **UK, Australia and NZ** operations in April 2024, so it is India-only.
- **Gojek**: exited **Vietnam** (Sept 2024) and sold Thailand earlier. A **Grab–GoTo** deal was still uncompleted as of Jan 2026 reporting, and I could not verify its status as of Oct 2026.
- **Yandex Go**: banned or exited in **Estonia** (2022) and **Latvia** (2022). **Yango** exited **Israel** (2024–25), and Yango was suspended in **Benin** (Dec 2024).
- **Cabify**: historically left Mexico, Brazil and Ecuador. Its current list is AR, CL, CO, ES, PE, UY.
- **DiDi**: a 2026 travel guide lists 8 Latin American countries and does **not** include Peru or Argentina. Both are flagged unverified.

## Unverified and low-confidence items
- **Low confidence (12 entries):** Managua (inDrive), Bursa, Antalya (inDrive), Muscat (OTaxi), Basra, Fes, Tangier, Oran, Bamako (Heetch, country only), Gaborone, Antananarivo, Vientiane. These are mostly cities where only a country-level inDrive or Heetch listing exists.
- **Uber secondary cities** in countries whose per-country page I couldn't fetch (FR, PL, CZ, RO, UA, IT, CH, NL, Nordics and others) are flagged `uber` in `unverifiedPlatforms`.
- **Uber city pages that cut off mid-list:**
  - Mexico: SLP, Chihuahua, Hermosillo, Saltillo, Mexicali, Culiacán, Morelia, Torreón are medium.
  - Brazil: Maceió, Natal, Teresina, Campo Grande, João Pessoa, Uberlândia, Vitória are medium.
  - Germany: Leipzig, Bremen, Dresden, Nuremberg are unverified for Uber.
  - India: the list stops at "K". Lucknow, Nagpur, Surat, Patna, Kochi and others are medium.
- **Russia:** cities other than Moscow and St Petersburg are medium (Yandex Go is near-universal there, but the source names only those two).
- **Indonesia, Philippines, Vietnam, Malaysia:** Grab/Gojek flags for secondary cities are medium because grab.com blocks crawling.
- **Not modelled:** local leaders such as BiTaksi/iTaksi (Turkey), itTaxi (Italy), Maxim (Russia/SEA), Bykea (Pakistan), Yassir (Algeria), LINE MAN (Thailand), JoyRide (Philippines), Little (Kenya). Add them if the app needs them.
- **Blocked URLs** (could not be fetched): uber.com/global/en/cities/ (the uber.com/cities mirror was used instead), most uber.com per-country pages not listed above, grab.com/*/locations (robots), and the full indrive.com/cities list.

## Workable area (preferred-area counties + Intercity)
Uber and Lyft don't publish which counties each market's preferred areas cover, so a market radius alone over-reaches (Baltimore's radius touches Cecil County, York PA and Wilmington DE). Each driver now confirms their own area:

- **Onboarding and Profile › Workable area** lists the counties around the chosen market, grouped by state (US Census shapes in `dist/regions/counties-XX.json`, built by `npm run build:counties`).
- **Uber screenshot:** "Read my preferred-areas screenshot" sends the image of *Uber Driver › Preferences › Preferred areas* to the Home Base AI, which lists the checked area names; they're matched to counties ("Bel Air – Harford County" → Harford; "Baltimore" → Baltimore City and County). This needs sign-in. Without it, drivers can type the names or tick the boxes.
- **Intercity off:** events, heat and route stops must fall inside the chosen counties.
- **Intercity on:** the rest of the market, plus the intercity neighbour markets in `config/market-areas.json`, also count. For Baltimore that's Washington DC (DC, Montgomery, Prince George's and Northern Virginia). PA and DE still never count.
- **Defaults:** `config/market-areas.json` holds known areas. Baltimore's 11 counties come from the owner's screenshot (Washington, Frederick, Carroll, Baltimore County and City, Harford, Howard, Anne Arundel, Calvert, Charles, St. Mary's). County edges were read off the map, so drivers should confirm them. Other US markets default to home-state counties inside the working radius until the driver confirms.
- **Saved:** on the device only, under `homeBaseWorkArea`. If there's no saved area for the current market, the app falls back to the market rule.
