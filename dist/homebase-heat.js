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
    school: 1.45, transit: 2.1, event: 1.7, nightlife: 1.2,
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
    const strength = weight / 13;
    return clamp(source.tags && source.tags.forecast ? strength * .55 : strength, 0, 1.25);
  }

  function areaIntensity(weightedValue) {
    return 1 - Math.exp(-Math.max(0, weightedValue) * 1.65);
  }

  function sourceRadiusKm(category) {
    return RADII_KM[String(category || '').toLowerCase()] || 1.5;
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
      initialize() { this._areas = []; this._when = new Date(); this._scoreSource = () => 0; this._frame = 0; },
      onAdd(map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'homebase-demand-canvas');
        this._canvas.setAttribute('aria-hidden', 'true');
        this._canvas.style.cssText = 'position:absolute;pointer-events:none;image-rendering:auto;';
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
      setData(areas, when, scoreSource) {
        this._areas = Array.isArray(areas) ? areas : [];
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

        const sample = map.getZoom() < 10 ? 2 : 3;
        this._areas.forEach(area => this._drawArea(output, map, area, size, sample));
      },
      _drawArea(output, map, area, size, sample) {
        const feature = area && area.feature, geometry = feature && feature.geometry;
        if (!geometry || !Array.isArray(area.sources) || !area.sources.length) return;
        const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
        if (!polygons.length) return;

        const path = new Path2D();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        polygons.forEach(rings => rings.forEach(ring => {
          if (!Array.isArray(ring) || ring.length < 3) return;
          ring.forEach(([lon, lat], index) => {
            const point = map.latLngToContainerPoint([lat, lon]);
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            if (index === 0) path.moveTo(point.x, point.y); else path.lineTo(point.x, point.y);
            minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
          });
          path.closePath();
        }));
        if (!Number.isFinite(minX) || maxX < 0 || maxY < 0 || minX > size.x || minY > size.y) return;
        minX = clamp(minX, 0, size.x); minY = clamp(minY, 0, size.y);
        maxX = clamp(maxX, 0, size.x); maxY = clamp(maxY, 0, size.y);
        const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);
        const gridWidth = Math.max(1, Math.ceil(width / sample)), gridHeight = Math.max(1, Math.ceil(height / sample));
        const field = new Float32Array(gridWidth * gridHeight);
        const sources = area.sources.map((source, index) => {
          const strength = sourceStrength(source, this._when, this._scoreSource);
          if (!strength || !Number.isFinite(source.lat) || !Number.isFinite(source.lon)) return null;
          const center = map.latLngToContainerPoint([source.lat, source.lon]);
          const km = sourceRadiusKm(source.cat), north = map.latLngToContainerPoint([source.lat + km / 111.32, source.lon]);
          const radius = Math.max(1.25, Math.abs(center.y - north.y));
          const angle = stableAngle(source, index);
          return { center, strength, angle, rx: radius * (.68 + (index % 4) * .07), ry: radius * (.49 + ((index + 2) % 4) * .08) };
        }).filter(Boolean);
        if (!sources.length) return;

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
            const distance = rx * rx + ry * ry;
            if (distance < 18) field[y * gridWidth + x] += source.strength * Math.exp(-distance * .5);
          }
        });

        const paint = document.createElement('canvas');
        paint.width = gridWidth; paint.height = gridHeight;
        const context = paint.getContext('2d'), image = context.createImageData(gridWidth, gridHeight), pixels = image.data;
        for (let i = 0; i < field.length; i++) {
          const value = field[i];
          if (value < .018) continue;
          const level = areaIntensity(value), rgb = colorAt(level), offset = i * 4;
          pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2];
          pixels[offset + 3] = Math.round(255 * (.1 + level * .42));
        }
        context.putImageData(image, 0, 0);
        output.save();
        output.clip(path, 'evenodd');
        output.imageSmoothingEnabled = true;
        output.imageSmoothingQuality = 'high';
        output.drawImage(paint, minX, minY, width, height);
        output.restore();
      }
    });
    return new HeatLayer();
  }

  return { colorAt, sourceStrength, areaIntensity, sourceRadiusKm, createLayer };
});
