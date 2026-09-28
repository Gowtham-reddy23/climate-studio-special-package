export interface GridCell {
  x: number;
  y: number;
  size: number;
}

export interface GridPlan {
  cols: number;
  rows: number;
  width: number;
  height: number;
  cells: GridCell[];
}

/** Pure square-ish grid layout for `count` images. */
export function planGrid(count: number, cell = 240, gap = 8): GridPlan {
  const n = Math.max(1, Math.floor(count));
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const width = cols * cell + (cols + 1) * gap;
  const height = rows * cell + (rows + 1) * gap;
  const cells: GridCell[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    cells.push({ x: gap + c * (cell + gap), y: gap + r * (cell + gap), size: cell });
  }
  return { cols, rows, width, height, cells };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Draw `img` to cover the (dx,dy,dw,dh) box, center-cropped. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}

/** Composite image data URLs into one moodboard JPEG. Browser-only (canvas). */
export async function composeMoodboard(dataUrls: string[]): Promise<Blob> {
  const plan = planGrid(dataUrls.length);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#14111a";
  ctx.fillRect(0, 0, plan.width, plan.height);
  const imgs = await Promise.all(dataUrls.map(loadImage));
  imgs.forEach((img, i) => {
    const cell = plan.cells[i];
    if (!cell) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.size, cell.size);
    ctx.clip();
    drawCover(ctx, img, cell.x, cell.y, cell.size, cell.size);
    ctx.restore();
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.85);
  });
}
