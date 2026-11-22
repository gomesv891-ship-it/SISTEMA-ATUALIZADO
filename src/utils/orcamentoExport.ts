import { getFontEmbedCSS, toBlob, toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { runWithPdfThemeExport } from './themeService';

export interface EspelhoCaptureResult {
  pngDataUrl: string;
  width: number;
  height: number;
}

let cachedFontEmbedCss: string | null = null;
let inFlightFontEmbedCssPromise: Promise<string | null> | null = null;

async function resolveCachedFontEmbedCss(element: HTMLElement): Promise<string | null> {
  if (cachedFontEmbedCss !== null) {
    return cachedFontEmbedCss;
  }
  if (inFlightFontEmbedCssPromise) {
    return inFlightFontEmbedCssPromise;
  }

  inFlightFontEmbedCssPromise = (async () => {
    try {
      const css = await Promise.race<string | null>([
        getFontEmbedCSS(element, { preferredFontFormat: 'woff2' }),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      cachedFontEmbedCss = typeof css === 'string' ? css : '';
      return cachedFontEmbedCss;
    } catch {
      cachedFontEmbedCss = '';
      return '';
    } finally {
      inFlightFontEmbedCssPromise = null;
    }
  })();

  return inFlightFontEmbedCssPromise;
}

export function warmEspelhoFontCache(element?: HTMLElement | null): void {
  if (typeof window === 'undefined' || cachedFontEmbedCss !== null) return;
  const target = element || document.getElementById('espelho-oficial-orcamento');
  if (!target) return;
  void resolveCachedFontEmbedCss(target);
}

async function waitForVisualSettlement(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading timeout
    }
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 24);
      });
    });
  });
}

let colorNormalizerCtx: CanvasRenderingContext2D | null = null;

function resolveCssColorToRgba(value: string): string {
  if (!value || (!value.includes('oklch') && !value.includes('oklab') && !value.includes('color-mix'))) {
    return value;
  }
  try {
    if (!colorNormalizerCtx && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      colorNormalizerCtx = c.getContext('2d');
    }
    if (!colorNormalizerCtx) return value;

    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    document.body.removeChild(probe);

    if (computed && !computed.includes('oklch') && !computed.includes('oklab')) {
      return computed;
    }
    colorNormalizerCtx.fillStyle = '#000000';
    colorNormalizerCtx.fillStyle = value;
    return colorNormalizerCtx.fillStyle;
  } catch {
    return value;
  }
}

function sanitizeClonedNodeColorsForHtml2Canvas(originalRoot: HTMLElement, clonedRoot: HTMLElement): void {
  const origElements = [originalRoot, ...Array.from(originalRoot.querySelectorAll('*'))];
  const cloneElements = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll('*'))];
  const props = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'fill',
    'stroke',
  ] as const;

  const len = Math.min(origElements.length, cloneElements.length);
  for (let i = 0; i < len; i++) {
    const origEl = origElements[i] as HTMLElement;
    const cloneEl = cloneElements[i] as HTMLElement;
    if (!origEl || !cloneEl || !cloneEl.style) continue;
    const cs = getComputedStyle(origEl);
    for (const prop of props) {
      const val = cs[prop];
      if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color-mix'))) {
        (cloneEl.style as any)[prop] = resolveCssColorToRgba(val);
      }
    }
  }
}

function getCaptureMetrics(element: HTMLElement): {
  captureWidth: number;
  captureHeight: number;
  captureStyle: Partial<CSSStyleDeclaration>;
} {
  const rect = element.getBoundingClientRect();
  const captureWidth = Math.max(
    Math.round(element.offsetWidth || rect.width || element.scrollWidth || 1040),
    960
  );
  const captureHeight = Math.max(
    Math.round(element.offsetHeight || element.scrollHeight || rect.height || 600),
    200
  );

  const captureStyle: Partial<CSSStyleDeclaration> = {
    margin: '0',
    transform: 'none',
    boxShadow: 'none',
    width: `${captureWidth}px`,
    minWidth: `${captureWidth}px`,
    maxWidth: `${captureWidth}px`,
    overflow: 'hidden',
  };

  return { captureWidth, captureHeight, captureStyle };
}

async function renderElementViaHtml2Canvas(
  element: HTMLElement,
  captureWidth: number,
  captureHeight: number
): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: captureWidth,
    height: captureHeight,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      const clonedEl = element.id
        ? clonedDoc.getElementById(element.id)
        : (clonedDoc.body.firstElementChild as HTMLElement | null);
      if (clonedEl) {
        clonedEl.style.margin = '0';
        clonedEl.style.transform = 'none';
        clonedEl.style.boxShadow = 'none';
        clonedEl.style.width = `${captureWidth}px`;
        clonedEl.style.minWidth = `${captureWidth}px`;
        clonedEl.style.maxWidth = `${captureWidth}px`;
        clonedEl.style.overflow = 'hidden';
        sanitizeClonedNodeColorsForHtml2Canvas(element, clonedEl);
      }
    },
  });
}

export async function captureEspelhoToBlob(
  element: HTMLElement,
  options?: { skipSettlementDelay?: boolean }
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!options?.skipSettlementDelay) {
    await waitForVisualSettlement();
  } else if (typeof document !== 'undefined' && document.fonts?.status !== 'loaded' && document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => window.setTimeout(resolve, 400)),
      ]);
    } catch {
      // ignore font loading error
    }
  }

  const { captureWidth, captureHeight, captureStyle } = getCaptureMetrics(element);
  const cachedCss = await resolveCachedFontEmbedCss(element);
  const fontOptions = cachedCss ? { fontEmbedCSS: cachedCss } : { skipFonts: true };

  try {
    const blob = await toBlob(element, {
      quality: 1.0,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: false,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: captureWidth * 2,
      canvasHeight: captureHeight * 2,
      style: captureStyle,
      ...fontOptions,
    });
    if (blob) {
      return { blob, width: captureWidth, height: captureHeight };
    }
    throw new Error('Blob vazio ao capturar imagem');
  } catch (errWithFonts) {
    if (cachedCss) {
      try {
        const blob = await toBlob(element, {
          quality: 1.0,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: false,
          skipFonts: true,
          width: captureWidth,
          height: captureHeight,
          canvasWidth: captureWidth * 2,
          canvasHeight: captureHeight * 2,
          style: captureStyle,
        });
        if (blob) {
          return { blob, width: captureWidth, height: captureHeight };
        }
      } catch {
        // fallback below
      }
    }
    console.warn('toBlob falhou, utilizando fallback html2canvas:', errWithFonts);
    const canvas = await renderElementViaHtml2Canvas(element, captureWidth, captureHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Falha ao converter canvas em PNG'));
        },
        'image/png',
        1.0
      );
    });
    return { blob, width: captureWidth, height: captureHeight };
  }
}

export async function captureEspelhoToPng(element: HTMLElement): Promise<EspelhoCaptureResult> {
  await waitForVisualSettlement();

  const { captureWidth, captureHeight, captureStyle } = getCaptureMetrics(element);
  const cachedCss = await resolveCachedFontEmbedCss(element);
  const fontOptions = cachedCss ? { fontEmbedCSS: cachedCss } : { skipFonts: true };

  try {
    const pngDataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: false,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: captureWidth * 2,
      canvasHeight: captureHeight * 2,
      style: captureStyle,
      ...fontOptions,
    });
    return { pngDataUrl, width: captureWidth, height: captureHeight };
  } catch (errWithFonts) {
    if (cachedCss) {
      try {
        const pngDataUrl = await toPng(element, {
          quality: 1.0,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: false,
          skipFonts: true,
          width: captureWidth,
          height: captureHeight,
          canvasWidth: captureWidth * 2,
          canvasHeight: captureHeight * 2,
          style: captureStyle,
        });
        return { pngDataUrl, width: captureWidth, height: captureHeight };
      } catch {
        // fallback below
      }
    }
    console.warn('toPng falhou, utilizando fallback html2canvas:', errWithFonts);
    const canvas = await renderElementViaHtml2Canvas(element, captureWidth, captureHeight);
    return {
      pngDataUrl: canvas.toDataURL('image/png'),
      width: captureWidth,
      height: captureHeight,
    };
  }
}

export async function convertPngDataUrlToJpg(pngDataUrl: string, quality = 0.96): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexto 2D indisponível'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Falha ao converter imagem para JPG'));
    img.src = pngDataUrl;
  });
}

function triggerDataUrlDownload(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  triggerDataUrlDownload(objectUrl, filename);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 10000);
}

export async function exportEspelhoToImage(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpg' = 'png',
  preCapturedBlob?: Blob | null
): Promise<void> {
  const blob =
    preCapturedBlob || (await captureEspelhoToBlob(element, { skipSettlementDelay: true })).blob;
  if (format === 'jpg') {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const jpgDataUrl = await convertPngDataUrlToJpg(objectUrl, 0.96);
      triggerDataUrlDownload(jpgDataUrl, filename);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else {
    triggerBlobDownload(blob, filename);
  }
}

export async function copyEspelhoImageToClipboard(element: HTMLElement): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false;
  }

  const blobPromise = captureEspelhoToBlob(element, { skipSettlementDelay: true }).then((res) => res.blob);

  try {
    // Passa a Promise<Blob> diretamente para preservar a ativação do usuário durante a captura
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blobPromise }),
    ]);
    return true;
  } catch {
    const blob = await blobPromise;
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
    return true;
  }
}

export async function exportEspelhoToPdf(element: HTMLElement, filename: string): Promise<void> {
  const { pngDataUrl, width, height } = await runWithPdfThemeExport(async () => {
    await waitForVisualSettlement();
    return captureEspelhoToPng(element);
  });

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  const imgWidthMm = width * 0.264583;
  const imgHeightMm = height * 0.264583;
  const scale = Math.min(availableWidth / imgWidthMm, availableHeight / imgHeightMm);

  const renderWidth = imgWidthMm * scale;
  const renderHeight = imgHeightMm * scale;
  const posX = (pageWidth - renderWidth) / 2;
  const posY = (pageHeight - renderHeight) / 2;

  pdf.addImage(pngDataUrl, 'PNG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
  pdf.save(filename);
}
