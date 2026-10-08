(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeBaseHeat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PALETTES = {
    classic: [[0,[10,66,92]],[.12,[16,158,120]],[.27,[62,196,73]],[.42,[255,220,42]],[.57,[255,146,31]],[.7,[247,52,49]],[.82,[235,38,128]],[.92,[190,39,214]],[1,[133,62,255]]],
    purple_blue_white: [[0,[67,29,126]],[.18,[104,56,196]],[.38,[70,91,225]],[.58,[31,146,255]],[.76,[112,205,255]],[.9,[205,239,255]],[1,[255,255,255]]],
    ocean: [[0,[5,42,92]],[.2,[8,88,165]],[.42,[0,157,210]],[.64,[39,211,224]],[.82,[126,242,231]],[1,[225,255,250]]],
    sunset: [[0,[255,220,74]],[.2,[255,170,50]],[.42,[255,105,54]],[.64,[238,61,126]],[.82,[189,57,190]],[1,[111,55,212]]],
    ember: [[0,[74,47,111]],[.16,[111,49,156]],[.32,[174,54,139]],[.48,[224,73,94]],[.64,[246,123,55]],[.8,[250,181,48]],[1,[255,230,112]]],
    mint: [[0,[8,72,83]],[.2,[7,125,126]],[.42,[17,173,139]],[.64,[76,213,133]],[.82,[164,240,142]],[1,[235,255,213]]],
    ice: [[0,[16,35,74]],[.2,[24,74,142]],[.42,[45,126,210]],[.64,[101,185,240]],[.82,[183,229,255]],[1,[255,255,255]]],
    aurora: [[0,[53,36,92]],[.25,[54,72,136]],[.5,[22,140,145]],[.75,[95,220,185]],[1,[181,255,225]]],
    violet_rose: [[0,[56,35,89]],[.25,[108,53,139]],[.5,[188,85,159]],[.75,[242,168,211]],[1,[255,240,247]]],
    blue_gold: [[0,[21,57,101]],[.25,[32,97,159]],[.5,[48,153,203]],[.75,[170,212,188]],[1,[255,240,166]]],
    coral_sand: [[0,[82,45,77]],[.25,[153,68,94]],[.5,[231,123,102]],[.75,[249,186,139]],[1,[255,240,196]]],
    teal_lime: [[0,[7,78,89]],[.25,[13,128,123]],[.5,[42,184,146]],[.75,[151,223,121]],[1,[237,255,168]]],
    royal_ice: [[0,[39,43,115]],[.25,[78,84,175]],[.5,[141,147,230]],[.75,[197,211,248]],[1,[248,250,255]]],
    custom: [[0,[104,56,196]],[.5,[31,146,255]],[1,[255,255,255]]],
    monochrome: [[0,[43,54,63]],[.2,[70,84,94]],[.42,[107,122,132]],[.64,[151,166,176]],[.82,[205,216,223]],[1,[255,255,255]]]
  };
  let activePalette = 'classic';
  const RADII_KM = {
    school: 1.45, k12: 1.45, university: 1.8, transit: 2.1, event: 1.7, nightlife: 1.2,
    restaurant: 1.15, hotel: 1.5, attraction: 1.6,
    medical: 1.55, neighborhood: 1.65, shopping: 1.8, warehouse: 1.3
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const HEAT_OPACITY_GAIN = 1.2;
  function anchoredGridOrigin(position, geographicAnchor, step) {
    return geographicAnchor + Math.floor((position - geographicAnchor) / step) * step;
  }

  function setPalette(name) {
    if (!Object.prototype.hasOwnProperty.call(PALETTES, name)) return activePalette;
    activePalette = name;
    return activePalette;
  }

  function getCustomColors() {
    return PALETTES.custom.map(stop => '#' + stop[1].map(channel => channel.toString(16).padStart(2, '0')).join(''));
  }

  function setCustomColors(colors) {
    if (!Array.isArray(colors) || colors.length !== 3 ||
        !colors.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) return null;
    PALETTES.custom = colors.map((color, index) => [index / 2, [1,3,5].map(offset => parseInt(color.slice(offset, offset + 2), 16))]);
    return getCustomColors();
  }

  function colorAt(level) {
    const value = clamp(Number(level) || 0, 0, 1);
    const STOPS = PALETTES[activePalette];
    let low = STOPS[0], high = STOPS[STOPS.length - 1];
    for (let i = 1; i < STOPS.length; i++) {
      if (value <= STOPS[i][0]) { low = STOPS[i - 1]; high = STOPS[i]; break; }
    }
    const t = (value - low[0]) / (high[0] - low[0] || 1);
    const eased = t * t * (3 - 2 * t);
    return low[1].map((channel, i) => Math.round(channel + (high[1][i] - channel) * eased));
  }

  function historicalPriorForSource(source,when,historyApi){
    // Baltimore references must never paint another city's similarly named areas.
    if(!historyApi||source.lat<38.8||source.lat>39.75||source.lon< -77.3||source.lon> -75.9)return 0;
    return Math.max(...[source.heatAreaName,source.name].filter(Boolean).map(name=>historyApi.forecastFor(name,when,true).strength),0);
  }
  function currentEvidence(source, when, now = Date.now()) {
    const tags=source.tags||{},time=+new Date(when);
    if(tags.historicalPrior)return 'history';
    const sampled=Date.parse(tags.providerSampledAt||'');
    if(tags.providerSignal&&Number.isFinite(sampled)&&now>=sampled&&now-sampled<=25*60000&&Math.abs(time-sampled)<=25*60000&&Number.isFinite(Number(tags.uberSurgeMultiplier)))return Number(tags.uberSurgeMultiplier)>1?'surge':'current';
    const fetchedActivity=Date.parse(tags.sourceFetchedAt||''),flightHour=Date.parse(tags.flightHour||'');
    if(tags.airportActivity&&Number.isFinite(fetchedActivity)&&now>=fetchedActivity&&now-fetchedActivity<=25*60000&&time>=flightHour&&time<flightHour+3600000&&Number(tags.arrivals)>0)return 'activity';
    const start=+new Date(source.eventStart||NaN),end=+new Date(source.eventEnd||NaN);
    if((tags.providerEvent||tags.liveEvent||tags.publicCalendar||source.verifiedEvent===true)&&Number.isFinite(start)&&!source.allDay&&!source.virtual&&!source.private&&!tags.allDay&&!tags.virtual&&!tags.private&&!/cancel|postpon|completed|post$/i.test(source.eventState||source.status||'')){
      const fetched=Date.parse(source.fetchedAt||tags.sourceFetchedAt||tags.fetchedAt||'');
      if(Number.isFinite(fetched)&&(now-fetched>24*3600000||fetched>now+5*60000))return 'modeled';
      if(time>=start-60*60000&&time<=start||Number.isFinite(end)&&end>start&&!source.eventEndEstimated&&time>=end&&time<end+60*60000)return 'event';
    }
    return 'modeled';
  }
  function evidenceLevel(value, weightedShade, evidence = {}) {
    const raw=compositeLevel(value,weightedShade);
    // Confirmed scheduled activity is demand context, not platform price surge.
    const event=clamp(Number(evidence.event)||0,0,1),surge=clamp(Number(evidence.surge)||0,0,1);
    return Math.max(Math.min(raw,.57),Math.min(raw,.78)*event,surge>0?Math.max(.82,surge):0);
  }
  function evidenceOpacity(value,evidence = {}) {
    return Math.min(compositeOpacity(value),evidence.surge>0||evidence.event>0?.8:.38);
  }
  function composePixel(value,weightedShade,evidence={},history=0){
    // Fresh evidence wins even when it reports no surge. Background history is
    // a small separate prior and cannot increase current event/provider heat.
    const prior=evidence.current>.12?0:clamp(Number(history)||0,0,.08);
    if(value<.018)return {level:.32,opacity:prior>.006?Math.min(.14,compositeOpacity(prior)):0};
    return {level:Math.min(evidenceLevel(value,weightedShade,evidence)+(prior>0?.04:0),evidence.surge>0?1:evidence.event>0?.78:.57),opacity:Math.min(evidenceOpacity(value,evidence)+(prior>0?.035:0),evidence.current>.12?.8:.38)};
  }
  function sourceStrength(source, when, scoreSource) {
    if(source.tags?.historicalPrior)return clamp(Number(source.tags.historicalPrior),0,.08);
    const weight = Number(scoreSource(source, when));
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    let strength = weight / 10;
    const tags = source.tags || {};
    if((tags.providerSignal||source.eventStart)&&currentEvidence(source,when)==='modeled')return 0;
    // Public points describe activity density, not verified ride requests. They
    // become useful when several nearby places overlap, without turning every
    // restaurant or school into a red hotspot by itself.
    if (tags.publicVenue) {
      const foodAmenity = String(tags.amenity || '').toLowerCase();
      const category = String(source.cat || '').toLowerCase();
      // Keep individual restaurants and cafes as faint context for passenger
      // rides, while letting nightlife, transit, universities and verified
      // events create visible demand fields. Fast food stays excluded upstream.
      const venueScale = {
        restaurant: .14, cafe: .14, nightlife: 1.28, event: 1.38,
        transit: .9, university: .72, shopping: .38, hotel: .36,
        medical: .3, school: .36, k12: .3, neighborhood: .48
      };
      strength *= venueScale[category] ?? (tags.place ? .28 : foodAmenity === 'fast_food' ? 0 : .24);
    }
    // Census-weighted neighborhood anchors supply a visible low-to-moderate base;
    // timed events, nightlife and other local signals create the stronger peaks.
    if (tags.areaCoverageAnchor) strength *= .42;
    if (tags.metroBaseline || tags.forecast) strength *= .85;
    return clamp(strength, 0, 1.25);
  }

  function composeFields(signal,signalShade,background,backgroundShade,evidence={},history=0){
    // Background density cannot accumulate into a city-wide surge. Fresh
    // signals replace context inside their own geographically anchored field.
    const prior=evidence.current>.12?0:Math.max(0,Number(background)||0);
    if(!signal&&!(evidence.event>0||evidence.surge>0)){
      if(evidence.current>.12)return {level:0,opacity:0};
      // Retain local differences instead of clipping every busy POI to the
      // same yellow. Background context runs from faint green to soft yellow.
      const activity=prior/(prior+.18),shade=prior>0?clamp(backgroundShade/prior,0,1):0;
      return {level:.14+.28*activity+.02*shade,opacity:Math.min(.34,activity*.34+clamp(history,0,.08))};
    }
    const capped=Math.min(prior,.1),ratio=prior>0?capped/prior:0;
    const pixel=composePixel(signal+capped,signalShade+backgroundShade*ratio,evidence,history);
    if(!(evidence.event>0||evidence.surge>0)){pixel.opacity=Math.min(pixel.opacity,.18);pixel.level=Math.min(pixel.level,.45);}
    return pixel;
  }

  function areaIntensity(weightedValue) {
    return 1 - Math.exp(-Math.max(0, weightedValue) * 2.05);
  }

  function sourceShade(strength) {
    return clamp(areaIntensity((Number(strength) || 0) * .82), .035, 1);
  }

  function compositeLevel(value, weightedShade) {
    const amount = Math.max(0, Number(value) || 0);
    if (!amount) return 0;
    const localShade = (Number(weightedShade) || 0) / Math.max(amount, .0001);
    // Blend signal strength with nearby source density. The center of a
    // strong area reaches orange/red, while its fading edge naturally moves
    // through yellow and green instead of keeping one purple hue in a blob.
    const signalQuality = clamp((localShade - .025) / .58, 0, 1);
    const localActivity = 1 - Math.exp(-amount * 5.25);
    const intensity = clamp(localActivity * .72 + signalQuality * .28, 0, 1);
    return clamp(Math.pow(intensity, .78), .025, 1);
  }

  function compositeOpacity(value) {
    // Keep locally scored demand legible above the dark basemap. Opacity still
    // falls to zero with the measured field, so this does not manufacture a
    // surrounding low-demand ring.
    return clamp(areaIntensity(Math.max(0, Number(value) || 0)) * 1.42 * HEAT_OPACITY_GAIN, 0, .84);
  }

  function sourceRadiusKm(category) {
    return RADII_KM[String(category || '').toLowerCase()] || 1.5;
  }

  function sourceInfluenceLimitKm(source){return ['school','k12'].includes(source.cat)&&!source.eventStart? .4:Infinity;}

  function sourceFootprintKm(source) {
    const tags = source.tags || {};
    if(['school','k12'].includes(source.cat)&&!source.eventStart)return .25;
    if (tags.providerSignal) return 1.35;
    if (tags.metroBaseline) {
      // Community anchors represent an area, not a single address. Wider,
      // category-specific footprints connect county demand without turning it
      // into one city-centered oval.
      const metro = { neighborhood: 1.25, shopping: 1.15, transit: 1.25, restaurant: .8, university: 1.05, k12: .8, event: 1.35, hotel: .9, medical: .85 };
      return metro[source.cat] || .9;
    }
    if (tags.publicVenue) return source.cat === 'neighborhood' ? 1.0 : sourceRadiusKm(source.cat) * .62;
    if (source.cat === 'event') return 1.35;
    return sourceRadiusKm(source.cat);
  }

  function stableAngle(source, index) {
    const value = `${source.name || ''}:${source.cat || ''}:${index}`;
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295 * Math.PI;
  }

  function createLayer(L) {
    if (!L || !L.Layer || typeof L.Layer.extend !== 'function') throw new Error('Leaflet must load before the Home Base heat layer.');
    const HeatLayer = L.Layer.extend({
      initialize() { this._areas = []; this._sources = []; this._when = new Date(); this._scoreSource = () => 0; this._frame = 0; },
      onAdd(map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'homebase-demand-canvas');
        this._canvas.setAttribute('aria-hidden', 'true');
        this._canvas.style.cssText = 'position:absolute;pointer-events:none;image-rendering:auto;opacity:1;visibility:visible;';
        map.getPane('heatPane').appendChild(this._canvas);
        map.on('moveend zoomend resize', this._schedule, this);
        this._schedule();
      },
      onRemove(map) {
        cancelAnimationFrame(this._frame);
        map.off('moveend zoomend resize', this._schedule, this);
        this._canvas.remove();
        this._canvas = null;
      },
      setData(areas, when, scoreSource, sources) {
        this._areas = Array.isArray(areas) ? areas : [];
        this._sources = Array.isArray(sources) ? sources : [];
        this._when = when || new Date();
        this._scoreSource = typeof scoreSource === 'function' ? scoreSource : () => 0;
        this._schedule();
        return this;
      },
      _schedule() {
        cancelAnimationFrame(this._frame);
        this._frame = requestAnimationFrame(() => this._draw());
      },
      _draw() {
        const map = this._map, canvas = this._canvas;
        if (!map || !canvas) return;
        const size = map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
        const origin = map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(canvas, origin);
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
        canvas.width = Math.max(1, Math.round(size.x * dpr));
        canvas.height = Math.max(1, Math.round(size.y * dpr));
        const output = canvas.getContext('2d', { alpha: true });
        output.setTransform(dpr, 0, 0, dpr, 0, 0);
        output.clearRect(0, 0, size.x, size.y);
        // Geographic boundaries are optional: other markets use real point sources.
        if (!this._areas.length && !this._sources.length) return;

        // Render a finer geographic field at neighborhood zooms so adjacent
        // demand surfaces melt together instead of reading as chunky tiles.
        const sample = map.getZoom() < 9 ? 2.25 : map.getZoom() < 11 ? 1.6 : 1.15;
        const seen = new Set(), sources = [];
        [...this._sources, ...this._areas.flatMap(area => area.sources || [])].forEach(source => {
          const key = `${Number(source.lat).toFixed(5)}:${Number(source.lon).toFixed(5)}:${source.name || ''}`;
          if (!seen.has(key)) { seen.add(key); sources.push(source); }
        });
        // Keep the metro-wide view as a continuous source field. Once the
        // driver zooms into Baltimore neighborhoods, restore the local
        // neighborhood demand surface from the sources assigned to each
        // geographic boundary, then layer source-level detail over it.
        const zoom = map.getZoom();
        const hasNeighborhoods = this._areas.some(area =>
          area.areaType === 'neighborhood' && area.feature && area.feature.geometry && (area.sources || []).length
        );
        if (zoom >= 9 && hasNeighborhoods) {
          // Keep each signal fixed to its real coordinate, but composite all
          // neighborhood contributions in one continuous field. This gives
          // the Uber-like layered transitions without circles, hard polygon
          // seams, or heat that drifts as the map is panned or zoomed.
          this._drawSources(output, map, sources, size, sample);
        } else {
          this._drawSources(output, map, sources, size, sample);
        }
      },
      _drawAreaSurface(output, map, areas, size, sample) {
        const active = (areas || []).filter(area =>
          area.areaType === 'neighborhood' &&
          area.feature && area.feature.geometry && (area.sources || []).length
        );
        if (!active.length) return false;

        // Paint local demand into small map-anchored cells, clipped to each
        // actual neighborhood boundary. Every cell scores only nearby sources,
        // so one busy venue cannot turn its entire neighborhood purple.
        const zoom = map.getZoom();
        const cell = clamp(Math.round(40 - zoom * 2), 9, 16);
        const prepared = active.map(area => {
          const sources = (area.sources || []).map((source, index) => {
            const strength = sourceStrength(source, this._when, this._scoreSource);
            const evidence=currentEvidence(source,this._when);
          if ((!strength&&evidence!=='current') || !Number.isFinite(source.lat) || !Number.isFinite(source.lon)) return null;
            const center = map.latLngToContainerPoint([source.lat, source.lon]);
            const km = sourceFootprintKm(source);
            const north = map.latLngToContainerPoint([source.lat + km / 111.32, source.lon]);
            const east = map.latLngToContainerPoint([
              source.lat,
              source.lon + km / (111.32 * Math.max(.2, Math.cos(source.lat * Math.PI / 180)))
            ]);
            return {
              center, strength,
              rx: Math.max(3, Math.abs(east.x - center.x) * (.72 + (index % 3) * .08)),
              ry: Math.max(3, Math.abs(north.y - center.y) * (.72 + ((index + 1) % 3) * .08)),
              shade: sourceShade(strength),
              opacity: source.tags && (source.tags.providerSignal || source.tags.providerEvent || source.tags.liveEvent) ? .9 : .78
            };
          }).filter(Boolean);
          return { area, sources };
        }).filter(entry => entry.sources.length);

        const tracePolygon = rings => {
          rings.forEach(ring => {
            ring.forEach((coordinate, index) => {
              const point = map.latLngToContainerPoint([coordinate[1], coordinate[0]]);
              if (index) output.lineTo(point.x, point.y); else output.moveTo(point.x, point.y);
            });
            output.closePath();
          });
        };

        prepared.forEach(({ area, sources }) => {
          const geometry = area.feature.geometry;
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
            geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
          polygons.forEach(rings => {
            if (!rings || !rings.length) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            rings[0].forEach(coordinate => {
              const point = map.latLngToContainerPoint([coordinate[1], coordinate[0]]);
              minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
            });
            minX = clamp(Math.floor(minX), 0, size.x); minY = clamp(Math.floor(minY), 0, size.y);
            maxX = clamp(Math.ceil(maxX), 0, size.x); maxY = clamp(Math.ceil(maxY), 0, size.y);
            if (maxX <= minX || maxY <= minY) return;

            output.save();
            output.beginPath();
            tracePolygon(rings);
            output.clip('evenodd');
            const geographicAnchor = map.latLngToContainerPoint([0, 0]);
            const gridLeft = anchoredGridOrigin(minX, geographicAnchor.x, cell);
            const gridTop = anchoredGridOrigin(minY, geographicAnchor.y, cell);
            for (let y = gridTop; y < maxY; y += cell) for (let x = gridLeft; x < maxX; x += cell) {
              const px = x + cell / 2, py = y + cell / 2;
              let amount = 0, weightedShade = 0;
              sources.forEach(source => {
                const dx = (px - source.center.x) / source.rx;
                const dy = (py - source.center.y) / source.ry;
                const distance = dx * dx + dy * dy;
                if (distance > 8) return;
                const profile = Math.exp(-distance * 1.05);
                const contribution = source.strength * profile * source.opacity;
                amount += contribution;
                weightedShade += contribution * source.shade;
              });
              if (amount < .012) continue;
              const level = compositeLevel(amount, weightedShade);
              const rgb = colorAt(level);
              const alpha = compositeOpacity(amount);
              if (alpha < .018) continue;
              output.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
              output.fillRect(x, y, cell + .35, cell + .35);
            }
            output.restore();
          });
        });

        // Fine boundary lines keep neighborhood edges readable beneath labels.
        output.save();
        output.lineWidth = .75;
        output.strokeStyle = 'rgba(174,220,255,.24)';
        output.beginPath();
        prepared.forEach(({ area }) => {
          const geometry = area.feature.geometry;
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] :
            geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
          polygons.forEach(rings => tracePolygon(rings));
        });
        output.stroke();
        output.restore();
        return true;
      },
      _drawSources(output, map, sourceData, size, sample) {
        if (!Array.isArray(sourceData) || !sourceData.length) return;
        const zoomFactor = 1;
        const historyApi=globalThis.HomeBaseDemandHistory;
        const history=historyApi?sourceData.filter(s=>!(s.tags&&(s.tags.providerSignal||s.tags.providerEvent||s.tags.liveEvent))).map(s=>{const strength=historicalPriorForSource(s,this._when,historyApi);return strength>0?{...s,eventStart:null,eventEnd:null,tags:{historicalPrior:strength}}:null;}).filter(Boolean):[];
        const sources = [...sourceData,...history].map((source, index) => {
          // Label/county anchors exist only to name areas. Neighborhood
          // coverage anchors remain fixed geographic sources at every zoom.
          if (source.tags && source.tags.areaCoverageAnchor) {
            if (source.heatAreaType !== 'neighborhood') return null;
          }
          const strength = sourceStrength(source, this._when, this._scoreSource);
          const evidence=currentEvidence(source,this._when);
          if ((!strength&&evidence!=='current') || !Number.isFinite(source.lat) || !Number.isFinite(source.lon)) return null;
          const center = map.latLngToContainerPoint([source.lat, source.lon]);
          const zoom = map.getZoom(), baseKm = sourceFootprintKm(source)*(evidence==='modeled'?.65:1), km = baseKm, north = map.latLngToContainerPoint([source.lat + km / 111.32, source.lon]);
          const radius = Math.max(1.25, Math.abs(center.y - north.y));
          const angle = stableAngle(source, index);
          let rx = radius * (.62 + (index % 5) * .055);
          let ry = radius * (.43 + ((index + 2) % 5) * .06);
          // Blend the organic point field with the footprint of the containing
          // neighborhood. This retains the useful neighborhood-block character
          // without restoring hard polygon edges or separate city/county maps.
          const bounds = source.heatAreaBounds;
          if (evidence!=='modeled'&&source.cat==='neighborhood'&&(source.heatAreaType === 'label' || source.heatAreaType === 'neighborhood') && Array.isArray(bounds) && bounds.length === 4) {
            const nw = map.latLngToContainerPoint([bounds[2], bounds[1]]);
            const se = map.latLngToContainerPoint([bounds[0], bounds[3]]);
            const areaRx = clamp(Math.abs(se.x - nw.x) * .28, radius * .55, radius * 2.35);
            const areaRy = clamp(Math.abs(se.y - nw.y) * .28, radius * .55, radius * 2.35);
            rx = rx * .58 + areaRx * .42;
            ry = ry * .58 + areaRy * .42;
          }
          return {
            center, strength, angle, rx, ry, influenceLimit:sourceInfluenceLimitKm(source)*radius/km, evidence:currentEvidence(source,this._when),
            blockShape: (source.heatAreaType === 'label' || source.heatAreaType === 'neighborhood') && Array.isArray(bounds),
            shade: sourceShade(strength),
            detailOpacity: source.tags && (source.tags.providerSignal || source.tags.providerEvent || source.tags.liveEvent) ? .76 :
              source.heatAreaType === 'label' ? .34 : source.heatAreaType === 'neighborhood' ? .78 : .68,
            skew: ((index % 7) - 3) * .045
          };
        }).filter(Boolean);
        if (!sources.length) return;

        // Paint from geographic source coordinates rather than clipping to a
        // neighborhood polygon. This keeps the local variation while allowing
        // adjacent neighborhoods to overlap and feather naturally at the edge.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        sources.forEach(source => {
          const spread = Math.max(source.rx, source.ry) * 3.35;
          minX = Math.min(minX, source.center.x - spread); minY = Math.min(minY, source.center.y - spread);
          maxX = Math.max(maxX, source.center.x + spread); maxY = Math.max(maxY, source.center.y + spread);
        });
        if (maxX < 0 || maxY < 0 || minX > size.x || minY > size.y) return;
        minX = clamp(minX, 0, size.x); minY = clamp(minY, 0, size.y);
        maxX = clamp(maxX, 0, size.x); maxY = clamp(maxY, 0, size.y);
        const geographicAnchor = map.latLngToContainerPoint([0, 0]);
        const gridLeft = anchoredGridOrigin(minX, geographicAnchor.x, sample);
        const gridTop = anchoredGridOrigin(minY, geographicAnchor.y, sample);
        const gridWidth = Math.max(1, Math.ceil((maxX - gridLeft) / sample)), gridHeight = Math.max(1, Math.ceil((maxY - gridTop) / sample));
        const width = gridWidth * sample, height = gridHeight * sample;
        const field = new Float32Array(gridWidth * gridHeight);
        const shadeField = new Float32Array(gridWidth * gridHeight);
        const backgroundField=new Float32Array(field.length),backgroundShade=new Float32Array(field.length);
        const eventField=new Float32Array(field.length),surgeField=new Float32Array(field.length),historyField=new Float32Array(field.length),currentField=new Float32Array(field.length);

        sources.forEach(source => {
          const radius = Math.max(source.rx, source.ry) * 3.1;
          const left = Math.max(0, Math.floor((source.center.x - radius - gridLeft) / sample));
          const right = Math.min(gridWidth - 1, Math.ceil((source.center.x + radius - gridLeft) / sample));
          const top = Math.max(0, Math.floor((source.center.y - radius - gridTop) / sample));
          const bottom = Math.min(gridHeight - 1, Math.ceil((source.center.y + radius - gridTop) / sample));
          const cos = Math.cos(source.angle), sin = Math.sin(source.angle);
          for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const px = gridLeft + (x + .5) * sample, py = gridTop + (y + .5) * sample;
            const dx = px - source.center.x, dy = py - source.center.y;
            if(dx*dx+dy*dy>source.influenceLimit*source.influenceLimit)continue;
            const rx = (dx * cos + dy * sin) / source.rx, ry = (-dx * sin + dy * cos) / source.ry;
            // Two close, asymmetrical lobes keep the interpolation geographic
            // but avoid the artificial bullseye/ring effect of a single radial
            // gradient. Real nearby venue points then overlap into block-scale
            // shade changes across the same neighborhood.
            const primary = source.blockShape
              ? Math.pow(Math.pow(Math.abs(rx), 2.8) + Math.pow(Math.abs(ry), 2.8), 2 / 2.8)
              : rx * rx + ry * ry;
            const shoulderA = (rx - .48) ** 2 / 1.18 + (ry + source.skew) ** 2 / .82;
            const shoulderB = (rx + .34) ** 2 / .9 + (ry - .3 - source.skew) ** 2 / 1.12;
            if (primary < 18) {
              const profile =
              .66 * Math.exp(-primary * .72) +
              .2 * Math.exp(-shoulderA * 1.05) +
              .14 * Math.exp(-shoulderB * 1.2);
              const texture = clamp(.82 + .11 * Math.sin(rx * 3.3 + source.angle * 5) + .08 * Math.cos(ry * 4.1 - source.angle * 3), .62, 1.04);
              const contribution = source.strength * profile * texture * source.detailOpacity;
              const offset = y * gridWidth + x;
              if(['event','current','surge','activity'].includes(source.evidence))currentField[offset]=Math.max(currentField[offset],profile);
              if(source.evidence==='history'){historyField[offset]=Math.max(historyField[offset],contribution);continue;}
              if(source.evidence==='event'||source.evidence==='activity')eventField[offset]=Math.max(eventField[offset],profile*source.shade);
              if(source.evidence==='surge')surgeField[offset]=Math.max(surgeField[offset],profile*source.shade);
              if(source.evidence==='modeled'){
                if(contribution>backgroundField[offset]){backgroundField[offset]=contribution;backgroundShade[offset]=contribution*source.shade;}
                continue;
              }
              field[offset] += contribution;
              // Color belongs to each locally measured source, while distance
              // controls opacity. A red source therefore feathers to clear
              // instead of manufacturing automatic yellow and green rings.
              // Independent lower-demand sources can still create green or
              // yellow areas beside, inside, or away from a red area.
              shadeField[offset] += contribution * source.shade;
            }
          }
        });

        const paint = document.createElement('canvas');
        paint.width = gridWidth; paint.height = gridHeight;
        const context = paint.getContext('2d'), image = context.createImageData(gridWidth, gridHeight), pixels = image.data;
        for (let i = 0; i < field.length; i++) {
          const composed=composeFields(field[i],shadeField[i],backgroundField[i],backgroundShade[i],{event:eventField[i],surge:surgeField[i],current:currentField[i]},historyField[i]);
          if(!composed.opacity)continue;
          const rgb=colorAt(composed.level),offset=i*4;
          pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2];
          pixels[offset + 3] = Math.round(255 * composed.opacity * zoomFactor);
        }
        context.putImageData(image, 0, 0);
        output.save();
        output.imageSmoothingEnabled = true;
        output.imageSmoothingQuality = 'high';
        output.drawImage(paint, gridLeft, gridTop, width, height);
        output.restore();
      }
    });
    return new HeatLayer();
  }

  return { historicalPriorForSource, composeFields, composePixel, currentEvidence, evidenceLevel, evidenceOpacity, colorAt, setPalette, getCustomColors, setCustomColors, getPalette: () => activePalette, paletteNames: Object.keys(PALETTES), sourceStrength, areaIntensity, sourceShade, compositeLevel, compositeOpacity, sourceRadiusKm, sourceFootprintKm, sourceInfluenceLimitKm, anchoredGridOrigin, createLayer };
});
