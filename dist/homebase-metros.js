(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeBaseMetros = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Offline staging anchors for the metros the launch screen already offers as a
  // home market. Without these, a driver outside Baltimore who opens the app
  // while the OpenStreetMap Overpass mirrors are unreachable gets an empty
  // route: loadVenues returns {elements:[]} rather than throwing, the hosted
  // snapshot carries nothing for their area, and a first run has no cached
  // places yet. These are well-known district, terminal and venue centres, kept
  // coarse on purpose — they are staging areas to head toward, not mapped venue
  // records, and they never carry event times, pay or surge.
  //
  // Baltimore is deliberately absent: it keeps its own richer neighborhood set
  // and its bundled Census boundaries, and is matched before this module runs.
  const METROS = [
    {
      name: 'Miami',
      aliases: ['miami', 'miami beach', 'miami-dade', 'hialeah', 'coral gables', 'fort lauderdale', 'hollywood'],
      center: [25.7743, -80.1937],
      radiusKm: 60,
      anchors: [
        ['Downtown Miami', 'attraction', 25.7743, -80.1937],
        ['Brickell', 'nightlife', 25.7601, -80.1951],
        ['South Beach', 'nightlife', 25.7826, -80.1341],
        ['Wynwood', 'nightlife', 25.8010, -80.1990],
        ['Miami International Airport', 'transit', 25.7959, -80.2870],
        ['PortMiami', 'transit', 25.7743, -80.1680],
        ['Coconut Grove', 'restaurant', 25.7289, -80.2434],
        ['Coral Gables', 'shopping', 25.7215, -80.2684],
        ['Kaseya Center', 'event', 25.7814, -80.1870],
        ['Hard Rock Stadium', 'event', 25.9580, -80.2389],
        ['Dolphin Mall', 'shopping', 25.7853, -80.3831],
        ['Fort Lauderdale Airport', 'transit', 26.0742, -80.1506]
      ]
    },
    {
      name: 'New York',
      aliases: ['new york', 'new york city', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'newark', 'jersey city'],
      center: [40.7128, -74.0060],
      radiusKm: 50,
      anchors: [
        ['Times Square', 'attraction', 40.7580, -73.9855],
        ['Penn Station', 'transit', 40.7506, -73.9935],
        ['Grand Central', 'transit', 40.7527, -73.9772],
        ['Lower East Side', 'nightlife', 40.7185, -73.9865],
        ['Williamsburg', 'nightlife', 40.7081, -73.9571],
        ['Downtown Brooklyn', 'shopping', 40.6928, -73.9903],
        ['Long Island City', 'neighborhood', 40.7447, -73.9485],
        ['JFK Airport', 'transit', 40.6413, -73.7781],
        ['LaGuardia Airport', 'transit', 40.7769, -73.8740],
        ['Newark Airport', 'transit', 40.6895, -74.1745],
        ['Barclays Center', 'event', 40.6826, -73.9754]
      ]
    },
    {
      name: 'Chicago',
      aliases: ['chicago', 'cook county', 'evanston', 'oak park'],
      center: [41.8827, -87.6279],
      radiusKm: 50,
      anchors: [
        ['The Loop', 'attraction', 41.8827, -87.6279],
        ['River North', 'nightlife', 41.8925, -87.6340],
        ['Wicker Park', 'nightlife', 41.9088, -87.6796],
        ['Navy Pier', 'attraction', 41.8917, -87.6086],
        ['Hyde Park', 'university', 41.7943, -87.5907],
        ["O'Hare Airport", 'transit', 41.9742, -87.9073],
        ['Midway Airport', 'transit', 41.7868, -87.7522],
        ['Wrigley Field', 'event', 41.9484, -87.6553],
        ['United Center', 'event', 41.8807, -87.6742],
        ['Soldier Field', 'event', 41.8623, -87.6167]
      ]
    },
    {
      name: 'Los Angeles',
      aliases: ['los angeles', 'la', 'hollywood', 'santa monica', 'long beach', 'pasadena', 'inglewood', 'burbank'],
      center: [34.0407, -118.2468],
      radiusKm: 70,
      anchors: [
        ['Downtown Los Angeles', 'attraction', 34.0407, -118.2468],
        ['Hollywood', 'nightlife', 34.0928, -118.3287],
        ['Koreatown', 'restaurant', 34.0580, -118.3000],
        ['Santa Monica', 'shopping', 34.0195, -118.4912],
        ['Venice', 'nightlife', 33.9850, -118.4695],
        ['Pasadena', 'shopping', 34.1478, -118.1445],
        ['Long Beach', 'neighborhood', 33.7701, -118.1937],
        ['LAX Airport', 'transit', 33.9416, -118.4085],
        ['Burbank Airport', 'transit', 34.2007, -118.3590],
        ['Crypto.com Arena', 'event', 34.0430, -118.2673],
        ['SoFi Stadium', 'event', 33.9535, -118.3392]
      ]
    },
    {
      name: 'Atlanta',
      aliases: ['atlanta', 'fulton county', 'decatur', 'buckhead', 'sandy springs'],
      center: [33.7550, -84.3900],
      radiusKm: 50,
      anchors: [
        ['Downtown Atlanta', 'attraction', 33.7550, -84.3900],
        ['Midtown', 'nightlife', 33.7838, -84.3836],
        ['Buckhead', 'nightlife', 33.8484, -84.3733],
        ['Ponce City Market', 'restaurant', 33.7723, -84.3652],
        ['Georgia Tech', 'university', 33.7756, -84.3963],
        ['Decatur', 'neighborhood', 33.7748, -84.2963],
        ['Hartsfield-Jackson Airport', 'transit', 33.6407, -84.4277],
        ['Mercedes-Benz Stadium', 'event', 33.7554, -84.4008],
        ['State Farm Arena', 'event', 33.7573, -84.3963],
        ['Truist Park', 'event', 33.8907, -84.4677]
      ]
    },
    {
      name: 'Philadelphia',
      aliases: ['philadelphia', 'philly', 'camden'],
      center: [39.9526, -75.1652],
      radiusKm: 45,
      anchors: [
        ['Center City', 'attraction', 39.9526, -75.1652],
        ['Old City', 'nightlife', 39.9496, -75.1437],
        ['Fishtown', 'nightlife', 39.9700, -75.1300],
        ['Northern Liberties', 'restaurant', 39.9640, -75.1410],
        ['University City', 'university', 39.9522, -75.1932],
        ['30th Street Station', 'transit', 39.9556, -75.1819],
        ['Manayunk', 'neighborhood', 40.0243, -75.2237],
        ['Philadelphia Airport', 'transit', 39.8744, -75.2424],
        ['South Philadelphia sports complex', 'event', 39.9012, -75.1720]
      ]
    },
    {
      name: 'Washington, DC',
      aliases: ['washington', 'washington, dc', 'district of columbia', 'arlington', 'alexandria', 'bethesda'],
      center: [38.8977, -77.0232],
      radiusKm: 45,
      anchors: [
        ['Penn Quarter', 'attraction', 38.8977, -77.0232],
        ['U Street', 'nightlife', 38.9169, -77.0282],
        ['Adams Morgan', 'nightlife', 38.9220, -77.0420],
        ['Georgetown', 'shopping', 38.9097, -77.0654],
        ['Union Station', 'transit', 38.8977, -77.0063],
        ['Rosslyn', 'neighborhood', 38.8955, -77.0710],
        ['Reagan National Airport', 'transit', 38.8512, -77.0402],
        ['Dulles Airport', 'transit', 38.9531, -77.4565],
        ['Capital One Arena', 'event', 38.8981, -77.0209],
        ['Nationals Park', 'event', 38.8730, -77.0074]
      ]
    },
    {
      // Carried over unchanged from the inline London set these anchors replace.
      name: 'London',
      aliases: ['london', 'greater london', 'city of london', 'westminster'],
      center: [51.5074, -0.1278],
      radiusKm: 40,
      anchors: [
        ['Westminster & Victoria', 'transit', 51.4988, -0.1347],
        ['West End theatres', 'event', 51.5115, -0.1281],
        ['Soho nightlife', 'nightlife', 51.5136, -0.1365],
        ['King’s Cross St Pancras', 'transit', 51.5308, -0.1238],
        ['Shoreditch', 'nightlife', 51.5245, -0.0773],
        ['The O2', 'event', 51.5030, -0.0032],
        ['Canary Wharf', 'transit', 51.5054, -0.0235],
        ['Heathrow staging', 'transit', 51.4700, -0.4543]
      ]
    }
  ];

  const EARTH_KM = 6371;
  const toRad = degrees => degrees * Math.PI / 180;

  function distanceKm(aLat, aLon, bLat, bLon) {
    const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Position decides the metro: a stale or mistyped market name must never
  // place a driver in a city they are not standing in. The name is only a
  // tiebreaker when two metros are both in range.
  function metroFor(lat, lon, market) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const label = String(market || '').trim().toLowerCase();
    const inRange = METROS
      .map(metro => ({ metro, km: distanceKm(lat, lon, metro.center[0], metro.center[1]) }))
      .filter(entry => entry.km <= entry.metro.radiusKm)
      .sort((a, b) => a.km - b.km);
    if (!inRange.length) return null;
    const named = label && inRange.find(entry =>
      entry.metro.name.toLowerCase() === label || entry.metro.aliases.includes(label));
    return (named || inRange[0]).metro;
  }

  function anchorsFor(lat, lon, market) {
    const metro = metroFor(lat, lon, market);
    if (!metro) return [];
    return metro.anchors.map(([name, cat, anchorLat, anchorLon]) =>
      ({ name, cat, lat: anchorLat, lon: anchorLon, metro: metro.name }));
  }

  return { METROS, metroFor, anchorsFor, distanceKm };
});
