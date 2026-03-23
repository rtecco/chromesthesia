import type { Stroke, StrokePoint } from '../types';
import { renderSegment, type BrushRenderContext, type BrushState } from './brushes';

export type CanvasRenderer = {
  readonly canvas: HTMLCanvasElement;
  readonly bufferCanvas: HTMLCanvasElement;
  clear: () => void;
  drawSegment: (stroke: Stroke, prev: StrokePoint, curr: StrokePoint, brushState: BrushState) => void;
  resize: () => void;
  getPlayheadPosition: () => number | null;
  setPlayheadPosition: (x: number | null) => void;
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

  let playheadX: number | null = null;
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

    // Draw playhead
    if (playheadX !== null) {
      const px = playheadX * canvas.width;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvas.height);
      ctx.stroke();
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

    getPlayheadPosition() {
      return playheadX;
    },

    setPlayheadPosition(x: number | null) {
      playheadX = x;
    },
  };
}
