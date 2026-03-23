import type { PaletteColor, Stroke, StrokePoint } from '../types';
import { renderSegment, type BrushRenderContext, type BrushState } from './brushes';

export type ShimmerStroke = {
  points: readonly StrokePoint[];
  color: PaletteColor;
  progress: number;
};

export type CanvasRenderer = {
  readonly canvas: HTMLCanvasElement;
  readonly bufferCanvas: HTMLCanvasElement;
  clear: () => void;
  drawSegment: (stroke: Stroke, prev: StrokePoint, curr: StrokePoint, brushState: BrushState) => void;
  resize: () => void;
  setShimmerStrokes: (strokes: ShimmerStroke[]) => void;
};

function createGrainPattern(w: number, h: number): HTMLCanvasElement {
  const grain = document.createElement('canvas');
  grain.width = w;
  grain.height = h;
  const gCtx = grain.getContext('2d')!;
  const imgData = gCtx.createImageData(w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 245 + Math.random() * 10; // very subtle: 245-255 range
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 30; // low alpha — just a hint of texture
  }
  gCtx.putImageData(imgData, 0, 0);
  return grain;
}

export function createRenderer(canvas: HTMLCanvasElement): CanvasRenderer {
  const ctx = canvas.getContext('2d')!;
  const bufferCanvas = document.createElement('canvas');
  const bufferCtx = bufferCanvas.getContext('2d')!;

  let shimmerStrokes: ShimmerStroke[] = [];
  let grainCanvas: HTMLCanvasElement | null = null;

  function syncSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      // Save buffer contents before resize
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = bufferCanvas.width;
      tmpCanvas.height = bufferCanvas.height;
      const tmpCtx = tmpCanvas.getContext('2d')!;
      tmpCtx.drawImage(bufferCanvas, 0, 0);

      canvas.width = w;
      canvas.height = h;
      bufferCanvas.width = w;
      bufferCanvas.height = h;

      // Restore buffer contents scaled to new size
      if (tmpCanvas.width > 0 && tmpCanvas.height > 0) {
        bufferCtx.drawImage(tmpCanvas, 0, 0, w, h);
      }

      grainCanvas = createGrainPattern(w, h);
    }
  }

  function compositeFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw canvas grain texture under the paint
    if (grainCanvas) {
      ctx.drawImage(grainCanvas, 0, 0);
    }

    ctx.drawImage(bufferCanvas, 0, 0);

    // Draw shimmer on active replay strokes
    if (shimmerStrokes.length > 0) {
      const t = performance.now() / 1000;
      ctx.save();
      for (const ss of shimmerStrokes) {
        if (ss.points.length < 2) continue;
        const [r, g, b] = ss.color.rgb;
        // Pulsing glow: oscillates alpha between 0.2 and 0.5
        const pulse = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 8));
        const w = canvas.width;
        const h = canvas.height;

        // Draw the stroke path as a wide, glowing line
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // White outer glow
        ctx.strokeStyle = `rgba(255, 255, 255, ${pulse * 0.7})`;
        const lastIdx = Math.floor(ss.progress * (ss.points.length - 1));
        ctx.beginPath();
        ctx.moveTo(ss.points[0].x * w, ss.points[0].y * h);
        for (let i = 1; i <= lastIdx; i++) {
          ctx.lineTo(ss.points[i].x * w, ss.points[i].y * h);
        }
        ctx.stroke();

        // Colored inner line (reuse same path)
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${pulse})`;
        ctx.stroke();

        // Brighter dot at the leading edge
        if (lastIdx >= 0) {
          const tip = ss.points[lastIdx];
          const dotPulse = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 12));
          ctx.fillStyle = `rgba(255, 255, 255, ${dotPulse})`;
          ctx.beginPath();
          ctx.arc(tip.x * w, tip.y * h, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    requestAnimationFrame(compositeFrame);
  }

  syncSize();
  compositeFrame();

  return {
    canvas,
    bufferCanvas,

    clear() {
      bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    },

    drawSegment(stroke: Stroke, prev: StrokePoint, curr: StrokePoint, brushState: BrushState) {
      const rc: BrushRenderContext = {
        ctx: bufferCtx,
        color: stroke.color,
        canvasWidth: bufferCanvas.width,
        canvasHeight: bufferCanvas.height,
      };
      renderSegment(stroke.brush, rc, prev, curr, brushState);
    },

    resize() {
      syncSize();
    },

    setShimmerStrokes(strokes: ShimmerStroke[]) {
      shimmerStrokes = strokes;
    },
  };
}
