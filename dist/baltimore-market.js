(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeBaseMarket = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Baltimore City plus the useful Baltimore, Anne Arundel, Howard, Harford
  // and Carroll operating area. The southwest edge turns north/east before
  // Bowie, Laurel and Aspen Hill so Washington-market places cannot become
  // Baltimore heat sources or route suggestions.
  const BALTIMORE_MARKET_RING = [
    [-76.65, 38.94], [-76.36, 38.94], [-76.18, 39.08],
    [-76.12, 39.40], [-76.30, 39.70], [-76.80, 39.76],
    [-77.20, 39.70], [-77.24, 39.32], [-77.03, 39.16],
    [-76.90, 39.15], [-76.78, 39.13], [-76.72, 39.14],
    [-76.65, 39.10], [-76.65, 38.94]
  ];

  function pointInRing(lon, lat, ring = BALTIMORE_MARKET_RING) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > lat) !== (b[1] > lat) &&
          lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1] || 1e-12) + a[0]) inside = !inside;
    }
    return inside;
  }

  function isBaltimorePoint(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && pointInRing(lon, lat);
  }

  return { BALTIMORE_MARKET_RING, pointInRing, isBaltimorePoint };
});
