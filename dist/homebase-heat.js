(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeBaseHeat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOPS = [
    [0, [7, 91, 45]],
    [.16, [19, 148, 57]],
    [.32, [137, 188, 49]],
    [.48, [250, 207, 43]],
    [.64, [255, 132, 28]],
    [.8, [242, 45, 43]],
    [1, [222, 26, 133]]
  ];
  const RADII_KM = {
    school: 1.45, k12: 1.45, university: 1.8, transit: 2.1, event: 1.7, nightlife: 1.2,
    restaurant: 1.15, hotel: 1.5, attraction: 1.6,
    medical: 1.55, neighborhood: 1.65, shopping: 1.8
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function colorAt(level) {
    const value = clamp(Number(level) || 0, 0, 1);
    let low = STOPS[0], high = STOPS[STOPS.length - 1];
    for (let i = 1; i < STOPS.length; i++) {
      if (value <= STOPS[i][0]) { low = STOPS[i - 1]; high = STOPS[i]; break; }
    }
    const t = (value - low[0]) / (high[0] - low[0] || 1);
    const eased = t * t * (3 - 2 * t);
    return low[1].map((channel, i) => Math.round(channel + (high[1][i] - channel) * eased));
  }

  function sourceStrength(source, when, scoreSource) {
    const weight = Number(scoreSource(source, when));
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    let strength = weight / 13;
    const tags = source.tags || {};
    // Public points describe activity density, not verified ride requests. They
    // become useful when several nearby places overlap, without turning every
    // restaurant or school into a red hotspot by itself.
    if (tags.publicVenue) strength *= tags.place ? .28 : .2;
    if (tags.metroBaseline || tags.forecast) strength *= .82;
    return clamp(strength, 0, 1.25);
  }

  function areaIntensity(weightedValue) {
    return 1 - Math.exp(-Math.max(0, weightedValue) * 1.65);
  }

  function sourceShade(strength) {
    return clamp(areaIntensity((Number(strength) || 0) * .82), .035, 1);
  }

  function compositeLevel(value, weightedShade) {
    const amount = Math.max(0, Number(value) || 0);
    if (!amount) return 0;
    const localShade = (Number(weightedShade) || 0) / Math.max(amount, .0001);
    return clamp(localShade + Math.min(.2, areaIntensity(amount) * .2), .035, 1);
  }

  function compositeOpacity(value) {
    // Keep locally scored demand legible above the dark basemap. Opacity still
    // falls to zero with the measured field, so this does not manufacture a
    // surrounding low-demand ring.
    return clamp(areaIntensity(Math.max(0, Number(value) || 0)) * .74, 0, .76);
  }

  function sourceRadiusKm(category) {
    return RADII_KM[String(category || '').toLowerCase()] || 1.5;
  }

  function sourceFootprintKm(source) {
    const tags = source.tags || {};
    if (tags.providerSignal) return 1.35;
    if (tags.metroBaseline) {
      // Community anchors represent an area, not a single address. Wider,
      // category-specific footprints connect county demand without turning it
      // into one city-centered oval.
      const metro = { neighborhood: 3.25, shopping: 3.1, transit: 3.45, restaurant: 2.7, university: 2.9, k12: 2.15, event: 2.55, hotel: 2.8, medical: 2.65 };
      return metro[source.cat] || 2.75;
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
        if (!this._areas.length) return;

        const sample = map.getZoom() < 10 ? 2.5 : 2;
        const seen = new Set(), sources = [];
        [...this._sources, ...this._areas.flatMap(area => area.sources || [])].forEach(source => {
          const key = `${Number(source.lat).toFixed(5)}:${Number(source.lon).toFixed(5)}:${source.name || ''}`;
          if (!seen.has(key)) { seen.add(key); sources.push(source); }
        });
        // Keep the metro-wide view as a continuous source field. Once the
        // driver zooms into Baltimore neighborhoods, restore the local
        // neighborhood demand surface from the sources assigned to each
        // geographic boundary, then layer source-level detail over it.
        if (map.getZoom() >= 13) this._drawAreaSurface(output, map, this._areas, size, sample);
        this._drawSources(output, map, sources, size, sample);
      },
      _drawAreaSurface(output, map, areas, size, sample) {
        const active = (areas || []).filter(area =>
          area.areaType === 'neighborhood' &&
          area.feature && area.feature.geometry && (area.sources || []).length
        );
        if (!active.length) return;
        const width = Math.max(1, Math.ceil(size.x / sample));
        const height = Math.max(1, Math.ceil(size.y / sample));
        const paint = document.createElement('canvas');
        paint.width = width; paint.height = height;
        const context = paint.getContext('2d');
        const traceRing = ring => {
          ring.forEach((coordinate, index) => {
            const point = map.latLngToContainerPoint([coordinate[1], coordinate[0]]);
            const x = point.x / sample, y = point.y / sample;
            if (index) context.lineTo(x, y); else context.moveTo(x, y);
          });
          context.closePath();
        };
        active.forEach(area => {
          let amount = 0, weightedShade = 0;
          (area.sources || []).forEach(source => {
            const strength = sourceStrength(source, this._when, this._scoreSource);
            if (!strength) return;
            amount += strength;
            weightedShade += strength * sourceShade(strength);
          });
          if (amount <= 0) return;
          const level = compositeLevel(amount, weightedShade);
          const rgb = colorAt(level);
          const opacity = clamp(.12 + compositeOpacity(amount) * .72, .12, .58);
          const geometry = area.feature.geometry;
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
          if (!polygons.length) return;
          context.save();
          // A blurred geographic mask keeps the neighborhood influence of the
          // provider reference without displaying a polygon edge or cell grid.
          const blur = map.getZoom() <= 11 ? (area.areaType === 'label' ? 15 : 20) : (area.areaType === 'label' ? 8 : 11);
          context.filter = `blur(${blur}px)`;
          context.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${opacity})`;
          context.beginPath();
          polygons.forEach(rings => rings.forEach(traceRing));
          context.fill('evenodd');
          context.restore();
        });
        output.save();
        output.imageSmoothingEnabled = true;
        output.imageSmoothingQuality = 'high';
        output.drawImage(paint, 0, 0, size.x, size.y);
        output.restore();
      },
      _drawSources(output, map, sourceData, size, sample) {
        if (!Array.isArray(sourceData) || !sourceData.length) return;
        const sources = sourceData.map((source, index) => {
          // Label/county anchors exist only to name areas. Neighborhood
          // coverage anchors remain fixed geographic sources at every zoom.
          if (source.tags && source.tags.areaCoverageAnchor) {
            if (source.heatAreaType !== 'neighborhood') return null;
          }
          const strength = sourceStrength(source, this._when, this._scoreSource);
          if (!strength || !Number.isFinite(source.lat) || !Number.isFinite(source.lon)) return null;
          const center = map.latLngToContainerPoint([source.lat, source.lon]);
          const km = sourceFootprintKm(source), north = map.latLngToContainerPoint([source.lat + km / 111.32, source.lon]);
          const radius = Math.max(1.25, Math.abs(center.y - north.y));
          const angle = stableAngle(source, index);
          let rx = radius * (.62 + (index % 5) * .055);
          let ry = radius * (.43 + ((index + 2) % 5) * .06);
          // Blend the organic point field with the footprint of the containing
          // neighborhood. This retains the useful neighborhood-block character
          // without restoring hard polygon edges or separate city/county maps.
          const bounds = source.heatAreaBounds;
          if ((source.heatAreaType === 'label' || source.heatAreaType === 'neighborhood') && Array.isArray(bounds) && bounds.length === 4) {
            const nw = map.latLngToContainerPoint([bounds[2], bounds[1]]);
            const se = map.latLngToContainerPoint([bounds[0], bounds[3]]);
            const areaRx = clamp(Math.abs(se.x - nw.x) * .28, radius * .55, radius * 2.35);
            const areaRy = clamp(Math.abs(se.y - nw.y) * .28, radius * .55, radius * 2.35);
            rx = rx * .58 + areaRx * .42;
            ry = ry * .58 + areaRy * .42;
          }
          return {
            center, strength, angle, rx, ry,
            blockShape: (source.heatAreaType === 'label' || source.heatAreaType === 'neighborhood') && Array.isArray(bounds),
            shade: sourceShade(strength),
            detailOpacity: source.tags && (source.tags.providerSignal || source.tags.providerEvent || source.tags.liveEvent) ? .96 :
              source.heatAreaType === 'label' ? .46 : source.heatAreaType === 'neighborhood' ? .56 : .9,
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
        const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);
        const gridWidth = Math.max(1, Math.ceil(width / sample)), gridHeight = Math.max(1, Math.ceil(height / sample));
        const field = new Float32Array(gridWidth * gridHeight);
        const shadeField = new Float32Array(gridWidth * gridHeight);

        sources.forEach(source => {
          const radius = Math.max(source.rx, source.ry) * 3.1;
          const left = Math.max(0, Math.floor((source.center.x - radius - minX) / sample));
          const right = Math.min(gridWidth - 1, Math.ceil((source.center.x + radius - minX) / sample));
          const top = Math.max(0, Math.floor((source.center.y - radius - minY) / sample));
          const bottom = Math.min(gridHeight - 1, Math.ceil((source.center.y + radius - minY) / sample));
          const cos = Math.cos(source.angle), sin = Math.sin(source.angle);
          for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const px = minX + (x + .5) * sample, py = minY + (y + .5) * sample;
            const dx = px - source.center.x, dy = py - source.center.y;
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
          const value = field[i];
          if (value < .018) continue;
          const level = compositeLevel(value, shadeField[i]), rgb = colorAt(level), offset = i * 4;
          pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2];
          pixels[offset + 3] = Math.round(255 * compositeOpacity(value));
        }
        context.putImageData(image, 0, 0);
        output.save();
        output.imageSmoothingEnabled = true;
        output.imageSmoothingQuality = 'high';
        output.drawImage(paint, minX, minY, width, height);
        output.restore();
      }
    });
    return new HeatLayer();
  }

  return { colorAt, sourceStrength, areaIntensity, sourceShade, compositeLevel, compositeOpacity, sourceRadiusKm, sourceFootprintKm, createLayer };
});
