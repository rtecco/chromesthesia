import type { BrushType, StrokePoint, PaletteColor } from '../types';
import { clamp, lerp } from '../utils/math';

export type BrushRenderContext = {
  ctx: CanvasRenderingContext2D;
  color: PaletteColor;
  canvasWidth: number;
  canvasHeight: number;
};

// Per-bristle persistent state for round brush
type Bristle = {
  offsetAngle: number;   // fixed angular position in the bundle
  offsetRadius: number;  // how far from center at rest
  thickness: number;     // individual bristle width
  opacity: number;       // individual bristle base opacity
  prevX: number;         // last drawn position (canvas px)
  prevY: number;
};

export type BrushState = {
  bristles: Bristle[];
  segmentCount: number;  // how many segments drawn so far (for paint load fade)
};

export function createBrushState(brush: BrushType): BrushState {
  const bristles: Bristle[] = [];
  if (brush === 'oil-round') {
    const count = 24;
    for (let i = 0; i < count; i++) {
      bristles.push({
        offsetAngle: (i / count) * Math.PI * 2 + (pseudoRand(i, 0.5) - 0.5) * 0.4,
        offsetRadius: 0.3 + pseudoRand(i, 0.7) * 0.7,
        thickness: 0.8 + pseudoRand(i, 0.3) * 1.4,
        opacity: 0.3 + pseudoRand(i, 0.9) * 0.4,
        prevX: -1,
        prevY: -1,
      });
    }
  }
  return { bristles, segmentCount: 0 };
}

type BrushRenderer = (
  rc: BrushRenderContext,
  prev: StrokePoint,
  curr: StrokePoint,
  state: BrushState,
) => void;

function rgbStr(c: PaletteColor, alpha: number): string {
  const [r, g, b] = c.rgb;
  return `rgba(${r},${g},${b},${alpha})`;
}

function strokeAngle(prev: StrokePoint, curr: StrokePoint): number {
  return Math.atan2(curr.y - prev.y, curr.x - prev.x);
}

function strokeSpeed(prev: StrokePoint, curr: StrokePoint): number {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const dt = Math.max(curr.timestamp - prev.timestamp, 1);
  return Math.sqrt(dx * dx + dy * dy) / dt;
}

// Velocity-based width multiplier: fast = thin, slow = thick
function velocityWidthMul(prev: StrokePoint, curr: StrokePoint): number {
  const speed = strokeSpeed(prev, curr);
  return clamp(lerp(1.3, 0.4, speed * 600), 0.4, 1.3);
}

// Seeded-ish random from two floats, for deterministic bristle placement
function pseudoRand(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const oilFlat: BrushRenderer = (rc, prev, curr, _state) => {
  const { ctx, color, canvasWidth, canvasHeight } = rc;
  const velMul = velocityWidthMul(prev, curr);
  const baseWidth = lerp(12, 30, curr.pressure) * velMul * (canvasWidth / 960);
  const angle = strokeAngle(prev, curr);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);
  const bristleCount = 12;

  for (let i = 0; i < bristleCount; i++) {
    const t = (i / (bristleCount - 1)) - 0.5; // -0.5 to 0.5
    const offsetX = perpX * t * baseWidth;
    const offsetY = perpY * t * baseWidth;
    const jitter = (pseudoRand(curr.x + i, curr.y) - 0.5) * 2;

    ctx.beginPath();
    ctx.strokeStyle = rgbStr(color, lerp(0.3, 0.65, curr.pressure));
    ctx.lineWidth = lerp(1.5, 3, pseudoRand(i, curr.timestamp)) * (canvasWidth / 960);
    ctx.lineCap = 'round';
    ctx.moveTo(
      prev.x * canvasWidth + offsetX + jitter,
      prev.y * canvasHeight + offsetY + jitter,
    );
    ctx.lineTo(
      curr.x * canvasWidth + offsetX + jitter,
      curr.y * canvasHeight + offsetY + jitter,
    );
    ctx.stroke();
  }
};

const oilRound: BrushRenderer = (rc, prev, curr, state) => {
  const { ctx, color, canvasWidth, canvasHeight } = rc;
  const sc = canvasWidth / 960;
  const velMul = velocityWidthMul(prev, curr);
  const baseRadius = lerp(8, 22, curr.pressure) * velMul * sc;
  // Bristles splay outward under pressure
  const splay = lerp(0.3, 1.0, curr.pressure);
  const cx = curr.x * canvasWidth;
  const cy = curr.y * canvasHeight;

  // Paint load fades over the stroke — starts thick, gets translucent
  const loadFade = clamp(1.0 - state.segmentCount / 300, 0.25, 1.0);

  for (const bristle of state.bristles) {
    const bx = cx + Math.cos(bristle.offsetAngle) * bristle.offsetRadius * baseRadius * splay;
    const by = cy + Math.sin(bristle.offsetAngle) * bristle.offsetRadius * baseRadius * splay;

    const alpha = bristle.opacity * loadFade * lerp(0.5, 1.0, curr.pressure);

    ctx.beginPath();
    ctx.strokeStyle = rgbStr(color, alpha);
    ctx.lineWidth = bristle.thickness * sc;
    ctx.lineCap = 'round';

    if (bristle.prevX < 0) {
      // First segment — just a dot
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 0.5, by + 0.5);
    } else {
      // Drag from previous bristle position — this is what makes it feel physical
      ctx.moveTo(bristle.prevX, bristle.prevY);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    bristle.prevX = bx;
    bristle.prevY = by;
  }

  state.segmentCount++;
};

const paletteKnife: BrushRenderer = (rc, prev, curr, _state) => {
  const { ctx, color, canvasWidth, canvasHeight } = rc;
  const speed = strokeSpeed(prev, curr);
  const velMul = velocityWidthMul(prev, curr);
  const width = lerp(20, 50, curr.pressure) * velMul * (canvasWidth / 960);
  const angle = strokeAngle(prev, curr);
  const stretch = Math.min(speed * 800, 2.5);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);

  // Sharp-edged smear
  ctx.save();
  ctx.globalAlpha = lerp(0.15, 0.4, curr.pressure);
  ctx.fillStyle = `rgb(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]})`;

  ctx.beginPath();
  const hw = width / 2;
  ctx.moveTo(
    prev.x * canvasWidth - perpX * hw,
    prev.y * canvasHeight - perpY * hw,
  );
  ctx.lineTo(
    prev.x * canvasWidth + perpX * hw,
    prev.y * canvasHeight + perpY * hw,
  );
  ctx.lineTo(
    curr.x * canvasWidth + perpX * hw * (1 + stretch * 0.2),
    curr.y * canvasHeight + perpY * hw * (1 + stretch * 0.2),
  );
  ctx.lineTo(
    curr.x * canvasWidth - perpX * hw * (1 + stretch * 0.2),
    curr.y * canvasHeight - perpY * hw * (1 + stretch * 0.2),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Thin scrape lines for knife texture
  for (let i = 0; i < 3; i++) {
    const t = (i / 2) - 0.5;
    ctx.beginPath();
    ctx.strokeStyle = rgbStr(color, 0.12);
    ctx.lineWidth = 0.5 * (canvasWidth / 960);
    ctx.moveTo(
      prev.x * canvasWidth + perpX * t * width,
      prev.y * canvasHeight + perpY * t * width,
    );
    ctx.lineTo(
      curr.x * canvasWidth + perpX * t * width,
      curr.y * canvasHeight + perpY * t * width,
    );
    ctx.stroke();
  }
};

const dryBrush: BrushRenderer = (rc, prev, curr, _state) => {
  const { ctx, color, canvasWidth, canvasHeight } = rc;
  const velMul = velocityWidthMul(prev, curr);
  const baseWidth = lerp(10, 35, curr.pressure) * velMul * (canvasWidth / 960);
  const angle = strokeAngle(prev, curr);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);

  // Sparse, skipping dots and dashes
  const dotCount = 18;
  for (let i = 0; i < dotCount; i++) {
    if (pseudoRand(i, curr.timestamp) < 0.35) continue; // skip for "dry" gaps

    const t = lerp(0, 1, i / dotCount);
    const mx = lerp(prev.x, curr.x, t) * canvasWidth;
    const my = lerp(prev.y, curr.y, t) * canvasHeight;
    const spread = (pseudoRand(i, curr.x) - 0.5) * baseWidth;

    ctx.beginPath();
    ctx.fillStyle = rgbStr(color, lerp(0.15, 0.45, pseudoRand(i + 3, curr.y)));
    const dotR = lerp(0.5, 2.5, pseudoRand(i + 7, curr.timestamp)) * (canvasWidth / 960);
    ctx.arc(
      mx + perpX * spread,
      my + perpY * spread,
      dotR,
      0, Math.PI * 2,
    );
    ctx.fill();
  }
};

// --- Eraser tools ---

const scraper: BrushRenderer = (rc, prev, curr, _state) => {
  const { ctx, canvasWidth, canvasHeight } = rc;
  const width = lerp(20, 50, curr.pressure) * (canvasWidth / 960);
  const angle = strokeAngle(prev, curr);
  const perpX = Math.cos(angle + Math.PI / 2);
  const perpY = Math.sin(angle + Math.PI / 2);
  const hw = width / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // Sharp quad that cuts paint away
  ctx.globalAlpha = lerp(0.85, 1.0, curr.pressure);
  ctx.beginPath();
  ctx.moveTo(prev.x * canvasWidth - perpX * hw, prev.y * canvasHeight - perpY * hw);
  ctx.lineTo(prev.x * canvasWidth + perpX * hw, prev.y * canvasHeight + perpY * hw);
  ctx.lineTo(curr.x * canvasWidth + perpX * hw, curr.y * canvasHeight + perpY * hw);
  ctx.lineTo(curr.x * canvasWidth - perpX * hw, curr.y * canvasHeight - perpY * hw);
  ctx.closePath();
  ctx.fill();

  // Fine scrape marks — thin lines that leave faint residue at edges
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 3; i++) {
    const t = (i / 2) - 0.5;
    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 0.5 * (canvasWidth / 960);
    ctx.moveTo(
      prev.x * canvasWidth + perpX * t * width * 1.1,
      prev.y * canvasHeight + perpY * t * width * 1.1,
    );
    ctx.lineTo(
      curr.x * canvasWidth + perpX * t * width * 1.1,
      curr.y * canvasHeight + perpY * t * width * 1.1,
    );
    ctx.stroke();
  }

  ctx.restore();
};

const solvent: BrushRenderer = (rc, prev, curr, _state) => {
  const { ctx, canvasWidth, canvasHeight } = rc;
  const radius = lerp(25, 55, curr.pressure) * (canvasWidth / 960);
  const cx = curr.x * canvasWidth;
  const cy = curr.y * canvasHeight;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // Soft dissolving dabs — multiple overlapping circles with low alpha
  // creates the fluid, pooling turpentine look
  const dabCount = 8;
  for (let i = 0; i < dabCount; i++) {
    const angle = pseudoRand(i, curr.timestamp) * Math.PI * 2;
    const dist = pseudoRand(i + 5, curr.x) * radius * 0.6;
    const dabR = radius * lerp(0.3, 0.7, pseudoRand(i + 2, curr.y));
    const dabAlpha = lerp(0.15, 0.4, curr.pressure);

    ctx.globalAlpha = dabAlpha;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, dabR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central dissolve — stronger in the middle, like solvent pooling
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = lerp(0.25, 0.5, curr.pressure);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Connecting flow between previous and current point
  ctx.globalAlpha = lerp(0.15, 0.35, curr.pressure);
  ctx.lineWidth = radius * 0.8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(prev.x * canvasWidth, prev.y * canvasHeight);
  ctx.lineTo(cx, cy);
  ctx.stroke();

  ctx.restore();
};

const BRUSH_RENDERERS: Record<BrushType, BrushRenderer> = {
  'oil-flat': oilFlat,
  'oil-round': oilRound,
  'palette-knife': paletteKnife,
  'dry-brush': dryBrush,
  'scraper': scraper,
  'solvent': solvent,
};

const ERASER_BRUSHES: ReadonlySet<BrushType> = new Set(['scraper', 'solvent']);

export function renderSegment(
  brush: BrushType,
  rc: BrushRenderContext,
  prev: StrokePoint,
  curr: StrokePoint,
  state: BrushState,
): void {
  const { ctx } = rc;
  // Paint brushes use multiply so overlapping strokes darken like pigment
  if (!ERASER_BRUSHES.has(brush)) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    BRUSH_RENDERERS[brush](rc, prev, curr, state);
    ctx.restore();
  } else {
    BRUSH_RENDERERS[brush](rc, prev, curr, state);
  }
}
