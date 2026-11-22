import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  DoorOpen,
  FolderOpen,
  History,
  Layers,
  Loader2,
  Maximize,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  Search,
  Send,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { ClientRecord, ClientType } from '../../types';
import { useFenixTheme } from '../../utils/themeService';
import { filterClientsForUser } from '../../utils/userDataFilter';
import { addClientActivity } from '../../utils/activities';
import {
  DEFAULT_FLOORPLAN_MATERIALS,
  FLOORPLAN_QUICK_DRAFT_KEY,
  FloorplanMaterialSelections,
  FloorplanRoom,
  QuickBudgetTransferDraft,
  calculateFloorplanTotals,
  computeRoomMetrics,
  createEmptyFloorplanRoom,
  formatPercentDisplay,
  formatPtBrNumber,
  formatQuickInputNumber,
  parsePtBrDimension,
} from '../../utils/floorplanCalculator';
import {
  SavedFloorplanProject,
  clearActiveFloorplanDraft,
  deleteFloorplanProject,
  getStoredFloorplanProjects,
  loadActiveFloorplanDraft,
  loadFloorplanProjectFullImage,
  loadFloorplanProjectsFromSupabase,
  saveActiveFloorplanDraft,
  saveFloorplanProject,
} from '../../utils/floorplanStorageService';
import {
  FloorplanOcrProgress,
  normalizeRoomComparisonKey,
  runLocalFloorplanRoomNamesRecognition,
} from '../../utils/floorplanOcrEngine';
import { FloorplanViewer, LoadedFloorplanAsset } from './FloorplanViewer';
import { RoomGeometryModal } from './RoomGeometryModal';

interface CalculadoraPlantasViewProps {
  client: ClientRecord | null;
  onGoToOrcamento?: () => void;
  onSelectClient?: (client: ClientRecord | null) => void;
  currentUserName?: string;
}

const CLIENT_TYPES: ClientType[] = [
  'Arquiteto',
  'Cliente Final',
  'Consumidor Final',
  'Construtora',
  'Distribuidor',
  'Engenheiro',
  'Instalador',
  'Revenda',
];

const LOSS_MARGIN_PRESETS = [0, 5, 10, 15];

interface RoomInputDrafts {
  width: string;
  length: string;
  manualArea: string;
  manualPerimeter: string;
}

function buildInitialDraftsForRoom(room: FloorplanRoom): RoomInputDrafts {
  return {
    width: room.widthMeters !== null ? formatQuickInputNumber(room.widthMeters) : '',
    length: room.lengthMeters !== null ? formatQuickInputNumber(room.lengthMeters) : '',
    manualArea: room.manualAreaSqm !== null ? formatQuickInputNumber(room.manualAreaSqm) : '',
    manualPerimeter:
      room.manualPerimeterMeters !== null && room.manualPerimeterMeters !== undefined
        ? formatQuickInputNumber(room.manualPerimeterMeters)
        : '',
  };
}

export const CalculadoraPlantasView: React.FC<CalculadoraPlantasViewProps> = ({
  client,
  onGoToOrcamento,
  onSelectClient,
  currentUserName = 'Usuário Fênix',
}) => {
  const { theme } = useFenixTheme('crm');
  const crm = theme.crm;

  // Clients dropdown state
  const [clientsList, setClientsList] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(client?.id || '');
  const [selectedClientType, setSelectedClientType] = useState<string>(
    client?.clientType || 'Cliente Final'
  );
  const [clientSearchQuery, setClientSearchQuery] = useState<string>(client?.name || '');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Project & Viewer state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [asset, setAsset] = useState<LoadedFloorplanAsset | null>(null);
  const [viewerError, setViewerError] = useState<string>('');

  // Local OCR recognition state (exclusivamente nomes dos ambientes, acionado por clique)
  const [isRecognizingOcr, setIsRecognizingOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<FloorplanOcrProgress | null>(null);
  const [ocrError, setOcrError] = useState<string>('');

  // Rooms & editable drafts
  const [rooms, setRooms] = useState<FloorplanRoom[]>([]);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomInputDrafts>>({});
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<FloorplanRoom | null>(null);
  const roomListRef = useRef<HTMLDivElement>(null);
  const roomsRef = useRef<FloorplanRoom[]>(rooms);
  roomsRef.current = rooms;

  // Independent calculation settings & Materials selector (ONLY Piso Vinílico & Rodapés)
  const [pisoLossPercent, setPisoLossPercent] = useState<number>(10);
  const [pisoLossInput, setPisoLossInput] = useState<string>('10');
  const [rodapeLossPercent, setRodapeLossPercent] = useState<number>(5);
  const [rodapeLossInput, setRodapeLossInput] = useState<string>('5');
  const [materials, setMaterials] = useState<FloorplanMaterialSelections>(
    DEFAULT_FLOORPLAN_MATERIALS
  );

  // History & persistence state
  const [savedProjects, setSavedProjects] = useState<SavedFloorplanProject[]>(() =>
    getStoredFloorplanProjects()
  );
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false);
  const [isSavingProject, setIsSavingProject] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const hasHydratedDraftRef = useRef(false);

  const showFeedback = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToastMsg({ text, kind });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4200);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Load CRM clients
  useEffect(() => {
    const loadClients = () => {
      try {
        const raw = localStorage.getItem('fenix_clients_db');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setClientsList(filterClientsForUser(parsed, currentUserName));
          }
        }
      } catch {
        // ignore
      }
    };
    loadClients();
    window.addEventListener('fenix_clients_updated', loadClients);
    window.addEventListener('storage', loadClients);
    return () => {
      window.removeEventListener('fenix_clients_updated', loadClients);
      window.removeEventListener('storage', loadClients);
    };
  }, [currentUserName]);

  // Sync external client prop if changed
  useEffect(() => {
    if (client) {
      setSelectedClientId(client.id);
      setSelectedClientType(client.clientType || 'Cliente Final');
      setClientSearchQuery(client.name);
    }
  }, [client]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(e.target as Node)
      ) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProjectLoadRef = useRef<string | null>(null);

  // Load saved history from Supabase & subscribe to cross-device updates
  useEffect(() => {
    let active = true;
    setIsLoadingHistory(true);
    loadFloorplanProjectsFromSupabase()
      .then((list) => {
        if (active) setSavedProjects(list);
      })
      .finally(() => {
        if (active) setIsLoadingHistory(false);
      });

    const handleProjectsUpdated = () => {
      if (!active) return;
      loadFloorplanProjectsFromSupabase()
        .then((list) => {
          if (active) setSavedProjects(list);
        })
        .catch(() => {
          if (active) setSavedProjects(getStoredFloorplanProjects());
        });
    };
    window.addEventListener('fenix_floorplan_projects_updated', handleProjectsUpdated);
    return () => {
      active = false;
      window.removeEventListener('fenix_floorplan_projects_updated', handleProjectsUpdated);
    };
  }, []);

  // Restore active draft once on mount
  useEffect(() => {
    if (hasHydratedDraftRef.current) return;
    hasHydratedDraftRef.current = true;
    const draft = loadActiveFloorplanDraft();
    if (!draft) return;

    setProjectId(draft.projectId || null);
    setProjectName(draft.projectName || '');
    if (!client && draft.clientId) {
      setSelectedClientId(draft.clientId);
      setClientSearchQuery(draft.clientName || '');
      if (draft.clientType) setSelectedClientType(draft.clientType);
    }

    if (draft.fileName) {
      setAsset({
        fileName: draft.fileName,
        fileType: draft.fileType || 'image/jpeg',
        previewDataUrl: draft.previewDataUrl || '',
        pageCount: 1,
        currentPage: 1,
      });
    }

    if (Array.isArray(draft.rooms) && draft.rooms.length > 0) {
      setRooms(draft.rooms);
      const nextDrafts: Record<string, RoomInputDrafts> = {};
      for (const r of draft.rooms) {
        nextDrafts[r.id] = buildInitialDraftsForRoom(r);
      }
      setRoomDrafts(nextDrafts);
    }

    if (typeof draft.pisoLossPercent === 'number') {
      setPisoLossPercent(draft.pisoLossPercent);
      setPisoLossInput(formatPercentDisplay(draft.pisoLossPercent));
    }
    if (typeof draft.rodapeLossPercent === 'number') {
      setRodapeLossPercent(draft.rodapeLossPercent);
      setRodapeLossInput(formatPercentDisplay(draft.rodapeLossPercent));
    }

    if (draft.materials) {
      setMaterials({
        piso: Boolean(draft.materials.piso),
        rodape: Boolean(draft.materials.rodape),
      });
    }
  }, [client]);

  // Auto-save active draft on state change
  useEffect(() => {
    if (!hasHydratedDraftRef.current) return;
    const hasMeaningfulState =
      Boolean(asset?.fileName) || rooms.length > 0 || Boolean(projectName.trim());
    if (!hasMeaningfulState) return;

    const timer = setTimeout(() => {
      saveActiveFloorplanDraft({
        projectId,
        projectName,
        clientId: selectedClientId,
        clientName: clientSearchQuery,
        clientType: selectedClientType,
        fileName: asset?.fileName || '',
        fileType: asset?.fileType || '',
        previewDataUrl: asset?.previewDataUrl || '',
        rooms,
        pisoLossPercent,
        rodapeLossPercent,
        materials,
        updatedAt: new Date().toISOString(),
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [
    projectId,
    projectName,
    selectedClientId,
    clientSearchQuery,
    selectedClientType,
    asset,
    rooms,
    pisoLossPercent,
    rodapeLossPercent,
    materials,
  ]);

  const filteredClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    if (!q) return clientsList.slice(0, 30);
    return clientsList
      .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.whatsapp || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [clientsList, clientSearchQuery]);

  const activeClientRecord = useMemo(() => {
    if (!selectedClientId) return null;
    return clientsList.find((c) => c.id === selectedClientId) || null;
  }, [clientsList, selectedClientId]);

  const summary = useMemo(() => {
    return calculateFloorplanTotals({
      rooms,
      pisoLossPercent,
      rodapeLossPercent,
      materials,
    });
  }, [rooms, pisoLossPercent, rodapeLossPercent, materials]);

  const handleSelectClientRecord = (c: ClientRecord) => {
    setSelectedClientId(c.id);
    setClientSearchQuery(c.name);
    setSelectedClientType(c.clientType || 'Cliente Final');
    setIsClientDropdownOpen(false);
    if (onSelectClient) onSelectClient(c);
  };

  const handleClearClient = () => {
    setSelectedClientId('');
    setClientSearchQuery('');
    if (onSelectClient) onSelectClient(null);
  };

  const handleAssetLoaded = (loaded: LoadedFloorplanAsset) => {
    setAsset(loaded);
    setViewerError('');
    setOcrError('');
    if (!projectName.trim()) {
      const cleanName = loaded.fileName.replace(/\.[^.]+$/, '');
      setProjectName(cleanName);
    }
  };

  const handleIdentifyRooms = async () => {
    if (!asset?.previewDataUrl) {
      setOcrError('Importe ou cole uma planta baixa antes de identificar os ambientes.');
      return;
    }

    setIsRecognizingOcr(true);
    setOcrError('');
    setOcrProgress({
      stage: 'preparing',
      progress: 5,
      message: 'Preparando leitura da planta para identificar ambientes...',
    });

    try {
      const existingNames = roomsRef.current.map((r) => r.name).filter(Boolean);
      const result = await runLocalFloorplanRoomNamesRecognition({
        previewDataUrl: asset.previewDataUrl,
        vectorTextTokens: asset.vectorTextTokens,
        existingRoomNames: existingNames,
        onProgress: setOcrProgress,
      });

      const currentRooms = roomsRef.current;
      const existingKeys = new Set(
        currentRooms.map((r) => normalizeRoomComparisonKey(r.name || '')).filter(Boolean)
      );

      const roomsToAdd: FloorplanRoom[] = [];
      const draftsToAdd: Record<string, RoomInputDrafts> = {};

      for (let i = 0; i < result.roomNames.length; i++) {
        const cleanName = result.roomNames[i].trim();
        const key = normalizeRoomComparisonKey(cleanName);
        if (!cleanName || !key || existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);

        const newRoom: FloorplanRoom = {
          id: `ocr_room_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          widthMeters: null,
          lengthMeters: null,
          manualAreaSqm: null,
          manualPerimeterMeters: null,
          selected: true,
          shapeType: 'rectangular',
        };

        roomsToAdd.push(newRoom);
        draftsToAdd[newRoom.id] = buildInitialDraftsForRoom(newRoom);
      }

      if (roomsToAdd.length > 0) {
        setRooms((prev) => [...roomsToAdd, ...prev]);
        setRoomDrafts((prev) => ({
          ...prev,
          ...draftsToAdd,
        }));
        if (roomListRef.current) {
          roomListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        showFeedback(
          `${roomsToAdd.length} ${
            roomsToAdd.length === 1
              ? 'ambiente identificado e adicionado'
              : 'ambientes identificados e adicionados'
          } ao início da lista!`
        );
      } else if (result.alreadyExistingCount > 0) {
        showFeedback(
          'Os ambientes identificados na planta já estão cadastrados na lista do projeto.'
        );
      } else {
        showFeedback(
          'Nenhum nome de ambiente legível foi identificado na planta. Você pode adicionar manualmente.',
          'err'
        );
      }
    } catch (err: any) {
      console.error('[OCR Planta] Falha ao identificar ambientes:', err);
      setOcrError(
        err?.message ||
          'Não foi possível processar a imagem por OCR. Você pode continuar cadastrando os ambientes manualmente.'
      );
    } finally {
      setIsRecognizingOcr(false);
      setOcrProgress(null);
    }
  };

  const nextRoomNumber = useMemo(() => {
    return (
      rooms.reduce((max, r) => {
        const match = /^Ambiente\s+(\d+)$/i.exec((r.name || '').trim());
        return match ? Math.max(max, Number(match[1])) : max;
      }, rooms.length) + 1
    );
  }, [rooms]);

  // Adiciona novo ambiente diretamente no início da lista para edição inline
  const handleAddRoom = () => {
    const newRoom = createEmptyFloorplanRoom(nextRoomNumber);
    setRooms((prev) => [newRoom, ...prev]);
    setRoomDrafts((prev) => ({
      ...prev,
      [newRoom.id]: buildInitialDraftsForRoom(newRoom),
    }));
    if (roomListRef.current) {
      roomListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // O lápis abre exclusivamente a configuração de cálculo irregular daquele ambiente
  const handleOpenIrregularConfig = (room: FloorplanRoom) => {
    setEditingRoom(room);
    setIsRoomModalOpen(true);
  };

  const handleSaveIrregularFromModal = (savedRoom: FloorplanRoom) => {
    const exists = rooms.some((r) => r.id === savedRoom.id);
    if (!exists) {
      setIsRoomModalOpen(false);
      setEditingRoom(null);
      return;
    }

    setRooms((prev) =>
      prev.map((r) =>
        r.id === savedRoom.id
          ? {
              ...r,
              manualAreaSqm: savedRoom.manualAreaSqm,
              manualPerimeterMeters: savedRoom.manualPerimeterMeters,
              shapeType: 'irregular',
              irregularData: savedRoom.irregularData,
            }
          : r
      )
    );
    setRoomDrafts((prev) => ({
      ...prev,
      [savedRoom.id]: buildInitialDraftsForRoom(savedRoom),
    }));
    showFeedback(
      `Cálculo irregular de "${savedRoom.name || 'Ambiente'}" salvo e atualizado.`
    );
    setIsRoomModalOpen(false);
    setEditingRoom(null);
  };

  const handleRevertToRectangular = (roomId: string) => {
    const target = rooms.find((r) => r.id === roomId);
    if (!target) return;

    const updated: FloorplanRoom = {
      ...target,
      shapeType: 'rectangular',
      manualAreaSqm: null,
      manualPerimeterMeters: null,
      irregularData: undefined,
    };

    setRooms((prev) => prev.map((r) => (r.id === roomId ? updated : r)));
    setRoomDrafts((prev) => ({
      ...prev,
      [roomId]: buildInitialDraftsForRoom(updated),
    }));
    setIsRoomModalOpen(false);
    setEditingRoom(null);
    showFeedback(
      `Ambiente "${target.name || 'selecionado'}" retornou ao cálculo retangular.`
    );
  };

  const handleDeleteRoom = (room: FloorplanRoom) => {
    const deletedName = room.name?.trim();
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    setRoomDrafts((prev) => {
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
    showFeedback(
      deletedName
        ? `Ambiente "${deletedName}" excluído da lista.`
        : 'Ambiente excluído da lista.'
    );
  };

  const handleToggleRoomSelected = (id: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAllRooms = (selected: boolean) => {
    setRooms((prev) => prev.map((r) => ({ ...r, selected })));
  };

  const handleRoomNameChange = (id: string, name: string) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  };

  const handleRoomDimensionChange = (
    id: string,
    field: 'width' | 'length' | 'manualArea' | 'manualPerimeter',
    rawValue: string
  ) => {
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? null : parsePtBrDimension(rawValue);

    setRoomDrafts((prev) => {
      const current = prev[id] || {
        width: '',
        length: '',
        manualArea: '',
        manualPerimeter: '',
      };
      const updated = { ...current, [field]: rawValue };
      if (field === 'width' || field === 'length') {
        updated.manualArea = '';
        updated.manualPerimeter = '';
      }
      return {
        ...prev,
        [id]: updated,
      };
    });

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === 'width') {
          return {
            ...r,
            widthMeters: parsed,
            manualAreaSqm: null,
            manualPerimeterMeters: null,
          };
        }
        if (field === 'length') {
          return {
            ...r,
            lengthMeters: parsed,
            manualAreaSqm: null,
            manualPerimeterMeters: null,
          };
        }
        if (field === 'manualArea') {
          return {
            ...r,
            manualAreaSqm: parsed,
          };
        }
        return {
          ...r,
          manualPerimeterMeters: parsed,
        };
      })
    );
  };

  const handleClearManualMetric = (id: string, target: 'area' | 'perimeter') => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return target === 'area'
          ? { ...r, manualAreaSqm: null }
          : { ...r, manualPerimeterMeters: null };
      })
    );
    setRoomDrafts((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: {
          ...current,
          ...(target === 'area' ? { manualArea: '' } : { manualPerimeter: '' }),
        },
      };
    });
  };

  const handleRoomDimensionBlur = (
    id: string,
    field: 'width' | 'length' | 'manualArea' | 'manualPerimeter'
  ) => {
    const room = rooms.find((r) => r.id === id);
    if (!room) return;
    setRoomDrafts((prev) => {
      const current = prev[id] || buildInitialDraftsForRoom(room);
      let formatted = '';
      if (field === 'width') {
        formatted = room.widthMeters !== null ? formatQuickInputNumber(room.widthMeters) : '';
      } else if (field === 'length') {
        formatted = room.lengthMeters !== null ? formatQuickInputNumber(room.lengthMeters) : '';
      } else if (field === 'manualArea') {
        formatted =
          room.manualAreaSqm !== null ? formatQuickInputNumber(room.manualAreaSqm) : '';
      } else {
        formatted =
          room.manualPerimeterMeters !== null && room.manualPerimeterMeters !== undefined
            ? formatQuickInputNumber(room.manualPerimeterMeters)
            : '';
      }
      return {
        ...prev,
        [id]: {
          ...current,
          [field]: formatted,
        },
      };
    });
  };

  // Independent Piso Vinílico loss margin handlers
  const handlePisoLossChange = (raw: string) => {
    setPisoLossInput(raw);
    if (raw.trim() === '') {
      setPisoLossPercent(0);
      return;
    }
    const parsed = parsePtBrDimension(raw);
    if (parsed !== null) {
      setPisoLossPercent(Math.min(1000, Math.max(0, parsed)));
    }
  };

  const selectPisoLossPreset = (pct: number) => {
    setPisoLossPercent(pct);
    setPisoLossInput(String(pct));
  };

  // Independent Rodapés loss margin handlers
  const handleRodapeLossChange = (raw: string) => {
    setRodapeLossInput(raw);
    if (raw.trim() === '') {
      setRodapeLossPercent(0);
      return;
    }
    const parsed = parsePtBrDimension(raw);
    if (parsed !== null) {
      setRodapeLossPercent(Math.min(1000, Math.max(0, parsed)));
    }
  };

  const selectRodapeLossPreset = (pct: number) => {
    setRodapeLossPercent(pct);
    setRodapeLossInput(String(pct));
  };

  const toggleMaterial = (key: keyof FloorplanMaterialSelections) => {
    setMaterials((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleResetAll = () => {
    setProjectId(null);
    setProjectName('');
    setAsset(null);
    setViewerError('');
    setRooms([]);
    setRoomDrafts({});
    setPisoLossPercent(10);
    setPisoLossInput('10');
    setRodapeLossPercent(5);
    setRodapeLossInput('5');
    setMaterials(DEFAULT_FLOORPLAN_MATERIALS);
    clearActiveFloorplanDraft();
    showFeedback('Calculadora de Plantas reiniciada.');
  };

  const handleSaveProject = async (silentToast = false): Promise<SavedFloorplanProject | null> => {
    if (!asset?.fileName && rooms.length === 0) {
      showFeedback('Importe uma planta ou adicione ambientes antes de salvar.', 'err');
      return null;
    }

    setIsSavingProject(true);
    try {
      const saved = await saveFloorplanProject({
        id: projectId || undefined,
        name:
          projectName.trim() ||
          asset?.fileName?.replace(/\.[^.]+$/, '') ||
          `Planta ${new Date().toLocaleDateString('pt-BR')}`,
        clientId: activeClientRecord?.id || selectedClientId || undefined,
        clientName: activeClientRecord?.name || clientSearchQuery.trim() || undefined,
        clientType: selectedClientType || undefined,
        fileName: asset?.fileName || 'Medição Manual',
        fileType: asset?.fileType || 'manual',
        previewDataUrl: asset?.previewDataUrl || '',
        rooms,
        pisoLossPercent,
        rodapeLossPercent,
        materials,
        summary,
      });

      setProjectId(saved.id);
      setProjectName(saved.name);
      setSavedProjects(getStoredFloorplanProjects());
      if (!silentToast) {
        showFeedback('Cálculo da planta salvo no histórico do CRM!');
      }
      return saved;
    } catch (err: any) {
      showFeedback(
        err?.message || 'Cálculo mantido localmente, erro ao sincronizar nuvem.',
        'err'
      );
      setSavedProjects(getStoredFloorplanProjects());
      return null;
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleLoadSavedProject = (proj: SavedFloorplanProject) => {
    activeProjectLoadRef.current = proj.id;
    setProjectId(proj.id);
    setProjectName(proj.name);
    setRooms(Array.isArray(proj.rooms) ? proj.rooms : []);
    const drafts: Record<string, RoomInputDrafts> = {};
    for (const r of proj.rooms || []) {
      drafts[r.id] = buildInitialDraftsForRoom(r);
    }
    setRoomDrafts(drafts);

    const nextPisoLoss = proj.pisoLossPercent ?? 10;
    const nextRodapeLoss = proj.rodapeLossPercent ?? 0;
    setPisoLossPercent(nextPisoLoss);
    setPisoLossInput(formatPercentDisplay(nextPisoLoss));
    setRodapeLossPercent(nextRodapeLoss);
    setRodapeLossInput(formatPercentDisplay(nextRodapeLoss));
    setMaterials({
      piso: Boolean(proj.materials?.piso ?? true),
      rodape: Boolean(proj.materials?.rodape ?? true),
    });

    if (proj.clientId) {
      const found = clientsList.find((c) => c.id === proj.clientId);
      if (found) {
        setSelectedClientId(found.id);
        setClientSearchQuery(found.name);
        setSelectedClientType(found.clientType || proj.clientType || 'Cliente Final');
      } else {
        setSelectedClientId(proj.clientId);
        setClientSearchQuery(proj.clientName || '');
        if (proj.clientType) setSelectedClientType(proj.clientType);
      }
    }

    if (proj.fileName) {
      setAsset({
        fileName: proj.fileName,
        fileType: proj.fileType || 'image/jpeg',
        previewDataUrl: proj.previewDataUrl || '',
        pageCount: 1,
        currentPage: 1,
      });

      if (proj.id) {
        loadFloorplanProjectFullImage(proj)
          .then((fullUrl) => {
            if (!fullUrl || activeProjectLoadRef.current !== proj.id) return;
            setAsset((prev) =>
              prev && fullUrl !== prev.previewDataUrl
                ? { ...prev, previewDataUrl: fullUrl }
                : prev
            );
          })
          .catch(() => {});
      }
    } else {
      setAsset(null);
    }

    setShowHistoryPanel(false);
    setViewerError('');
    showFeedback(`Projeto "${proj.name}" carregado com sucesso.`);
  };

  const handleDeleteSavedProject = async (id: string) => {
    try {
      await deleteFloorplanProject(id);
      setSavedProjects(getStoredFloorplanProjects());
      if (projectId === id) {
        setProjectId(null);
      }
      showFeedback('Registro excluído do histórico.');
    } catch (err: any) {
      showFeedback(err?.message || 'Erro ao excluir registro.', 'err');
    }
  };

  const handleSendToQuickBudget = async () => {
    if (!materials.piso && !materials.rodape) {
      showFeedback(
        'Selecione ao menos um material (Piso Vinílico ou Rodapés) em MATERIAIS A CALCULAR.',
        'err'
      );
      return;
    }

    const hasValidQuantity =
      (materials.piso && summary.pisoSqmWithLoss > 0) ||
      (materials.rodape && summary.rodapeMlWithLoss > 0);

    if (!hasValidQuantity) {
      showFeedback(
        'Nenhum quantitativo calculado acima de zero. Preencha as medidas dos ambientes selecionados.',
        'err'
      );
      return;
    }

    void handleSaveProject(true).catch(() => {});

    const draft: QuickBudgetTransferDraft = {
      source: 'calculadora_plantas',
      projectId: projectId || undefined,
      projectName:
        projectName.trim() || asset?.fileName?.replace(/\.[^.]+$/, '') || 'Planta Baixa',
      clientId: activeClientRecord?.id || selectedClientId || undefined,
      clientName: activeClientRecord?.name || clientSearchQuery.trim() || undefined,
      clientType: selectedClientType || 'Cliente Final',
      pisoSqm:
        materials.piso && summary.pisoSqmWithLoss > 0
          ? formatQuickInputNumber(summary.pisoSqmWithLoss)
          : '',
      rodapeMl:
        materials.rodape && summary.rodapeMlWithLoss > 0
          ? formatQuickInputNumber(summary.rodapeMlWithLoss)
          : '',
      ripadoSqm: '',
      tetoSqm: '',
      mantaSqm: '',
      selectedRoomsCount: summary.selectedRoomsCount,
      totalAreaSqm: summary.totalSelectedAreaSqm,
      totalPerimeterMeters: summary.totalSelectedPerimeterMeters,
      pisoLossPercent: summary.pisoLossPercent,
      rodapeLossPercent: summary.rodapeLossPercent,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(FLOORPLAN_QUICK_DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      console.error('Erro ao gravar rascunho para Orçamento Rápido:', err);
      showFeedback('Não foi possível preparar a transferência para o Orçamento.', 'err');
      return;
    }

    if (activeClientRecord?.id) {
      const selectedSummaryParts = [
        draft.pisoSqm
          ? `Piso Vinílico: ${draft.pisoSqm} m² (perda ${formatPercentDisplay(summary.pisoLossPercent)}%)`
          : '',
        draft.rodapeMl
          ? `Rodapés: ${draft.rodapeMl} ml (perda ${formatPercentDisplay(summary.rodapeLossPercent)}%)`
          : '',
      ].filter(Boolean);

      addClientActivity({
        clientId: activeClientRecord.id,
        type: 'calculo_realizado',
        title: `Calculadora de Plantas (${draft.projectName})`,
        description: `Quantitativos enviados ao Orçamento Rápido (${summary.selectedRoomsCount} ambientes · Área base ${formatPtBrNumber(summary.totalSelectedAreaSqm)} m² · Perímetro base ${formatPtBrNumber(summary.totalSelectedPerimeterMeters)} ml).`,
        date: new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        relevantInfo: selectedSummaryParts.join(' · '),
      });
    }

    if (onSelectClient && activeClientRecord) {
      onSelectClient(activeClientRecord);
    }

    showFeedback('Quantitativos transferidos para o Orçamento Rápido!');

    if (onGoToOrcamento) {
      setTimeout(() => {
        onGoToOrcamento();
      }, 250);
    }
  };

  const anyMaterialSelected = materials.piso || materials.rodape;

  return (
    <div className="space-y-5">
      {/* Toast de feedback */}
      {toastMsg && (
        <div
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 animate-in slide-in-from-bottom-3 duration-200 text-white"
          style={{
            backgroundColor: toastMsg.kind === 'err' ? '#b91c1c' : crm.secondary,
            borderColor: toastMsg.kind === 'err' ? '#f87171' : crm.accent,
          }}
        >
          {toastMsg.kind === 'err' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <Check className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ================================================================
          1. CABEÇALHO DO PROJETO, CLIENTE E HISTÓRICO
         ================================================================ */}
      <div
        className="rounded-3xl border shadow-xs p-5 sm:p-6 space-y-5"
        style={{
          backgroundColor: crm.cardBg,
          borderColor: crm.cardBorder,
        }}
      >
        <div
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b"
          style={{ borderColor: crm.dividerColor }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: crm.indicatorBg,
                color: crm.indicatorText,
              }}
            >
              <Maximize className="w-5 h-5" />
            </div>
            <div>
              <h2
                className="text-base sm:text-lg font-extrabold tracking-tight"
                style={{ color: crm.highlightText }}
              >
                Cálculo Manual de Plantas & Ambientes
              </h2>
              <p className="text-xs text-slate-500">
                Visualize a planta do imóvel, cadastre os ambientes manualmente, ajuste perdas independentes e envie ao Orçamento Rápido.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryPanel((prev) => !prev)}
              className="h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
              style={{
                backgroundColor: showHistoryPanel ? crm.indicatorBg : crm.cardTintBg,
                borderColor: crm.cardTintBorder,
                color: crm.primary,
              }}
            >
              <History className="w-3.5 h-3.5" />
              <span>Plantas Salvas ({savedProjects.length})</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSaveProject(false)}
              disabled={isSavingProject}
              className="h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: crm.cardBg,
                borderColor: crm.cardBorder,
                color: crm.highlightText,
              }}
            >
              {isSavingProject ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: crm.primary }} />
              ) : (
                <Save className="w-3.5 h-3.5" style={{ color: crm.primary }} />
              )}
              <span>Salvar Cálculo</span>
            </button>
          </div>
        </div>

        {/* Histórico de Plantas Salvas */}
        {showHistoryPanel && (
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{
              backgroundColor: crm.panelSubtleBg,
              borderColor: crm.cardTintBorder,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" style={{ color: crm.primary }} />
                <h3
                  className="text-xs sm:text-sm font-bold"
                  style={{ color: crm.highlightText }}
                >
                  Histórico de Plantas e Cálculos Salvos
                </h3>
                {isLoadingHistory && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryPanel(false)}
                className="p-1 rounded-lg hover:bg-white text-slate-500 cursor-pointer"
                title="Fechar histórico"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                Nenhuma planta salva ainda. Clique em "Salvar Cálculo" para gravar seus projetos no histórico.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {savedProjects.map((proj) => {
                  const isCurrent = proj.id === projectId;
                  return (
                    <div
                      key={proj.id}
                      className="rounded-xl border p-3 flex items-start justify-between gap-2.5 transition-colors"
                      style={{
                        backgroundColor: crm.cardBg,
                        borderColor: isCurrent ? crm.primary : crm.cardBorder,
                      }}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p
                          className="text-xs font-bold truncate"
                          style={{ color: crm.highlightText }}
                          title={proj.name}
                        >
                          {proj.name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {proj.clientName ? `${proj.clientName} · ` : ''}
                          {proj.summary?.selectedRoomsCount || 0} amb. ·{' '}
                          <span className="tabular-nums font-semibold">
                            {formatPtBrNumber(proj.summary?.totalSelectedAreaSqm || 0)} m²
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(proj.updatedAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {proj.updatedBy}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedProject(proj)}
                          className="h-7 px-2.5 rounded-lg text-[11px] font-bold text-white cursor-pointer"
                          style={{ backgroundColor: crm.primary }}
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSavedProject(proj.id)}
                          className="h-7 w-7 rounded-lg border flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                          style={{ borderColor: crm.cardBorder }}
                          title="Excluir do histórico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Campos: Obra | Cliente | Tipo de Cliente */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: crm.highlightText }}
            >
              <Building2 className="w-4 h-4" style={{ color: crm.primary }} />
              <span>Identificação da Planta / Obra</span>
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Ex.: Apartamento 402 - Residencial Solar"
              className="w-full h-11 rounded-xl border px-3.5 text-xs sm:text-sm font-medium text-slate-800 outline-none transition-all"
              style={{
                backgroundColor: crm.inputBg,
                borderColor: crm.inputBorder,
              }}
            />
          </div>

          <div className="space-y-1.5" ref={clientDropdownRef}>
            <label
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: crm.highlightText }}
            >
              <User className="w-4 h-4" style={{ color: crm.primary }} />
              <span>Cliente (Opcional)</span>
            </label>
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={clientSearchQuery}
                  onChange={(e) => {
                    setClientSearchQuery(e.target.value);
                    setIsClientDropdownOpen(true);
                  }}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  placeholder="Digite o nome do cliente..."
                  className="w-full h-11 rounded-xl border pl-10 pr-10 text-xs sm:text-sm font-medium text-slate-800 outline-none transition-all"
                  style={{
                    backgroundColor: crm.inputBg,
                    borderColor: crm.inputBorder,
                  }}
                />
                {clientSearchQuery ? (
                  <button
                    type="button"
                    onClick={handleClearClient}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title="Limpar seleção"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 pointer-events-none" />
                )}
              </div>

              {isClientDropdownOpen && (
                <div
                  className="absolute z-40 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border shadow-lg py-1"
                  style={{
                    backgroundColor: crm.cardBg,
                    borderColor: crm.cardBorder,
                  }}
                >
                  {filteredClients.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      Nenhum cliente encontrado
                    </div>
                  ) : (
                    filteredClients.map((c) => {
                      const isSel = c.id === selectedClientId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectClientRecord(c)}
                          className="w-full px-3.5 py-2 text-left text-xs sm:text-sm flex items-center justify-between transition-colors cursor-pointer"
                          style={{
                            backgroundColor: isSel ? crm.cardTintBg : 'transparent',
                            color: isSel ? crm.primary : '#1e293b',
                          }}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{c.name}</p>
                            {c.phone || c.whatsapp ? (
                              <p className="text-[11px] text-slate-400">
                                {c.phone || c.whatsapp}
                              </p>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium shrink-0 ml-2">
                            {c.clientType || 'Cliente Final'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
              style={{ color: crm.highlightText }}
            >
              <Users className="w-4 h-4" style={{ color: crm.primary }} />
              <span>Tipo de Cliente</span>
            </label>
            <div className="relative">
              <select
                value={selectedClientType}
                onChange={(e) => setSelectedClientType(e.target.value)}
                className="w-full h-11 rounded-xl border px-3.5 pr-10 text-xs sm:text-sm font-medium text-slate-800 outline-none cursor-pointer appearance-none"
                style={{
                  backgroundColor: crm.inputBg,
                  borderColor: crm.inputBorder,
                }}
              >
                {CLIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================
          2. ESTRUTURA LADO A LADO (50% / 50% COM ALTURA IDÊNTICA):
             LADO ESQUERDO — PLANTA DO IMÓVEL
             LADO DIREITO  — AMBIENTES DO PROJETO
         ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* LADO ESQUERDO — PLANTA DO IMÓVEL */}
        <div
          className="rounded-3xl border shadow-xs p-5 flex flex-col gap-3.5 lg:h-[620px] min-w-0"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
          }}
        >
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3
                className="text-sm sm:text-base font-extrabold uppercase tracking-wide"
                style={{ color: crm.highlightText }}
              >
                Planta do Imóvel
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cole direto do WhatsApp com Ctrl + V ou importe em PDF, JPG, JPEG ou PNG.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleIdentifyRooms()}
              disabled={!asset?.previewDataUrl || isRecognizingOcr}
              className="h-9 px-3.5 rounded-xl text-[11px] sm:text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ backgroundColor: crm.primary }}
              title={
                asset?.previewDataUrl
                  ? 'Analisar a planta importada e reconhecer os nomes dos ambientes por OCR'
                  : 'Importe ou cole uma planta para habilitar a identificação'
              }
            >
              {isRecognizingOcr ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <ScanText className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {isRecognizingOcr ? 'Identificando...' : 'IDENTIFICAR AMBIENTES'}
              </span>
            </button>
          </div>

          {isRecognizingOcr && ocrProgress && (
            <div
              className="shrink-0 rounded-xl border px-3.5 py-2.5 space-y-1.5"
              style={{
                backgroundColor: crm.cardTintBg,
                borderColor: crm.cardTintBorder,
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: crm.highlightText }}>
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: crm.primary }} />
                  {ocrProgress.message}
                </span>
                <span className="tabular-nums font-bold" style={{ color: crm.primary }}>
                  {ocrProgress.progress}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${Math.max(8, Math.min(100, ocrProgress.progress))}%`,
                    backgroundColor: crm.primary,
                  }}
                />
              </div>
            </div>
          )}

          {(viewerError || ocrError) && (
            <div className="shrink-0 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{viewerError || ocrError}</span>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            <FloorplanViewer
              asset={asset}
              onAssetLoaded={handleAssetLoaded}
              onError={setViewerError}
              disabled={isRecognizingOcr}
            />
          </div>
        </div>

        {/* LADO DIREITO — AMBIENTES DO PROJETO */}
        <div
          className="rounded-3xl border shadow-xs p-5 flex flex-col gap-4 lg:h-[620px] min-w-0"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
          }}
        >
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3
                className="text-sm sm:text-base font-extrabold uppercase tracking-wide"
                style={{ color: crm.highlightText }}
              >
                Ambientes do Projeto ({summary.selectedRoomsCount}/{summary.totalRoomsCount})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Edite nome, largura e comprimento na própria lista ou clique no lápis para cálculo irregular.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddRoom}
              className="h-10 px-4 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
              style={{ backgroundColor: crm.primary }}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Adicionar Ambiente</span>
            </button>
          </div>

          {rooms.length > 0 && (
            <div
              className="shrink-0 flex flex-wrap items-center justify-between gap-2 pb-3 border-b"
              style={{ borderColor: crm.dividerColor }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAllRooms(true)}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: crm.cardBg,
                    borderColor: crm.cardBorder,
                    color: crm.highlightText,
                  }}
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAllRooms(false)}
                  className="h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer text-slate-600"
                  style={{
                    backgroundColor: crm.cardBg,
                    borderColor: crm.cardBorder,
                  }}
                >
                  Desmarcar todos
                </button>
              </div>

              <div className="text-xs font-semibold text-slate-500 tabular-nums">
                Base selecionada:{' '}
                <strong style={{ color: crm.highlightText }}>
                  {formatPtBrNumber(summary.totalSelectedAreaSqm)} m²
                </strong>{' '}
                ·{' '}
                <strong style={{ color: crm.highlightText }}>
                  {formatPtBrNumber(summary.totalSelectedPerimeterMeters)} ml
                </strong>
              </div>
            </div>
          )}

          {summary.duplicateRoomNames.length > 0 && (
            <div className="shrink-0 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Atenção: há ambientes selecionados com nomes repetidos (
                <strong>{summary.duplicateRoomNames.join(', ')}</strong>). Verifique para evitar soma duplicada.
              </span>
            </div>
          )}

          {rooms.length === 0 ? (
            <div
              className="flex-1 min-h-[340px] lg:min-h-0 rounded-2xl border border-dashed p-8 text-center flex flex-col items-center justify-center gap-3"
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
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-bold" style={{ color: crm.highlightText }}>
                  Nenhum ambiente adicionado ainda
                </p>
                <p className="text-xs text-slate-500">
                  Importe a planta e clique em &quot;IDENTIFICAR AMBIENTES&quot; ou clique em &quot;Adicionar Ambiente&quot; para preencher nome, largura e comprimento diretamente na lista.
                </p>
              </div>
            </div>
          ) : (
            <div
              ref={roomListRef}
              className="flex-1 min-h-0 max-h-[460px] lg:max-h-none overflow-y-auto space-y-3 pr-1"
            >
              {rooms.map((room, index) => {
                const metrics = computeRoomMetrics(room);
                const draft = roomDrafts[room.id] || buildInitialDraftsForRoom(room);
                const hasSides =
                  room.widthMeters !== null &&
                  room.widthMeters > 0 &&
                  room.lengthMeters !== null &&
                  room.lengthMeters > 0;

                const areaValue =
                  room.manualAreaSqm !== null
                    ? draft.manualArea
                    : hasSides && metrics.hasValidArea
                      ? formatQuickInputNumber(metrics.areaSqm)
                      : draft.manualArea;

                const perimeterValue =
                  room.manualPerimeterMeters !== null &&
                  room.manualPerimeterMeters !== undefined
                    ? draft.manualPerimeter
                    : hasSides && metrics.hasValidPerimeter
                      ? formatQuickInputNumber(metrics.perimeterMeters)
                      : draft.manualPerimeter;

                const isIrregularRoom = room.shapeType === 'irregular';
                const irregularSegmentsCount = room.irregularData?.segments?.length || 0;

                return (
                  <div
                    key={room.id}
                    className={`rounded-2xl border p-3.5 space-y-3 transition-opacity ${
                      room.selected ? '' : 'opacity-60'
                    }`}
                    style={{
                      backgroundColor: room.selected ? crm.panelSubtleBg : crm.cardBg,
                      borderColor: room.selected ? crm.cardTintBorder : crm.cardBorder,
                    }}
                  >
                    {/* Linha superior do ambiente: checkbox, nome, resumo, editar, excluir */}
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleRoomSelected(room.id)}
                        className="w-5 h-5 rounded-md border inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: room.selected ? crm.primary : crm.inputBg,
                          borderColor: room.selected ? crm.primary : crm.inputBorder,
                          color: '#ffffff',
                        }}
                        aria-label={`Incluir ${room.name || `Ambiente ${index + 1}`} no cálculo`}
                        title={
                          room.selected
                            ? 'Incluído no cálculo (clique para desmarcar)'
                            : 'Excluído do cálculo (clique para incluir)'
                        }
                      >
                        {room.selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => handleRoomNameChange(room.id, e.target.value)}
                        placeholder="Nome do ambiente (ex.: Sala de Estar)"
                        className="flex-1 h-9 rounded-xl border px-3 text-xs sm:text-sm font-bold outline-none min-w-0"
                        style={{
                          backgroundColor: crm.inputBg,
                          borderColor: crm.inputBorder,
                          color: crm.highlightText,
                        }}
                      />

                      <div className="hidden sm:flex items-center gap-2 text-xs font-bold tabular-nums shrink-0">
                        <span style={{ color: crm.primary }}>
                          {formatPtBrNumber(metrics.areaSqm)} m²
                        </span>
                        <span className="text-slate-300">|</span>
                        <span style={{ color: crm.highlightText }}>
                          {formatPtBrNumber(metrics.perimeterMeters)} ml
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenIrregularConfig(room)}
                        className="w-8 h-8 rounded-lg border inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: isIrregularRoom ? crm.cardTintBg : crm.cardBg,
                          borderColor: isIrregularRoom ? crm.primary : crm.cardBorder,
                          color: crm.primary,
                        }}
                        title="Configurar cálculo irregular do ambiente"
                        aria-label={`Configurar cálculo irregular de ${room.name || `Ambiente ${index + 1}`}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteRoom(room)}
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                        title="Excluir ambiente"
                        aria-label={`Excluir ${room.name || `Ambiente ${index + 1}`}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isIrregularRoom ? (
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
                          <span>
                            {room.irregularData?.method === 'floorplan_trace'
                              ? 'Contorno da planta'
                              : 'Formato irregular'}{' '}
                            ·{' '}
                            <span className="tabular-nums">
                              {irregularSegmentsCount}{' '}
                              {irregularSegmentsCount === 1 ? 'trecho' : 'trechos'}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRevertToRectangular(room.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold cursor-pointer hover:opacity-90 transition-opacity"
                            style={{
                              backgroundColor: crm.cardBg,
                              borderColor: crm.cardTintBorder,
                              color: crm.primary,
                            }}
                            title="Retornar ao cálculo retangular (Largura × Comprimento)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retornar ao retangular</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2.5 tabular-nums">
                          <div
                            className="px-3 py-1.5 rounded-xl border text-xs font-extrabold"
                            style={{
                              backgroundColor: crm.cardTintBg,
                              borderColor: crm.cardTintBorder,
                              color: crm.primary,
                            }}
                          >
                            Área: {formatPtBrNumber(metrics.areaSqm)} m²
                          </div>
                          <div
                            className="px-3 py-1.5 rounded-xl border text-xs font-extrabold"
                            style={{
                              backgroundColor: crm.cardBg,
                              borderColor: crm.cardBorder,
                              color: crm.highlightText,
                            }}
                          >
                            Perímetro: {formatPtBrNumber(metrics.perimeterMeters)} ml
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Grid de dimensões retangulares: Largura | Comprimento | Área (m²) | Perímetro (ml) */
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Largura (m)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.width}
                            onChange={(e) =>
                              handleRoomDimensionChange(room.id, 'width', e.target.value)
                            }
                            onBlur={() => handleRoomDimensionBlur(room.id, 'width')}
                            placeholder="0,00"
                            className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-semibold text-center outline-none tabular-nums"
                            style={{
                              backgroundColor: crm.inputBg,
                              borderColor: crm.inputBorder,
                              color: crm.highlightText,
                            }}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Comprimento (m)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.length}
                            onChange={(e) =>
                              handleRoomDimensionChange(room.id, 'length', e.target.value)
                            }
                            onBlur={() => handleRoomDimensionBlur(room.id, 'length')}
                            placeholder="0,00"
                            className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-semibold text-center outline-none tabular-nums"
                            style={{
                              backgroundColor: crm.inputBg,
                              borderColor: crm.inputBorder,
                              color: crm.highlightText,
                            }}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Área (m²)
                            </label>
                            {metrics.isManualArea && (
                              <button
                                type="button"
                                onClick={() => handleClearManualMetric(room.id, 'area')}
                                className="text-[10px] font-bold cursor-pointer hover:underline"
                                style={{ color: crm.primary }}
                                title={
                                  hasSides
                                    ? 'Voltar para cálculo automático L × C'
                                    : 'Área informada manualmente'
                                }
                              >
                                {hasSides ? '↺ Auto' : 'Manual'}
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={areaValue}
                            onChange={(e) =>
                              handleRoomDimensionChange(room.id, 'manualArea', e.target.value)
                            }
                            onBlur={() => handleRoomDimensionBlur(room.id, 'manualArea')}
                            placeholder="0,00"
                            title="Calculada automaticamente por Largura × Comprimento ou editável manualmente para ambientes irregulares"
                            className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-extrabold text-center outline-none tabular-nums"
                            style={{
                              backgroundColor: metrics.isManualArea ? crm.cardTintBg : crm.inputBg,
                              borderColor: metrics.isManualArea ? crm.primary : crm.inputBorder,
                              color: crm.primary,
                            }}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Perímetro (ml)
                            </label>
                            {metrics.isManualPerimeter && (
                              <button
                                type="button"
                                onClick={() => handleClearManualMetric(room.id, 'perimeter')}
                                className="text-[10px] font-bold cursor-pointer hover:underline"
                                style={{ color: crm.primary }}
                                title={
                                  hasSides
                                    ? 'Voltar para cálculo automático 2 × (L + C)'
                                    : 'Perímetro informado manualmente'
                                }
                              >
                                {hasSides ? '↺ Auto' : 'Manual'}
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={perimeterValue}
                            onChange={(e) =>
                              handleRoomDimensionChange(
                                room.id,
                                'manualPerimeter',
                                e.target.value
                              )
                            }
                            onBlur={() => handleRoomDimensionBlur(room.id, 'manualPerimeter')}
                            placeholder="0,00"
                            title="Calculado automaticamente por 2 × (Largura + Comprimento) ou editável manualmente para ambientes irregulares"
                            className="w-full h-9 rounded-xl border px-2.5 text-xs sm:text-sm font-extrabold text-center outline-none tabular-nums"
                            style={{
                              backgroundColor: metrics.isManualPerimeter
                                ? crm.cardTintBg
                                : crm.inputBg,
                              borderColor: metrics.isManualPerimeter
                                ? crm.primary
                                : crm.inputBorder,
                              color: crm.highlightText,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          3. PARTE INFERIOR:
             MATERIAIS A CALCULAR + MARGEM DE PERDA INDEPENDENTE + RESULTADOS CALCULADOS
         ================================================================ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Esquerda/Centro: MATERIAIS A CALCULAR & MARGEM DE PERDA INDEPENDENTE */}
        <div
          className="xl:col-span-7 rounded-3xl border shadow-xs p-5 sm:p-6 space-y-5"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
          }}
        >
          <div>
            <h3
              className="text-sm sm:text-base font-extrabold uppercase tracking-wide"
              style={{ color: crm.highlightText }}
            >
              Materiais a Calcular & Margem de Perda Independente
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ative apenas os materiais desejados e defina a porcentagem de perda de forma separada para cada um.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARD 1: PISO VINÍLICO */}
            <div
              className="rounded-2xl border p-4 space-y-4 transition-colors"
              style={{
                backgroundColor: materials.piso ? crm.cardTintBg : crm.panelSubtleBg,
                borderColor: materials.piso ? crm.primary : crm.cardBorder,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: materials.piso ? crm.primary : crm.cardBg,
                      color: materials.piso ? '#ffffff' : '#64748b',
                      border: materials.piso ? 'none' : `1px solid ${crm.cardBorder}`,
                    }}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-extrabold"
                      style={{ color: crm.highlightText }}
                    >
                      Piso Vinílico
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Área total × (1 + perda / 100)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleMaterial('piso')}
                  className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: materials.piso ? crm.primary : crm.cardBg,
                    borderColor: materials.piso ? crm.primary : crm.inputBorder,
                    color: materials.piso ? '#ffffff' : '#475569',
                  }}
                >
                  {materials.piso && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  <span>{materials.piso ? 'Incluído' : 'Incluir'}</span>
                </button>
              </div>

              <div
                className="pt-3 border-t space-y-2.5"
                style={{ borderColor: crm.dividerColor }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Margem de Perda — Piso
                  </span>
                  <span
                    className="text-xs font-extrabold tabular-nums"
                    style={{ color: crm.primary }}
                  >
                    {materials.piso
                      ? `${formatPtBrNumber(summary.pisoSqmWithLoss)} m²`
                      : 'Inativo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {LOSS_MARGIN_PRESETS.map((pct) => {
                    const active = pisoLossPercent === pct;
                    return (
                      <button
                        key={`piso-${pct}`}
                        type="button"
                        onClick={() => selectPisoLossPreset(pct)}
                        className="h-8 px-2.5 rounded-lg border text-xs font-bold tabular-nums transition-colors cursor-pointer"
                        style={{
                          backgroundColor: active ? crm.primary : crm.cardBg,
                          borderColor: active ? crm.primary : crm.cardBorder,
                          color: active ? '#ffffff' : crm.highlightText,
                        }}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                  <div className="relative flex-1 min-w-[78px]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pisoLossInput}
                      onChange={(e) => handlePisoLossChange(e.target.value)}
                      className="w-full h-8 rounded-lg border pl-2 pr-6 text-xs font-bold text-center outline-none tabular-nums"
                      style={{
                        backgroundColor: crm.inputBg,
                        borderColor: crm.inputBorder,
                        color: crm.highlightText,
                      }}
                      aria-label="Margem de perda do Piso Vinílico em porcentagem"
                    />
                    <span className="text-[11px] font-bold text-slate-400 absolute right-2 top-1.5 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 tabular-nums">
                  Base: {formatPtBrNumber(summary.totalSelectedAreaSqm)} m² · Perda aplicada:{' '}
                  <strong>{formatPercentDisplay(summary.pisoLossPercent)}%</strong>
                </p>
              </div>
            </div>

            {/* CARD 2: RODAPÉS */}
            <div
              className="rounded-2xl border p-4 space-y-4 transition-colors"
              style={{
                backgroundColor: materials.rodape ? crm.cardTintBg : crm.panelSubtleBg,
                borderColor: materials.rodape ? crm.primary : crm.cardBorder,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: materials.rodape ? crm.primary : crm.cardBg,
                      color: materials.rodape ? '#ffffff' : '#64748b',
                      border: materials.rodape ? 'none' : `1px solid ${crm.cardBorder}`,
                    }}
                  >
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-extrabold"
                      style={{ color: crm.highlightText }}
                    >
                      Rodapés
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Perímetro total × (1 + perda / 100)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleMaterial('rodape')}
                  className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: materials.rodape ? crm.primary : crm.cardBg,
                    borderColor: materials.rodape ? crm.primary : crm.inputBorder,
                    color: materials.rodape ? '#ffffff' : '#475569',
                  }}
                >
                  {materials.rodape && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  <span>{materials.rodape ? 'Incluído' : 'Incluir'}</span>
                </button>
              </div>

              <div
                className="pt-3 border-t space-y-2.5"
                style={{ borderColor: crm.dividerColor }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Margem de Perda — Rodapés
                  </span>
                  <span
                    className="text-xs font-extrabold tabular-nums"
                    style={{ color: crm.primary }}
                  >
                    {materials.rodape
                      ? `${formatPtBrNumber(summary.rodapeMlWithLoss)} ml`
                      : 'Inativo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {LOSS_MARGIN_PRESETS.map((pct) => {
                    const active = rodapeLossPercent === pct;
                    return (
                      <button
                        key={`rodape-${pct}`}
                        type="button"
                        onClick={() => selectRodapeLossPreset(pct)}
                        className="h-8 px-2.5 rounded-lg border text-xs font-bold tabular-nums transition-colors cursor-pointer"
                        style={{
                          backgroundColor: active ? crm.primary : crm.cardBg,
                          borderColor: active ? crm.primary : crm.cardBorder,
                          color: active ? '#ffffff' : crm.highlightText,
                        }}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                  <div className="relative flex-1 min-w-[78px]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rodapeLossInput}
                      onChange={(e) => handleRodapeLossChange(e.target.value)}
                      className="w-full h-8 rounded-lg border pl-2 pr-6 text-xs font-bold text-center outline-none tabular-nums"
                      style={{
                        backgroundColor: crm.inputBg,
                        borderColor: crm.inputBorder,
                        color: crm.highlightText,
                      }}
                      aria-label="Margem de perda dos Rodapés em porcentagem"
                    />
                    <span className="text-[11px] font-bold text-slate-400 absolute right-2 top-1.5 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 tabular-nums">
                  Base: {formatPtBrNumber(summary.totalSelectedPerimeterMeters)} ml · Perda aplicada:{' '}
                  <strong>{formatPercentDisplay(summary.rodapeLossPercent)}%</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Direita: RESULTADOS CALCULADOS + AÇÃO PRINCIPAL */}
        <div
          className="xl:col-span-5 rounded-3xl border shadow-xs p-5 sm:p-6 flex flex-col justify-between gap-5"
          style={{
            backgroundColor: crm.cardBg,
            borderColor: crm.cardBorder,
          }}
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3
                className="text-sm sm:text-base font-extrabold uppercase tracking-wide"
                style={{ color: crm.highlightText }}
              >
                Resultados Calculados
              </h3>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg tabular-nums"
                style={{
                  backgroundColor: crm.indicatorBg,
                  color: crm.indicatorText,
                }}
              >
                {summary.selectedRoomsCount}{' '}
                {summary.selectedRoomsCount === 1 ? 'ambiente' : 'ambientes'}
              </span>
            </div>

            <div className="space-y-2.5">
              {/* 1. Área total dos ambientes */}
              <div
                className="rounded-2xl border p-3.5 flex items-center justify-between gap-3"
                style={{
                  backgroundColor: crm.panelSubtleBg,
                  borderColor: crm.cardBorder,
                }}
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: crm.highlightText }}>
                    Área total dos ambientes
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Perímetro base somado: {formatPtBrNumber(summary.totalSelectedPerimeterMeters)} ml
                  </p>
                </div>
                <span
                  className="text-lg font-extrabold tabular-nums shrink-0"
                  style={{ color: crm.highlightText }}
                >
                  {formatPtBrNumber(summary.totalSelectedAreaSqm)} m²
                </span>
              </div>

              {/* 2. Piso Vinílico com margem de perda */}
              <div
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                  materials.piso ? '' : 'opacity-60'
                }`}
                style={{
                  backgroundColor: materials.piso ? crm.cardTintBg : crm.panelSubtleBg,
                  borderColor: materials.piso ? crm.cardTintBorder : crm.cardBorder,
                }}
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: crm.highlightText }}>
                    Piso Vinílico com margem de perda
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {materials.piso
                      ? `Perda independente aplicada: ${formatPercentDisplay(summary.pisoLossPercent)}%`
                      : 'Material desmarcado para o orçamento'}
                  </p>
                </div>
                <span
                  className="text-xl font-black tabular-nums shrink-0"
                  style={{ color: materials.piso ? crm.primary : '#94a3b8' }}
                >
                  {materials.piso
                    ? `${formatPtBrNumber(summary.pisoSqmWithLoss)} m²`
                    : '—'}
                </span>
              </div>

              {/* 3. Rodapé com margem de perda */}
              <div
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                  materials.rodape ? '' : 'opacity-60'
                }`}
                style={{
                  backgroundColor: materials.rodape ? crm.cardTintBg : crm.panelSubtleBg,
                  borderColor: materials.rodape ? crm.cardTintBorder : crm.cardBorder,
                }}
              >
                <div>
                  <p className="text-xs font-bold" style={{ color: crm.highlightText }}>
                    Rodapé com margem de perda
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {materials.rodape
                      ? `Perda independente aplicada: ${formatPercentDisplay(summary.rodapeLossPercent)}%`
                      : 'Material desmarcado para o orçamento'}
                  </p>
                </div>
                <span
                  className="text-xl font-black tabular-nums shrink-0"
                  style={{ color: materials.rodape ? crm.primary : '#94a3b8' }}
                >
                  {materials.rodape
                    ? `${formatPtBrNumber(summary.rodapeMlWithLoss)} ml`
                    : '—'}
                </span>
              </div>

              {!anyMaterialSelected && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-medium">
                  Selecione ao menos Piso Vinílico ou Rodapés ao lado para enviar ao Orçamento Rápido.
                </div>
              )}
            </div>
          </div>

          {/* Botões finais */}
          <div
            className="space-y-2.5 pt-3 border-t"
            style={{ borderColor: crm.dividerColor }}
          >
            <button
              type="button"
              onClick={() => void handleSendToQuickBudget()}
              className="w-full h-12 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              style={{ backgroundColor: crm.primary }}
            >
              <Send className="w-4 h-4" />
              <span>ENVIAR PARA O ORÇAMENTO</span>
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleResetAll}
                className="h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: crm.cardBg,
                  borderColor: crm.cardBorder,
                  color: crm.highlightText,
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Cálculo</span>
              </button>

              <button
                type="button"
                onClick={() => void handleSaveProject(false)}
                disabled={isSavingProject}
                className="h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: crm.cardTintBg,
                  borderColor: crm.cardTintBorder,
                  color: crm.primary,
                }}
              >
                {isSavingProject ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Salvar Histórico</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 justify-center text-center">
              <DoorOpen className="w-3.5 h-3.5 shrink-0" />
              <span>
                O orçamento não é gerado automaticamente — revise os quantitativos no Orçamento Rápido antes de confirmar.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Configuração de Cálculo Irregular (exclusivo do botão lápis) */}
      <RoomGeometryModal
        isOpen={isRoomModalOpen}
        editingRoom={editingRoom}
        floorplanAsset={asset}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSave={handleSaveIrregularFromModal}
        onRevertToRectangular={handleRevertToRectangular}
      />
    </div>
  );
};
