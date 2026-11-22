import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Eye,
  FileImage,
  FileText,
  Minimize2,
  Move,
  RefreshCw,
  RotateCw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useFenixTheme } from '../../utils/themeService';
import { FloorplanTextToken } from '../../utils/floorplanOcrEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LoadedFloorplanAsset {
  fileName: string;
  fileType: string;
  previewDataUrl: string;
  pageCount: number;
  currentPage: number;
  vectorTextTokens?: FloorplanTextToken[];
}

interface FloorplanViewerProps {
  asset: LoadedFloorplanAsset | null;
  onAssetLoaded: (asset: LoadedFloorplanAsset) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5.0;

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

function isAcceptedFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (
    mime === 'application/pdf' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png'
  ) {
    return true;
  }
  const lowerName = (file.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function getNormalizedFileKind(file: File): 'pdf' | 'jpeg' | 'png' {
  const mime = (file.type || '').toLowerCase();
  const lowerName = (file.name || '').toLowerCase();
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf';
  if (mime === 'image/png' || lowerName.endsWith('.png')) return 'png';
  return 'jpeg';
}

function buildClipboardFilename(mimeType: string, existingName?: string): string {
  const trimmed = (existingName || '').trim();
  if (trimmed && trimmed.toLowerCase() !== 'image.png' && trimmed.toLowerCase() !== 'image.jpg') {
    return trimmed;
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
  const ext =
    mimeType === 'application/pdf'
      ? 'pdf'
      : mimeType === 'image/jpeg' || mimeType === 'image/jpg'
        ? 'jpg'
        : 'png';
  return `Planta_Colada_${stamp}.${ext}`;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error('Não foi possível ler os dados da imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo da planta.'));
    reader.readAsDataURL(blob);
  });
}

async function renderImageFileToAsset(file: File): Promise<LoadedFloorplanAsset> {
  const previewDataUrl = await readBlobAsDataUrl(file);

  // Valida integridade da imagem sem alterar resolução, qualidade ou proporção original
  await new Promise<void>((resolve, reject) => {
    const imageEl = new Image();
    imageEl.onload = () => resolve();
    imageEl.onerror = () =>
      reject(new Error('Não foi possível abrir a imagem selecionada ou colada.'));
    imageEl.src = previewDataUrl;
  });

  const preferred = getNormalizedFileKind(file) === 'png' ? 'image/png' : 'image/jpeg';

  return {
    fileName: file.name || buildClipboardFilename(preferred),
    fileType: file.type || preferred,
    previewDataUrl,
    pageCount: 1,
    currentPage: 1,
  };
}

async function renderPdfBytesToAsset(
  pdfBytes: ArrayBuffer,
  fileName: string,
  pageNumber: number
): Promise<LoadedFloorplanAsset> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages || 1;
  const safePage = Math.max(1, Math.min(pageNumber, pageCount));
  const page = await pdfDoc.getPage(safePage);

  const baseViewport = page.getViewport({ scale: 1 });
  const maxSide = Math.max(baseViewport.width, baseViewport.height) || 1000;
  const targetScale = Math.min(3.0, Math.max(1.5, 2400 / maxSide));
  const viewport = page.getViewport({ scale: targetScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Falha ao renderizar página do PDF.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  // Extrai textos vetoriais e coordenadas reais do PDF (quando gerados por AutoCAD/Revit/etc.)
  const vectorTextTokens: FloorplanTextToken[] = [];
  try {
    const textContent = await page.getTextContent();
    const pageW = Math.max(1, viewport.width);
    const pageH = Math.max(1, viewport.height);
    for (const rawItem of textContent.items as any[]) {
      const str = String(rawItem?.str || '').trim();
      if (!str || !Array.isArray(rawItem?.transform)) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, rawItem.transform);
      const fontHeight = Math.max(6, Math.hypot(tx[2], tx[3]) || (rawItem.height || 10) * targetScale);
      const itemWidth = Math.max(4, (rawItem.width || str.length * 5) * targetScale);
      const isVertical = Math.abs(tx[1]) > Math.abs(tx[0]) * 1.4;
      const boxW = isVertical ? fontHeight : itemWidth;
      const boxH = isVertical ? itemWidth : fontHeight;
      const xPos = Math.max(0, Math.min(1, tx[4] / pageW));
      const yPos = Math.max(0, Math.min(1, (tx[5] - boxH) / pageH));
      vectorTextTokens.push({
        text: str,
        x: xPos,
        y: yPos,
        width: Math.min(1, boxW / pageW),
        height: Math.min(1, boxH / pageH),
        confidence: 96,
        isVertical,
        source: 'pdf_vector',
      });
    }
  } catch {
    // PDF sem camada de texto ou protegido -> OCR fará a leitura normalmente
  }

  const previewDataUrl = canvas.toDataURL('image/png');

  return {
    fileName,
    fileType: 'application/pdf',
    previewDataUrl,
    pageCount,
    currentPage: safePage,
    vectorTextTokens,
  };
}

function extractInlineImageFromHtml(html: string): File | null {
  if (!html) return null;
  const match = html.match(/src=["'](data:image\/(png|jpeg|jpg);base64,[^"']+)["']/i);
  if (!match?.[1]) return null;
  try {
    const dataUrl = match[1];
    const [header, base64] = dataUrl.split(',');
    if (!header || !base64) return null;
    const mimeMatch = header.match(/data:(image\/(?:png|jpeg|jpg))/i);
    const mimeType = (mimeMatch?.[1] || 'image/png').toLowerCase();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    return new File([bytes], buildClipboardFilename(normalizedMime), {
      type: normalizedMime,
    });
  } catch {
    return null;
  }
}

function extractSupportedFileFromDataTransfer(dataTransfer: DataTransfer | null): {
  file: File | null;
  hasUnsupportedContent: boolean;
} {
  if (!dataTransfer) return { file: null, hasUnsupportedContent: false };

  let sawAnyContent = false;

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    sawAnyContent = true;
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const candidate = dataTransfer.files[i];
      if (candidate && isAcceptedFile(candidate)) {
        const mime = (candidate.type || '').toLowerCase();
        const fileName = buildClipboardFilename(mime, candidate.name);
        if (fileName !== candidate.name) {
          return {
            file: new File([candidate], fileName, { type: candidate.type }),
            hasUnsupportedContent: false,
          };
        }
        return { file: candidate, hasUnsupportedContent: false };
      }
    }
  }

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    sawAnyContent = true;
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const candidate = item.getAsFile();
        if (candidate && isAcceptedFile(candidate)) {
          const mime = (candidate.type || item.type || '').toLowerCase();
          const fileName = buildClipboardFilename(mime, candidate.name);
          const normalized =
            fileName !== candidate.name
              ? new File([candidate], fileName, { type: candidate.type || mime })
              : candidate;
          return { file: normalized, hasUnsupportedContent: false };
        }
      }
    }
  }

  const htmlPayload = dataTransfer.getData('text/html');
  if (htmlPayload) {
    sawAnyContent = true;
    const inlineImage = extractInlineImageFromHtml(htmlPayload);
    if (inlineImage) {
      return { file: inlineImage, hasUnsupportedContent: false };
    }
  }

  const textPayload = dataTransfer.getData('text/plain');
  if (textPayload && textPayload.trim()) {
    sawAnyContent = true;
  }

  return { file: null, hasUnsupportedContent: sawAnyContent };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export const FloorplanViewer: React.FC<FloorplanViewerProps> = ({
  asset,
  onAssetLoaded,
  onError,
  disabled = false,
}) => {
  const { theme } = useFenixTheme('crm');
  const crm = theme.crm;

  const viewerRootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePdfBytesRef = useRef<{ fileName: string; bytes: ArrayBuffer } | null>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isRenderingFile, setIsRenderingFile] = useState(false);
  const [isViewerFocused, setIsViewerFocused] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null
  );

  const resetTransform = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  const handleProcessFile = useCallback(
    async (file: File) => {
      if (disabled) return;
      if (!isAcceptedFile(file)) {
        onError('Formato inválido. Utilize ou cole arquivos PDF, JPG, JPEG ou PNG.');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        onError('Arquivo muito grande (máximo 25 MB). Reduza ou exporte novamente a planta.');
        return;
      }

      setIsRenderingFile(true);
      onError('');
      try {
        if (getNormalizedFileKind(file) === 'pdf') {
          const buffer = await file.arrayBuffer();
          const normalizedName = file.name || buildClipboardFilename('application/pdf');
          activePdfBytesRef.current = { fileName: normalizedName, bytes: buffer };
          const pdfAsset = await renderPdfBytesToAsset(buffer, normalizedName, 1);
          resetTransform();
          onAssetLoaded(pdfAsset);
        } else {
          activePdfBytesRef.current = null;
          const imgAsset = await renderImageFileToAsset(file);
          resetTransform();
          onAssetLoaded(imgAsset);
        }
      } catch (err: any) {
        onError(
          err?.message ||
            'Não foi possível carregar este arquivo de planta. Verifique se o documento não está protegido por senha ou corrompido.'
        );
      } finally {
        setIsRenderingFile(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [disabled, onAssetLoaded, onError, resetTransform]
  );

  const handleClipboardData = useCallback(
    (dataTransfer: DataTransfer | null, triggeredInsideViewer: boolean): boolean => {
      if (disabled || isRenderingFile) return false;
      const { file, hasUnsupportedContent } = extractSupportedFileFromDataTransfer(dataTransfer);
      if (file) {
        void handleProcessFile(file);
        return true;
      }
      if (triggeredInsideViewer && hasUnsupportedContent) {
        onError(
          'O conteúdo colado não é compatível ou não pôde ser acessado pelo navegador. No WhatsApp Web, clique com o botão direito na imagem e escolha "Copiar imagem" (PNG/JPG), ou selecione PDFs e arquivos manualmente pelo computador.'
        );
        return true;
      }
      return false;
    },
    [disabled, handleProcessFile, isRenderingFile, onError]
  );

  const handlePasteFromClipboardApi = useCallback(async () => {
    if (disabled || isRenderingFile) return;
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      onError(
        'Seu navegador não permite leitura direta pelo botão. Clique na área da planta e pressione Ctrl + V para colar, ou selecione o arquivo manualmente.'
      );
      return;
    }

    onError('');
    try {
      const clipboardItems = await navigator.clipboard.read();
      const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

      for (const item of clipboardItems) {
        const matchedType = acceptedTypes.find((t) => item.types.includes(t));
        if (matchedType) {
          const blob = await item.getType(matchedType);
          const normalizedMime = matchedType === 'image/jpg' ? 'image/jpeg' : matchedType;
          const file = new File([blob], buildClipboardFilename(normalizedMime), {
            type: normalizedMime,
          });
          await handleProcessFile(file);
          return;
        }
      }

      onError(
        'Nenhum arquivo PNG, JPG ou PDF compatível encontrado na área de transferência. No WhatsApp Web, copie a imagem (Ctrl+C ou "Copiar imagem") ou selecione o arquivo pelo computador.'
      );
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        onError(
          'Permissão de leitura da área de transferência bloqueada pelo navegador. Clique nesta área e use Ctrl + V para colar diretamente.'
        );
      } else {
        onError(
          'Não foi possível acessar o conteúdo copiado. Use Ctrl + V dentro da área da planta ou selecione o arquivo manualmente.'
        );
      }
    }
  }, [disabled, handleProcessFile, isRenderingFile, onError]);

  // Captura Ctrl + V quando o usuário foca ou interage na área da planta (ou fora de inputs de texto quando há imagem/PDF no clipboard)
  useEffect(() => {
    const onGlobalPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const target = e.target;
      const insideViewer =
        target instanceof Node && Boolean(viewerRootRef.current?.contains(target));

      if (!insideViewer && isEditableElement(target)) {
        return;
      }

      const { file, hasUnsupportedContent } = extractSupportedFileFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        void handleProcessFile(file);
        return;
      }

      if (insideViewer && hasUnsupportedContent) {
        e.preventDefault();
        onError(
          'O conteúdo colado não é compatível (aceita PNG, JPG/JPEG ou PDF acessível pelo navegador). Copie a imagem no WhatsApp ou selecione o arquivo manualmente.'
        );
      }
    };

    window.addEventListener('paste', onGlobalPaste);
    return () => window.removeEventListener('paste', onGlobalPaste);
  }, [disabled, handleProcessFile, onError]);

  const handleChangePdfPage = async (nextPage: number) => {
    if (!activePdfBytesRef.current || !asset || isRenderingFile) return;
    if (nextPage < 1 || nextPage > asset.pageCount) return;

    setIsRenderingFile(true);
    try {
      const updatedAsset = await renderPdfBytesToAsset(
        activePdfBytesRef.current.bytes,
        activePdfBytesRef.current.fileName,
        nextPage
      );
      resetTransform();
      onAssetLoaded(updatedAsset);
    } catch (err: any) {
      onError(err?.message || 'Erro ao trocar página do PDF.');
    } finally {
      setIsRenderingFile(false);
    }
  };

  const handleZoomStep = (delta: number) => {
    setZoom((prev) =>
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((prev + delta) * 100) / 100))
    );
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    viewerRootRef.current?.focus();
    if (!asset?.previewDataUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({
      x: panStartRef.current.originX + dx,
      y: panStartRef.current.originY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!asset?.previewDataUrl) return;
    if (e.ctrlKey || e.metaKey || isFullscreen) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      handleZoomStep(delta);
    }
  };

  const triggerFilePicker = () => {
    if (disabled || isRenderingFile) return;
    fileInputRef.current?.click();
  };

  const renderInteractiveStage = (fullscreenMode: boolean) => (
    <div
      className={`relative overflow-hidden select-none touch-none flex-1 min-h-0 w-full h-full ${
        fullscreenMode ? '' : 'min-h-[300px]'
      } ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        backgroundColor: crm.panelSubtleBg,
        backgroundImage: 'radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheelZoom}
    >
      {asset?.previewDataUrl ? (
        <div className="w-full h-full flex items-center justify-center p-4">
          <img
            src={asset.previewDataUrl}
            alt={`Planta baixa: ${asset.fileName}`}
            draggable={false}
            className="max-w-full max-h-full w-auto h-auto object-contain shadow-sm rounded-md transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
          <FileImage className="w-10 h-10 mb-2 opacity-60" />
          <p className="text-sm font-medium text-slate-600">
            Visualização indisponível neste rascunho salvo.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Cole uma nova planta com Ctrl + V ou clique em "Substituir arquivo".
          </p>
        </div>
      )}

      {asset?.previewDataUrl && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2"
        >
          <div
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 backdrop-blur-xs border"
            style={{
              backgroundColor: crm.cardBg,
              borderColor: crm.cardBorder,
              color: crm.highlightText,
            }}
          >
            <Move className="w-3.5 h-3.5" style={{ color: crm.primary }} />
            <span>Arraste para movimentar · Zoom: {Math.round(zoom * 100)}%</span>
          </div>

          {!fullscreenMode && (
            <div
              className="hidden sm:flex px-2.5 py-1 rounded-lg text-[11px] font-medium items-center gap-1.5 backdrop-blur-xs border text-slate-500"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
              }}
            >
              <ClipboardPaste className="w-3 h-3" style={{ color: crm.primary }} />
              <span>Ctrl + V para substituir por outra planta</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderToolbar = (fullscreenMode: boolean) => (
    <div
      className="px-3.5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2"
      style={{
        backgroundColor: crm.cardTintBg,
        borderColor: crm.dividerColor,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            backgroundColor: crm.indicatorBg,
            color: crm.indicatorText,
          }}
        >
          {asset?.fileType === 'application/pdf' ? (
            <FileText className="w-4 h-4" />
          ) : (
            <FileImage className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <p
            className="text-xs font-bold truncate max-w-[140px] sm:max-w-[200px]"
            style={{ color: crm.highlightText }}
            title={asset?.fileName}
          >
            {asset?.fileName}
          </p>
          <p className="text-[11px] text-slate-500">
            {asset?.pageCount && asset.pageCount > 1
              ? `PDF · Página ${asset.currentPage} de ${asset.pageCount}`
              : asset?.fileType === 'application/pdf'
                ? 'Documento PDF'
                : 'Imagem de Planta'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {asset && asset.pageCount > 1 && activePdfBytesRef.current && (
          <div
            className="inline-flex items-center rounded-lg border mr-0.5"
            style={{
              backgroundColor: crm.cardBg,
              borderColor: crm.cardBorder,
            }}
          >
            <button
              type="button"
              onClick={() => handleChangePdfPage(asset.currentPage - 1)}
              disabled={asset.currentPage <= 1 || isRenderingFile}
              className="p-1.5 disabled:opacity-40 cursor-pointer"
              style={{ color: crm.highlightText }}
              title="Página anterior do PDF"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1.5 text-xs font-semibold tabular-nums text-slate-600">
              {asset.currentPage}/{asset.pageCount}
            </span>
            <button
              type="button"
              onClick={() => handleChangePdfPage(asset.currentPage + 1)}
              disabled={asset.currentPage >= asset.pageCount || isRenderingFile}
              className="p-1.5 disabled:opacity-40 cursor-pointer"
              style={{ color: crm.highlightText }}
              title="Próxima página do PDF"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => handleZoomStep(-0.25)}
          disabled={zoom <= MIN_ZOOM}
          className="h-8 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.highlightText,
          }}
          title="Reduzir zoom"
        >
          <ZoomOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reduzir</span>
        </button>

        <span
          className="h-8 px-2 rounded-lg border text-xs font-bold tabular-nums flex items-center"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.primary,
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoomStep(0.25)}
          disabled={zoom >= MAX_ZOOM}
          className="h-8 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.highlightText,
          }}
          title="Ampliar zoom"
        >
          <ZoomIn className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ampliar</span>
        </button>

        <button
          type="button"
          onClick={handleRotate}
          className="h-8 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.highlightText,
          }}
          title="Girar planta 90°"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={resetTransform}
          className="h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.highlightText,
          }}
          title="Ajustar à tela e centralizar"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Ajustar à tela</span>
        </button>

        <button
          type="button"
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
            color: crm.primary,
          }}
          title={fullscreenMode ? 'Fechar visualização detalhada' : 'Visualizar detalhes em tela cheia'}
        >
          {fullscreenMode ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Visualizar detalhes</span>
            </>
          )}
        </button>

        {!fullscreenMode && (
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={disabled || isRenderingFile}
            className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-white disabled:opacity-50"
            style={{ backgroundColor: crm.primary }}
            title="Substituir arquivo da planta"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Substituir arquivo</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={viewerRootRef}
      tabIndex={0}
      onFocus={() => setIsViewerFocused(true)}
      onBlur={() => setIsViewerFocused(false)}
      onPaste={(e) => {
        if (handleClipboardData(e.clipboardData, true)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="flex flex-col flex-1 min-h-0 h-full outline-none rounded-2xl"
      style={
        isViewerFocused
          ? { boxShadow: `0 0 0 2px ${crm.cardTintBorder}` }
          : undefined
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) void handleProcessFile(selected);
        }}
      />

      {!asset ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) void handleProcessFile(dropped);
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            triggerFilePicker();
          }}
          className="flex-1 min-h-[340px] lg:min-h-0 h-full rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3.5"
          style={{
            backgroundColor: isDraggingOver ? crm.cardTintBg : crm.panelSubtleBg,
            borderColor: isDraggingOver ? crm.primary : crm.cardTintBorder,
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs"
            style={{
              backgroundColor: crm.indicatorBg,
              color: crm.indicatorText,
            }}
          >
            {isRenderingFile ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5 max-w-md">
            <p className="text-sm sm:text-base font-bold" style={{ color: crm.highlightText }}>
              {isRenderingFile
                ? 'Carregando planta do imóvel...'
                : 'Cole sua planta aqui com Ctrl + V ou clique para selecionar um arquivo'}
            </p>
            <p className="text-xs text-slate-500">
              Copie imagens (PNG ou JPG/JPEG) diretamente do WhatsApp ou importe arquivos PDF, JPG e PNG do computador.
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={triggerFilePicker}
              disabled={disabled || isRenderingFile}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-bold text-white shadow-2xs cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: crm.primary }}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Selecionar Arquivo</span>
            </button>

            <button
              type="button"
              onClick={() => void handlePasteFromClipboardApi()}
              disabled={disabled || isRenderingFile}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
                color: crm.highlightText,
              }}
              title="Colar imagem ou arquivo copiado da área de transferência"
            >
              <ClipboardPaste className="w-3.5 h-3.5" style={{ color: crm.primary }} />
              <span>Colar (Ctrl + V)</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 min-h-[360px] lg:min-h-0 h-full rounded-2xl border overflow-hidden shadow-2xs flex flex-col"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) void handleProcessFile(dropped);
          }}
        >
          <div className="shrink-0">{renderToolbar(false)}</div>
          <div className="relative flex-1 min-h-0 flex flex-col">
            {renderInteractiveStage(false)}
            {isRenderingFile && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-10">
                <RefreshCw className="w-7 h-7 animate-spin" style={{ color: crm.primary }} />
                <p className="text-xs font-bold" style={{ color: crm.highlightText }}>
                  Carregando visualização da planta...
                </p>
              </div>
            )}
            {isDraggingOver && (
              <div
                className="absolute inset-0 backdrop-blur-xs flex items-center justify-center border-2 border-dashed rounded-b-2xl z-10"
                style={{
                  backgroundColor: crm.cardTintBg,
                  borderColor: crm.primary,
                }}
              >
                <p className="text-sm font-bold" style={{ color: crm.primary }}>
                  Solte o novo arquivo para substituir a planta atual
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Visualização Detalhada */}
      {isFullscreen && asset && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center">
          <div
            className="w-full h-full max-w-7xl max-h-[94vh] rounded-2xl border overflow-hidden flex flex-col shadow-2xl"
            style={{
              backgroundColor: crm.cardBg,
              borderColor: crm.cardBorder,
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: crm.dividerColor, backgroundColor: crm.cardBg }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: crm.highlightText }}
              >
                Visualizar Detalhes — Planta do Imóvel
              </span>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-600 cursor-pointer"
                title="Fechar visualização detalhada (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderToolbar(true)}
            {renderInteractiveStage(true)}
          </div>
        </div>
      )}
    </div>
  );
};
