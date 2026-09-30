import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const areas = JSON.parse(await readFile(new URL('../dist/baltimore-demand-areas.geojson', import.meta.url), 'utf8'));
const indexHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const heatRenderer = await readFile(new URL('../dist/homebase-heat.js', import.meta.url), 'utf8');
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1] || 1e-12) + a[0]) inside = !inside;
  }
  return inside;
}
function contains(feature, lat, lon) {
  const geometry = feature.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(lon, lat, rings[0]) && !rings.slice(1).some(ring => inRing(lon, lat, ring)));
}

test('bundled map coverage contains the city neighborhoods and five surrounding counties', () => {
  assert.equal(areas.type, 'FeatureCollection');
  assert.ok(areas.features.filter(item => item.properties.areaType === 'neighborhood').length >= 50);
  const zoomedNeighborhoods = areas.features.filter(item => item.properties.areaType === 'label');
  assert.ok(zoomedNeighborhoods.length >= 250, 'detailed neighborhood labels appear at close zoom');
  assert.ok(zoomedNeighborhoods.some(item => item.properties.areaName === 'The Orchards'));
  const countyNames = areas.features.filter(item => item.properties.areaType === 'county').map(item => item.properties.areaName);
  for (const county of ['Baltimore County', 'Anne Arundel County', 'Howard County', 'Harford County', 'Carroll County']) assert.ok(countyNames.includes(county), county);
});

test('geographic anchors stay in Baltimore metro and exclude Washington and Virginia', () => {
  const containingArea = (lat, lon) => areas.features.find(feature => contains(feature, lat, lon));
  assert.ok(containingArea(39.278, -76.6227), 'M&T Bank Stadium is in Baltimore City coverage');
  assert.ok(containingArea(39.4015, -76.6019), 'Towson is in Baltimore County coverage');
  assert.ok(containingArea(38.98, -76.49), 'Annapolis is in Anne Arundel County coverage');
  assert.equal(containingArea(38.9072, -77.0369), undefined, 'Washington, DC is a separate market');
  assert.equal(containingArea(38.8048, -77.0469), undefined, 'Alexandria, Virginia is a separate market');
});

test('demand rendering uses one map-anchored geographic surface at every zoom', () => {
  assert.match(indexHtml, /areaType==='label'.+areaType==='neighborhood'.+areaType==='county'/s);
  assert.match(indexHtml, /heatLayer\.setData\(demandAreas,selectedForecastTime,demandWeight,demandAreaSources\)/);
  assert.match(indexHtml, /createAreaCoverageSources/);
  assert.match(indexHtml, /areaCoverageAnchor:true/);
  assert.match(heatRenderer, /source\.tags\.areaCoverageAnchor/);
  assert.doesNotMatch(heatRenderer, /map\.getZoom\(\) >= 12\) this\._drawAreaSurface/);
  assert.match(heatRenderer, /source\.heatAreaType !== 'neighborhood'/);
});

test('each forecast hour has up to twelve destination options and custom event icons', () => {
  assert.match(indexHtml, /for\(let i=0;i<12;i\+\+\)/);
  assert.match(indexHtml, /if\(options\.length===12\)break/);
  assert.match(indexHtml, /hourlyDestinations\.push\(options\)/);
  assert.match(indexHtml, /renderTimeButtons\(stops,hourlyDestinations\)/);
  assert.match(indexHtml, /function eventIconSvg\(event\)/);
  assert.match(indexHtml, /function eventPopupContent\(event\)/);
  assert.match(indexHtml, /event-icon-key" id="eventIconKey"/);
  assert.match(heatRenderer, /HEAT_OPACITY_GAIN = 1\.05/);
  assert.match(heatRenderer, /function anchoredGridOrigin/);
});

test('hourly destination markers are on the selected route and open an information card', () => {
  assert.match(indexHtml, /function traceDestinationRoute\(options\)/);
  assert.match(indexHtml, /traceDestinationRoute\(destinations\)/);
  assert.match(indexHtml, /marker\.openPopup\(\)/);
  assert.match(indexHtml, /class="event-popup"/);
  assert.match(indexHtml, /bottomSheet'\)\.classList\.remove\('collapsed'\)/);
});

test('passenger destinations aggregate restaurant activity into busy-time districts', () => {
  assert.match(indexHtml, /function restaurantDistrictCandidates/);
  assert.match(indexHtml, /cat:'restaurant_district'/);
  assert.match(indexHtml, /v\.cat!=='restaurant'/);
  assert.match(indexHtml, /hour>=11&&hour<14\|\|hour>=17&&hour<22/);
  assert.match(indexHtml, /ARTS:'🎨'.+MUSIC:'🎵'.+THEATER:'🎭'.+NIGHTLIFE:'🍸'.+FESTIVAL:'🎉'/s);
});

test('K–12 pickup and university demand use different timing models', () => {
  assert.match(indexHtml, /amenity==='school'.+return'k12'/s);
  assert.match(indexHtml, /amenity==='college'.+return'university'/s);
  assert.match(indexHtml, /\['Morgan State University','university'/);
  assert.match(indexHtml, /\['Johns Hopkins University','university'/);
  assert.match(indexHtml, /\['Baltimore City College','k12'/);
  assert.match(indexHtml, /\['Dulaney High School','k12'/);
  assert.match(indexHtml, /\['Towson High School','k12'/);
  assert.match(indexHtml, /\['Phoenix','neighborhood'/);
  assert.match(indexHtml, /weekday&&h>=13&&h<19\?7/);
  assert.match(indexHtml, /K–12 pickup and dismissal window/);
  assert.match(indexHtml, /All-day campus activity/);
  assert.match(indexHtml, /h>=15\.75&&h<16\.5/);
  assert.match(indexHtml, /h>=16\.5&&h<17/);
  assert.match(indexHtml, /h>=15\.5&&h<20/);
});

test('stadium heat and route stops require a dated verified event', () => {
  assert.match(indexHtml, /source\.cat==='event'&&!source\.eventStart/);
  assert.match(indexHtml, /v\.cat!=='event'\|\|v\.eventStart/);
  assert.match(indexHtml, /heatOnly:source\.cat==='event'/);
  assert.match(indexHtml, /function eventScale/);
  assert.match(indexHtml, /function rainDemandBoost/);
});
