import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CornerDownRight,
  Crosshair,
  FileImage,
  Hand,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Shapes,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useFenixTheme } from '../../utils/themeService';
import {
  FloorplanRoom,
  formatPtBrNumber,
  formatQuickInputNumber,
  parsePtBrDimension,
} from '../../utils/floorplanCalculator';
import {
  FloorplanTraceGeometryData,
  IrregularDiagonalSpec,
  IrregularGeometryMethod,
  IrregularRoomGeometryData,
  IrregularTurnDirection,
  IrregularWallSegment,
  TracedNormalizedPoint,
  convertFloorplanTraceToManualSegments,
  createDefaultIrregularSegments,
  solveIrregularRoomGeometry,
  syncDiagonalsForSegmentCount,
} from '../../utils/irregularRoomGeometry';
import { LoadedFloorplanAsset } from './FloorplanViewer';
import { IrregularRoomPreviewSvg } from './IrregularRoomPreviewSvg';

interface RoomGeometryModalProps {
  isOpen: boolean;
  editingRoom: FloorplanRoom | null;
  floorplanAsset: LoadedFloorplanAsset | null;
  onClose: () => void;
  onSave: (savedRoom: FloorplanRoom) => void;
  onRevertToRectangular?: (roomId: string) => void;
}

interface SegmentInputDraft {
  length: string;
  angle: string;
}

type EditorTabMode = 'floorplan' | 'manual';
type CanvasToolMode = 'trace' | 'pan';

const TURN_OPTIONS: { value: IrregularTurnDirection; label: string }[] = [
  { value: 'pending', label: 'Selecione a curva...' },
  { value: 'right_90', label: '90° Direita (↪)' },
  { value: 'left_90', label: '90° Esquerda (↩)' },
  { value: 'right_angle', label: 'Outro ângulo — Direita (°)' },
  { value: 'left_angle', label: 'Outro ângulo — Esquerda (°)' },
];

const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 6.0;

export const RoomGeometryModal: React.FC<RoomGeometryModalProps> = ({
  isOpen,
  editingRoom,
  floorplanAsset,
  onClose,
  onSave,
  onRevertToRectangular,
}) => {
  const { theme } = useFenixTheme('crm');
  const crm = theme.crm;

  const hasFloorplanImage = Boolean(floorplanAsset?.previewDataUrl);

  // Modo principal: 'floorplan' (exibir planta + COPIAR DA PLANTA) ou 'manual' (medidas manuais)
  const [editorTab, setEditorTab] = useState<EditorTabMode>('floorplan');
  const [isCopyToolActive, setIsCopyToolActive] = useState<boolean>(false);
  const [canvasToolMode, setCanvasToolMode] = useState<CanvasToolMode>('trace');

  // Estado do contorno traçado diretamente na planta
  const [tracedPoints, setTracedPoints] = useState<TracedNormalizedPoint[]>([]);
  const [isContourClosed, setIsContourClosed] = useState<boolean>(false);
  const [referenceEdgeIndex, setReferenceEdgeIndex] = useState<number>(0);
  const [referenceLengthInput, setReferenceLengthInput] = useState<string>('');
  const [referenceLengthMeters, setReferenceLengthMeters] = useState<number | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [hoverNormPoint, setHoverNormPoint] = useState<{ x: number; y: number } | null>(null);

  // Estado visual do palco da planta (zoom, pan, dimensões naturais da imagem)
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 440,
  });
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 1200, h: 900 });
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Refs de interação de ponteiro (pan, arrastar vértice, clique)
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const pointerSessionRef = useRef<{
    kind: 'stage_trace' | 'stage_pan' | 'vertex_drag' | 'vertex_first_candidate';
    pointIndex?: number;
    startClientX: number;
    startClientY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);

  // Estado do modo manual (Curvas / Ângulos ou Diagonais)
  const [manualMethod, setManualMethod] = useState<'angles' | 'diagonals'>('angles');
  const [segments, setSegments] = useState<IrregularWallSegment[]>(() =>
    createDefaultIrregularSegments(4)
  );
  const [segmentDrafts, setSegmentDrafts] = useState<Record<string, SegmentInputDraft>>({});
  const [diagonals, setDiagonals] = useState<IrregularDiagonalSpec[]>([]);
  const [diagonalDrafts, setDiagonalDrafts] = useState<Record<string, string>>({});

  // Carrega dados iniciais quando o modal abre para um ambiente
  useEffect(() => {
    if (!isOpen || !editingRoom) return;

    const existingData = editingRoom.irregularData;

    // Reseta zoom e pan ao abrir
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setHoverNormPoint(null);
    setSelectedPointIndex(null);

    if (
      existingData?.method === 'floorplan_trace' &&
      existingData.floorplanTrace &&
      Array.isArray(existingData.floorplanTrace.points)
    ) {
      const tr = existingData.floorplanTrace;
      setEditorTab(hasFloorplanImage ? 'floorplan' : 'manual');
      setIsCopyToolActive(true);
      setCanvasToolMode(tr.isClosed ? 'pan' : 'trace');
      setTracedPoints(tr.points.map((p) => ({ ...p })));
      setIsContourClosed(Boolean(tr.isClosed));
      setReferenceEdgeIndex(
        typeof tr.referenceEdgeIndex === 'number' && tr.referenceEdgeIndex >= 0
          ? tr.referenceEdgeIndex
          : 0
      );
      setReferenceLengthMeters(
        typeof tr.referenceLengthMeters === 'number' && tr.referenceLengthMeters > 0
          ? tr.referenceLengthMeters
          : null
      );
      setReferenceLengthInput(
        typeof tr.referenceLengthMeters === 'number' && tr.referenceLengthMeters > 0
          ? formatQuickInputNumber(tr.referenceLengthMeters)
          : ''
      );
    } else {
      setTracedPoints([]);
      setIsContourClosed(false);
      setReferenceEdgeIndex(0);
      setReferenceLengthInput('');
      setReferenceLengthMeters(null);
      if (
        existingData &&
        (existingData.method === 'angles' || existingData.method === 'diagonals') &&
        Array.isArray(existingData.segments) &&
        existingData.segments.length >= 3 &&
        existingData.segments.some((s) => s.lengthMeters !== null && s.lengthMeters > 0)
      ) {
        setEditorTab('manual');
        setIsCopyToolActive(false);
      } else {
        setEditorTab(hasFloorplanImage ? 'floorplan' : 'manual');
        setIsCopyToolActive(false);
        setCanvasToolMode('trace');
      }
    }

    if (
      existingData &&
      Array.isArray(existingData.segments) &&
      existingData.segments.length >= 3
    ) {
      const loadedMethod = existingData.method === 'diagonals' ? 'diagonals' : 'angles';
      const loadedSegments = existingData.segments.map((s) => ({ ...s }));
      const loadedDiags = syncDiagonalsForSegmentCount(
        loadedSegments.length,
        existingData.diagonals || []
      );

      const nextSegDrafts: Record<string, SegmentInputDraft> = {};
      for (const s of loadedSegments) {
        nextSegDrafts[s.id] = {
          length: s.lengthMeters !== null ? formatQuickInputNumber(s.lengthMeters) : '',
          angle:
            typeof s.angleDegrees === 'number' && s.angleDegrees > 0
              ? String(s.angleDegrees).replace('.', ',')
              : '',
        };
      }

      const nextDiagDrafts: Record<string, string> = {};
      for (const d of loadedDiags) {
        nextDiagDrafts[d.id] =
          d.lengthMeters !== null ? formatQuickInputNumber(d.lengthMeters) : '';
      }

      setManualMethod(loadedMethod);
      setSegments(loadedSegments);
      setSegmentDrafts(nextSegDrafts);
      setDiagonals(loadedDiags);
      setDiagonalDrafts(nextDiagDrafts);
    } else {
      const defaults = createDefaultIrregularSegments(4);
      setManualMethod('angles');
      setSegments(defaults);
      setSegmentDrafts({});
      setDiagonals(syncDiagonalsForSegmentCount(defaults.length, []));
      setDiagonalDrafts({});
    }
  }, [isOpen, editingRoom, hasFloorplanImage]);

  // Observa tamanho do container da planta para preservar proporção exata da imagem
  useEffect(() => {
    if (!isOpen || editorTab !== 'floorplan') return;
    const el = stageContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, editorTab, hasFloorplanImage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const floorplanTraceData: FloorplanTraceGeometryData = useMemo(
    () => ({
      points: tracedPoints,
      imageWidth: imageDims.w,
      imageHeight: imageDims.h,
      isClosed: isContourClosed,
      referenceEdgeIndex,
      referenceLengthMeters,
    }),
    [
      tracedPoints,
      imageDims.w,
      imageDims.h,
      isContourClosed,
      referenceEdgeIndex,
      referenceLengthMeters,
    ]
  );

  const activeMethod: IrregularGeometryMethod =
    editorTab === 'floorplan' ? 'floorplan_trace' : manualMethod;

  const irregularData: IrregularRoomGeometryData = useMemo(
    () => ({
      method: activeMethod,
      segments,
      diagonals,
      ...(activeMethod === 'floorplan_trace' ? { floorplanTrace: floorplanTraceData } : {}),
    }),
    [activeMethod, segments, diagonals, floorplanTraceData]
  );

  const solvedGeometry = useMemo(() => {
    return solveIrregularRoomGeometry(irregularData);
  }, [irregularData]);

  // Dimensões base da imagem ajustadas ao stage preservando aspect ratio original
  const fittedImageBox = useMemo(() => {
    const pad = 20;
    const availW = Math.max(120, stageSize.width - pad * 2);
    const availH = Math.max(120, stageSize.height - pad * 2);
    const imgW = Math.max(1, imageDims.w);
    const imgH = Math.max(1, imageDims.h);
    const scale = Math.min(availW / imgW, availH / imgH);
    return {
      width: Math.max(1, imgW * scale),
      height: Math.max(1, imgH * scale),
    };
  }, [stageSize.width, stageSize.height, imageDims.w, imageDims.h]);

  const svgUnitsPerScreenPx = useMemo(() => {
    const renderedW = Math.max(1, fittedImageBox.width * zoom);
    return imageDims.w / renderedW;
  }, [fittedImageBox.width, zoom, imageDims.w]);

  const clientToNormalizedImagePoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const box = imageBoxRef.current;
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return { x, y };
    },
    []
  );

  const isNearFirstVertexOnScreen = useCallback(
    (normPt: { x: number; y: number }): boolean => {
      if (tracedPoints.length < 3 || isContourClosed) return false;
      const first = tracedPoints[0];
      const box = imageBoxRef.current;
      if (!box) return false;
      const rect = box.getBoundingClientRect();
      const dx = (normPt.x - first.x) * rect.width;
      const dy = (normPt.y - first.y) * rect.height;
      return Math.hypot(dx, dy) <= 16;
    },
    [tracedPoints, isContourClosed]
  );

  const tracedEdgeDescriptors = useMemo(() => {
    const count = tracedPoints.length;
    if (count < 2) return [];
    const totalEdges = isContourClosed ? count : count - 1;
    return Array.from({ length: totalEdges }, (_, idx) => {
      const fromV = idx + 1;
      const toV = idx + 1 === count ? 1 : idx + 2;
      const solvedEdge = solvedGeometry.edges[idx];
      return {
        index: idx,
        fromV,
        toV,
        label: `Parede ${idx + 1} (V${fromV} → V${toV})`,
        lengthMeters: solvedEdge?.lengthMeters ?? null,
      };
    });
  }, [tracedPoints.length, isContourClosed, solvedGeometry.edges]);

  const handleZoomStep = useCallback((delta: number) => {
    setZoom((prev) =>
      Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Math.round((prev + delta) * 100) / 100))
    );
  }, []);

  useEffect(() => {
    if (!isOpen || editorTab !== 'floorplan' || !hasFloorplanImage) return;
    const el = stageContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.2 : -0.2;
      handleZoomStep(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen, editorTab, hasFloorplanImage, handleZoomStep]);

  if (!isOpen || !editingRoom) return null;

  // =========================================================================
  // CONTROLES DE ZOOM, PAN E COPIAR DA PLANTA
  // =========================================================================
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleActivateCopyFromFloorplan = () => {
    if (!hasFloorplanImage) return;
    setEditorTab('floorplan');
    setIsCopyToolActive(true);
    setCanvasToolMode(isContourClosed ? 'pan' : 'trace');
  };

  const handleUndoLastPoint = () => {
    if (isContourClosed) {
      // Reabre o contorno para continuar ajustando a partir do último ponto
      setIsContourClosed(false);
      setCanvasToolMode('trace');
      return;
    }
    setTracedPoints((prev) => {
      const next = prev.slice(0, -1);
      if (referenceEdgeIndex >= Math.max(1, next.length)) {
        setReferenceEdgeIndex(0);
      }
      return next;
    });
    setSelectedPointIndex(null);
  };

  const handleClearContour = () => {
    setTracedPoints([]);
    setIsContourClosed(false);
    setReferenceEdgeIndex(0);
    setReferenceLengthInput('');
    setReferenceLengthMeters(null);
    setSelectedPointIndex(null);
    setHoverNormPoint(null);
    setIsCopyToolActive(true);
    setCanvasToolMode('trace');
  };

  const handleFinalizeContour = () => {
    if (tracedPoints.length < 3) return;
    setIsContourClosed(true);
    setHoverNormPoint(null);
    setCanvasToolMode('pan');
    setTimeout(() => {
      referenceInputRef.current?.focus();
    }, 60);
  };

  const handleDeletePoint = (indexToRemove: number) => {
    if (isContourClosed && tracedPoints.length <= 3) return;
    setTracedPoints((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (next.length < 3) {
        setIsContourClosed(false);
      }
      setReferenceEdgeIndex((prevRef) =>
        Math.min(prevRef, Math.max(0, next.length - 1))
      );
      return next;
    });
    setSelectedPointIndex(null);
  };

  const handleInsertMidpoint = (edgeIndex: number, startDragging = false) => {
    if (tracedPoints.length < 2) return;
    const a = tracedPoints[edgeIndex];
    const b = tracedPoints[(edgeIndex + 1) % tracedPoints.length];
    if (!a || !b) return;
    const newPt: TracedNormalizedPoint = {
      id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
    const insertAt = edgeIndex + 1;
    setTracedPoints((prev) => [
      ...prev.slice(0, insertAt),
      newPt,
      ...prev.slice(insertAt),
    ]);
    if (referenceEdgeIndex > edgeIndex) {
      setReferenceEdgeIndex((prev) => prev + 1);
    }
    setSelectedPointIndex(insertAt);
    if (startDragging) {
      setDraggingPointIndex(insertAt);
      pointerSessionRef.current = {
        kind: 'vertex_drag',
        pointIndex: insertAt,
        startClientX: 0,
        startClientY: 0,
        originPanX: pan.x,
        originPanY: pan.y,
        moved: true,
      };
    }
  };

  const handleReferenceLengthChange = (raw: string) => {
    setReferenceLengthInput(raw);
    if (raw.trim() === '') {
      setReferenceLengthMeters(null);
      return;
    }
    const parsed = parsePtBrDimension(raw);
    setReferenceLengthMeters(parsed !== null && parsed > 0 ? parsed : null);
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasFloorplanImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const shouldPanOnly =
      e.button === 1 ||
      e.button === 2 ||
      !isCopyToolActive ||
      canvasToolMode === 'pan' ||
      isContourClosed;

    if (shouldPanOnly) {
      setIsPanning(true);
      pointerSessionRef.current = {
        kind: 'stage_pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        originPanX: pan.x,
        originPanY: pan.y,
        moved: false,
      };
      return;
    }

    pointerSessionRef.current = {
      kind: 'stage_trace',
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: pan.x,
      originPanY: pan.y,
      moved: false,
    };
  };

  const handleVertexPointerDown = (
    e: React.PointerEvent<SVGCircleElement>,
    idx: number
  ) => {
    e.stopPropagation();
    stageContainerRef.current?.setPointerCapture(e.pointerId);
    setSelectedPointIndex(idx);

    if (!isContourClosed && idx === 0 && tracedPoints.length >= 3 && isCopyToolActive) {
      pointerSessionRef.current = {
        kind: 'vertex_first_candidate',
        pointIndex: 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originPanX: pan.x,
        originPanY: pan.y,
        moved: false,
      };
      return;
    }

    setDraggingPointIndex(idx);
    pointerSessionRef.current = {
      kind: 'vertex_drag',
      pointIndex: idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: pan.x,
      originPanY: pan.y,
      moved: false,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;

    if (!session) {
      if (isCopyToolActive && !isContourClosed && canvasToolMode === 'trace') {
        const pt = clientToNormalizedImagePoint(e.clientX, e.clientY);
        setHoverNormPoint(pt);
      } else if (hoverNormPoint) {
        setHoverNormPoint(null);
      }
      return;
    }

    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;
    const dist = Math.hypot(dx, dy);

    if (session.kind === 'vertex_first_candidate') {
      if (dist >= 5) {
        session.kind = 'vertex_drag';
        session.moved = true;
        setDraggingPointIndex(0);
      }
      return;
    }

    if (session.kind === 'vertex_drag' && typeof session.pointIndex === 'number') {
      const pt = clientToNormalizedImagePoint(e.clientX, e.clientY);
      if (!pt) return;
      session.moved = true;
      const targetIdx = session.pointIndex;
      setTracedPoints((prev) =>
        prev.map((p, idx) => (idx === targetIdx ? { ...p, x: pt.x, y: pt.y } : p))
      );
      return;
    }

    if (session.kind === 'stage_pan' || (session.kind === 'stage_trace' && dist >= 5)) {
      session.moved = true;
      setIsPanning(true);
      setPan({
        x: session.originPanX + dx,
        y: session.originPanY + dy,
      });
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    pointerSessionRef.current = null;
    setDraggingPointIndex(null);
    setIsPanning(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (!session) return;

    if (session.kind === 'vertex_first_candidate' && !session.moved) {
      handleFinalizeContour();
      return;
    }

    if (session.kind === 'stage_trace' && !session.moved && e.button === 0) {
      const pt = clientToNormalizedImagePoint(e.clientX, e.clientY);
      if (!pt) return;

      if (isNearFirstVertexOnScreen(pt)) {
        handleFinalizeContour();
        return;
      }

      const nextPoint: TracedNormalizedPoint = {
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        x: pt.x,
        y: pt.y,
      };
      setTracedPoints((prev) => {
        const next = [...prev, nextPoint];
        setSelectedPointIndex(next.length - 1);
        return next;
      });
    }
  };

  const handleTransferTraceToManual = () => {
    const converted = convertFloorplanTraceToManualSegments(floorplanTraceData);
    if (converted.length < 3) return;

    const nextDrafts: Record<string, SegmentInputDraft> = {};
    for (const seg of converted) {
      nextDrafts[seg.id] = {
        length: seg.lengthMeters !== null ? formatQuickInputNumber(seg.lengthMeters) : '',
        angle:
          typeof seg.angleDegrees === 'number' && seg.angleDegrees > 0
            ? String(seg.angleDegrees).replace('.', ',')
            : '',
      };
    }

    setManualMethod('angles');
    setSegments(converted);
    setSegmentDrafts(nextDrafts);
    setDiagonals(syncDiagonalsForSegmentCount(converted.length, []));
    setDiagonalDrafts({});
    setEditorTab('manual');
  };

  // =========================================================================
  // CONTROLES DO MODO MANUAL (TRECHOS, ÂNGULOS E DIAGONAIS)
  // =========================================================================
  const updateSegmentsAndDiagonals = (nextSegs: IrregularWallSegment[]) => {
    setSegments(nextSegs);
    const syncedDiags = syncDiagonalsForSegmentCount(nextSegs.length, diagonals);
    setDiagonals(syncedDiags);
  };

  const handleAddSegment = () => {
    const newSeg: IrregularWallSegment = {
      id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      lengthMeters: null,
      turn: 'pending',
      angleDegrees: null,
    };
    updateSegmentsAndDiagonals([...segments, newSeg]);
  };

  const handleRemoveSegment = (id: string) => {
    if (segments.length <= 3) return;
    updateSegmentsAndDiagonals(segments.filter((s) => s.id !== id));
    setSegmentDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleMoveSegment = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= segments.length) return;
    const copy = [...segments];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    if (copy[0].turn !== 'pending') {
      copy[0] = { ...copy[0], turn: 'pending', angleDegrees: null };
    }
    updateSegmentsAndDiagonals(copy);
  };

  const handleSegmentLengthChange = (id: string, raw: string) => {
    const parsed = raw.trim() === '' ? null : parsePtBrDimension(raw);
    setSegmentDrafts((prev) => ({
      ...prev,
      [id]: {
        length: raw,
        angle: prev[id]?.angle ?? '',
      },
    }));
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, lengthMeters: parsed !== null && parsed > 0 ? parsed : null }
          : s
      )
    );
  };

  const handleSegmentTurnChange = (id: string, turn: IrregularTurnDirection) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              turn,
              angleDegrees:
                turn === 'right_angle' || turn === 'left_angle' ? s.angleDegrees ?? null : null,
            }
          : s
      )
    );
  };

  const handleSegmentAngleChange = (id: string, raw: string) => {
    const parsed = raw.trim() === '' ? null : parsePtBrDimension(raw);
    setSegmentDrafts((prev) => ({
      ...prev,
      [id]: {
        length: prev[id]?.length ?? '',
        angle: raw,
      },
    }));
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              angleDegrees: parsed !== null && parsed > 0 && parsed < 180 ? parsed : null,
            }
          : s
      )
    );
  };

  const handleApplyRight90ToPending = () => {
    setSegments((prev) =>
      prev.map((s, idx) =>
        idx > 0 && s.turn === 'pending' ? { ...s, turn: 'right_90', angleDegrees: null } : s
      )
    );
  };

  const handleDiagonalLengthChange = (diagId: string, raw: string) => {
    const parsed = raw.trim() === '' ? null : parsePtBrDimension(raw);
    setDiagonalDrafts((prev) => ({
      ...prev,
      [diagId]: raw,
    }));
    setDiagonals((prev) =>
      prev.map((d) =>
        d.id === diagId
          ? { ...d, lengthMeters: parsed !== null && parsed > 0 ? parsed : null }
          : d
      )
    );
  };

  const handleToggleDiagonalReflex = (diagId: string) => {
    setDiagonals((prev) =>
      prev.map((d) => (d.id === diagId ? { ...d, reflex: !d.reflex } : d))
    );
  };

  // =========================================================================
  // VALIDAÇÃO FINAL E SALVAMENTO
  // =========================================================================
  const canSave =
    solvedGeometry.isComplete &&
    solvedGeometry.areaSqm !== null &&
    solvedGeometry.areaSqm > 0 &&
    solvedGeometry.perimeterMeters > 0;

  const handleConfirmSave = () => {
    if (!canSave) return;

    if (editorTab === 'floorplan') {
      const derivedSegments = convertFloorplanTraceToManualSegments(floorplanTraceData);
      onSave({
        ...editingRoom,
        manualAreaSqm: solvedGeometry.areaSqm,
        manualPerimeterMeters: solvedGeometry.perimeterMeters,
        shapeType: 'irregular',
        irregularData: {
          method: 'floorplan_trace',
          segments: derivedSegments,
          diagonals: [],
          floorplanTrace: {
            ...floorplanTraceData,
            points: tracedPoints.map((p) => ({ ...p })),
          },
        },
      });
      return;
    }

    onSave({
      ...editingRoom,
      manualAreaSqm: solvedGeometry.areaSqm,
      manualPerimeterMeters: solvedGeometry.perimeterMeters,
      shapeType: 'irregular',
      irregularData: {
        method: manualMethod,
        segments: segments.map((s) => ({ ...s })),
        diagonals: manualMethod === 'diagonals' ? diagonals.map((d) => ({ ...d })) : [],
      },
    });
  };

  const roomDisplayName = editingRoom.name?.trim() || 'Ambiente sem nome';

  const hoverSnapToFirst = hoverNormPoint ? isNearFirstVertexOnScreen(hoverNormPoint) : false;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs p-2.5 sm:p-5 flex items-center justify-center">
      <div
        className="w-full max-w-6xl max-h-[94vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: crm.cardBg,
          borderColor: crm.cardBorder,
        }}
      >
        {/* Cabeçalho */}
        <div
          className="px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: crm.cardTintBg,
            borderColor: crm.dividerColor,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: crm.indicatorBg,
                color: crm.indicatorText,
              }}
            >
              <Shapes className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className="text-base sm:text-lg font-extrabold tracking-tight truncate"
                  style={{ color: crm.highlightText }}
                >
                  Cálculo Irregular
                </h3>
                <span
                  className="px-2.5 py-0.5 rounded-lg text-xs font-bold truncate max-w-[260px]"
                  style={{
                    backgroundColor: crm.indicatorBg,
                    color: crm.indicatorText,
                  }}
                  title={roomDisplayName}
                >
                  {roomDisplayName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Copie o contorno diretamente sobre a planta importada com uma medida de referência ou informe os trechos manualmente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botão destacado: COPIAR DA PLANTA + alternância com Entrada Manual */}
            <button
              type="button"
              onClick={handleActivateCopyFromFloorplan}
              disabled={!hasFloorplanImage}
              className="h-9 px-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  editorTab === 'floorplan' && isCopyToolActive
                    ? crm.primary
                    : crm.cardBg,
                color:
                  editorTab === 'floorplan' && isCopyToolActive
                    ? '#ffffff'
                    : crm.primary,
                border: `1.5px solid ${crm.primary}`,
              }}
              title={
                hasFloorplanImage
                  ? 'Clique para marcar os cantos do ambiente diretamente na planta do imóvel'
                  : 'Importe uma planta na tela principal para copiar o contorno'
              }
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>COPIAR DA PLANTA</span>
            </button>

            <button
              type="button"
              onClick={() => setEditorTab('manual')}
              className="h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              style={{
                backgroundColor: editorTab === 'manual' ? crm.indicatorBg : crm.cardBg,
                borderColor: editorTab === 'manual' ? crm.primary : crm.cardBorder,
                color: editorTab === 'manual' ? crm.primary : crm.highlightText,
              }}
            >
              <Ruler className="w-3.5 h-3.5 shrink-0" />
              <span>Entrada Manual</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl border flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
              }}
              title="Fechar (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo principal */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {editorTab === 'floorplan' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* COLUNA ESQUERDA — PLANTA DO IMÓVEL INTERATIVA */}
              <div className="lg:col-span-7 space-y-3">
                {hasFloorplanImage ? (
                  <div
                    className="rounded-2xl border overflow-hidden flex flex-col"
                    style={{
                      backgroundColor: crm.cardBg,
                      borderColor: crm.cardBorder,
                    }}
                  >
                    {/* Barra de ferramentas da planta */}
                    <div
                      className="px-3 py-2.5 border-b flex flex-wrap items-center justify-between gap-2"
                      style={{
                        backgroundColor: crm.panelSubtleBg,
                        borderColor: crm.dividerColor,
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isCopyToolActive ? (
                          <button
                            type="button"
                            onClick={handleActivateCopyFromFloorplan}
                            className="h-8 px-3 rounded-lg text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            style={{ backgroundColor: crm.primary }}
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                            <span>COPIAR DA PLANTA</span>
                          </button>
                        ) : (
                          <>
                            <div
                              className="inline-flex items-center p-0.5 rounded-lg border"
                              style={{
                                backgroundColor: crm.cardBg,
                                borderColor: crm.cardBorder,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setCanvasToolMode('trace')}
                                disabled={isContourClosed}
                                className="h-7 px-2.5 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                style={{
                                  backgroundColor:
                                    canvasToolMode === 'trace' && !isContourClosed
                                      ? crm.primary
                                      : 'transparent',
                                  color:
                                    canvasToolMode === 'trace' && !isContourClosed
                                      ? '#ffffff'
                                      : crm.highlightText,
                                }}
                                title="Clicar nos cantos para marcar pontos"
                              >
                                <MousePointerClick className="w-3 h-3" />
                                <span>Marcar Pontos</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCanvasToolMode('pan')}
                                className="h-7 px-2.5 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                style={{
                                  backgroundColor:
                                    canvasToolMode === 'pan' || isContourClosed
                                      ? crm.primary
                                      : 'transparent',
                                  color:
                                    canvasToolMode === 'pan' || isContourClosed
                                      ? '#ffffff'
                                      : crm.highlightText,
                                }}
                                title="Arrastar a planta ou editar pontos marcados"
                              >
                                <Hand className="w-3 h-3" />
                                <span>{isContourClosed ? 'Editar / Mover' : 'Mover Planta'}</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={handleUndoLastPoint}
                              disabled={tracedPoints.length === 0}
                              className="h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                              style={{
                                backgroundColor: crm.cardBg,
                                borderColor: crm.cardBorder,
                                color: crm.highlightText,
                              }}
                              title={
                                isContourClosed
                                  ? 'Reabrir contorno para adicionar ou ajustar pontos'
                                  : 'Desfazer último ponto marcado'
                              }
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>{isContourClosed ? 'Reabrir' : 'Desfazer'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleClearContour}
                              disabled={tracedPoints.length === 0}
                              className="h-8 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 text-rose-600"
                              style={{
                                backgroundColor: crm.cardBg,
                                borderColor: crm.cardBorder,
                              }}
                              title="Limpar todos os pontos e começar novamente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Limpar</span>
                            </button>

                            {!isContourClosed && tracedPoints.length >= 3 && (
                              <button
                                type="button"
                                onClick={handleFinalizeContour}
                                className="h-8 px-3 rounded-lg text-[11px] font-extrabold text-white flex items-center gap-1 cursor-pointer shadow-2xs bg-emerald-600 hover:bg-emerald-700"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Finalizar Contorno</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* Controles de Zoom e Ajuste */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleZoomStep(-0.3)}
                          disabled={zoom <= MIN_CANVAS_ZOOM}
                          className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                            color: crm.highlightText,
                          }}
                          title="Reduzir zoom"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span
                          className="h-8 px-2 rounded-lg border text-[11px] font-bold tabular-nums flex items-center"
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
                          onClick={() => handleZoomStep(0.3)}
                          disabled={zoom >= MAX_CANVAS_ZOOM}
                          className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                            color: crm.highlightText,
                          }}
                          title="Ampliar zoom"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleResetView}
                          className="h-8 px-2 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                            color: crm.highlightText,
                          }}
                          title="Centralizar e ajustar planta na tela"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span className="hidden sm:inline">Ajustar</span>
                        </button>
                      </div>
                    </div>

                    {/* Área interativa da Planta + SVG de marcação */}
                    <div
                      ref={stageContainerRef}
                      onPointerDown={handleStagePointerDown}
                      onPointerMove={handleStagePointerMove}
                      onPointerUp={handleStagePointerUp}
                      onPointerCancel={handleStagePointerUp}
                      onPointerLeave={() => setHoverNormPoint(null)}
                      onContextMenu={(e) => e.preventDefault()}
                      className={`relative w-full h-[380px] sm:h-[440px] overflow-hidden select-none touch-none flex items-center justify-center ${
                        draggingPointIndex !== null
                          ? 'cursor-grabbing'
                          : isCopyToolActive && !isContourClosed && canvasToolMode === 'trace'
                            ? 'cursor-crosshair'
                            : isPanning
                              ? 'cursor-grabbing'
                              : 'cursor-grab'
                      }`}
                      style={{
                        backgroundColor: '#f8fafc',
                        backgroundImage:
                          'radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                      }}
                    >
                      <div
                        className="relative shrink-0"
                        style={{
                          width: fittedImageBox.width,
                          height: fittedImageBox.height,
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                          transformOrigin: 'center center',
                        }}
                      >
                        <div ref={imageBoxRef} className="relative w-full h-full">
                          <img
                            src={floorplanAsset!.previewDataUrl}
                            alt={`Planta do projeto: ${floorplanAsset!.fileName}`}
                            draggable={false}
                            onLoad={(e) => {
                              const nw = e.currentTarget.naturalWidth || 1200;
                              const nh = e.currentTarget.naturalHeight || 900;
                              setImageDims({ w: nw, h: nh });
                            }}
                            className="w-full h-full block select-none rounded-xs shadow-sm"
                          />

                          {/* Camada vetorial alinhada em coordenadas naturais da imagem */}
                          <svg
                            viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
                            className="absolute inset-0 w-full h-full overflow-visible"
                          >
                            {/* Preenchimento do polígono fechado (ou pré-visualização com 3+ pontos) */}
                            {tracedPoints.length >= 3 && (
                              <polygon
                                points={tracedPoints
                                  .map((p) => `${p.x * imageDims.w},${p.y * imageDims.h}`)
                                  .join(' ')}
                                fill={
                                  solvedGeometry.hasSelfIntersection
                                    ? 'rgba(225, 29, 72, 0.18)'
                                    : crm.primary
                                }
                                fillOpacity={
                                  solvedGeometry.hasSelfIntersection
                                    ? 1
                                    : isContourClosed
                                      ? 0.22
                                      : 0.1
                                }
                                stroke="none"
                              />
                            )}

                            {/* Arestas do contorno */}
                            {tracedPoints.length >= 2 &&
                              Array.from(
                                {
                                  length: isContourClosed
                                    ? tracedPoints.length
                                    : tracedPoints.length - 1,
                                },
                                (_, edgeIdx) => {
                                  const a = tracedPoints[edgeIdx];
                                  const b =
                                    tracedPoints[(edgeIdx + 1) % tracedPoints.length];
                                  const x1 = a.x * imageDims.w;
                                  const y1 = a.y * imageDims.h;
                                  const x2 = b.x * imageDims.w;
                                  const y2 = b.y * imageDims.h;
                                  const isRefEdge =
                                    isContourClosed && edgeIdx === referenceEdgeIndex;
                                  const solvedEdge = solvedGeometry.edges[edgeIdx];

                                  return (
                                    <g key={`edge_${a.id}_${b.id}`}>
                                      {/* Linha visível da parede */}
                                      <line
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke={
                                          solvedGeometry.hasSelfIntersection
                                            ? '#e11d48'
                                            : isRefEdge
                                              ? '#d97706'
                                              : crm.primary
                                        }
                                        strokeWidth={
                                          (isRefEdge ? 3.8 : 2.6) * svgUnitsPerScreenPx
                                        }
                                        strokeLinecap="round"
                                      />

                                      {/* Área clicável ampliada para selecionar a parede de calibração */}
                                      {isContourClosed && (
                                        <line
                                          x1={x1}
                                          y1={y1}
                                          x2={x2}
                                          y2={y2}
                                          stroke="transparent"
                                          strokeWidth={16 * svgUnitsPerScreenPx}
                                          className="cursor-pointer"
                                          onPointerDown={(ev) => {
                                            ev.stopPropagation();
                                            setReferenceEdgeIndex(edgeIdx);
                                            referenceInputRef.current?.focus();
                                          }}
                                        />
                                      )}

                                      {/* Rótulo com medida ou referência no meio da parede */}
                                      {isContourClosed && (
                                        <g
                                          transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2 - 10 * svgUnitsPerScreenPx})`}
                                          className="pointer-events-none"
                                        >
                                          <text
                                            textAnchor="middle"
                                            fontSize={11 * svgUnitsPerScreenPx}
                                            fontWeight="800"
                                            fill={isRefEdge ? '#b45309' : '#0f172a'}
                                            stroke="#ffffff"
                                            strokeWidth={3.2 * svgUnitsPerScreenPx}
                                            paintOrder="stroke"
                                          >
                                            {solvedEdge && solvedEdge.lengthMeters > 0
                                              ? `${formatPtBrNumber(solvedEdge.lengthMeters)} m${
                                                  isRefEdge ? ' (Ref.)' : ''
                                                }`
                                              : isRefEdge
                                                ? `Parede ${edgeIdx + 1} (Ref.)`
                                                : `P${edgeIdx + 1}`}
                                          </text>
                                        </g>
                                      )}

                                      {/* Alça "+" no ponto médio para inserir novo ponto nesta parede */}
                                      {isContourClosed && (
                                        <g
                                          transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
                                          className="cursor-pointer"
                                          onPointerDown={(ev) => {
                                            ev.stopPropagation();
                                            stageContainerRef.current?.setPointerCapture(
                                              ev.pointerId
                                            );
                                            handleInsertMidpoint(edgeIdx, true);
                                          }}
                                        >
                                          <circle
                                            r={7.5 * svgUnitsPerScreenPx}
                                            fill="#ffffff"
                                            stroke={crm.primary}
                                            strokeWidth={1.6 * svgUnitsPerScreenPx}
                                          />
                                          <line
                                            x1={-3 * svgUnitsPerScreenPx}
                                            y1={0}
                                            x2={3 * svgUnitsPerScreenPx}
                                            y2={0}
                                            stroke={crm.primary}
                                            strokeWidth={1.6 * svgUnitsPerScreenPx}
                                          />
                                          <line
                                            x1={0}
                                            y1={-3 * svgUnitsPerScreenPx}
                                            x2={0}
                                            y2={3 * svgUnitsPerScreenPx}
                                            stroke={crm.primary}
                                            strokeWidth={1.6 * svgUnitsPerScreenPx}
                                          />
                                        </g>
                                      )}
                                    </g>
                                  );
                                }
                              )}

                            {/* Linha guia elástica até o cursor enquanto marca pontos */}
                            {isCopyToolActive &&
                              !isContourClosed &&
                              canvasToolMode === 'trace' &&
                              tracedPoints.length >= 1 &&
                              hoverNormPoint && (
                                <line
                                  x1={
                                    tracedPoints[tracedPoints.length - 1].x *
                                    imageDims.w
                                  }
                                  y1={
                                    tracedPoints[tracedPoints.length - 1].y *
                                    imageDims.h
                                  }
                                  x2={
                                    (hoverSnapToFirst
                                      ? tracedPoints[0].x
                                      : hoverNormPoint.x) * imageDims.w
                                  }
                                  y2={
                                    (hoverSnapToFirst
                                      ? tracedPoints[0].y
                                      : hoverNormPoint.y) * imageDims.h
                                  }
                                  stroke={hoverSnapToFirst ? '#059669' : crm.primary}
                                  strokeWidth={2 * svgUnitsPerScreenPx}
                                  strokeDasharray={`${5 * svgUnitsPerScreenPx} ${4 * svgUnitsPerScreenPx}`}
                                  className="pointer-events-none"
                                />
                              )}

                            {/* Vértices (cantos) clicáveis e arrastáveis */}
                            {tracedPoints.map((pt, idx) => {
                              const cx = pt.x * imageDims.w;
                              const cy = pt.y * imageDims.h;
                              const isFirst = idx === 0;
                              const isSelected = selectedPointIndex === idx;
                              const highlightClose = isFirst && hoverSnapToFirst;

                              return (
                                <g key={pt.id}>
                                  {highlightClose && (
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={14 * svgUnitsPerScreenPx}
                                      fill="rgba(5, 150, 105, 0.2)"
                                      stroke="#059669"
                                      strokeWidth={2 * svgUnitsPerScreenPx}
                                      className="pointer-events-none"
                                    />
                                  )}
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={(isSelected ? 8.5 : 6.8) * svgUnitsPerScreenPx}
                                    fill={
                                      highlightClose
                                        ? '#059669'
                                        : isSelected
                                          ? '#f59e0b'
                                          : isFirst
                                            ? '#0f172a'
                                            : '#ffffff'
                                    }
                                    stroke={crm.primary}
                                    strokeWidth={2.4 * svgUnitsPerScreenPx}
                                    className="cursor-move"
                                    onPointerDown={(ev) =>
                                      handleVertexPointerDown(ev, idx)
                                    }
                                  />
                                  <text
                                    x={cx + 9 * svgUnitsPerScreenPx}
                                    y={cy - 7 * svgUnitsPerScreenPx}
                                    fontSize={10.5 * svgUnitsPerScreenPx}
                                    fontWeight="800"
                                    fill="#0f172a"
                                    stroke="#ffffff"
                                    strokeWidth={3 * svgUnitsPerScreenPx}
                                    paintOrder="stroke"
                                    className="pointer-events-none"
                                  >
                                    V{idx + 1}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>

                      {/* Legenda contextual no rodapé da planta */}
                      <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div
                          className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold backdrop-blur-xs shadow-2xs"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                            color: crm.highlightText,
                          }}
                        >
                          {!isCopyToolActive
                            ? 'Clique em "COPIAR DA PLANTA" para marcar os cantos do ambiente ou arraste/use a roda do mouse para navegar.'
                            : !isContourClosed
                              ? tracedPoints.length < 3
                                ? `Clique nos cantos do ambiente (${tracedPoints.length} marcado${tracedPoints.length === 1 ? '' : 's'}) · Arraste para mover a planta · Roda do mouse para zoom`
                                : 'Continue clicando nos cantos ou clique em V1 / "Finalizar Contorno" para fechar.'
                              : 'Contorno fechado: arraste vértices (V1..Vn) para ajustar, clique em "+" para adicionar ponto ou clique em uma parede para calibrar.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-2xl border border-dashed p-8 text-center flex flex-col items-center justify-center gap-3 min-h-[340px]"
                    style={{
                      backgroundColor: crm.panelSubtleBg,
                      borderColor: crm.cardTintBorder,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{
                        backgroundColor: crm.indicatorBg,
                        color: crm.indicatorText,
                      }}
                    >
                      <FileImage className="w-6 h-6" />
                    </div>
                    <div className="max-w-md space-y-1.5">
                      <p className="text-sm font-bold" style={{ color: crm.highlightText }}>
                        Nenhuma planta importada no projeto atual
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Importe ou cole a planta na área &quot;Planta do Imóvel&quot; para habilitar o botão <strong>COPIAR DA PLANTA</strong>, ou preencha os trechos manualmente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditorTab('manual')}
                      className="h-9 px-4 rounded-xl text-xs font-bold text-white cursor-pointer"
                      style={{ backgroundColor: crm.primary }}
                    >
                      Ir para Entrada Manual
                    </button>
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA — CALIBRAÇÃO DE ESCALA, PONTOS, TRECHOS E RESULTADO */}
              <div className="lg:col-span-5 space-y-3.5">
                {/* 1. Calibração da Escala */}
                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    backgroundColor: crm.panelSubtleBg,
                    borderColor: isContourClosed && !referenceLengthMeters ? '#f59e0b' : crm.cardBorder,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4" style={{ color: crm.primary }} />
                      <h4
                        className="text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: crm.highlightText }}
                      >
                        1. Calibração da Escala
                      </h4>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                      {tracedPoints.length} {tracedPoints.length === 1 ? 'ponto' : 'pontos'}
                    </span>
                  </div>

                  {tracedEdgeDescriptors.length === 0 ? (
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {!isCopyToolActive
                        ? 'Ative "COPIAR DA PLANTA" e marque os cantos do ambiente na planta para selecionar uma parede de referência.'
                        : 'Marque os cantos do ambiente na planta e finalize o contorno para calibrar a escala com uma medida real.'}
                    </p>
                  ) : !isContourClosed ? (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {tracedPoints.length < 3
                        ? `Marque pelo menos ${3 - tracedPoints.length} ${
                            3 - tracedPoints.length === 1 ? 'canto' : 'cantos'
                          } para poder fechar o contorno.`
                        : 'Clique no ponto inicial (V1) ou em "Finalizar Contorno" para fechar o ambiente e informar a medida de referência.'}
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Parede de Referência
                          </label>
                          <select
                            value={referenceEdgeIndex}
                            onChange={(e) => setReferenceEdgeIndex(Number(e.target.value))}
                            className="w-full h-9 rounded-xl border px-2.5 text-xs font-bold outline-none cursor-pointer"
                            style={{
                              backgroundColor: crm.inputBg,
                              borderColor: crm.inputBorder,
                              color: crm.highlightText,
                            }}
                          >
                            {tracedEdgeDescriptors.map((edge) => (
                              <option key={edge.index} value={edge.index}>
                                {edge.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Medida Real (m)
                          </label>
                          <input
                            ref={referenceInputRef}
                            type="text"
                            inputMode="decimal"
                            value={referenceLengthInput}
                            onChange={(e) => handleReferenceLengthChange(e.target.value)}
                            placeholder="Ex.: 4,00"
                            className="w-full h-9 rounded-xl border px-3 text-xs font-extrabold text-center outline-none tabular-nums"
                            style={{
                              backgroundColor: crm.inputBg,
                              borderColor:
                                referenceLengthMeters && referenceLengthMeters > 0
                                  ? crm.primary
                                  : '#f59e0b',
                              color: crm.highlightText,
                            }}
                          />
                        </div>
                      </div>

                      {(!referenceLengthMeters || referenceLengthMeters <= 0) && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                          Informe a medida real em metros da parede selecionada (clique na linha desejada na planta ou escolha acima) para calcular área e perímetro.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Pontos e Medidas dos Trechos */}
                {tracedPoints.length > 0 && (
                  <div
                    className="rounded-2xl border p-4 space-y-3"
                    style={{
                      backgroundColor: crm.panelSubtleBg,
                      borderColor: crm.cardBorder,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4
                        className="text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: crm.highlightText }}
                      >
                        2. Pontos e Trechos ({tracedPoints.length})
                      </h4>

                      {selectedPointIndex !== null &&
                        tracedPoints[selectedPointIndex] && (
                          <button
                            type="button"
                            onClick={() => handleDeletePoint(selectedPointIndex)}
                            disabled={isContourClosed && tracedPoints.length <= 3}
                            className="h-7 px-2.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 text-rose-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: crm.cardBg,
                              borderColor: crm.cardBorder,
                            }}
                            title={
                              isContourClosed && tracedPoints.length <= 3
                                ? 'Mínimo de 3 pontos no contorno fechado'
                                : `Excluir ponto V${selectedPointIndex + 1}`
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Excluir V{selectedPointIndex + 1}</span>
                          </button>
                        )}
                    </div>

                    {/* Chips de pontos para seleção rápida / exclusão */}
                    <div className="flex flex-wrap gap-1.5">
                      {tracedPoints.map((pt, idx) => {
                        const isSel = selectedPointIndex === idx;
                        return (
                          <button
                            key={pt.id}
                            type="button"
                            onClick={() => setSelectedPointIndex(isSel ? null : idx)}
                            className="h-7 px-2 rounded-lg border text-[11px] font-extrabold tabular-nums cursor-pointer transition-colors"
                            style={{
                              backgroundColor: isSel ? crm.primary : crm.cardBg,
                              borderColor: isSel ? crm.primary : crm.cardBorder,
                              color: isSel ? '#ffffff' : crm.highlightText,
                            }}
                            title="Clique para selecionar este ponto e permitir excluí-lo ou arrastá-lo na planta"
                          >
                            V{idx + 1}
                          </button>
                        );
                      })}
                    </div>

                    {/* Lista dos trechos com medida calculada */}
                    {tracedEdgeDescriptors.length > 0 && (
                      <div className="space-y-1.5 max-h-[155px] overflow-y-auto pr-1">
                        {tracedEdgeDescriptors.map((edge) => {
                          const isRef = isContourClosed && edge.index === referenceEdgeIndex;
                          return (
                            <div
                              key={edge.index}
                              className="rounded-xl border px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                              style={{
                                backgroundColor: isRef ? crm.cardTintBg : crm.cardBg,
                                borderColor: isRef ? crm.primary : crm.cardBorder,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setReferenceEdgeIndex(edge.index);
                                  referenceInputRef.current?.focus();
                                }}
                                className="min-w-0 text-left font-bold truncate cursor-pointer flex items-center gap-1.5"
                                style={{ color: crm.highlightText }}
                                title="Clique para usar esta parede como referência de escala"
                              >
                                <span className="truncate">{edge.label}</span>
                                {isRef && (
                                  <span
                                    className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                                    style={{
                                      backgroundColor: crm.indicatorBg,
                                      color: crm.indicatorText,
                                    }}
                                  >
                                    Ref.
                                  </span>
                                )}
                              </button>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className="font-extrabold tabular-nums"
                                  style={{
                                    color:
                                      edge.lengthMeters !== null ? crm.primary : '#94a3b8',
                                  }}
                                >
                                  {edge.lengthMeters !== null
                                    ? `${formatPtBrNumber(edge.lengthMeters)} m`
                                    : '—'}
                                </span>

                                {isContourClosed && (
                                  <button
                                    type="button"
                                    onClick={() => handleInsertMidpoint(edge.index, false)}
                                    className="w-6 h-6 rounded-md border flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                                    style={{
                                      backgroundColor: crm.cardBg,
                                      borderColor: crm.cardBorder,
                                    }}
                                    title={`Adicionar novo ponto entre V${edge.fromV} e V${edge.toV}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Resultado & Pré-visualização */}
                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    backgroundColor: solvedGeometry.isComplete
                      ? crm.cardTintBg
                      : crm.panelSubtleBg,
                    borderColor: solvedGeometry.isComplete
                      ? crm.cardTintBorder
                      : crm.cardBorder,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: crm.highlightText }}
                    >
                      Resultado — {roomDisplayName}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        solvedGeometry.isComplete ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {solvedGeometry.isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>{solvedGeometry.statusLabel}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div
                      className="rounded-xl border p-2.5"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: crm.cardBorder,
                      }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Área Calculada
                      </p>
                      <p
                        className="text-base sm:text-lg font-black tabular-nums mt-0.5"
                        style={{
                          color:
                            solvedGeometry.areaSqm !== null ? crm.primary : '#94a3b8',
                        }}
                      >
                        {solvedGeometry.areaSqm !== null
                          ? `${formatPtBrNumber(solvedGeometry.areaSqm)} m²`
                          : '—'}
                      </p>
                    </div>

                    <div
                      className="rounded-xl border p-2.5"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: crm.cardBorder,
                      }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Perímetro Calculado
                      </p>
                      <p
                        className="text-base sm:text-lg font-black tabular-nums mt-0.5"
                        style={{ color: crm.highlightText }}
                      >
                        {solvedGeometry.perimeterMeters > 0
                          ? `${formatPtBrNumber(solvedGeometry.perimeterMeters)} ml`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {solvedGeometry.isComplete && (
                    <IrregularRoomPreviewSvg
                      solved={solvedGeometry}
                      emptyHint="Pré-visualização proporcional"
                    />
                  )}

                  {solvedGeometry.missingReasons.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
                      {solvedGeometry.missingReasons.map((reason, rIdx) => (
                        <p key={rIdx} className="leading-relaxed">
                          {reason}
                        </p>
                      ))}
                    </div>
                  )}

                  {solvedGeometry.isComplete && (
                    <button
                      type="button"
                      onClick={handleTransferTraceToManual}
                      className="w-full h-8 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: crm.cardBorder,
                        color: crm.primary,
                      }}
                    >
                      Ajustar medidas dos trechos manualmente
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* MODO MANUAL COMPLETO (CURVAS / ÂNGULOS OU DIAGONAIS) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* COLUNA ESQUERDA — TRECHOS E DEFINIÇÃO GEOMÉTRICA */}
              <div className="lg:col-span-7 space-y-4">
                {segments.length >= 4 && (
                  <div
                    className="rounded-2xl border p-3 flex flex-wrap items-center justify-between gap-2"
                    style={{
                      backgroundColor: crm.panelSubtleBg,
                      borderColor: crm.cardBorder,
                    }}
                  >
                    <span className="text-xs font-bold text-slate-600">
                      Como definir a geometria:
                    </span>
                    <div
                      className="flex items-center gap-1.5 p-1 rounded-xl border"
                      style={{ backgroundColor: crm.cardBg, borderColor: crm.cardBorder }}
                    >
                      <button
                        type="button"
                        onClick={() => setManualMethod('angles')}
                        className="h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor:
                            manualMethod === 'angles' ? crm.primary : 'transparent',
                          color: manualMethod === 'angles' ? '#ffffff' : '#475569',
                        }}
                      >
                        Curvas / Ângulos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManualMethod('diagonals');
                          setDiagonals((prev) =>
                            syncDiagonalsForSegmentCount(segments.length, prev)
                          );
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor:
                            manualMethod === 'diagonals' ? crm.primary : 'transparent',
                          color: manualMethod === 'diagonals' ? '#ffffff' : '#475569',
                        }}
                      >
                        Diagonais (Triangulação)
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista sequencial de trechos das paredes */}
                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    backgroundColor: crm.panelSubtleBg,
                    borderColor: crm.cardBorder,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4
                        className="text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: crm.highlightText }}
                      >
                        Trechos das Paredes ({segments.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Preencha cada parede em ordem contínua ao redor do ambiente.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddSegment}
                      className="h-8 px-3 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                      style={{ backgroundColor: crm.primary }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Trecho</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {segments.map((seg, idx) => {
                      const draft = segmentDrafts[seg.id] || {
                        length:
                          seg.lengthMeters !== null
                            ? formatQuickInputNumber(seg.lengthMeters)
                            : '',
                        angle:
                          typeof seg.angleDegrees === 'number'
                            ? String(seg.angleDegrees).replace('.', ',')
                            : '',
                      };
                      const isCustomAngle =
                        seg.turn === 'right_angle' || seg.turn === 'left_angle';

                      return (
                        <div
                          key={seg.id}
                          className="rounded-xl border p-2.5 flex flex-wrap items-center gap-2"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                          }}
                        >
                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className="w-7 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold tabular-nums"
                              style={{
                                backgroundColor: crm.indicatorBg,
                                color: crm.indicatorText,
                              }}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleMoveSegment(idx, -1)}
                                disabled={idx === 0}
                                className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer"
                                title="Mover trecho para cima"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveSegment(idx, 1)}
                                disabled={idx === segments.length - 1}
                                className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer"
                                title="Mover trecho para baixo"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="w-28 shrink-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft.length}
                              onChange={(e) =>
                                handleSegmentLengthChange(seg.id, e.target.value)
                              }
                              placeholder="Comp. (m)"
                              aria-label={`Comprimento do trecho ${idx + 1} em metros`}
                              className="w-full h-9 rounded-lg border px-2 text-xs font-bold text-center outline-none tabular-nums"
                              style={{
                                backgroundColor: crm.inputBg,
                                borderColor: crm.inputBorder,
                                color: crm.highlightText,
                              }}
                            />
                          </div>

                          {manualMethod === 'angles' && (
                            <div className="flex-1 min-w-[165px] flex items-center gap-1.5">
                              {idx === 0 ? (
                                <span className="text-[11px] font-semibold text-slate-500 px-2">
                                  Parede inicial (base)
                                </span>
                              ) : segments.length === 3 &&
                                segments.slice(1).every((s) => s.turn === 'pending') ? (
                                <span className="text-[11px] font-semibold text-slate-500 px-2">
                                  Fechamento triangular automático (3 lados)
                                </span>
                              ) : (
                                <>
                                  <select
                                    value={seg.turn}
                                    onChange={(e) =>
                                      handleSegmentTurnChange(
                                        seg.id,
                                        e.target.value as IrregularTurnDirection
                                      )
                                    }
                                    className="flex-1 h-9 rounded-lg border px-2 text-xs font-semibold outline-none cursor-pointer"
                                    style={{
                                      backgroundColor: crm.inputBg,
                                      borderColor:
                                        seg.turn === 'pending'
                                          ? '#f59e0b'
                                          : crm.inputBorder,
                                      color: crm.highlightText,
                                    }}
                                  >
                                    {TURN_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>

                                  {isCustomAngle && (
                                    <div className="relative w-20 shrink-0">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={draft.angle}
                                        onChange={(e) =>
                                          handleSegmentAngleChange(seg.id, e.target.value)
                                        }
                                        placeholder="Graus"
                                        className="w-full h-9 rounded-lg border pl-2 pr-5 text-xs font-bold text-center outline-none tabular-nums"
                                        style={{
                                          backgroundColor: crm.inputBg,
                                          borderColor: crm.inputBorder,
                                          color: crm.highlightText,
                                        }}
                                      />
                                      <span className="text-[11px] font-bold text-slate-400 absolute right-1.5 top-2 pointer-events-none">
                                        °
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {manualMethod === 'diagonals' && (
                            <span className="flex-1 text-[11px] font-medium text-slate-500 px-1">
                              Parede V{idx + 1} → V{idx + 1 === segments.length ? 1 : idx + 2}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveSegment(seg.id)}
                            disabled={segments.length <= 3}
                            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-25 cursor-pointer shrink-0"
                            title={
                              segments.length <= 3
                                ? 'Mínimo de 3 trechos para formar um ambiente'
                                : 'Remover trecho'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {manualMethod === 'angles' &&
                    segments.length >= 4 &&
                    segments.slice(1).some((s) => s.turn === 'pending') && (
                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleApplyRight90ToPending}
                          className="h-8 px-3 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardTintBorder,
                            color: crm.primary,
                          }}
                        >
                          <CornerDownRight className="w-3.5 h-3.5" />
                          <span>Aplicar 90° Direita nos pendentes</span>
                        </button>

                        <span className="text-[11px] text-slate-500">
                          Ou altere para <strong>Diagonais (Triangulação)</strong> acima.
                        </span>
                      </div>
                    )}
                </div>

                {manualMethod === 'diagonals' && diagonals.length > 0 && (
                  <div
                    className="rounded-2xl border p-4 space-y-3"
                    style={{
                      backgroundColor: crm.panelSubtleBg,
                      borderColor: crm.cardBorder,
                    }}
                  >
                    <div>
                      <h4
                        className="text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: crm.highlightText }}
                      >
                        Diagonais / Medidas de Referência
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Meça do canto V1 até os vértices opostos indicados para fixar a geometria real.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {diagonals.map((diag, dIdx) => (
                        <div
                          key={diag.id}
                          className="rounded-xl border p-2.5 flex items-center justify-between gap-2"
                          style={{
                            backgroundColor: crm.cardBg,
                            borderColor: crm.cardBorder,
                          }}
                        >
                          <div className="min-w-0">
                            <p
                              className="text-xs font-bold"
                              style={{ color: crm.highlightText }}
                            >
                              Diagonal D{dIdx + 1} (V{diag.fromVertex} ↔ V{diag.toVertex})
                            </p>
                            <button
                              type="button"
                              onClick={() => handleToggleDiagonalReflex(diag.id)}
                              className="text-[10px] font-semibold hover:underline cursor-pointer"
                              style={{ color: crm.primary }}
                            >
                              {diag.reflex
                                ? 'Sentido: interno (côncavo)'
                                : 'Sentido: padrão (convexo)'}
                            </button>
                          </div>

                          <input
                            type="text"
                            inputMode="decimal"
                            value={diagonalDrafts[diag.id] ?? ''}
                            onChange={(e) =>
                              handleDiagonalLengthChange(diag.id, e.target.value)
                            }
                            placeholder="Metros"
                            className="w-24 h-9 rounded-lg border px-2 text-xs font-bold text-center outline-none tabular-nums shrink-0"
                            style={{
                              backgroundColor: crm.inputBg,
                              borderColor: crm.inputBorder,
                              color: crm.highlightText,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA — PRÉ-VISUALIZAÇÃO + RESULTADO DO CÁLCULO */}
              <div className="lg:col-span-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: crm.highlightText }}
                    >
                      Pré-visualização do Formato
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      Escala proporcional
                    </span>
                  </div>

                  <IrregularRoomPreviewSvg
                    solved={solvedGeometry}
                    showVertexLabels={
                      manualMethod === 'diagonals' && segments.length >= 4
                    }
                    emptyHint="Informe os trechos das paredes e suas curvas ou diagonais para visualizar o formato."
                  />
                </div>

                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    backgroundColor: solvedGeometry.isComplete
                      ? crm.cardTintBg
                      : crm.panelSubtleBg,
                    borderColor: solvedGeometry.isComplete
                      ? crm.cardTintBorder
                      : crm.cardBorder,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-extrabold uppercase tracking-wider"
                      style={{ color: crm.highlightText }}
                    >
                      Resultado — {roomDisplayName}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                        solvedGeometry.isComplete ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {solvedGeometry.isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <span>{solvedGeometry.statusLabel}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className="rounded-xl border p-3"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: crm.cardBorder,
                      }}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Área Calculada
                      </p>
                      <p
                        className="text-lg font-black tabular-nums mt-0.5"
                        style={{
                          color:
                            solvedGeometry.areaSqm !== null ? crm.primary : '#94a3b8',
                        }}
                      >
                        {solvedGeometry.areaSqm !== null
                          ? `${formatPtBrNumber(solvedGeometry.areaSqm)} m²`
                          : '—'}
                      </p>
                    </div>

                    <div
                      className="rounded-xl border p-3"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: crm.cardBorder,
                      }}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Perímetro Calculado
                      </p>
                      <p
                        className="text-lg font-black tabular-nums mt-0.5"
                        style={{ color: crm.highlightText }}
                      >
                        {solvedGeometry.perimeterMeters > 0
                          ? `${formatPtBrNumber(solvedGeometry.perimeterMeters)} ml`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {solvedGeometry.missingReasons.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1">
                      {solvedGeometry.missingReasons.map((reason, rIdx) => (
                        <p key={rIdx} className="leading-relaxed">
                          {reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Retornar ao Retangular (se irregular), CANCELAR e SALVAR ALTERAÇÕES */}
        <div
          className="px-5 py-3.5 border-t flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.dividerColor,
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {editingRoom.shapeType === 'irregular' && onRevertToRectangular ? (
              <button
                type="button"
                onClick={() => onRevertToRectangular(editingRoom.id)}
                className="h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: crm.cardTintBg,
                  borderColor: crm.cardTintBorder,
                  color: crm.primary,
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retornar ao cálculo retangular</span>
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                {canSave
                  ? `Área e perímetro prontos para atualizar "${roomDisplayName}" na lista.`
                  : editorTab === 'floorplan'
                    ? 'Marque o contorno na planta, finalize e informe uma medida de referência para calcular.'
                    : 'Complete as medidas e validações do contorno para calcular e salvar.'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border text-xs font-extrabold uppercase tracking-wide cursor-pointer"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
                color: crm.highlightText,
              }}
            >
              CANCELAR
            </button>

            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={!canSave}
              className="h-10 px-5 rounded-xl text-xs font-extrabold uppercase tracking-wide text-white flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ backgroundColor: crm.primary }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>SALVAR ALTERAÇÕES</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
