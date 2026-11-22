import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home,
  FileText,
  User,
  ArrowLeft,
  Save,
  CheckCircle2,
  Phone,
  Tag,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Truck,
  Percent,
  DollarSign,
  Download,
  Printer,
  Share2,
  Calculator,
  RefreshCw,
  Search,
  Layers,
  Package,
  Check,
  ChevronRight,
  ArrowRight,
  Sparkles,
  X,
  Filter,
  Edit3,
  Pencil,
  Loader2,
  RotateCcw,
  ChevronDown,
  Copy,
} from 'lucide-react';
import { ClientRecord, ClientType, SavedOrcamento, OrcamentoStatus, PriceTableTier } from '../types';
import { addClientActivity } from '../utils/activities';
import {
  getOrcamentoMessageTemplate,
  getWhatsAppMessageTemplate,
  formatOrcamentoMessage,
} from '../utils/configOrcamentoEMetas';
import {
  fetchCatalogFromSupabase,
  filterCatalogProducts,
  getProductDetailsFromCatalog,
  getDynamicProductCatalog,
  getOfficialCategories,
  getProductTierPrice,
  normalizePriceTier,
  getPriceTierFromClientType,
  getOfficialPriceTableLabel,
  searchProductsInSupabase,
  resolveCatalogProductByNameOrId,
  CatalogProduct,
} from '../data/productCatalog';
import { ProductSelectionModal } from './ProductSelectionModal';
import { ModalCadastrarNovoProdutoOrcamento } from './ModalCadastrarNovoProdutoOrcamento';
import { EspelhoOrcamento, EspelhoItem } from './EspelhoOrcamento';
import { EspelhoThemeSelector } from './EspelhoThemeSelector';
import { filterClientsForUser, isClientOwnedByUser, getSellerIdForUser } from '../utils/userDataFilter';
import {
  saveItemToSupabase,
  getLocalCollectionSafe,
  setLocalCollectionSafe,
  fetchSupabaseKeysIndividually,
} from '../utils/supabaseClient';
import { isEmergencyOfflineMode } from '../utils/indexedDbOfflineStore';
import { syncSingleOrcamentoToFollowUp } from '../utils/orcamentoFollowUpSync';
import { getOrcamentoExportFileName } from '../utils/orcamentoFileName';
import {
  exportEspelhoToPdf,
  exportEspelhoToImage,
  copyEspelhoImageToClipboard,
  captureEspelhoToBlob,
  warmEspelhoFontCache,
} from '../utils/orcamentoExport';
import {
  BudgetThemeVariant,
  FenixThemeId,
  supportsDecoratedVariant,
  useFenixTheme,
} from '../utils/themeService';
import {
  getUserShortcuts,
  recordProductUsage,
  UserCategoryShortcut,
} from '../utils/orcamentoShortcuts';
import {
  FLOORPLAN_QUICK_DRAFT_KEY,
  QuickBudgetTransferDraft,
} from '../utils/floorplanCalculator';
import {
  isRodapeProduct,
  convertMetrosToBarras,
  calculateRodapeBarras,
  extractBarLengthFromProductName,
  parseBarCountFromInput,
  stripRodapeAutoDetail,
  parseRodapeDetails,
  isRodapeColaCatalogProduct,
  isRodapeCalafetarCatalogProduct,
  calculateRodapeInsumosForOrcamento,
  formatMlPtBr,
  RodapeInsumosPlan,
} from '../utils/rodapeCalculator';
import { ModalIncluirInsumosPiso } from './ModalIncluirInsumosPiso';
import {
  ModalIncluirInsumosRodape,
  RodapeInsumosConfirmSelection,
} from './ModalIncluirInsumosRodape';
import { ModalConfiguracaoOrcamentoRapido } from './ModalConfiguracaoOrcamentoRapido';
import {
  calculatePisoInsumosForOrcamento,
  convertBoxesToPisoSqm,
  convertSqmToPisoBoxes,
  extractPisoBoxYield,
  formatBoxesDetail,
  formatSqmPtBr,
  isPisoVinilicoColado,
  isPisoVinilicoProduct,
  isSquareMeterUnit,
  parseBoxesFromDetail,
  parsePtBrNumeric,
  PisoInsumosPlan,
} from '../utils/pisoInsumosCalculator';
import {
  buildQuickCategoryItems,
  calculateAreaTerreaPrimerQty,
  calculateRipadoInternalBars,
  calculateTetoVinilico,
  findLimpaPiso1LProduct,
  findPrimerAntiumidadeProduct,
  getQuickAutoTagsForCategory,
  QuickCategoryKey,
  QuickWizardConfigState,
  QuickWizardMeasurements,
  RipadoCalcMode,
} from '../utils/orcamentoRapidoCalculator';
import {
  getCalcRuleShortLabel,
  ProductCalcRule,
  resolveProductCalcRule,
} from '../utils/productCalcRules';
import {
  applyPisoTableQuantityChange,
  applyRodapeTableQuantityChange,
  classifyPisoInsumoGroup,
  classifyRodapeInsumoGroup,
  ensurePisoLinkForExistingBudget,
  ensureRodapeLinkForExistingBudgetList,
  getPisoInsumoGroupFromKind,
  PisoInsumoGroup,
  PisoInsumoLink,
  RodapeInsumoGroup,
  RodapeInsumoLink,
  syncPisoInsumosInItemsList,
  syncRodapeInsumosInItemsList,
} from '../utils/orcamentoSync';

const stripTetoAutoDetail = (raw?: string): string => {
  if (!raw) return '';
  return raw
    .replace(/\b\d+\s*CAIXAS?(?:\s*\+\s*\d+\s*R[ÉE]GUAS?)?/gi, '')
    .replace(/\b\d+\s*R[ÉE]GUAS?/gi, '')
    .replace(/\|\s*\|/g, '|')
    .replace(/^[\s\-|•+/]+|[\s\-|•+/]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const formatTetoDetail = (compositionDetail: string, existing?: string): string => {
  const cleanManual = stripTetoAutoDetail(existing);
  if (!compositionDetail) return cleanManual;
  return cleanManual ? `${compositionDetail} | ${cleanManual}` : compositionDetail;
};

interface OrcamentoScreenProps {
  client: ClientRecord | null;
  onBackToCadastro?: () => void;
  onBackToList?: () => void;
  currentUserName?: string;
  onSelectClient?: (client: ClientRecord | null) => void;
  initialOrcamento?: SavedOrcamento | null;
  onSaveSuccess?: (saved: SavedOrcamento) => void;
  onCreateDuplicatedOrcamento?: (newOrcamento: SavedOrcamento, clientRecord: ClientRecord | null) => void;
  onStatusChangeInProgress?: (inProgress: boolean) => void;
  scrollToProductsOnMount?: boolean;
  onConsumeScrollToProducts?: () => void;
}

// Helpers seguros para conversão e formatação monetária (prevenindo TypeErrors)
const formatPriceToBrl = (val: any): string => {
  if (val === null || val === undefined || val === '') return '0,00';
  if (typeof val === 'number') {
    return (isNaN(val) ? 0 : val).toFixed(2).replace('.', ',');
  }
  if (typeof val === 'string') {
    const clean = val.replace('R$', '').trim();
    if (clean.includes(',')) {
      const num = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
      return (isNaN(num) ? 0 : num).toFixed(2).replace('.', ',');
    }
    const num = parseFloat(clean);
    return (isNaN(num) ? 0 : num).toFixed(2).replace('.', ',');
  }
  return '0,00';
};

const parsePriceToNumber = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  if (typeof val === 'string') {
    const clean = val.replace('R$', '').trim();
    if (clean.includes(',')) {
      const num = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const OrcamentoScreen: React.FC<OrcamentoScreenProps> = ({
  client,
  onBackToCadastro,
  onBackToList,
  currentUserName = 'Vanessa Gomes',
  onSelectClient,
  initialOrcamento,
  onSaveSuccess,
  onCreateDuplicatedOrcamento,
  onStatusChangeInProgress,
  scrollToProductsOnMount = false,
  onConsumeScrollToProducts,
}) => {
  const ACTIVE_DRAFT_KEY = `fenix_orcamento_in_progress_draft_${currentUserName || 'default'}`;
  const adicionarProdutosRef = useRef<HTMLElement | null>(null);
  const consumeScrollRef = useRef(onConsumeScrollToProducts);
  consumeScrollRef.current = onConsumeScrollToProducts;

  useEffect(() => {
    if (!scrollToProductsOnMount) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const target =
        adicionarProdutosRef.current ||
        document.getElementById('adicionar-produtos-container');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      consumeScrollRef.current?.();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scrollToProductsOnMount]);

  // Recupera o rascunho de orçamento em preenchimento de forma síncrona para evitar qualquer perda ao alternar abas
  const initialDraft = useMemo(() => {
    if (initialOrcamento) return null;
    try {
      const userKey = `fenix_orcamento_in_progress_draft_${currentUserName || 'default'}`;
      const raw = localStorage.getItem(userKey) || localStorage.getItem('fenix_orcamento_in_progress_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Se o client prop foi fornecido e o rascunho salvo for de outro cliente, descarta o rascunho anterior
          if (client?.id && parsed.selectedClientId && parsed.selectedClientId !== client.id) {
            try {
              localStorage.removeItem(userKey);
              localStorage.removeItem('fenix_orcamento_in_progress_draft');
            } catch {}
            return null;
          }
          return parsed;
        }
      }
    } catch {}
    return null;
  }, [initialOrcamento, currentUserName, client]);

  // =========================================================
  // 1. DADOS DO CLIENTE
  // =========================================================
  const [clientsList, setClientsList] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    return initialOrcamento?.clientId || client?.id || initialDraft?.selectedClientId || '';
  });

  const [clientSearchQuery, setClientSearchQuery] = useState<string>(() => {
    return initialOrcamento?.clientName || client?.name || initialDraft?.clientSearchQuery || '';
  });
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node)
      ) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load clients safely from cache/localStorage + Supabase (Mostrar SOMENTE clientes cadastrados pelo usuário logado)
  useEffect(() => {
    let active = true;

    const applyClientsList = (parsed: ClientRecord[]) => {
      if (!active) return;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const userClients = parsed.filter((c) => {
          if (!currentUserName) return true;
          if (currentUserName.toLowerCase().includes('eder')) return true;
          return isClientOwnedByUser(c, currentUserName);
        });
        // Garante que o cliente passado por prop esteja incluído mesmo antes de eventual refetch
        const withPropClient =
          client?.id && !userClients.some((c) => c.id === client.id)
            ? [client, ...userClients]
            : userClients;
        setClientsList(withPropClient);

        // Prioriza o cliente do orçamento em edição se disponível
        if (initialOrcamento?.clientId || initialOrcamento?.clientName) {
          if (initialOrcamento.clientId) setSelectedClientId(initialOrcamento.clientId);
          if (initialOrcamento.clientName) setClientSearchQuery(initialOrcamento.clientName);
          return;
        }

        // Prioriza o cliente explicitamente passado
        if (client?.id && withPropClient.some((c) => c.id === client.id)) {
          setSelectedClientId(client.id);
          setClientSearchQuery(client.name || '');
          return;
        }

        setSelectedClientId((prev) => {
          if (prev && withPropClient.some((c) => c.id === prev)) return prev;
          if (initialDraft?.selectedClientId && withPropClient.some((c) => c.id === initialDraft.selectedClientId)) {
            return initialDraft.selectedClientId;
          }
          return '';
        });
        return;
      }

      if (client?.id) {
        setClientsList([client]);
        setSelectedClientId(client.id);
        setClientSearchQuery(client.name || '');
      } else {
        setClientsList([]);
        setSelectedClientId((prev) => prev || '');
      }
    };

    const loadLocalClients = () => {
      const parsed = getLocalCollectionSafe<ClientRecord>('fenix_clients_db', []);
      applyClientsList(parsed);
      return parsed;
    };

    const initialParsed = loadLocalClients();
    if (initialParsed.length === 0 && !isEmergencyOfflineMode()) {
      fetchSupabaseKeysIndividually(['fenix_clients_db'], 12000)
        .then(({ rows, succeededKeys }) => {
          if (!active) return;
          if (succeededKeys.has('fenix_clients_db')) {
            const remote = rows.get('fenix_clients_db');
            if (Array.isArray(remote) && remote.length > 0) {
              setLocalCollectionSafe('fenix_clients_db', remote);
              applyClientsList(remote);
            }
          }
        })
        .catch(() => {});
    }

    const handleClientsUpdated = () => {
      loadLocalClients();
    };
    window.addEventListener('fenix_clients_updated', handleClientsUpdated);
    window.addEventListener('storage', handleClientsUpdated);

    return () => {
      active = false;
      window.removeEventListener('fenix_clients_updated', handleClientsUpdated);
      window.removeEventListener('storage', handleClientsUpdated);
    };
  }, [client, currentUserName, initialDraft]);

  // Current Active Client
  const currentClient = useMemo(() => {
    if (selectedClientId) {
      const found = clientsList.find((c) => c.id === selectedClientId);
      if (found) return found;
    }
    return client || null;
  }, [selectedClientId, clientsList, client]);

  // Atualiza campo de busca quando o cliente corrente mudar
  useEffect(() => {
    if (currentClient?.name && !clientSearchQuery) {
      setClientSearchQuery(currentClient.name);
    }
  }, [currentClient]);

  // Se o prop client mudar externamente (ex: clicou Novo Orçamento no card do cliente B)
  useEffect(() => {
    if (client?.id) {
      if (selectedClientId && selectedClientId !== client.id && !initialOrcamento) {
        pisoInsumoLinksRef.current.clear();
        lockedPisoInsumoGroupsRef.current.clear();
        removedPisoInsumoGroupsRef.current.clear();
        rodapeInsumoLinksRef.current.clear();
        lockedRodapeInsumoGroupsRef.current.clear();
        removedRodapeInsumoGroupsRef.current.clear();
        setItems([]);
        setNomeOrcamento('');
        setObservacoes('');
        setObservacoesRodape('');
        setDescontoInput('0,00');
        setDescontoTexto('DESCONTO PARA PAGAMENTO VIA PIX');
        setHasDescontoEnabled(false);
        setHasFreteEnabled(false);
        setFreteValorInput('0,00');
        setExibirQuantidade(true);
        persistedOrcIdRef.current = null;
        try {
          localStorage.removeItem(ACTIVE_DRAFT_KEY);
          localStorage.removeItem('fenix_orcamento_in_progress_draft');
        } catch {}
      }
      setSelectedClientId(client.id);
      setClientSearchQuery(client.name || '');
      const newType = client.clientType || 'Cliente Final';
      setCustomClientType(newType);
      const resolved = getPriceTierFromClientType(newType);
      setPriceTable(resolved);
    } else if (!client && !initialOrcamento && !initialDraft) {
      // Quando não há cliente vinculado nem rascunho, inicia completamente vazio
      setSelectedClientId('');
      setClientSearchQuery('');
    }
  }, [client]);

  const filteredClientsForSearch = useMemo(() => {
    if (!clientSearchQuery.trim()) return clientsList;
    const q = clientSearchQuery.toLowerCase().trim();
    return clientsList.filter((c) => {
      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const phoneMatch = (c.phone || c.whatsapp || '').toLowerCase().includes(q);
      const typeMatch = (c.clientType || '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || typeMatch;
    });
  }, [clientsList, clientSearchQuery]);

  const [customClientType, setCustomClientType] = useState<string>(() => {
    return initialDraft?.customClientType || '';
  });
  const activeClientType = customClientType || currentClient?.clientType || 'Instalador';

  const clientName = currentClient?.name || (clientSearchQuery.trim() ? clientSearchQuery.trim() : '');
  const clientType = activeClientType;
  const clientContact = currentClient?.whatsapp || currentClient?.phone || '';

  const handleSelectClientRecord = (c: ClientRecord) => {
    if (c.id !== selectedClientId) {
      // Ao selecionar o Cliente B e clicar em "Novo Orçamento", iniciar exclusivamente com os dados do Cliente B
      if (!initialOrcamento) {
        resetAllInsumoLinks();
        setItems([]);
        setNomeOrcamento('');
        setObservacoes('');
        setObservacoesRodape('');
        setDescontoInput('0,00');
        setDescontoTexto('DESCONTO PARA PAGAMENTO VIA PIX');
        setHasDescontoEnabled(false);
        setHasFreteEnabled(false);
        setFreteValorInput('0,00');
        setExibirQuantidade(true);
        persistedOrcIdRef.current = null;
        try {
          localStorage.removeItem(ACTIVE_DRAFT_KEY);
          localStorage.removeItem('fenix_orcamento_in_progress_draft');
        } catch {}
      }
    }
    setSelectedClientId(c.id);
    setClientSearchQuery(c.name);
    setIsClientDropdownOpen(false);
    const newType = c.clientType || 'Cliente Final';
    setCustomClientType(newType);
    const resolved = getPriceTierFromClientType(newType);
    setPriceTable(resolved);
    if (selectedProductCatalog) {
      const details = getProductDetailsFromCatalog(selectedProductCatalog, resolved);
      setNewPrecoUnitario(formatPriceToBrl(details.price));
      setNewCategoria(details.category || 'Geral');
      setNewUnid(details.unit || 'unidades');
    }
    if (onSelectClient) {
      onSelectClient(c);
    }
  };

  const handleClearClientSelection = () => {
    setSelectedClientId('');
    setClientSearchQuery('');
    if (onSelectClient) {
      onSelectClient(null);
    }
  };

  const handleSelectClientChange = (id: string) => {
    const found = clientsList.find((c) => c.id === id);
    if (found) {
      handleSelectClientRecord(found);
    } else {
      setSelectedClientId(id);
    }
  };

  // =========================================================
  // 2. INFORMAÇÕES DO ORÇAMENTO
  // =========================================================
  const consultoraName = currentUserName || 'Vanessa Gomes';
  const [observacoes, setObservacoes] = useState<string>(() => {
    return initialOrcamento?.observacoes || initialDraft?.observacoes || '';
  });
  const [observacoesRodape, setObservacoesRodape] = useState<string>(() => {
    return initialOrcamento?.observacoesRodape || initialDraft?.observacoesRodape || '';
  });
  const [nomeOrcamento, setNomeOrcamento] = useState<string>(() => {
    return initialOrcamento?.nomeOrcamento || initialDraft?.nomeOrcamento || '';
  });
  const [exibirQuantidade, setExibirQuantidade] = useState<boolean>(() => {
    if (initialOrcamento) {
      return initialOrcamento.exibirQuantidade !== false;
    }
    if (typeof initialDraft?.exibirQuantidade === 'boolean') {
      return initialDraft.exibirQuantidade;
    }
    return true;
  });

  // Estado para edição de item já adicionado
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Auto-filled current date DD/MM/YYYY
  const dataOrcamento = useMemo(() => {
    if (initialOrcamento?.dataOrcamento) {
      return initialOrcamento.dataOrcamento;
    }
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  }, [initialOrcamento]);

  // =========================================================
  // 3 & 4. ADICIONAR PRODUTOS E ITENS DO ORÇAMENTO
  // =========================================================
  // Initial items - starts from draft if available or clean
  const [items, setItems] = useState<EspelhoItem[]>(() => {
    if (initialOrcamento) {
      return Array.isArray(initialOrcamento.items) ? initialOrcamento.items : [];
    }
    if (initialDraft?.items && Array.isArray(initialDraft.items) && initialDraft.items.length > 0) {
      return initialDraft.items;
    }
    return [];
  });

  // Check if draft exists in localStorage from CalculadoraScreen
  const [hasDraftFromCalculator, setHasDraftFromCalculator] = useState(false);

  // Helper para garantir que textos de calculadora nunca contenham a frase proibida
  const cleanCalcText = (text?: string): string => {
    if (!text) return '';
    return text
      .replace(/Calculado via Calculadora[^\n]*/gi, '')
      .replace(/Calculado via calculadora[^\n]*/gi, '')
      .replace(/Materiais calculados pela Calculadora[^\n]*/gi, '')
      .replace(/Calculado via[^\n]*/gi, '')
      .trim();
  };

  useEffect(() => {
    // Se for um novo orçamento e houver rascunho vindo da calculadora, importa automaticamente
    try {
      const raw = localStorage.getItem('fenix_orcamento_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          if (!initialOrcamento) {
            // Aplicar cliente se presente
            if (parsed.clientId) {
              setSelectedClientId(parsed.clientId);
            }
            const targetType = parsed.clientType || 'Cliente Final';
            setCustomClientType(targetType);
            const resolvedTier = getPriceTierFromClientType(targetType);
            setPriceTable(resolvedTier);

            // Converter itens
            const convertedItems: EspelhoItem[] = parsed.items.map(
              (
                item: {
                  product: string;
                  quantity: string;
                  qtdDetalhe?: string;
                  unit?: string;
                  precoUnitario?: number;
                  subtitulo?: string;
                  observacao?: string;
                },
                idx: number
              ) => {
                const details = getProductDetailsFromCatalog(item.product, resolvedTier);
                const numQtd =
                  parseFloat(
                    String(item.quantity).replace(/\./g, '').replace(',', '.')
                  ) || 1;
                const preco =
                  typeof item.precoUnitario === 'number' && item.precoUnitario > 0
                    ? item.precoUnitario
                    : parsePriceToNumber(details.price);
                const itemTotal = Math.round(numQtd * preco * 100) / 100;

                const cleanSub = cleanCalcText(item.subtitulo) || cleanCalcText(item.observacao) || details.defaultSubtitle || '';

                return {
                  id: `calc_item_${Date.now()}_${idx}`,
                  qtd: String(item.quantity),
                  qtdDetalhe: item.qtdDetalhe,
                  descricao: item.product,
                  subtitulo: cleanSub,
                  unidade: item.unit || details.unit || 'unidades',
                  precoUnitario: preco,
                  total: itemTotal,
                };
              }
            );

            setItems(convertedItems);
            const cleanObs = cleanCalcText(parsed.observacoes);
            if (cleanObs) {
              setObservacoes((prev) => (prev ? `${prev}\n${cleanObs}` : cleanObs));
            }
            if (parsed.category) {
              setNomeOrcamento((prev) => prev || `Orçamento - ${parsed.category}`);
            }
            showToast('Itens da Calculadora importados automaticamente para o orçamento!');
            localStorage.removeItem('fenix_orcamento_draft');
            setHasDraftFromCalculator(false);
          } else {
            setHasDraftFromCalculator(true);
          }
        }
      }

      // Importação automática de quantitativos vindos da Calculadora de Plantas -> Orçamento Rápido
      const rawQuickDraft = localStorage.getItem(FLOORPLAN_QUICK_DRAFT_KEY);
      if (rawQuickDraft && !initialOrcamento) {
        const quickDraft = JSON.parse(rawQuickDraft) as QuickBudgetTransferDraft;
        if (quickDraft && quickDraft.source === 'calculadora_plantas') {
          if (quickDraft.clientId) {
            setSelectedClientId(quickDraft.clientId);
          }
          if (quickDraft.clientType) {
            setCustomClientType(quickDraft.clientType);
            setPriceTable(getPriceTierFromClientType(quickDraft.clientType));
          }
          if (quickDraft.projectName) {
            setNomeOrcamento((prev) => prev || `Orçamento - ${quickDraft.projectName}`);
          }

          setProductSubTab('rapido');
          setQuickPisoSqm(quickDraft.pisoSqm || '');
          setQuickRodapeMl(quickDraft.rodapeMl || '');
          setQuickRipadoMode('m2');
          setQuickRipadoSqm(quickDraft.ripadoSqm || '');
          setQuickRipadoWidth('');
          setQuickRipadoHeight('');
          setQuickTetoSqm(quickDraft.tetoSqm || '');
          setQuickMantaSqm(quickDraft.mantaSqm || '');

          localStorage.removeItem(FLOORPLAN_QUICK_DRAFT_KEY);
          showToast(
            'Quantitativos da Calculadora de Plantas carregados no Orçamento Rápido! Confira e clique em Gerar Orçamento.'
          );
        }
      }
    } catch {
      // ignore
    }
  }, [initialOrcamento]);

  // Tabela de Preço Ativa baseada na REGRA OFICIAL FÊNIX WORLD:
  // - Cliente Final → Preço Cliente Final
  // - Engenheiro → Preço Cliente Final
  // - Arquiteto → Preço Cliente Final
  // - Revenda → Preço Revenda
  // - Instalador → Preço Revenda
  // - Construtora → Preço Construtora
  const resolvePriceTier = (type?: string): PriceTableTier => {
    return getPriceTierFromClientType(type);
  };

  const [priceTable, setPriceTable] = useState<PriceTableTier>(() => {
    if (initialDraft?.priceTable) return initialDraft.priceTable;
    return resolvePriceTier(client?.clientType || 'Instalador');
  });

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState(0);

  // Atualiza automaticamente opções e preços quando o cadastro oficial de produtos for alterado (CRM / Supabase)
  useEffect(() => {
    const handleProductsUpdated = () => {
      setCatalogRevision((r) => r + 1);
    };
    window.addEventListener('fenix_products_updated', handleProductsUpdated);
    return () => {
      window.removeEventListener('fenix_products_updated', handleProductsUpdated);
    };
  }, []);

  // Sincroniza catálogo oficial diretamente do Supabase quando atualizado
  useEffect(() => {
    let active = true;
    fetchCatalogFromSupabase(catalogRevision > 0)
      .then(() => {
        if (active && catalogRevision === 0) {
          setCatalogRevision((r) => (r === 0 ? 1 : r));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [catalogRevision, isProductModalOpen]);

  // Dynamic catalog directly from official PRODUTOS database (alimentado pelo Supabase)
  const dynamicCatalog = useMemo(
    () => getDynamicProductCatalog(),
    [isProductModalOpen, catalogRevision]
  );

  // Form states for adding new product
  const [selectedProductCatalog, setSelectedProductCatalog] = useState<string>(
    dynamicCatalog[0]?.name || ''
  );
  const [newCategoria, setNewCategoria] = useState<string>(
    dynamicCatalog[0]?.category || 'Geral'
  );
  const [newQtd, setNewQtd] = useState<string>('1');
  const [newUnid, setNewUnid] = useState<string>(dynamicCatalog[0]?.unit || 'unidades');
  const [newPrecoUnitario, setNewPrecoUnitario] = useState<string>(() => {
    if (dynamicCatalog[0]) {
      const details = getProductDetailsFromCatalog(dynamicCatalog[0].name, priceTable);
      return formatPriceToBrl(details.price);
    }
    return '0,00';
  });
  const [newSubtitulo, setNewSubtitulo] = useState<string>('');
  const [newCatalogProductId, setNewCatalogProductId] = useState<string | undefined>(
    dynamicCatalog[0]?.id
  );
  const [newGroupId, setNewGroupId] = useState<string | undefined>(
    dynamicCatalog[0]?.groupId
  );
  const [newGroupName, setNewGroupName] = useState<string | undefined>(
    dynamicCatalog[0]?.groupName
  );
  const [newGroupCalcRule, setNewGroupCalcRule] = useState<ProductCalcRule | undefined>(
    dynamicCatalog[0]?.groupCalcRule
  );

  const syncFormCatalogMetadata = (
    prod?: {
      id?: string;
      groupId?: string;
      groupName?: string;
      groupCalcRule?: ProductCalcRule;
      calcRule?: ProductCalcRule;
    } | null
  ) => {
    setNewCatalogProductId(prod?.id);
    setNewGroupId(prod?.groupId);
    setNewGroupName(prod?.groupName);
    setNewGroupCalcRule(prod?.groupCalcRule ?? prod?.calcRule);
  };

  const currentCatalogMatch = useMemo(
    () =>
      resolveCatalogProductByNameOrId(
        newCatalogProductId || selectedProductCatalog,
        dynamicCatalog
      ),
    [newCatalogProductId, selectedProductCatalog, dynamicCatalog]
  );

  const effectiveGroupId = newGroupId || currentCatalogMatch?.groupId;
  const effectiveGroupName = newGroupName || currentCatalogMatch?.groupName;
  const effectiveGroupCalcRule = newGroupCalcRule ?? currentCatalogMatch?.groupCalcRule;
  const effectiveCategoryId = currentCatalogMatch?.categoryId;

  const currentProductCalcRule = useMemo<ProductCalcRule>(
    () =>
      resolveProductCalcRule({
        productName: selectedProductCatalog,
        categoryName: newCategoria,
        categoryId: effectiveCategoryId,
        groupName: effectiveGroupName,
        groupId: effectiveGroupId,
        groupCalcRule: effectiveGroupCalcRule,
      }),
    [
      selectedProductCatalog,
      newCategoria,
      effectiveCategoryId,
      effectiveGroupName,
      effectiveGroupId,
      effectiveGroupCalcRule,
    ]
  );

  // Detecta se o produto ativo segue regra de Rodapé (pelo Grupo / Regra, independente da Categoria)
  const isCurrentProductRodape = useMemo(() => {
    return isRodapeProduct(
      selectedProductCatalog,
      newCategoria,
      effectiveCategoryId,
      effectiveGroupName,
      effectiveGroupCalcRule
    );
  }, [
    selectedProductCatalog,
    newCategoria,
    effectiveCategoryId,
    effectiveGroupName,
    effectiveGroupCalcRule,
  ]);

  // Controle de conversão direta de metros lineares para barras no campo Quantidade
  // Guarda separadamente o ML solicitado e a última quantidade de barras convertida (evita reconverter barras como ML)
  const rodapeRequestedMlRef = useRef<number | null>(null);
  const rodapeLastBarrasRef = useRef<number | null>(null);
  const rodapeDebounceTimerRef = useRef<any>(null);

  const resetRodapeConversionRefs = () => {
    if (rodapeDebounceTimerRef.current) {
      clearTimeout(rodapeDebounceTimerRef.current);
      rodapeDebounceTimerRef.current = null;
    }
    rodapeRequestedMlRef.current = null;
    rodapeLastBarrasRef.current = null;
  };

  const triggerRodapeQuantityConversion = (valToConvert?: string): {
    barras: number;
    barLen: number;
    requestedMl: number;
    detailText: string;
  } | null => {
    if (!isCurrentProductRodape) return null;

    const rawVal = (valToConvert !== undefined ? valToConvert : newQtd).trim();
    if (!rawVal) return null;

    const barLen = extractBarLengthFromProductName(selectedProductCatalog, 2.4);
    const manualDetail = stripRodapeAutoDetail(newSubtitulo) || '';

    const explicitBars = parseBarCountFromInput(rawVal);
    if (explicitBars && explicitBars > 0) {
      const requestedMl = Math.round(explicitBars * barLen * 100) / 100;
      rodapeRequestedMlRef.current = requestedMl;
      rodapeLastBarrasRef.current = explicitBars;
      setNewQtd(String(explicitBars));
      setNewUnid('barras');
      return { barras: explicitBars, barLen, requestedMl, detailText: manualDetail };
    }

    const parsedNum = parsePtBrNumeric(rawVal);
    if (parsedNum <= 0) return null;

    // Se já corresponde às barras convertidas anteriormente, preserva o ML solicitado original sem reinterpretar
    if (
      rodapeLastBarrasRef.current !== null &&
      Math.abs(parsedNum - rodapeLastBarrasRef.current) <= 0.005
    ) {
      const bars = rodapeLastBarrasRef.current;
      const preservedMl =
        rodapeRequestedMlRef.current && rodapeRequestedMlRef.current > 0
          ? rodapeRequestedMlRef.current
          : Math.round(bars * barLen * 100) / 100;
      setNewUnid('barras');
      return { barras: bars, barLen, requestedMl: preservedMl, detailText: manualDetail };
    }

    const result = convertMetrosToBarras(rawVal, selectedProductCatalog, barLen);
    if (result && result.barras > 0) {
      rodapeRequestedMlRef.current = result.metros;
      rodapeLastBarrasRef.current = result.barras;
      setNewQtd(String(result.barras));
      setNewUnid('barras');
      return {
        barras: result.barras,
        barLen: result.barLen,
        requestedMl: result.metros,
        detailText: manualDetail,
      };
    }

    return null;
  };

  // Controle de conversão bidirecional (m² <-> Caixas) para Pisos Vinílicos (pelo Grupo / Regra)
  const isCurrentProductPiso = useMemo(() => {
    return isPisoVinilicoProduct(
      selectedProductCatalog,
      newCategoria,
      effectiveCategoryId,
      effectiveGroupName,
      effectiveGroupCalcRule
    );
  }, [
    selectedProductCatalog,
    newCategoria,
    effectiveCategoryId,
    effectiveGroupName,
    effectiveGroupCalcRule,
  ]);

  const isCurrentProductPisoColado = useMemo(() => {
    return isPisoVinilicoColado(
      selectedProductCatalog,
      newCategoria,
      effectiveCategoryId,
      effectiveGroupName,
      effectiveGroupCalcRule
    );
  }, [
    selectedProductCatalog,
    newCategoria,
    effectiveCategoryId,
    effectiveGroupName,
    effectiveGroupCalcRule,
  ]);

  const isCurrentProductTeto = currentProductCalcRule === 'teto_vinilico';
  const isCurrentProductRipado = currentProductCalcRule === 'ripado';

  const currentPisoBoxYield = useMemo(() => {
    if (!isCurrentProductPiso) return null;
    return extractPisoBoxYield(selectedProductCatalog);
  }, [isCurrentProductPiso, selectedProductCatalog]);

  // Guarda separadamente a metragem originalmente solicitada e a última metragem efetiva convertida (anti-loop)
  const pisoRequestedSqmRef = useRef<number | null>(null);
  const pisoLastRealSqmRef = useRef<number | null>(null);
  const pisoQtdDebounceRef = useRef<any>(null);

  const resetPisoConversionRefs = () => {
    if (pisoQtdDebounceRef.current) {
      clearTimeout(pisoQtdDebounceRef.current);
      pisoQtdDebounceRef.current = null;
    }
    pisoRequestedSqmRef.current = null;
    pisoLastRealSqmRef.current = null;
  };

  // Controle de conversão m² -> Réguas/Caixas para Teto Vinílico
  const tetoRequestedSqmRef = useRef<number | null>(null);
  const tetoLastEffectiveSqmRef = useRef<number | null>(null);
  const tetoQtdDebounceRef = useRef<any>(null);

  const resetTetoConversionRefs = () => {
    if (tetoQtdDebounceRef.current) {
      clearTimeout(tetoQtdDebounceRef.current);
      tetoQtdDebounceRef.current = null;
    }
    tetoRequestedSqmRef.current = null;
    tetoLastEffectiveSqmRef.current = null;
  };

  // Auxiliar opcional para cálculo de Ripado direto na Aba Produtos
  const [ripadoHelperMode, setRipadoHelperMode] = useState<RipadoCalcMode>('m2');
  const [ripadoHelperValA, setRipadoHelperValA] = useState('');
  const [ripadoHelperValB, setRipadoHelperValB] = useState('');

  const resetRipadoHelperStates = () => {
    setRipadoHelperMode('m2');
    setRipadoHelperValA('');
    setRipadoHelperValB('');
  };

  const applyTetoFromQuantity = (rawQty: string, updateQtyField: boolean) => {
    if (!isCurrentProductTeto || !isSquareMeterUnit(newUnid)) {
      return null;
    }
    const parsedNum = parsePtBrNumeric(rawQty);
    if (parsedNum <= 0) return null;

    const isAlreadyEffective =
      tetoLastEffectiveSqmRef.current !== null &&
      Math.abs(parsedNum - tetoLastEffectiveSqmRef.current) <= 0.009;

    const requestedSqm = isAlreadyEffective
      ? (tetoRequestedSqmRef.current ?? parsedNum)
      : parsedNum;

    tetoRequestedSqmRef.current = requestedSqm;

    const prodObj = currentCatalogMatch || {
      name: selectedProductCatalog,
      details: '',
      description: '',
    };
    const conv = calculateTetoVinilico(requestedSqm, prodObj);
    if (!conv || conv.effectiveSqm <= 0) return null;

    const detailText = formatTetoDetail(conv.compositionDetail, newSubtitulo);
    setNewSubtitulo(detailText);
    if (updateQtyField) {
      setNewQtd(conv.effectiveSqmDisplay);
      tetoLastEffectiveSqmRef.current = conv.effectiveSqm;
    }
    return { ...conv, detailText };
  };

  const handleTetoQuantityInputChange = (val: string) => {
    if (tetoQtdDebounceRef.current) {
      clearTimeout(tetoQtdDebounceRef.current);
      tetoQtdDebounceRef.current = null;
    }
    if (!isCurrentProductTeto || !isSquareMeterUnit(newUnid)) {
      return;
    }
    const parsedNum = parsePtBrNumeric(val);
    if (parsedNum <= 0) {
      tetoRequestedSqmRef.current = null;
      tetoLastEffectiveSqmRef.current = null;
      return;
    }
    if (
      tetoLastEffectiveSqmRef.current !== null &&
      Math.abs(parsedNum - tetoLastEffectiveSqmRef.current) <= 0.009
    ) {
      return;
    }

    tetoRequestedSqmRef.current = parsedNum;
    tetoLastEffectiveSqmRef.current = null;

    const prodObj = currentCatalogMatch || {
      name: selectedProductCatalog,
      details: '',
      description: '',
    };
    const conv = calculateTetoVinilico(parsedNum, prodObj);
    setNewSubtitulo(formatTetoDetail(conv.compositionDetail, newSubtitulo));

    tetoQtdDebounceRef.current = setTimeout(() => {
      setNewQtd(conv.effectiveSqmDisplay);
      tetoLastEffectiveSqmRef.current = conv.effectiveSqm;
      tetoQtdDebounceRef.current = null;
    }, 550);
  };

  const applyPisoFromQuantity = (rawQty: string, updateQtyField: boolean) => {
    if (!isCurrentProductPiso || !isSquareMeterUnit(newUnid) || !currentPisoBoxYield) {
      return null;
    }
    const parsedNum = parsePtBrNumeric(rawQty);
    if (parsedNum <= 0) return null;

    // Se a Quantidade já corresponde à metragem efetiva arredondada previamente, preserva a metragem original solicitada
    const isAlreadyEffective =
      pisoLastRealSqmRef.current !== null &&
      Math.abs(parsedNum - pisoLastRealSqmRef.current) <= 0.009;

    const requestedSqm = isAlreadyEffective
      ? (pisoRequestedSqmRef.current ?? parsedNum)
      : parsedNum;

    pisoRequestedSqmRef.current = requestedSqm;

    const conv = convertSqmToPisoBoxes(requestedSqm, currentPisoBoxYield, newSubtitulo);
    setNewSubtitulo(conv.detailText);
    if (updateQtyField) {
      setNewQtd(conv.realSqmDisplay);
      pisoLastRealSqmRef.current = conv.realSqm;
    }
    return conv;
  };

  const handlePisoQuantityInputChange = (val: string) => {
    if (pisoQtdDebounceRef.current) {
      clearTimeout(pisoQtdDebounceRef.current);
      pisoQtdDebounceRef.current = null;
    }
    if (!isCurrentProductPiso || !isSquareMeterUnit(newUnid) || !currentPisoBoxYield) {
      return;
    }

    const parsedNum = parsePtBrNumeric(val);
    if (parsedNum <= 0) {
      pisoRequestedSqmRef.current = null;
      pisoLastRealSqmRef.current = null;
      return;
    }

    if (
      pisoLastRealSqmRef.current !== null &&
      Math.abs(parsedNum - pisoLastRealSqmRef.current) <= 0.009
    ) {
      return;
    }

    pisoRequestedSqmRef.current = parsedNum;
    pisoLastRealSqmRef.current = null;

    // Atualiza Detalhe imediatamente com a quantidade de caixas arredondada para cima
    const conv = convertSqmToPisoBoxes(parsedNum, currentPisoBoxYield, newSubtitulo);
    setNewSubtitulo(conv.detailText);

    // Atualiza Quantidade com a metragem real das caixas sem interromper digitação de múltiplos dígitos
    pisoQtdDebounceRef.current = setTimeout(() => {
      setNewQtd(conv.realSqmDisplay);
      pisoLastRealSqmRef.current = conv.realSqm;
      pisoQtdDebounceRef.current = null;
    }, 550);
  };

  const handlePisoDetalheInputChange = (val: string) => {
    setNewSubtitulo(val);
    if (!isCurrentProductPiso || !isSquareMeterUnit(newUnid) || !currentPisoBoxYield) {
      return;
    }
    if (pisoQtdDebounceRef.current) {
      clearTimeout(pisoQtdDebounceRef.current);
      pisoQtdDebounceRef.current = null;
    }

    const boxes = parseBoxesFromDetail(val);
    if (boxes !== null && boxes > 0) {
      const conv = convertBoxesToPisoSqm(boxes, currentPisoBoxYield);
      setNewQtd(conv.realSqmDisplay);
      pisoLastRealSqmRef.current = conv.realSqm;
      pisoRequestedSqmRef.current = conv.realSqm;
    }
  };

  const handlePisoDetalheInputBlur = () => {
    if (!isCurrentProductPiso || !isSquareMeterUnit(newUnid) || !currentPisoBoxYield) {
      return;
    }
    const boxes = parseBoxesFromDetail(newSubtitulo);
    if (boxes !== null && boxes > 0) {
      const conv = convertBoxesToPisoSqm(boxes, currentPisoBoxYield);
      setNewQtd(conv.realSqmDisplay);
      pisoLastRealSqmRef.current = conv.realSqm;
      pisoRequestedSqmRef.current = conv.realSqm;
      if (/^\d+$/.test(newSubtitulo.trim())) {
        setNewSubtitulo(formatBoxesDetail(boxes));
      }
    }
  };

  // Sub-abas do fluxo de seleção de produtos solicitado:
  // 'rapido' = Orçamento Rápido (cálculo instantâneo de piso + rodapé + insumos do catálogo)
  // 'buscar' = Barra de busca com lista/dropdown de resultados embaixo
  // 'categorias' = Escolher Categoria (ex: Piso -> mostra só os pisos cadastrados -> puxar)
  // 'produtos' = Aba Produtos (produto puxado, campo Detalhe, Quantidade, Unidade auto, Preço Unitário editável)
  const [productSubTab, setProductSubTab] = useState<'rapido' | 'buscar' | 'categorias' | 'produtos'>('rapido');
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryFilterQuery, setCategoryFilterQuery] = useState('');

  // Estados do Orçamento Rápido (5 campos independentes + wizard sequencial)
  const [quickPisoSqm, setQuickPisoSqm] = useState<string>('');
  const [quickRodapeMl, setQuickRodapeMl] = useState<string>('');
  const [quickRipadoMode, setQuickRipadoMode] = useState<RipadoCalcMode>('m2');
  const [quickRipadoSqm, setQuickRipadoSqm] = useState<string>('');
  const [quickRipadoWidth, setQuickRipadoWidth] = useState<string>('');
  const [quickRipadoHeight, setQuickRipadoHeight] = useState<string>('');
  const [quickTetoSqm, setQuickTetoSqm] = useState<string>('');
  const [quickMantaSqm, setQuickMantaSqm] = useState<string>('');

  const [quickWizardOpen, setQuickWizardOpen] = useState(false);
  const [quickWizardSteps, setQuickWizardSteps] = useState<QuickCategoryKey[]>([]);
  const [quickWizardMeasurements, setQuickWizardMeasurements] =
    useState<QuickWizardMeasurements | null>(null);
  const [quickWizardConfig, setQuickWizardConfig] =
    useState<QuickWizardConfigState>({
      piso: {
        pisoType: 'colado',
        productId: '',
        includeInsumos: true,
      },
      rodape: {
        height: '07cm',
        productId: '',
        includeInsumos: true,
        includeColar: true,
        includeCalafetar: true,
        calafetarProductId: '',
      },
      ripado: {
        productId: '',
        includeInsumos: true,
        includeAcabamento: false,
        acabamentoProductId: '',
        acabamentoQty: '1',
      },
      teto: {
        productId: '',
        includeAcabamento: false,
        acabamentoProductId: '',
        acabamentoQty: '1',
      },
      manta: {
        productId: '',
        includeInsumos: true,
        includeAcabamentos: false,
        acabamentoMl: '',
        suporteProductId: '',
      },
    });

  // Chaves no cabeçalho de Itens do Orçamento: LIMPA PISO e ÁREA TÉRREA (desligadas por padrão)
  const [limpaPisoEnabled, setLimpaPisoEnabled] = useState<boolean>(() => {
    if (initialOrcamento) {
      return Boolean(
        initialOrcamento.limpaPisoAtivo ??
          initialOrcamento.items?.some((it) => it.autoTag === 'toggle_limpa_piso')
      );
    }
    if (initialDraft?.limpaPisoEnabled !== undefined) {
      return Boolean(initialDraft.limpaPisoEnabled);
    }
    return false;
  });

  const [areaTerreaEnabled, setAreaTerreaEnabled] = useState<boolean>(() => {
    if (initialOrcamento) {
      return Boolean(
        initialOrcamento.areaTerreaAtiva ??
          initialOrcamento.items?.some((it) => it.autoTag === 'toggle_area_terrea')
      );
    }
    if (initialDraft?.areaTerreaEnabled !== undefined) {
      return Boolean(initialDraft.areaTerreaEnabled);
    }
    return false;
  });

  const [areaTerreaSqm, setAreaTerreaSqm] = useState<string>(() => {
    if (initialOrcamento?.areaTerreaSqm !== undefined) {
      return initialOrcamento.areaTerreaSqm;
    }
    if (initialDraft?.areaTerreaSqm !== undefined) {
      return initialDraft.areaTerreaSqm;
    }
    return '';
  });

  const handleToggleLimpaPiso = (nextEnabled: boolean) => {
    if (!nextEnabled) {
      setLimpaPisoEnabled(false);
      setItems((prev) => prev.filter((it) => it.autoTag !== 'toggle_limpa_piso'));
      return;
    }

    const prod = findLimpaPiso1LProduct(dynamicCatalog);
    if (!prod) {
      setLimpaPisoEnabled(false);
      showToast('Limpa Piso 1L não encontrado no catálogo.');
      return;
    }

    const tierPrice = getProductTierPrice(prod, priceTable);
    setLimpaPisoEnabled(true);
    setItems((prev) => {
      const withoutPrev = prev.filter((it) => it.autoTag !== 'toggle_limpa_piso');
      const newItem: EspelhoItem = {
        id: `item_${Date.now()}_limpapiso`,
        qtd: '1',
        descricao: prod.name,
        unidade: prod.unit || 'un',
        precoUnitario: tierPrice,
        total: Math.round(tierPrice * 100) / 100,
        autoTag: 'toggle_limpa_piso',
      };
      return [...withoutPrev, newItem];
    });
  };

  const syncAreaTerreaItem = (rawArea: string) => {
    const areaNum = parsePtBrNumeric(rawArea);
    if (areaNum <= 0) {
      setItems((prev) => prev.filter((it) => it.autoTag !== 'toggle_area_terrea'));
      return;
    }

    const prod = findPrimerAntiumidadeProduct(dynamicCatalog);
    if (!prod) {
      showToast('Primer Antiumidade não encontrado no catálogo.');
      return;
    }

    const qty = calculateAreaTerreaPrimerQty(areaNum);
    const catalogPrice = getProductTierPrice(prod, priceTable);

    setItems((prev) => {
      const existing = prev.find((it) => it.autoTag === 'toggle_area_terrea');
      const resolvedPrice =
        existing && existing.precoUnitario > 0 ? existing.precoUnitario : catalogPrice;
      const newTotal = Math.round(qty * resolvedPrice * 100) / 100;

      if (existing) {
        return prev.map((it) =>
          it.autoTag === 'toggle_area_terrea'
            ? {
                ...it,
                qtd: String(qty),
                total: newTotal,
              }
            : it
        );
      }

      const newItem: EspelhoItem = {
        id: `item_${Date.now()}_areaterrea`,
        qtd: String(qty),
        descricao: prod.name,
        unidade: prod.unit || 'balde',
        precoUnitario: resolvedPrice,
        total: newTotal,
        autoTag: 'toggle_area_terrea',
      };
      return [...prev, newItem];
    });
  };

  const handleToggleAreaTerrea = (nextEnabled: boolean) => {
    if (!nextEnabled) {
      setAreaTerreaEnabled(false);
      setAreaTerreaSqm('');
      setItems((prev) => prev.filter((it) => it.autoTag !== 'toggle_area_terrea'));
      return;
    }

    setAreaTerreaEnabled(true);
    if (parsePtBrNumeric(areaTerreaSqm) > 0) {
      syncAreaTerreaItem(areaTerreaSqm);
    }
  };

  const handleAreaTerreaSqmChange = (val: string) => {
    setAreaTerreaSqm(val);
    if (areaTerreaEnabled) {
      syncAreaTerreaItem(val);
    }
  };

  // Categorias oficiais da base
  const categoriesList = useMemo(() => getOfficialCategories(), [isProductModalOpen, catalogRevision]);

  const [supabaseSearchResults, setSupabaseSearchResults] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    const q = searchProductQuery.trim();
    if (!q) {
      setSupabaseSearchResults(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchProductsInSupabase(q, { limit: 20 })
        .then((res) => {
          if (active) setSupabaseSearchResults(res);
        })
        .catch(() => {});
    }, 130);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchProductQuery, catalogRevision]);

  // Resultados da busca com dropdown embaixo (filtrados na consulta ao Supabase por categoria real, nome, marca e modelo)
  const searchResults = useMemo(() => {
    if (!searchProductQuery.trim()) return [];
    const source = supabaseSearchResults !== null ? supabaseSearchResults : dynamicCatalog;
    return filterCatalogProducts(source, searchProductQuery, { limit: 20 });
  }, [searchProductQuery, dynamicCatalog, supabaseSearchResults]);

  // Modal para Cadastrar Novo Produto
  const [isCadastrarProdutoModalOpen, setIsCadastrarProdutoModalOpen] = useState(false);
  const [cadastrarInitialName, setCadastrarInitialName] = useState('');
  const [shortcutsRefreshCounter, setShortcutsRefreshCounter] = useState(0);

  // Atalhos reais e dinâmicos específicos do usuário conectado (somente produtos/categorias cadastrados)
  const userShortcuts = useMemo(() => {
    return getUserShortcuts(currentUserName);
  }, [currentUserName, shortcutsRefreshCounter, dynamicCatalog]);

  // Drafts para edição direta do preço unitário e quantidade na tabela do orçamento
  const [itemPrecoDrafts, setItemPrecoDrafts] = useState<Record<string, string>>({});
  const [itemQtdDrafts, setItemQtdDrafts] = useState<Record<string, string>>({});

  // Objeto da categoria ativa
  const activeCategoryObj = useMemo(() => {
    if (!selectedCategoryId) return null;
    return categoriesList.find((c) => c.id === selectedCategoryId) || null;
  }, [selectedCategoryId, categoriesList]);

  // Produtos filtrados apenas da categoria escolhida (ex: Pisos)
  const categoryProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    const list = dynamicCatalog.filter((p) => {
      return (
        p.categoryId === selectedCategoryId ||
        p.category.toLowerCase() === (activeCategoryObj?.name || '').toLowerCase()
      );
    });
    if (categoryFilterQuery.trim()) {
      return filterCatalogProducts(list, categoryFilterQuery);
    }
    return list;
  }, [selectedCategoryId, activeCategoryObj, dynamicCatalog, categoryFilterQuery]);

  // Cálculo em tempo real do item para a Aba Produtos
  const previewItemTotal = useMemo(() => {
    const numQtd = parseFloat(newQtd.replace(/\./g, '').replace(',', '.')) || 0;
    const numPreco = parseFloat(newPrecoUnitario.replace(/\./g, '').replace(',', '.')) || 0;
    return Math.round(numQtd * numPreco * 100) / 100;
  }, [newQtd, newPrecoUnitario]);

  // Puxar produto selecionado para a aba Produtos
  const handleSelectAndPullProduct = (prod: CatalogProduct) => {
    resetPisoConversionRefs();
    resetRodapeConversionRefs();
    resetTetoConversionRefs();
    resetRipadoHelperStates();
    setSelectedProductCatalog(prod.name);
    setNewCategoria(prod.category || 'Geral');
    syncFormCatalogMetadata(prod);
    const price = getProductTierPrice(prod, priceTable);
    setNewPrecoUnitario(formatPriceToBrl(price));

    const isRodape = isRodapeProduct(
      prod.name,
      prod.category,
      prod.categoryId,
      prod.groupName,
      prod.groupCalcRule
    );
    if (isRodape) {
      setNewUnid('barras');
      setNewQtd('1');
    } else {
      setNewUnid(prod.unit || 'unidades');
      setNewQtd('1');
    }

    setNewSubtitulo(prod.defaultSubtitle || '');
    setSearchProductQuery('');
    // Registra o uso do produto nos atalhos do usuário
    recordProductUsage(currentUserName, { id: prod.id, name: prod.name, category: prod.category });
    setShortcutsRefreshCounter((c) => c + 1);
    // Manda imediatamente para a aba produtos para preencher as demais informações!
    setProductSubTab('produtos');
    showToast(`"${prod.name}" puxado! Preencha o detalhe e a quantidade.`);
  };

  // Atualizar tabela automaticamente se o cliente ativo mudar
  useEffect(() => {
    if (currentClient?.clientType) {
      setCustomClientType(currentClient.clientType);
      const resolved = getPriceTierFromClientType(currentClient.clientType);
      setPriceTable(resolved);
      if (selectedProductCatalog || newCatalogProductId) {
        const details = getProductDetailsFromCatalog(
          newCatalogProductId || selectedProductCatalog,
          resolved
        );
        setNewPrecoUnitario(formatPriceToBrl(details.price));
        setNewCategoria(details.category || 'Geral');
        setNewUnid(details.unit || 'unidades');
        syncFormCatalogMetadata(details);
      }
    }
  }, [currentClient?.id, currentClient?.clientType]);

  // Alteração do Tipo de Cliente: atualiza automaticamente a tabela de preços e os preços disponíveis
  const handleClientTypeChange = (newType: string) => {
    setCustomClientType(newType);
    const newTier = getPriceTierFromClientType(newType);
    setPriceTable(newTier);

    // Atualiza imediatamente o preço unitário do produto em foco no formulário
    if (selectedProductCatalog || newCatalogProductId) {
      const details = getProductDetailsFromCatalog(
        newCatalogProductId || selectedProductCatalog,
        newTier
      );
      setNewPrecoUnitario(formatPriceToBrl(details.price));
      setNewCategoria(details.category || 'Geral');
      setNewUnid(details.unit || 'unidades');
      syncFormCatalogMetadata(details);
    }

    // Atualiza automaticamente os preços dos itens já adicionados ao orçamento
    setItems((prevItems) => {
      if (prevItems.length === 0) return prevItems;
      return prevItems.map((item) => {
        const details = getProductDetailsFromCatalog(
          item.catalogProductId || item.descricao,
          newTier
        );
        const numQtd = parseFloat(item.qtd.replace(/\./g, '').replace(',', '.')) || 1;
        const newUnitPrice = parsePriceToNumber(details.price);
        const newTotal = Math.round(numQtd * newUnitPrice * 100) / 100;
        return {
          ...item,
          precoUnitario: newUnitPrice,
          total: newTotal,
        };
      });
    });

    // Se o cliente estiver cadastrado, persiste a alteração de tipo no cadastro
    if (selectedClientId) {
      try {
        const parsed = getLocalCollectionSafe<ClientRecord>('fenix_clients_db', []);
        if (parsed.length > 0) {
          const targetClient = parsed.find((c) => c.id === selectedClientId);
          if (targetClient) {
            const updatedClient = { ...targetClient, clientType: newType as ClientType };
            const updatedAll = parsed.map((c) => (c.id === selectedClientId ? updatedClient : c));
            setLocalCollectionSafe('fenix_clients_db', updatedAll);
            const userClients = updatedAll.filter((c) => {
              if (!currentUserName) return true;
              if (currentUserName.toLowerCase().includes('eder')) return true;
              return isClientOwnedByUser(c, currentUserName);
            });
            setClientsList(userClients);
            saveItemToSupabase('fenix_clients_db', updatedClient, 'id', currentUserName || consultoraName).catch(() => {});
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    showToast(`Tipo de Cliente: "${newType}" → Tabela alterada automaticamente para "${getOfficialPriceTableLabel(newTier)}"!`);
  };

  const handleImportFromCalculator = () => {
    try {
      const raw = localStorage.getItem('fenix_orcamento_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          if (parsed.clientId) {
            setSelectedClientId(parsed.clientId);
          }
          const targetType = parsed.clientType || customClientType || currentClient?.clientType || 'Cliente Final';
          setCustomClientType(targetType);
          const resolvedTier = getPriceTierFromClientType(targetType);
          setPriceTable(resolvedTier);

          const convertedItems: EspelhoItem[] = parsed.items.map(
            (
              item: {
                product: string;
                quantity: string;
                qtdDetalhe?: string;
                unit?: string;
                precoUnitario?: number;
                subtitulo?: string;
                observacao?: string;
              },
              idx: number
            ) => {
              const details = getProductDetailsFromCatalog(item.product, resolvedTier);
              const numQtd =
                parseFloat(
                  String(item.quantity).replace(/\./g, '').replace(',', '.')
                ) || 1;
              const preco =
                typeof item.precoUnitario === 'number' && item.precoUnitario > 0
                  ? item.precoUnitario
                  : parsePriceToNumber(details.price);
              const itemTotal = Math.round(numQtd * preco * 100) / 100;

              const cleanSub = cleanCalcText(item.subtitulo) || cleanCalcText(item.observacao) || details.defaultSubtitle || '';

              return {
                id: `calc_item_${Date.now()}_${idx}`,
                qtd: String(item.quantity),
                qtdDetalhe: item.qtdDetalhe,
                descricao: item.product,
                subtitulo: cleanSub,
                unidade: item.unit || details.unit || 'unidades',
                precoUnitario: preco,
                total: itemTotal,
                ...(details.id ? { catalogProductId: details.id } : {}),
                ...(details.groupId ? { groupId: details.groupId } : {}),
                ...(details.groupName ? { groupName: details.groupName } : {}),
                ...(details.groupCalcRule ? { calcRule: details.groupCalcRule } : {}),
              };
            }
          );

          setItems(convertedItems);
          const cleanObs = cleanCalcText(parsed.observacoes);
          if (cleanObs) {
            setObservacoes((prev) => (prev ? `${prev}\n${cleanObs}` : cleanObs));
          }
          if (parsed.category) {
            setNomeOrcamento((prev) => prev || `Orçamento - ${parsed.category}`);
          }
          localStorage.removeItem('fenix_orcamento_draft');
          setHasDraftFromCalculator(false);
          showToast('Itens da Calculadora importados com sucesso!');
        }
      }
    } catch {
      showToast('Erro ao carregar itens da calculadora.');
    }
  };

  // Handle product catalog change
  const handleProductCatalogSelect = (productName: string, tier: PriceTableTier = priceTable) => {
    resetPisoConversionRefs();
    resetRodapeConversionRefs();
    resetTetoConversionRefs();
    resetRipadoHelperStates();
    setSelectedProductCatalog(productName);
    const details = getProductDetailsFromCatalog(productName, tier);
    setNewCategoria(details.category || 'Geral');
    setNewUnid(details.unit || 'unidades');
    setNewPrecoUnitario(formatPriceToBrl(details.price));
    syncFormCatalogMetadata(details);
    if (details.defaultSubtitle) {
      setNewSubtitulo(details.defaultSubtitle);
    } else {
      setNewSubtitulo('');
    }
  };

  const handlePriceTableChange = (tier: PriceTableTier) => {
    setPriceTable(tier);
    const details = getProductDetailsFromCatalog(
      newCatalogProductId || selectedProductCatalog,
      tier
    );
    setNewPrecoUnitario(formatPriceToBrl(details.price));
  };

  const [pendingPisoPrompt, setPendingPisoPrompt] = useState<{
    plan: PisoInsumosPlan;
    category: string;
    unit: string;
    unitPrice: number;
    subtitulo?: string;
    customToast?: string;
    preserveQuickTab?: boolean;
    productId?: string;
    groupId?: string;
    groupName?: string;
    calcRule?: ProductCalcRule;
    onAfterCommit?: () => void;
  } | null>(null);

  const [pendingRodapePrompt, setPendingRodapePrompt] = useState<{
    plan: RodapeInsumosPlan;
    category: string;
    unit: string;
    unitPrice: number;
    subtitulo?: string;
    customToast?: string;
    preserveQuickTab?: boolean;
    productId?: string;
    groupId?: string;
    groupName?: string;
    calcRule?: ProductCalcRule;
  } | null>(null);

  // Vínculo de insumos por item (piso e rodapé) e controle de edições/exclusões manuais
  const pisoInsumoLinksRef = useRef<Map<string, PisoInsumoLink>>(new Map());
  const lockedPisoInsumoGroupsRef = useRef<Set<PisoInsumoGroup>>(new Set());
  const removedPisoInsumoGroupsRef = useRef<Set<PisoInsumoGroup>>(new Set());

  const rodapeInsumoLinksRef = useRef<Map<string, RodapeInsumoLink>>(new Map());
  const lockedRodapeInsumoGroupsRef = useRef<Set<RodapeInsumoGroup>>(new Set());
  const removedRodapeInsumoGroupsRef = useRef<Set<RodapeInsumoGroup>>(new Set());

  const resetAllInsumoLinks = () => {
    pisoInsumoLinksRef.current.clear();
    lockedPisoInsumoGroupsRef.current.clear();
    removedPisoInsumoGroupsRef.current.clear();
    rodapeInsumoLinksRef.current.clear();
    lockedRodapeInsumoGroupsRef.current.clear();
    removedRodapeInsumoGroupsRef.current.clear();
    setItemQtdDrafts({});
  };

  // Hidrata vínculos de rascunho em memória caso existam no initialDraft
  const hydratedDraftLinksRef = useRef(false);
  useEffect(() => {
    if (hydratedDraftLinksRef.current || initialOrcamento || !initialDraft) return;
    hydratedDraftLinksRef.current = true;
    try {
      if (initialDraft.pisoLinks && typeof initialDraft.pisoLinks === 'object') {
        Object.entries(initialDraft.pisoLinks).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object') {
            pisoInsumoLinksRef.current.set(k, v as PisoInsumoLink);
          }
        });
      }
      if (initialDraft.rodapeLinks && typeof initialDraft.rodapeLinks === 'object') {
        Object.entries(initialDraft.rodapeLinks).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object') {
            rodapeInsumoLinksRef.current.set(k, v as RodapeInsumoLink);
          }
        });
      }
      if (Array.isArray(initialDraft.lockedPisoGroups)) {
        initialDraft.lockedPisoGroups.forEach((g: PisoInsumoGroup) =>
          lockedPisoInsumoGroupsRef.current.add(g)
        );
      }
      if (Array.isArray(initialDraft.removedPisoGroups)) {
        initialDraft.removedPisoGroups.forEach((g: PisoInsumoGroup) =>
          removedPisoInsumoGroupsRef.current.add(g)
        );
      }
      if (Array.isArray(initialDraft.lockedRodapeGroups)) {
        initialDraft.lockedRodapeGroups.forEach((g: RodapeInsumoGroup) =>
          lockedRodapeInsumoGroupsRef.current.add(g)
        );
      }
      if (Array.isArray(initialDraft.removedRodapeGroups)) {
        initialDraft.removedRodapeGroups.forEach((g: RodapeInsumoGroup) =>
          removedRodapeInsumoGroupsRef.current.add(g)
        );
      }
    } catch {
      // ignore hydration errors
    }
  }, [initialDraft, initialOrcamento]);

  // Atualiza plano do modal de rodapé automaticamente caso o catálogo seja sincronizado enquanto aberto
  useEffect(() => {
    if (!pendingRodapePrompt) return;
    setPendingRodapePrompt((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        plan: calculateRodapeInsumosForOrcamento({
          rodapeName: prev.plan.rodapeName,
          barCount: prev.plan.barCount,
          barLengthMeters: prev.plan.barLengthMeters,
          requestedMl: prev.plan.insumoMl,
          priceTable,
          selectedCalafetarId: prev.plan.selectedCalafetarId,
        }),
      };
    });
  }, [catalogRevision, priceTable]);

  const syncPisoInsumosInList = (currentItems: EspelhoItem[]): EspelhoItem[] => {
    return syncPisoInsumosInItemsList({
      currentItems,
      pisoLinks: pisoInsumoLinksRef.current,
      lockedGroups: lockedPisoInsumoGroupsRef.current,
      removedGroups: removedPisoInsumoGroupsRef.current,
      priceTable,
      catalogOverride: dynamicCatalog,
    });
  };

  const syncRodapeInsumosInList = (
    currentItems: EspelhoItem[],
    referenceRodapeName?: string
  ): EspelhoItem[] => {
    return syncRodapeInsumosInItemsList({
      currentItems,
      rodapeLinks: rodapeInsumoLinksRef.current,
      lockedGroups: lockedRodapeInsumoGroupsRef.current,
      removedGroups: removedRodapeInsumoGroupsRef.current,
      priceTable,
      referenceRodapeName,
      catalogOverride: dynamicCatalog,
    });
  };

  const ensureRodapeLinkForExistingBudget = (
    itemsList: EspelhoItem[],
    rodapeItem: EspelhoItem
  ) => {
    ensureRodapeLinkForExistingBudgetList({
      itemsList,
      rodapeItem,
      rodapeLinks: rodapeInsumoLinksRef.current,
      priceTable,
      catalogOverride: dynamicCatalog,
    });
  };

  const resetProductForm = () => {
    resetPisoConversionRefs();
    resetRodapeConversionRefs();
    resetTetoConversionRefs();
    resetRipadoHelperStates();
    setSelectedProductCatalog('');
    setNewCategoria('Geral');
    syncFormCatalogMetadata(null);
    setNewUnid('unidades');
    setNewPrecoUnitario('0,00');
    setNewQtd('1');
    setNewSubtitulo('');
    setEditingItemId(null);
    setSearchProductQuery('');
    setProductSubTab('buscar');
  };

  const tryOpenPisoInsumosPrompt = (params: {
    name: string;
    category: string;
    categoryId?: string;
    productId?: string;
    groupId?: string;
    groupName?: string;
    calcRule?: ProductCalcRule;
    unit: string;
    unitPrice: number;
    requestedSqm: number;
    effectiveSqm?: number;
    boxes?: number | null;
    subtitulo?: string;
    customToast?: string;
  }): boolean => {
    const matchedCat = resolveCatalogProductByNameOrId(
      params.productId || params.name,
      dynamicCatalog
    );
    const resolvedCategoryId = params.categoryId ?? matchedCat?.categoryId;
    const resolvedGroupId = params.groupId ?? matchedCat?.groupId;
    const resolvedGroupName = params.groupName ?? matchedCat?.groupName;
    const resolvedCalcRule =
      params.calcRule ??
      resolveProductCalcRule({
        productName: params.name,
        categoryName: params.category,
        categoryId: resolvedCategoryId,
        groupName: resolvedGroupName,
        groupId: resolvedGroupId,
        groupCalcRule: matchedCat?.groupCalcRule,
      });

    if (
      params.requestedSqm > 0 &&
      isPisoVinilicoColado(
        params.name,
        params.category,
        resolvedCategoryId,
        resolvedGroupName,
        resolvedCalcRule
      ) &&
      isSquareMeterUnit(params.unit)
    ) {
      const plan = calculatePisoInsumosForOrcamento({
        productName: params.name,
        requestedSqm: params.requestedSqm,
        effectiveSqm: params.effectiveSqm,
        boxes: params.boxes,
        priceTable,
      });
      const finalSubtitulo =
        plan.boxes && plan.boxes > 0 && parseBoxesFromDetail(params.subtitulo) === null
          ? formatBoxesDetail(plan.boxes, params.subtitulo)
          : params.subtitulo;
      setPendingPisoPrompt({
        plan,
        category: params.category,
        unit: params.unit || 'm²',
        unitPrice: params.unitPrice,
        subtitulo: finalSubtitulo,
        customToast: params.customToast,
        productId: params.productId ?? matchedCat?.id,
        groupId: resolvedGroupId,
        groupName: resolvedGroupName,
        calcRule: resolvedCalcRule,
      });
      return true;
    }
    return false;
  };

  const tryOpenRodapeInsumosPrompt = (params: {
    name: string;
    category: string;
    categoryId?: string;
    productId?: string;
    groupId?: string;
    groupName?: string;
    calcRule?: ProductCalcRule;
    unit: string;
    unitPrice: number;
    barCount: number;
    barLengthMeters?: number;
    requestedMl?: number;
    subtitulo?: string;
    customToast?: string;
  }): boolean => {
    const matchedCat = resolveCatalogProductByNameOrId(
      params.productId || params.name,
      dynamicCatalog
    );
    const resolvedCategoryId = params.categoryId ?? matchedCat?.categoryId;
    const resolvedGroupId = params.groupId ?? matchedCat?.groupId;
    const resolvedGroupName = params.groupName ?? matchedCat?.groupName;
    const resolvedCalcRule =
      params.calcRule ??
      resolveProductCalcRule({
        productName: params.name,
        categoryName: params.category,
        categoryId: resolvedCategoryId,
        groupName: resolvedGroupName,
        groupId: resolvedGroupId,
        groupCalcRule: matchedCat?.groupCalcRule,
      });

    if (
      params.barCount > 0 &&
      isRodapeProduct(
        params.name,
        params.category,
        resolvedCategoryId,
        resolvedGroupName,
        resolvedCalcRule
      )
    ) {
      const plan = calculateRodapeInsumosForOrcamento({
        rodapeName: params.name,
        barCount: params.barCount,
        barLengthMeters: params.barLengthMeters,
        requestedMl: params.requestedMl,
        priceTable,
        catalogOverride: dynamicCatalog,
      });
      setPendingRodapePrompt({
        plan,
        category: params.category,
        unit: params.unit || 'barras',
        unitPrice: params.unitPrice,
        subtitulo: params.subtitulo,
        customToast: params.customToast,
        productId: params.productId ?? matchedCat?.id,
        groupId: resolvedGroupId,
        groupName: resolvedGroupName,
        calcRule: resolvedCalcRule,
      });
      return true;
    }
    return false;
  };

  const commitRodapePrompt = (selection: RodapeInsumosConfirmSelection | null) => {
    if (!pendingRodapePrompt) return;
    const {
      plan,
      category,
      unit,
      unitPrice,
      subtitulo,
      customToast,
      preserveQuickTab,
      productId,
      groupId,
      groupName,
      calcRule,
    } = pendingRodapePrompt;
    setPendingRodapePrompt(null);

    const rodapeTotal = Math.round(plan.barCount * unitPrice * 100) / 100;
    const baseTimestamp = Date.now();
    const rodapeItem: EspelhoItem = {
      id: `item_${baseTimestamp}_${Math.random().toString(36).substring(2, 6)}`,
      qtd: String(plan.barCount),
      descricao: plan.rodapeName,
      subtitulo,
      unidade: unit || 'barras',
      precoUnitario: unitPrice,
      total: rodapeTotal,
      requestedMl: plan.insumoMl > 0 ? plan.insumoMl : undefined,
      barLengthMeters: plan.barLengthMeters,
      ...(productId ? { catalogProductId: productId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
      calcRule: calcRule || 'rodape',
    };

    const includeColar = Boolean(selection?.includeColar);
    const includeCalafetar = Boolean(selection?.includeCalafetar);

    if (!selection || (!includeColar && !includeCalafetar)) {
      rodapeInsumoLinksRef.current.set(rodapeItem.id, {
        barLengthMeters: plan.barLengthMeters,
        requestedMl: plan.insumoMl > 0 ? plan.insumoMl : undefined,
        lastBarras: plan.barCount,
        includeColar: false,
        includeCalafetar: false,
        calafetarProductId: '',
      });
      setItems((prev) => [...prev, rodapeItem]);
      showToast(
        customToast ||
          `"${plan.rodapeName}" (${plan.barCount} ${plan.barCount === 1 ? 'barra' : 'barras'}) adicionado ao orçamento.`
      );
    } else {
      if (includeColar) {
        lockedRodapeInsumoGroupsRef.current.delete('colar');
        removedRodapeInsumoGroupsRef.current.delete('colar');
      }
      if (includeCalafetar) {
        lockedRodapeInsumoGroupsRef.current.delete('calafetar');
        removedRodapeInsumoGroupsRef.current.delete('calafetar');
      }
      rodapeInsumoLinksRef.current.set(rodapeItem.id, {
        barLengthMeters: plan.barLengthMeters,
        requestedMl: plan.insumoMl > 0 ? plan.insumoMl : undefined,
        lastBarras: plan.barCount,
        includeColar,
        includeCalafetar,
        calafetarProductId: selection.selectedCalafetarId || plan.selectedCalafetarId,
      });
      setItems((prev) => syncRodapeInsumosInList([...prev, rodapeItem], plan.rodapeName));
      showToast(
        customToast ||
          `"${plan.rodapeName}" (${plan.insumoMlDisplay || plan.effectiveMlDisplay} ml) e insumos selecionados incluídos no orçamento!`
      );
    }

    recordProductUsage(currentUserName, { name: plan.rodapeName, category });
    setShortcutsRefreshCounter((c) => c + 1);
    if (!preserveQuickTab) {
      resetProductForm();
    }
  };

  const commitPisoPrompt = (includeInsumos: boolean) => {
    if (!pendingPisoPrompt) return;
    const {
      plan,
      category,
      unit,
      unitPrice,
      subtitulo,
      customToast,
      preserveQuickTab,
      productId,
      groupId,
      groupName,
      calcRule,
      onAfterCommit,
    } = pendingPisoPrompt;
    setPendingPisoPrompt(null);

    const pisoTotal = Math.round(plan.realSqm * unitPrice * 100) / 100;
    const baseTimestamp = Date.now();
    const pisoItem: EspelhoItem = {
      id: `item_${baseTimestamp}_${Math.random().toString(36).substring(2, 6)}`,
      qtd: plan.realSqmDisplay,
      descricao: plan.productName,
      subtitulo,
      unidade: unit || 'm²',
      precoUnitario: unitPrice,
      total: pisoTotal,
      ...(productId ? { catalogProductId: productId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupName ? { groupName } : {}),
      calcRule: calcRule || 'piso_vinilico',
    };

    const skipCola = !isPisoVinilicoColado(
      plan.productName,
      category,
      undefined,
      groupName,
      calcRule
    );
    const includePrimerAntiumidade = plan.insumos.some(
      (i) => i.kind === 'primer_antiumidade'
    );

    if (!includeInsumos) {
      pisoInsumoLinksRef.current.set(pisoItem.id, {
        hasInsumos: false,
        requestedSqm: plan.requestedSqm,
        lastEffectiveSqm: plan.realSqm,
        skipCola,
        includePrimerAntiumidade: false,
      });
      setItems((prev) => [...prev, pisoItem]);
      showToast(
        customToast ||
          `"${plan.productName}" (${plan.realSqmDisplay} m²) adicionado ao orçamento.`
      );
    } else {
      plan.insumos.forEach((insumo) => {
        const grp = getPisoInsumoGroupFromKind(insumo.kind);
        lockedPisoInsumoGroupsRef.current.delete(grp);
        removedPisoInsumoGroupsRef.current.delete(grp);
      });
      pisoInsumoLinksRef.current.set(pisoItem.id, {
        hasInsumos: true,
        requestedSqm: plan.requestedSqm,
        lastEffectiveSqm: plan.realSqm,
        skipCola,
        includePrimerAntiumidade,
      });
      setItems((prev) => syncPisoInsumosInList([...prev, pisoItem]));
      showToast(
        customToast ||
          `"${plan.productName}" (${plan.realSqmDisplay} m²) e insumos incluídos no orçamento!`
      );
    }

    recordProductUsage(currentUserName, { name: plan.productName, category });
    setShortcutsRefreshCounter((c) => c + 1);
    if (!preserveQuickTab) {
      resetProductForm();
    }
    if (onAfterCommit) {
      onAfterCommit();
    }
  };

  // Handle selection from ProductSelectionModal
  const handleSelectProductFromModal = (prod: {
    name: string;
    category: string;
    unit: string;
    price: number;
    quantity: string;
    subtitulo?: string;
    requestedSqm?: number;
    effectiveSqm?: number;
    boxes?: number;
    requestedRodapeMl?: number;
    productId?: string;
    groupId?: string;
    groupName?: string;
    calcRule?: ProductCalcRule;
  }) => {
    const matchedCat = resolveCatalogProductByNameOrId(
      prod.productId || prod.name,
      dynamicCatalog
    );
    const resolvedProductId = prod.productId ?? matchedCat?.id;
    const resolvedGroupId = prod.groupId ?? matchedCat?.groupId;
    const resolvedGroupName = prod.groupName ?? matchedCat?.groupName;
    const resolvedCategoryId = matchedCat?.categoryId;
    const resolvedCalcRule =
      prod.calcRule ??
      resolveProductCalcRule({
        productName: prod.name,
        categoryName: prod.category,
        categoryId: resolvedCategoryId,
        groupName: resolvedGroupName,
        groupId: resolvedGroupId,
        groupCalcRule: matchedCat?.groupCalcRule,
      });

    const rawNumQtd = parsePtBrNumeric(prod.quantity) || 1;
    const safeProdPrice = parsePriceToNumber(prod.price);
    const isPiso =
      isPisoVinilicoProduct(
        prod.name,
        prod.category,
        resolvedCategoryId,
        resolvedGroupName,
        resolvedCalcRule
      ) && isSquareMeterUnit(prod.unit);
    const boxYield = isPiso ? extractPisoBoxYield(prod.name) : null;
    const isRodape = isRodapeProduct(
      prod.name,
      prod.category,
      resolvedCategoryId,
      resolvedGroupName,
      resolvedCalcRule
    );
    const isTeto = resolvedCalcRule === 'teto_vinilico' && isSquareMeterUnit(prod.unit);

    let finalQtyDisplay = prod.quantity;
    let finalNumQtd = rawNumQtd;
    let finalSubtitulo = prod.subtitulo;
    let requestedSqm = prod.requestedSqm ?? rawNumQtd;
    let effectiveSqm = prod.effectiveSqm ?? rawNumQtd;
    let finalBoxes = prod.boxes ?? null;
    let requestedRodapeMl = prod.requestedRodapeMl;

    if (isPiso && boxYield) {
      if (prod.effectiveSqm && prod.effectiveSqm > 0) {
        effectiveSqm = prod.effectiveSqm;
        finalNumQtd = effectiveSqm;
      } else {
        const boxesFromSub = parseBoxesFromDetail(prod.subtitulo);
        if (boxesFromSub && boxesFromSub > 0 && !prod.requestedSqm) {
          const boxConv = convertBoxesToPisoSqm(boxesFromSub, boxYield);
          finalQtyDisplay = boxConv.realSqmDisplay;
          finalNumQtd = boxConv.realSqm;
          effectiveSqm = boxConv.realSqm;
          requestedSqm = boxConv.realSqm;
          finalBoxes = boxConv.boxes;
          finalSubtitulo = formatBoxesDetail(boxConv.boxes, prod.subtitulo);
        } else {
          const sqmConv = convertSqmToPisoBoxes(requestedSqm, boxYield, prod.subtitulo);
          finalQtyDisplay = sqmConv.realSqmDisplay;
          finalNumQtd = sqmConv.realSqm;
          effectiveSqm = sqmConv.realSqm;
          finalBoxes = sqmConv.boxes;
          finalSubtitulo = sqmConv.detailText;
        }
      }
    } else if (isRodape) {
      const barLen = extractBarLengthFromProductName(prod.name, 2.4);
      const explicitBars = parseBarCountFromInput(prod.quantity);
      const parsedFromSub = parseRodapeDetails(prod.subtitulo)?.metrosDesejados;
      finalSubtitulo = stripRodapeAutoDetail(prod.subtitulo);
      if (requestedRodapeMl && requestedRodapeMl > 0) {
        const calc = calculateRodapeBarras(requestedRodapeMl, barLen, safeProdPrice);
        finalNumQtd = calc.barrasNecessarias || 1;
        finalQtyDisplay = String(finalNumQtd);
      } else if (explicitBars && explicitBars > 0) {
        finalNumQtd = explicitBars;
        finalQtyDisplay = String(explicitBars);
        requestedRodapeMl = Math.round(explicitBars * barLen * 100) / 100;
      } else if (parsedFromSub && parsedFromSub > 0) {
        requestedRodapeMl = parsedFromSub;
      } else if (rawNumQtd > 0) {
        const rodConv = convertMetrosToBarras(prod.quantity, prod.name, barLen);
        if (rodConv && rodConv.barras > 0) {
          finalNumQtd = rodConv.barras;
          finalQtyDisplay = String(rodConv.barras);
          requestedRodapeMl = rodConv.metros;
        }
      }
    } else if (isTeto && rawNumQtd > 0) {
      const tetoConv = calculateTetoVinilico(rawNumQtd, matchedCat || { name: prod.name });
      if (tetoConv.effectiveSqm > 0) {
        finalNumQtd = tetoConv.effectiveSqm;
        finalQtyDisplay = tetoConv.effectiveSqmDisplay;
        finalSubtitulo = formatTetoDetail(tetoConv.compositionDetail, prod.subtitulo);
      }
    }

    if (
      tryOpenPisoInsumosPrompt({
        name: prod.name,
        category: prod.category,
        categoryId: resolvedCategoryId,
        productId: resolvedProductId,
        groupId: resolvedGroupId,
        groupName: resolvedGroupName,
        calcRule: resolvedCalcRule,
        unit: prod.unit,
        unitPrice: safeProdPrice,
        requestedSqm,
        effectiveSqm,
        boxes: finalBoxes,
        subtitulo: finalSubtitulo,
      })
    ) {
      return;
    }

    if (
      tryOpenRodapeInsumosPrompt({
        name: prod.name,
        category: prod.category,
        categoryId: resolvedCategoryId,
        productId: resolvedProductId,
        groupId: resolvedGroupId,
        groupName: resolvedGroupName,
        calcRule: resolvedCalcRule,
        unit: prod.unit,
        unitPrice: safeProdPrice,
        barCount: finalNumQtd,
        requestedMl: requestedRodapeMl,
        subtitulo: finalSubtitulo,
      })
    ) {
      return;
    }

    const itemTotal = Math.round(finalNumQtd * safeProdPrice * 100) / 100;

    const newItem: EspelhoItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      qtd: finalQtyDisplay,
      descricao: prod.name,
      subtitulo: finalSubtitulo,
      unidade: prod.unit,
      precoUnitario: safeProdPrice,
      total: itemTotal,
      ...(resolvedProductId ? { catalogProductId: resolvedProductId } : {}),
      ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
      ...(resolvedGroupName ? { groupName: resolvedGroupName } : {}),
      calcRule: resolvedCalcRule,
      ...(isRodape
        ? {
            requestedMl: requestedRodapeMl,
            barLengthMeters: extractBarLengthFromProductName(prod.name, 2.4),
          }
        : {}),
    };

    setItems((prev) => [...prev, newItem]);
    recordProductUsage(currentUserName, { name: prod.name, category: prod.category });
    setShortcutsRefreshCounter((c) => c + 1);
    showToast(`"${prod.name}" adicionado ao orçamento.`);

    // Limpa o formulário e deixa pronto para pesquisar outro produto
    resetProductForm();
  };

  // Callback de sucesso ao cadastrar novo produto diretamente pelo modal
  const handleCadastrarProdutoSuccess = (
    newProd: CatalogProduct,
    initialQty: string,
    initialDetail?: string
  ) => {
    const resolvedCalcRule = resolveProductCalcRule({
      productName: newProd.name,
      categoryName: newProd.category,
      categoryId: newProd.categoryId,
      groupName: newProd.groupName,
      groupId: newProd.groupId,
      groupCalcRule: newProd.groupCalcRule,
    });
    const rawNumQtd = parsePtBrNumeric(initialQty) || 1;
    const tierPrice = getProductTierPrice(newProd, priceTable);
    const isPiso =
      isPisoVinilicoProduct(
        newProd.name,
        newProd.category,
        newProd.categoryId,
        newProd.groupName,
        resolvedCalcRule
      ) && isSquareMeterUnit(newProd.unit);
    const boxYield = isPiso ? extractPisoBoxYield(newProd.name) : null;
    const isRodape = isRodapeProduct(
      newProd.name,
      newProd.category,
      newProd.categoryId,
      newProd.groupName,
      resolvedCalcRule
    );
    const isTeto =
      resolvedCalcRule === 'teto_vinilico' && isSquareMeterUnit(newProd.unit);

    let finalQtyDisplay = initialQty || '1';
    let finalNumQtd = rawNumQtd;
    let finalUnit = newProd.unit;
    let finalDetail = initialDetail || undefined;
    let requestedSqm = rawNumQtd;
    let effectiveSqm = rawNumQtd;
    let finalBoxes: number | null = null;
    let requestedRodapeMl: number | undefined;

    if (isPiso && boxYield) {
      const boxesFromDetail = parseBoxesFromDetail(initialDetail);
      if (boxesFromDetail && boxesFromDetail > 0) {
        const boxConv = convertBoxesToPisoSqm(boxesFromDetail, boxYield);
        finalQtyDisplay = boxConv.realSqmDisplay;
        finalNumQtd = boxConv.realSqm;
        effectiveSqm = boxConv.realSqm;
        requestedSqm = boxConv.realSqm;
        finalBoxes = boxConv.boxes;
        finalDetail = formatBoxesDetail(boxConv.boxes, initialDetail);
      } else {
        const sqmConv = convertSqmToPisoBoxes(rawNumQtd, boxYield, initialDetail);
        finalQtyDisplay = sqmConv.realSqmDisplay;
        finalNumQtd = sqmConv.realSqm;
        effectiveSqm = sqmConv.realSqm;
        finalBoxes = sqmConv.boxes;
        finalDetail = sqmConv.detailText;
      }
    } else if (isRodape) {
      const barLen = extractBarLengthFromProductName(newProd.name, 2.4);
      const explicitBars = parseBarCountFromInput(initialQty) || parseBarCountFromInput(initialDetail);
      finalDetail = stripRodapeAutoDetail(initialDetail) || undefined;
      if (explicitBars && explicitBars > 0) {
        finalNumQtd = explicitBars;
        finalQtyDisplay = String(explicitBars);
        requestedRodapeMl = Math.round(explicitBars * barLen * 100) / 100;
      } else {
        const rodConv = convertMetrosToBarras(finalQtyDisplay, newProd.name, barLen);
        if (rodConv && rodConv.barras > 0) {
          finalNumQtd = rodConv.barras;
          finalQtyDisplay = String(rodConv.barras);
          requestedRodapeMl = rodConv.metros;
        }
      }
      finalUnit = 'barras';
    } else if (isTeto && rawNumQtd > 0) {
      const tetoConv = calculateTetoVinilico(rawNumQtd, newProd);
      if (tetoConv.effectiveSqm > 0) {
        finalNumQtd = tetoConv.effectiveSqm;
        finalQtyDisplay = tetoConv.effectiveSqmDisplay;
        finalDetail = formatTetoDetail(tetoConv.compositionDetail, initialDetail);
      }
    }

    if (
      tryOpenPisoInsumosPrompt({
        name: newProd.name,
        category: newProd.category,
        categoryId: newProd.categoryId,
        productId: newProd.id,
        groupId: newProd.groupId,
        groupName: newProd.groupName,
        calcRule: resolvedCalcRule,
        unit: finalUnit,
        unitPrice: tierPrice,
        requestedSqm,
        effectiveSqm,
        boxes: finalBoxes,
        subtitulo: finalDetail,
        customToast: `Produto "${newProd.name}" cadastrado no catálogo e inserido no orçamento!`,
      })
    ) {
      return;
    }

    if (
      tryOpenRodapeInsumosPrompt({
        name: newProd.name,
        category: newProd.category,
        categoryId: newProd.categoryId,
        productId: newProd.id,
        groupId: newProd.groupId,
        groupName: newProd.groupName,
        calcRule: resolvedCalcRule,
        unit: finalUnit,
        unitPrice: tierPrice,
        barCount: finalNumQtd,
        requestedMl: requestedRodapeMl,
        subtitulo: finalDetail,
        customToast: `Produto "${newProd.name}" cadastrado no catálogo e inserido no orçamento!`,
      })
    ) {
      return;
    }

    const itemTotal = Math.round(finalNumQtd * tierPrice * 100) / 100;

    const newItem: EspelhoItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      qtd: finalQtyDisplay,
      descricao: newProd.name,
      subtitulo: finalDetail,
      unidade: finalUnit,
      precoUnitario: tierPrice,
      total: itemTotal,
      catalogProductId: newProd.id,
      groupId: newProd.groupId,
      groupName: newProd.groupName,
      calcRule: resolvedCalcRule,
      ...(isRodape
        ? {
            requestedMl: requestedRodapeMl,
            barLengthMeters: extractBarLengthFromProductName(newProd.name, 2.4),
          }
        : {}),
    };

    setItems((prev) => [...prev, newItem]);
    recordProductUsage(currentUserName, newProd);
    setShortcutsRefreshCounter((c) => c + 1);
    showToast(`Produto "${newProd.name}" cadastrado no catálogo e inserido no orçamento!`);

    setSelectedProductCatalog(newProd.name);
    setNewCategoria(newProd.category || 'Geral');
    syncFormCatalogMetadata({
      id: newProd.id,
      groupId: newProd.groupId,
      groupName: newProd.groupName,
      groupCalcRule: resolvedCalcRule,
    });
    setNewUnid(finalUnit || 'unidades');
    setNewPrecoUnitario(formatPriceToBrl(tierPrice));
    setNewQtd(finalQtyDisplay);
    setNewSubtitulo(finalDetail || '');
    setProductSubTab('buscar');
  };

  // Carregar dados de produto já adicionado para edição
  const handleEditItem = (item: EspelhoItem) => {
    resetPisoConversionRefs();
    resetRodapeConversionRefs();
    resetTetoConversionRefs();
    resetRipadoHelperStates();
    setEditingItemId(item.id);
    setSelectedProductCatalog(item.descricao);
    const matchedCat = resolveCatalogProductByNameOrId(
      item.catalogProductId || item.descricao,
      dynamicCatalog
    );
    const resolvedGroupName = item.groupName ?? matchedCat?.groupName;
    const resolvedCalcRule =
      item.calcRule ??
      matchedCat?.groupCalcRule ??
      resolveProductCalcRule({
        productName: item.descricao,
        categoryName: matchedCat?.category,
        categoryId: matchedCat?.categoryId,
        groupName: resolvedGroupName,
        groupId: item.groupId ?? matchedCat?.groupId,
      });

    setNewCategoria(matchedCat?.category || 'Geral');
    syncFormCatalogMetadata({
      id: item.catalogProductId ?? matchedCat?.id,
      groupId: item.groupId ?? matchedCat?.groupId,
      groupName: resolvedGroupName,
      groupCalcRule: resolvedCalcRule,
    });

    const isRodapeItem = isRodapeProduct(
      item.descricao,
      matchedCat?.category,
      matchedCat?.categoryId,
      resolvedGroupName,
      resolvedCalcRule
    );
    const isPisoItem = isPisoVinilicoProduct(
      item.descricao,
      matchedCat?.category,
      matchedCat?.categoryId,
      resolvedGroupName,
      resolvedCalcRule
    );
    const isTetoItem = resolvedCalcRule === 'teto_vinilico';

    setNewSubtitulo(
      isRodapeItem ? stripRodapeAutoDetail(item.subtitulo) || '' : item.subtitulo || ''
    );
    setNewUnid(item.unidade || 'unidades');
    setNewPrecoUnitario(formatPriceToBrl(item.precoUnitario));

    const parsedQty = parsePtBrNumeric(item.qtd);
    if (parsedQty > 0 && isPisoItem && isSquareMeterUnit(item.unidade)) {
      pisoLastRealSqmRef.current = parsedQty;
      pisoRequestedSqmRef.current = parsedQty;
      setNewQtd(item.qtd);
    } else if (parsedQty > 0 && isTetoItem && isSquareMeterUnit(item.unidade)) {
      tetoLastEffectiveSqmRef.current = parsedQty;
      tetoRequestedSqmRef.current = parsedQty;
      setNewQtd(item.qtd);
    } else if (isRodapeItem) {
      const barLen =
        item.barLengthMeters || extractBarLengthFromProductName(item.descricao, 2.4);
      const existingLink = rodapeInsumoLinksRef.current.get(item.id);
      const parsedDet = parseRodapeDetails(item.subtitulo);
      const resolvedMl =
        (item.requestedMl && item.requestedMl > 0 ? item.requestedMl : undefined) ??
        (existingLink?.requestedMl && existingLink.requestedMl > 0
          ? existingLink.requestedMl
          : undefined) ??
        (parsedDet?.metrosDesejados && parsedDet.metrosDesejados > 0
          ? parsedDet.metrosDesejados
          : undefined) ??
        (parsedQty > 0 ? Math.round(parsedQty * barLen * 100) / 100 : 0);
      rodapeLastBarrasRef.current = parsedQty > 0 ? parsedQty : null;
      rodapeRequestedMlRef.current = resolvedMl > 0 ? resolvedMl : null;
      setNewQtd(resolvedMl > 0 ? String(resolvedMl).replace('.', ',') : item.qtd);
    } else {
      setNewQtd(item.qtd);
    }

    setProductSubTab('produtos');
    const formSection = document.getElementById('adicionar-produtos-container');
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth' });
    }
    showToast(`Editando "${item.descricao}". Altere os dados e salve.`);
  };

  // Cancelar edição
  const handleCancelEdit = () => {
    resetPisoConversionRefs();
    resetRodapeConversionRefs();
    resetTetoConversionRefs();
    resetRipadoHelperStates();
    setEditingItemId(null);
    setSelectedProductCatalog('');
    syncFormCatalogMetadata(null);
    setNewSubtitulo('');
    setNewQtd('1');
    setNewUnid('unidades');
    setNewPrecoUnitario('0,00');
    setProductSubTab('buscar');
  };

  const handleGenerateQuickBudget = (e: React.FormEvent) => {
    e.preventDefault();

    const pisoSqm = parsePtBrNumeric(quickPisoSqm);
    const rodapeMl = parsePtBrNumeric(quickRodapeMl);
    const ripadoArea =
      quickRipadoMode === 'm2' ? parsePtBrNumeric(quickRipadoSqm) : 0;
    const ripadoW =
      quickRipadoMode === 'lxA' ? parsePtBrNumeric(quickRipadoWidth) : 0;
    const ripadoH =
      quickRipadoMode === 'lxA' ? parsePtBrNumeric(quickRipadoHeight) : 0;
    const tetoSqm = parsePtBrNumeric(quickTetoSqm);
    const mantaSqm = parsePtBrNumeric(quickMantaSqm);

    if (
      quickRipadoMode === 'lxA' &&
      ((ripadoW > 0 && ripadoH <= 0) || (ripadoH > 0 && ripadoW <= 0))
    ) {
      showToast('Para Ripado em L × A, informe Largura e Altura.');
      return;
    }

    const hasRipado =
      quickRipadoMode === 'm2' ? ripadoArea > 0 : ripadoW > 0 && ripadoH > 0;

    const steps: QuickCategoryKey[] = [];
    if (pisoSqm > 0) steps.push('piso');
    if (rodapeMl > 0) steps.push('rodape');
    if (hasRipado) steps.push('ripado');
    if (tetoSqm > 0) steps.push('teto');
    if (mantaSqm > 0) steps.push('manta');

    if (steps.length === 0) {
      showToast('Preencha ao menos um produto para gerar o orçamento.');
      return;
    }

    setQuickWizardMeasurements({
      pisoSqm,
      rodapeMl,
      ripado: {
        mode: quickRipadoMode,
        areaM2: ripadoArea,
        widthMeters: ripadoW,
        heightMeters: ripadoH,
      },
      tetoSqm,
      mantaSqm,
    });
    setQuickWizardSteps(steps);
    setQuickWizardOpen(true);
  };

  const handleConfirmQuickWizard = (finalConfig: QuickWizardConfigState) => {
    setQuickWizardConfig(finalConfig);
    setQuickWizardOpen(false);

    if (!quickWizardMeasurements || quickWizardSteps.length === 0) return;

    const tagsToReplace = new Set<string>(
      quickWizardSteps.flatMap((step) => getQuickAutoTagsForCategory(step))
    );

    if (quickWizardSteps.includes('piso')) {
      lockedPisoInsumoGroupsRef.current.clear();
      removedPisoInsumoGroupsRef.current.clear();
    }
    if (quickWizardSteps.includes('rodape')) {
      lockedRodapeInsumoGroupsRef.current.clear();
      removedRodapeInsumoGroupsRef.current.clear();
    }

    const allGeneratedItems: EspelhoItem[] = [];
    const allWarnings: string[] = [];

    for (const step of quickWizardSteps) {
      const res = buildQuickCategoryItems({
        category: step,
        measurements: quickWizardMeasurements,
        config: finalConfig,
        priceTable,
        catalog: dynamicCatalog,
        parseNumeric: parsePtBrNumeric,
      });

      allGeneratedItems.push(...res.items);
      allWarnings.push(...res.warnings);

      if (res.pisoLink) {
        pisoInsumoLinksRef.current.set(res.pisoLink.itemId, {
          hasInsumos: res.pisoLink.hasInsumos,
          requestedSqm: res.pisoLink.requestedSqm,
          lastEffectiveSqm: res.pisoLink.lastEffectiveSqm,
          skipCola: res.pisoLink.skipCola,
          includePrimerAntiumidade: false,
        });
      }

      if (res.rodapeLink) {
        rodapeInsumoLinksRef.current.set(res.rodapeLink.itemId, {
          barLengthMeters: res.rodapeLink.barLengthMeters,
          requestedMl: res.rodapeLink.requestedMl,
          lastBarras: res.rodapeLink.lastBarras,
          includeColar: res.rodapeLink.includeColar,
          includeCalafetar: res.rodapeLink.includeCalafetar,
          calafetarProductId: res.rodapeLink.calafetarProductId,
        });
      }
    }

    setItems((prev) => {
      prev.forEach((it) => {
        if (it.autoTag && tagsToReplace.has(it.autoTag)) {
          pisoInsumoLinksRef.current.delete(it.id);
          rodapeInsumoLinksRef.current.delete(it.id);
        }
      });
      const preserved = prev.filter(
        (it) => !it.autoTag || !tagsToReplace.has(it.autoTag)
      );
      return [...preserved, ...allGeneratedItems];
    });

    allGeneratedItems.forEach((it) => {
      const prodObj = dynamicCatalog.find((p) => p.name === it.descricao);
      if (prodObj) {
        recordProductUsage(currentUserName, {
          name: prodObj.name,
          category: prodObj.category,
        });
      }
    });
    setShortcutsRefreshCounter((c) => c + 1);

    if (allWarnings.length > 0) {
      showToast(allWarnings[0]);
    } else {
      showToast('Orçamento rápido aplicado aos itens do orçamento.');
    }
  };

  const handleConfirmClearAllItems = () => {
    resetAllInsumoLinks();
    if (editingItemId) {
      handleCancelEdit();
    }
    setItems([]);
    setLimpaPisoEnabled(false);
    setAreaTerreaEnabled(false);
    setAreaTerreaSqm('');
    setItemQtdDrafts({});
    setItemPrecoDrafts({});
    setHasFreteEnabled(false);
    setFreteValorInput('0,00');
    setHasDescontoEnabled(false);
    setDescontoInput('0,00');
    setPendingPisoPrompt(null);
    setPendingRodapePrompt(null);

    if (
      !initialOrcamento &&
      !selectedClientId &&
      !nomeOrcamento.trim() &&
      !observacoes.trim() &&
      !observacoesRodape.trim()
    ) {
      try {
        localStorage.removeItem(ACTIVE_DRAFT_KEY);
        localStorage.removeItem('fenix_orcamento_in_progress_draft');
      } catch {}
    }

    showToast('Todos os itens da tabela foram removidos e os totais foram zerados.');
  };

  // Salvar Produto (Adiciona novo ou Atualiza item existente sem duplicar)
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (rodapeDebounceTimerRef.current) {
      clearTimeout(rodapeDebounceTimerRef.current);
    }
    if (pisoQtdDebounceRef.current) {
      clearTimeout(pisoQtdDebounceRef.current);
      pisoQtdDebounceRef.current = null;
    }
    if (tetoQtdDebounceRef.current) {
      clearTimeout(tetoQtdDebounceRef.current);
      tetoQtdDebounceRef.current = null;
    }
    const cleanDesc = selectedProductCatalog.trim();
    if (!cleanDesc) {
      showToast('Informe a descrição ou selecione um produto.');
      return;
    }

    let finalQtd = newQtd.trim();
    let finalUnid = newUnid || 'unidades';
    let finalSubtitulo = newSubtitulo.trim() || undefined;

    let rodapeRequestedMl: number | undefined;
    let rodapeBarLen: number | undefined;

    // Se for rodapé, garante a conversão de ML para barras (sem reinterpretar barras já convertidas) e atualiza detalhe
    if (isCurrentProductRodape) {
      const rodConv = triggerRodapeQuantityConversion(finalQtd);
      if (rodConv) {
        finalQtd = String(rodConv.barras);
        finalUnid = 'barras';
        finalSubtitulo = rodConv.detailText.trim() || undefined;
        rodapeRequestedMl = rodConv.requestedMl;
        rodapeBarLen = rodConv.barLen;
      }
    }

    let pisoRequestedSqm = parsePtBrNumeric(finalQtd);
    let pisoEffectiveSqm = pisoRequestedSqm;
    let pisoBoxes: number | null = null;

    // Se for Piso Vinílico, sincroniza metragem efetiva das caixas e preserva metragem originalmente solicitada
    if (isCurrentProductPiso && isSquareMeterUnit(finalUnid) && currentPisoBoxYield) {
      const conv = applyPisoFromQuantity(finalQtd, true);
      if (conv) {
        finalQtd = conv.realSqmDisplay;
        finalSubtitulo = conv.detailText.trim() || undefined;
        pisoRequestedSqm = conv.requestedSqm;
        pisoEffectiveSqm = conv.realSqm;
        pisoBoxes = conv.boxes;
      } else {
        const boxesFromSub = parseBoxesFromDetail(newSubtitulo);
        if (boxesFromSub && boxesFromSub > 0) {
          const boxConv = convertBoxesToPisoSqm(boxesFromSub, currentPisoBoxYield);
          finalQtd = boxConv.realSqmDisplay;
          finalSubtitulo = formatBoxesDetail(boxesFromSub, newSubtitulo).trim() || undefined;
          pisoRequestedSqm = boxConv.realSqm;
          pisoEffectiveSqm = boxConv.realSqm;
          pisoBoxes = boxConv.boxes;
        }
      }
    } else if (isCurrentProductTeto && isSquareMeterUnit(finalUnid)) {
      const tetoConv = applyTetoFromQuantity(finalQtd, true);
      if (tetoConv) {
        finalQtd = tetoConv.effectiveSqmDisplay;
        finalSubtitulo = tetoConv.detailText.trim() || undefined;
      }
    }

    if (!finalQtd || finalQtd === '0') {
      showToast('Informe uma quantidade válida.');
      return;
    }

    const numQtd =
      parseFloat(finalQtd.replace(/\./g, '').replace(',', '.')) || 0;
    const numPreco =
      parseFloat(newPrecoUnitario.replace(/\./g, '').replace(',', '.')) || 0;

    if (numQtd <= 0) {
      showToast('A quantidade deve ser maior que zero.');
      return;
    }

    const itemTotal = Math.round(numQtd * numPreco * 100) / 100;
    const resolvedProductId = newCatalogProductId ?? currentCatalogMatch?.id;

    if (editingItemId) {
      // ATUALIZA O ITEM EXISTENTE SEM DUPLICAR (e recalcula insumos se for piso ou rodapé vinculado)
      const targetId = editingItemId;
      setItems((prev) => {
        const updatedList = prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                qtd: finalQtd,
                descricao: cleanDesc,
                subtitulo: finalSubtitulo,
                unidade: finalUnid,
                precoUnitario: numPreco,
                total: itemTotal,
                ...(resolvedProductId ? { catalogProductId: resolvedProductId } : {}),
                ...(effectiveGroupId ? { groupId: effectiveGroupId } : {}),
                ...(effectiveGroupName ? { groupName: effectiveGroupName } : {}),
                calcRule: currentProductCalcRule,
                ...(isCurrentProductRodape
                  ? {
                      requestedMl: rodapeRequestedMl,
                      barLengthMeters: rodapeBarLen,
                    }
                  : {}),
              }
            : it
        );
        const editedItem = updatedList.find((it) => it.id === targetId);
        if (!editedItem) return updatedList;

        if (
          isPisoVinilicoProduct(
            editedItem.descricao,
            newCategoria,
            effectiveCategoryId,
            editedItem.groupName ?? effectiveGroupName,
            editedItem.calcRule ?? currentProductCalcRule
          ) &&
          isSquareMeterUnit(editedItem.unidade)
        ) {
          ensurePisoLinkForExistingBudget({
            itemsList: updatedList,
            pisoItem: editedItem,
            pisoLinks: pisoInsumoLinksRef.current,
            removedGroups: removedPisoInsumoGroupsRef.current,
            catalogOverride: dynamicCatalog,
          });
          const existingPisoLink = pisoInsumoLinksRef.current.get(targetId);
          if (existingPisoLink) {
            existingPisoLink.requestedSqm = pisoRequestedSqm;
            existingPisoLink.lastEffectiveSqm = pisoEffectiveSqm;
            existingPisoLink.skipCola = !isPisoVinilicoColado(
              editedItem.descricao,
              newCategoria,
              effectiveCategoryId,
              editedItem.groupName ?? effectiveGroupName,
              editedItem.calcRule ?? currentProductCalcRule
            );
            if (existingPisoLink.hasInsumos) {
              return syncPisoInsumosInList(updatedList);
            }
          }
          return updatedList;
        }

        if (
          isRodapeProduct(
            editedItem.descricao,
            newCategoria,
            effectiveCategoryId,
            editedItem.groupName ?? effectiveGroupName,
            editedItem.calcRule ?? currentProductCalcRule
          )
        ) {
          ensureRodapeLinkForExistingBudget(updatedList, editedItem);
          const resolvedBarLen =
            rodapeBarLen ??
            extractBarLengthFromProductName(editedItem.descricao, 2.4);
          const existingLink = rodapeInsumoLinksRef.current.get(targetId);
          const resolvedReqMl =
            rodapeRequestedMl ??
            parseRodapeDetails(editedItem.subtitulo)?.metrosDesejados ??
            existingLink?.requestedMl ??
            Math.round(numQtd * resolvedBarLen * 100) / 100;
          if (existingLink) {
            existingLink.requestedMl = resolvedReqMl;
            existingLink.lastBarras = numQtd;
            existingLink.barLengthMeters = resolvedBarLen;
            if (existingLink.includeColar || existingLink.includeCalafetar) {
              return syncRodapeInsumosInList(updatedList, editedItem.descricao);
            }
          } else {
            rodapeInsumoLinksRef.current.set(targetId, {
              barLengthMeters: resolvedBarLen,
              requestedMl: resolvedReqMl,
              lastBarras: numQtd,
              includeColar: false,
              includeCalafetar: false,
              calafetarProductId: '',
            });
          }
          return updatedList;
        }

        const editedPisoInsumoGrp = classifyPisoInsumoGroup(
          editedItem.descricao,
          dynamicCatalog
        );
        if (editedPisoInsumoGrp) {
          lockedPisoInsumoGroupsRef.current.add(editedPisoInsumoGrp);
        }
        const editedRodapeInsumoGrp = classifyRodapeInsumoGroup(
          editedItem.descricao,
          editedItem.unidade,
          dynamicCatalog
        );
        if (editedRodapeInsumoGrp) {
          lockedRodapeInsumoGroupsRef.current.add(editedRodapeInsumoGrp);
        }
        return updatedList;
      });
      showToast(`Item "${cleanDesc}" atualizado com sucesso!`);
    } else {
      if (
        tryOpenPisoInsumosPrompt({
          name: cleanDesc,
          category: newCategoria,
          categoryId: effectiveCategoryId,
          productId: resolvedProductId,
          groupId: effectiveGroupId,
          groupName: effectiveGroupName,
          calcRule: currentProductCalcRule,
          unit: finalUnid,
          unitPrice: numPreco,
          requestedSqm: pisoRequestedSqm,
          effectiveSqm: pisoEffectiveSqm,
          boxes: pisoBoxes,
          subtitulo: finalSubtitulo,
        })
      ) {
        return;
      }

      if (
        tryOpenRodapeInsumosPrompt({
          name: cleanDesc,
          category: newCategoria,
          categoryId: effectiveCategoryId,
          productId: resolvedProductId,
          groupId: effectiveGroupId,
          groupName: effectiveGroupName,
          calcRule: currentProductCalcRule,
          unit: finalUnid,
          unitPrice: numPreco,
          barCount: numQtd,
          barLengthMeters: rodapeBarLen,
          requestedMl: rodapeRequestedMl,
          subtitulo: finalSubtitulo,
        })
      ) {
        return;
      }

      // ADICIONA NOVO PRODUTO
      const newItem: EspelhoItem = {
        id: `item_${Date.now()}`,
        qtd: finalQtd,
        descricao: cleanDesc,
        subtitulo: finalSubtitulo,
        unidade: finalUnid,
        precoUnitario: numPreco,
        total: itemTotal,
        ...(resolvedProductId ? { catalogProductId: resolvedProductId } : {}),
        ...(effectiveGroupId ? { groupId: effectiveGroupId } : {}),
        ...(effectiveGroupName ? { groupName: effectiveGroupName } : {}),
        calcRule: currentProductCalcRule,
        ...(isCurrentProductRodape
          ? {
              requestedMl: rodapeRequestedMl,
              barLengthMeters: rodapeBarLen,
            }
          : {}),
      };

      setItems((prev) => [...prev, newItem]);
      recordProductUsage(currentUserName, { name: cleanDesc, category: newCategoria });
      setShortcutsRefreshCounter((c) => c + 1);
      showToast(`"${cleanDesc}" adicionado ao orçamento.`);
    }

    // LIMPAR AUTOMATICAMENTE O FORMULÁRIO e deixar pronto para pesquisar outro
    resetProductForm();
  };

  // Remove product from budget
  const handleRemoveItem = (id: string) => {
    if (editingItemId === id) {
      handleCancelEdit();
    }
    setItemQtdDrafts((prev) => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

    setItems((prev) => {
      const removedItem = prev.find((i) => i.id === id);
      const remaining = prev.filter((i) => i.id !== id);
      if (!removedItem) return remaining;

      if (removedItem.autoTag === 'toggle_limpa_piso') {
        setLimpaPisoEnabled(false);
        return remaining;
      }
      if (removedItem.autoTag === 'toggle_area_terrea') {
        setAreaTerreaEnabled(false);
        setAreaTerreaSqm('');
        return remaining;
      }
      if (removedItem.autoTag === 'quick_manta_insumo') {
        return remaining;
      }

      const pisoLink = pisoInsumoLinksRef.current.get(id);
      if (pisoLink) {
        pisoInsumoLinksRef.current.delete(id);
        if (pisoLink.hasInsumos) {
          return syncPisoInsumosInList(remaining);
        }
        return remaining;
      }

      const wasLinkedRodape = rodapeInsumoLinksRef.current.has(id);
      if (wasLinkedRodape) {
        rodapeInsumoLinksRef.current.delete(id);
        return syncRodapeInsumosInList(remaining);
      }

      // Se o usuário removeu manualmente um insumo de piso ou rodapé, respeita a exclusão
      const pisoInsumoGrp = classifyPisoInsumoGroup(
        removedItem.descricao,
        dynamicCatalog
      );
      if (pisoInsumoGrp) {
        const hasAnotherSameGroup = remaining.some(
          (it) =>
            it.autoTag !== 'toggle_area_terrea' &&
            it.autoTag !== 'quick_manta_insumo' &&
            classifyPisoInsumoGroup(it.descricao, dynamicCatalog) === pisoInsumoGrp
        );
        if (hasAnotherSameGroup) {
          lockedPisoInsumoGroupsRef.current.add(pisoInsumoGrp);
        } else {
          removedPisoInsumoGroupsRef.current.add(pisoInsumoGrp);
        }
        return remaining;
      }

      const rodapeInsumoGrp = classifyRodapeInsumoGroup(
        removedItem.descricao,
        removedItem.unidade,
        dynamicCatalog
      );
      if (rodapeInsumoGrp) {
        const hasAnotherSameGroup = remaining.some(
          (it) =>
            classifyRodapeInsumoGroup(it.descricao, it.unidade, dynamicCatalog) ===
            rodapeInsumoGrp
        );
        if (hasAnotherSameGroup) {
          lockedRodapeInsumoGroupsRef.current.add(rodapeInsumoGrp);
        } else {
          removedRodapeInsumoGroupsRef.current.add(rodapeInsumoGrp);
          rodapeInsumoLinksRef.current.forEach((lnk) => {
            if (rodapeInsumoGrp === 'colar') lnk.includeColar = false;
            if (rodapeInsumoGrp === 'calafetar') lnk.includeCalafetar = false;
          });
        }
        return remaining;
      }

      return remaining;
    });
  };

  // Move product up or down in budget
  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      setItems((prev) => {
        const next = [...prev];
        const temp = next[index];
        next[index] = next[index - 1];
        next[index - 1] = temp;
        return next;
      });
    } else if (direction === 'down' && index < items.length - 1) {
      setItems((prev) => {
        const next = [...prev];
        const temp = next[index];
        next[index] = next[index + 1];
        next[index + 1] = temp;
        return next;
      });
    }
  };

  // Edit item quantity directly (sincroniza Piso Vinílico, Rodapé, Teto Vinílico e seus insumos vinculados)
  const handleItemQtdChange = (id: string, newQtdVal: string) => {
    setItems((prev) => {
      const targetItem = prev.find((it) => it.id === id);
      if (!targetItem) return prev;

      const itemCat = resolveCatalogProductByNameOrId(
        targetItem.catalogProductId || targetItem.descricao,
        dynamicCatalog
      );
      const itemGroupName = targetItem.groupName ?? itemCat?.groupName;
      const itemCalcRule =
        targetItem.calcRule ??
        itemCat?.groupCalcRule ??
        resolveProductCalcRule({
          productName: targetItem.descricao,
          categoryName: itemCat?.category,
          categoryId: itemCat?.categoryId,
          groupName: itemGroupName,
          groupId: targetItem.groupId ?? itemCat?.groupId,
        });

      if (
        isPisoVinilicoProduct(
          targetItem.descricao,
          itemCat?.category,
          itemCat?.categoryId,
          itemGroupName,
          itemCalcRule
        ) &&
        isSquareMeterUnit(targetItem.unidade)
      ) {
        ensurePisoLinkForExistingBudget({
          itemsList: prev,
          pisoItem: targetItem,
          pisoLinks: pisoInsumoLinksRef.current,
          removedGroups: removedPisoInsumoGroupsRef.current,
          catalogOverride: dynamicCatalog,
        });
        const existingLink = pisoInsumoLinksRef.current.get(id);
        const conv = applyPisoTableQuantityChange({
          item: targetItem,
          rawQtdVal: newQtdVal,
          existingLink,
        });

        if (existingLink) {
          existingLink.requestedSqm = conv.requestedSqm;
          existingLink.lastEffectiveSqm = conv.effectiveSqm;
        } else {
          pisoInsumoLinksRef.current.set(id, {
            hasInsumos: false,
            requestedSqm: conv.requestedSqm,
            lastEffectiveSqm: conv.effectiveSqm,
            skipCola: !isPisoVinilicoColado(
              targetItem.descricao,
              itemCat?.category,
              itemCat?.categoryId,
              itemGroupName,
              itemCalcRule
            ),
            includePrimerAntiumidade: false,
          });
        }

        const updated = prev.map((it) => (it.id === id ? conv.updatedItem : it));
        return pisoInsumoLinksRef.current.get(id)?.hasInsumos
          ? syncPisoInsumosInList(updated)
          : updated;
      }

      if (
        isRodapeProduct(
          targetItem.descricao,
          itemCat?.category,
          itemCat?.categoryId,
          itemGroupName,
          itemCalcRule
        )
      ) {
        ensureRodapeLinkForExistingBudget(prev, targetItem);
        const existingLink = rodapeInsumoLinksRef.current.get(id);
        const conv = applyRodapeTableQuantityChange({
          item: targetItem,
          rawQtdVal: newQtdVal,
          existingLink,
          barLengthMeters: targetItem.barLengthMeters ?? existingLink?.barLengthMeters,
          forceTreatAsMl: false,
          inputMode: 'barras',
        });
        if (existingLink) {
          existingLink.requestedMl = conv.requestedMl > 0 ? conv.requestedMl : undefined;
          existingLink.lastBarras = conv.bars;
          existingLink.barLengthMeters = conv.barLen;
        } else {
          rodapeInsumoLinksRef.current.set(id, {
            barLengthMeters: conv.barLen,
            requestedMl: conv.requestedMl > 0 ? conv.requestedMl : undefined,
            lastBarras: conv.bars,
            includeColar: false,
            includeCalafetar: false,
            calafetarProductId: '',
          });
        }
        const updated = prev.map((it) => (it.id === id ? conv.updatedItem : it));
        const activeLink = rodapeInsumoLinksRef.current.get(id);
        return activeLink && (activeLink.includeColar || activeLink.includeCalafetar)
          ? syncRodapeInsumosInList(updated, targetItem.descricao)
          : updated;
      }

      if (itemCalcRule === 'teto_vinilico' && isSquareMeterUnit(targetItem.unidade)) {
        const parsedTetoSqm = parsePtBrNumeric(newQtdVal);
        if (parsedTetoSqm > 0) {
          const tetoConv = calculateTetoVinilico(
            parsedTetoSqm,
            itemCat || { name: targetItem.descricao }
          );
          if (tetoConv.effectiveSqm > 0) {
            const newTotal =
              Math.round(tetoConv.effectiveSqm * targetItem.precoUnitario * 100) / 100;
            return prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    qtd: tetoConv.effectiveSqmDisplay,
                    subtitulo:
                      formatTetoDetail(tetoConv.compositionDetail, it.subtitulo) ||
                      it.subtitulo,
                    total: newTotal,
                  }
                : it
            );
          }
        }
      }

      // Edição manual direta de um insumo na tabela: respeita e trava aquele grupo contra sobrescritas
      const pisoInsumoGrp = classifyPisoInsumoGroup(
        targetItem.descricao,
        dynamicCatalog
      );
      if (pisoInsumoGrp) {
        lockedPisoInsumoGroupsRef.current.add(pisoInsumoGrp);
      }
      const rodapeInsumoGrp = classifyRodapeInsumoGroup(
        targetItem.descricao,
        targetItem.unidade,
        dynamicCatalog
      );
      if (rodapeInsumoGrp) {
        lockedRodapeInsumoGroupsRef.current.add(rodapeInsumoGrp);
      }

      const numQtd =
        parseFloat(newQtdVal.replace(/\./g, '').replace(',', '.')) || 0;
      const total = Math.round(numQtd * targetItem.precoUnitario * 100) / 100;
      return prev.map((item) =>
        item.id === id
          ? {
              ...item,
              qtd: newQtdVal,
              total,
            }
          : item
      );
    });
  };

  // Edit item unit price directly in the budget
  // Recalculates totals automatically; alteration is valid ONLY for this budget, without altering the catalog price
  const handleItemPrecoChange = (id: string, newPrecoStr: string) => {
    let numPreco = 0;
    const clean = newPrecoStr.replace('R$', '').trim();
    if (clean.includes(',')) {
      numPreco = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      numPreco = parseFloat(clean) || 0;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const numQtd =
          parseFloat(String(item.qtd).replace(/\./g, '').replace(',', '.')) || 0;
        const total = Math.round(numQtd * numPreco * 100) / 100;
        return {
          ...item,
          precoUnitario: numPreco,
          total,
        };
      })
    );
  };

  // =========================================================
  // 5. FRETE & DESCONTO & TOTAIS
  // =========================================================
  // O frete deve iniciar SEMPRE desativado/desmarcado para novos orçamentos, exceto se configurado no rascunho
  const [hasFreteEnabled, setHasFreteEnabled] = useState<boolean>(() => {
    if (initialOrcamento) {
      return Boolean(initialOrcamento.freteAtivo ?? (parsePriceToNumber(initialOrcamento.freteValor) > 0));
    }
    if (initialDraft?.hasFreteEnabled !== undefined) {
      return initialDraft.hasFreteEnabled;
    }
    return false;
  });
  const [freteValorInput, setFreteValorInput] = useState<string>(() => {
    if (initialOrcamento?.freteValor !== undefined) {
      return formatPriceToBrl(initialOrcamento.freteValor);
    }
    if (initialDraft?.freteValorInput !== undefined) {
      return initialDraft.freteValorInput;
    }
    return '0,00';
  });

  // Campos de endereço e CEP
  const [freteCep, setFreteCep] = useState<string>(() => {
    return initialOrcamento?.freteCep || initialDraft?.freteCep || '';
  });
  const [freteLogradouro, setFreteLogradouro] = useState<string>(() => {
    return initialOrcamento?.freteLogradouro || initialDraft?.freteLogradouro || '';
  });
  const [freteNumero, setFreteNumero] = useState<string>(() => {
    return initialOrcamento?.freteNumero || initialDraft?.freteNumero || '';
  });
  const [freteComplemento, setFreteComplemento] = useState<string>(() => {
    return initialOrcamento?.freteComplemento || initialDraft?.freteComplemento || '';
  });
  const [freteBairro, setFreteBairro] = useState<string>(() => {
    return initialOrcamento?.freteBairro || initialDraft?.freteBairro || '';
  });
  const [freteCidade, setFreteCidade] = useState<string>(() => {
    return initialOrcamento?.freteCidade || initialDraft?.freteCidade || '';
  });
  const [freteUf, setFreteUf] = useState<string>(() => {
    return initialOrcamento?.freteUf || initialDraft?.freteUf || '';
  });
  const [freteEndereco, setFreteEndereco] = useState<string>(() => {
    return initialOrcamento?.freteEndereco || initialDraft?.freteEndereco || '';
  });
  const [isSearchingCep, setIsSearchingCep] = useState<boolean>(false);

  // Atualiza a linha de endereço consolidada
  const updateComposedAddress = (
    logradouro: string,
    num: string,
    comp: string,
    bairro: string,
    cidade: string,
    uf: string,
    cep: string
  ) => {
    const parts: string[] = [];
    if (logradouro) {
      parts.push(num ? `${logradouro}, ${num}` : logradouro);
    }
    if (comp) parts.push(comp);
    if (bairro) parts.push(bairro);
    if (cidade && uf) parts.push(`${cidade} - ${uf}`);
    else if (cidade || uf) parts.push(cidade || uf);
    if (cep) parts.push(`CEP: ${cep}`);

    const full = parts.join(', ');
    setFreteEndereco(full);
    return full;
  };

  // Buscar CEP via ViaCEP e preencher automaticamente Logradouro, Bairro, Cidade e UF
  const handleSearchCep = async (cepValue?: string) => {
    const clean = (cepValue !== undefined ? cepValue : freteCep).replace(/\D/g, '');
    if (clean.length !== 8) {
      showToast('Digite um CEP completo com 8 dígitos.');
      return;
    }

    try {
      setIsSearchingCep(true);
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();

      if (data.erro) {
        showToast('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }

      const newLog = data.logradouro || '';
      const newBairro = data.bairro || '';
      const newCidade = data.localidade || '';
      const newUf = data.uf || '';
      const formattedCep = clean.replace(/^(\d{5})(\d{3})$/, '$1-$2');

      setFreteLogradouro(newLog);
      setFreteBairro(newBairro);
      setFreteCidade(newCidade);
      setFreteUf(newUf);

      updateComposedAddress(
        newLog,
        freteNumero,
        freteComplemento,
        newBairro,
        newCidade,
        newUf,
        formattedCep
      );

      showToast('Endereço preenchido com sucesso pelo CEP!');
      setTimeout(() => {
        document.getElementById('frete-numero-input')?.focus();
      }, 100);
    } catch (err) {
      console.warn('Erro ao buscar CEP:', err);
      showToast('Erro ao consultar CEP automaticamente. Digite o endereço.');
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleCepChange = (val: string) => {
    const numbersOnly = val.replace(/\D/g, '').slice(0, 8);
    let formatted = numbersOnly;
    if (numbersOnly.length > 5) {
      formatted = `${numbersOnly.slice(0, 5)}-${numbersOnly.slice(5)}`;
    }
    setFreteCep(formatted);
    updateComposedAddress(
      freteLogradouro,
      freteNumero,
      freteComplemento,
      freteBairro,
      freteCidade,
      freteUf,
      formatted
    );

    if (numbersOnly.length === 8) {
      handleSearchCep(numbersOnly);
    }
  };

  // Desconto (R$ ou %)
  const [descontoTipo, setDescontoTipo] = useState<'reais' | 'percent'>(() => {
    return initialDraft?.descontoTipo || 'reais';
  });
  const [descontoInput, setDescontoInput] = useState<string>(() => {
    if (initialOrcamento?.descontoValor !== undefined && initialOrcamento.descontoValor > 0) {
      return formatPriceToBrl(initialOrcamento.descontoValor);
    }
    if (initialDraft?.descontoInput !== undefined) {
      return initialDraft.descontoInput;
    }
    return '0,00';
  });
  const [descontoTexto, setDescontoTexto] = useState<string>(() => {
    return (
      initialOrcamento?.descontoTexto ||
      initialDraft?.descontoTexto ||
      'DESCONTO PARA PAGAMENTO VIA PIX'
    );
  });
  const [hasDescontoEnabled, setHasDescontoEnabled] = useState<boolean>(() => {
    if (initialOrcamento?.descontoValor !== undefined && initialOrcamento.descontoValor > 0) {
      return true;
    }
    if (initialDraft?.hasDescontoEnabled !== undefined) {
      return Boolean(initialDraft.hasDescontoEnabled);
    }
    return false;
  });

  // Sync initialOrcamento if changed
  useEffect(() => {
    if (initialOrcamento) {
      resetAllInsumoLinks();
      setEditingItemId(null);
      setItemPrecoDrafts({});
      setItemQtdDrafts({});
      setPendingPisoPrompt(null);
      setPendingRodapePrompt(null);
      setQuickPisoSqm('');
      setQuickRodapeMl('');
      setQuickRipadoSqm('');
      setQuickRipadoWidth('');
      setQuickRipadoHeight('');
      setQuickTetoSqm('');
      setQuickMantaSqm('');
      setQuickWizardOpen(false);
      setQuickWizardMeasurements(null);
      setQuickWizardSteps([]);
      setProductSubTab('rapido');

      if (initialOrcamento.clientId) {
        setSelectedClientId(initialOrcamento.clientId);
      }
      if (initialOrcamento.clientName) {
        setClientSearchQuery(initialOrcamento.clientName);
      }
      if (initialOrcamento.clientType) {
        setCustomClientType(initialOrcamento.clientType);
        const resolved = getPriceTierFromClientType(initialOrcamento.clientType);
        setPriceTable(resolved);
      }
      setItems(Array.isArray(initialOrcamento.items) ? initialOrcamento.items : []);
      setObservacoes(initialOrcamento.observacoes ?? '');
      setObservacoesRodape(initialOrcamento.observacoesRodape ?? '');
      setNomeOrcamento(initialOrcamento.nomeOrcamento ?? '');

      const hasFrete = Boolean(
        initialOrcamento.freteAtivo ?? (parsePriceToNumber(initialOrcamento.freteValor) > 0)
      );
      setHasFreteEnabled(hasFrete);
      setFreteValorInput(formatPriceToBrl(initialOrcamento.freteValor ?? 0));
      setFreteEndereco(initialOrcamento.freteEndereco ?? '');
      setFreteCep(initialOrcamento.freteCep ?? '');
      setFreteLogradouro(initialOrcamento.freteLogradouro ?? '');
      setFreteNumero(initialOrcamento.freteNumero ?? '');
      setFreteComplemento(initialOrcamento.freteComplemento ?? '');
      setFreteBairro(initialOrcamento.freteBairro ?? '');
      setFreteCidade(initialOrcamento.freteCidade ?? '');
      setFreteUf(initialOrcamento.freteUf ?? '');

      const descontoNum = parsePriceToNumber(initialOrcamento.descontoValor);
      setHasDescontoEnabled(descontoNum > 0);
      setDescontoTipo('reais');
      setDescontoInput(formatPriceToBrl(descontoNum));
      setDescontoTexto(initialOrcamento.descontoTexto || 'DESCONTO PARA PAGAMENTO VIA PIX');

      setLimpaPisoEnabled(
        Boolean(
          initialOrcamento.limpaPisoAtivo ??
            initialOrcamento.items?.some((it) => it.autoTag === 'toggle_limpa_piso')
        )
      );
      setAreaTerreaEnabled(
        Boolean(
          initialOrcamento.areaTerreaAtiva ??
            initialOrcamento.items?.some((it) => it.autoTag === 'toggle_area_terrea')
        )
      );
      setAreaTerreaSqm(initialOrcamento.areaTerreaSqm || '');
      setExibirQuantidade(initialOrcamento.exibirQuantidade !== false);
    }
  }, [initialOrcamento]);

  // Ref para sempre ter a versão mais recente dos dados do orçamento ao desmontar (navegação entre abas)
  const draftStateRef = useRef({
    selectedClientId,
    customClientType,
    priceTable,
    nomeOrcamento,
    observacoes,
    observacoesRodape,
    items,
    limpaPisoEnabled,
    areaTerreaEnabled,
    areaTerreaSqm,
    hasFreteEnabled,
    freteValorInput,
    freteCep,
    freteLogradouro,
    freteNumero,
    freteComplemento,
    freteBairro,
    freteCidade,
    freteUf,
    freteEndereco,
    descontoTipo,
    descontoInput,
    descontoTexto,
    hasDescontoEnabled,
    exibirQuantidade,
  });

  draftStateRef.current = {
    selectedClientId,
    customClientType,
    priceTable,
    nomeOrcamento,
    observacoes,
    observacoesRodape,
    items,
    limpaPisoEnabled,
    areaTerreaEnabled,
    areaTerreaSqm,
    hasFreteEnabled,
    freteValorInput,
    freteCep,
    freteLogradouro,
    freteNumero,
    freteComplemento,
    freteBairro,
    freteCidade,
    freteUf,
    freteEndereco,
    descontoTipo,
    descontoInput,
    descontoTexto,
    hasDescontoEnabled,
    exibirQuantidade,
  };

  // Salvar rascunho em andamento automaticamente a cada alteração (sem criar no Supabase ou duplicar)
  useEffect(() => {
    if (initialOrcamento || hasSavedSuccessfullyRef.current) return;

    const hasData =
      items.length > 0 ||
      limpaPisoEnabled ||
      areaTerreaEnabled ||
      Boolean(nomeOrcamento && nomeOrcamento.trim()) ||
      Boolean(observacoes && observacoes.trim()) ||
      Boolean(selectedClientId) ||
      hasFreteEnabled ||
      hasDescontoEnabled ||
      !exibirQuantidade;

    if (!hasData) {
      return;
    }

    try {
      const draftPayload = {
        selectedClientId,
        customClientType,
        priceTable,
        nomeOrcamento,
        observacoes,
        observacoesRodape,
        items,
        limpaPisoEnabled,
        areaTerreaEnabled,
        areaTerreaSqm,
        hasFreteEnabled,
        freteValorInput,
        freteCep,
        freteLogradouro,
        freteNumero,
        freteComplemento,
        freteBairro,
        freteCidade,
        freteUf,
        freteEndereco,
        descontoTipo,
        descontoInput,
        descontoTexto,
        hasDescontoEnabled,
        exibirQuantidade,
        pisoLinks: Object.fromEntries(pisoInsumoLinksRef.current.entries()),
        rodapeLinks: Object.fromEntries(rodapeInsumoLinksRef.current.entries()),
        lockedPisoGroups: Array.from(lockedPisoInsumoGroupsRef.current),
        removedPisoGroups: Array.from(removedPisoInsumoGroupsRef.current),
        lockedRodapeGroups: Array.from(lockedRodapeInsumoGroupsRef.current),
        removedRodapeGroups: Array.from(removedRodapeInsumoGroupsRef.current),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(draftPayload));
      localStorage.setItem('fenix_orcamento_in_progress_draft', JSON.stringify(draftPayload));
    } catch {
      // ignore
    }
  }, [
    initialOrcamento,
    ACTIVE_DRAFT_KEY,
    selectedClientId,
    customClientType,
    priceTable,
    nomeOrcamento,
    observacoes,
    observacoesRodape,
    items,
    limpaPisoEnabled,
    areaTerreaEnabled,
    areaTerreaSqm,
    hasFreteEnabled,
    freteValorInput,
    freteCep,
    freteLogradouro,
    freteNumero,
    freteComplemento,
    freteBairro,
    freteCidade,
    freteUf,
    freteEndereco,
    descontoTipo,
    descontoInput,
    descontoTexto,
    hasDescontoEnabled,
    exibirQuantidade,
  ]);

  // Garantir persistência ao desmontar (ex: usuário clica em Pós-Vendas, Clientes ou outra aba)
  useEffect(() => {
    return () => {
      if (initialOrcamento || hasSavedSuccessfullyRef.current) return;
      const cur = draftStateRef.current;
      const hasData =
        cur.items.length > 0 ||
        Boolean(cur.nomeOrcamento && cur.nomeOrcamento.trim()) ||
        Boolean(cur.observacoes && cur.observacoes.trim()) ||
        Boolean(cur.selectedClientId) ||
        cur.hasFreteEnabled ||
        cur.hasDescontoEnabled ||
        !cur.exibirQuantidade;

      if (hasData) {
        try {
          const draftPayload = {
            ...cur,
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(draftPayload));
          localStorage.setItem('fenix_orcamento_in_progress_draft', JSON.stringify(draftPayload));
        } catch {
          // ignore
        }
      }
    };
  }, [initialOrcamento, ACTIVE_DRAFT_KEY]);

  // Garantir persistência se fechar ou atualizar o navegador
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (initialOrcamento || hasSavedSuccessfullyRef.current) return;
      const cur = draftStateRef.current;
      const hasData =
        cur.items.length > 0 ||
        Boolean(cur.nomeOrcamento && cur.nomeOrcamento.trim()) ||
        Boolean(cur.observacoes && cur.observacoes.trim()) ||
        Boolean(cur.selectedClientId) ||
        cur.hasFreteEnabled ||
        cur.hasDescontoEnabled ||
        !cur.exibirQuantidade;

      if (hasData) {
        try {
          const draftPayload = {
            ...cur,
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify(draftPayload));
          localStorage.setItem('fenix_orcamento_in_progress_draft', JSON.stringify(draftPayload));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [initialOrcamento, ACTIVE_DRAFT_KEY]);

  // Identifica com exatidão se existe um orçamento em andamento que possa ser interrompido
  const isBudgetInProgress = useMemo(() => {
    if (initialOrcamento) {
      return true;
    }
    const hasItems = items.length > 0;
    const hasNome = Boolean(nomeOrcamento && nomeOrcamento.trim().length > 0);
    const hasClient = Boolean(selectedClientId || (clientSearchQuery && clientSearchQuery.trim().length > 0));
    const hasObs = Boolean(
      (observacoes && observacoes.trim().length > 0) ||
      (observacoesRodape && observacoesRodape.trim().length > 0)
    );
    const hasFrete = Boolean(
      hasFreteEnabled &&
      (freteValorInput !== '0,00' || (freteEndereco && freteEndereco.trim().length > 0))
    );
    const hasDesconto = Boolean(
      hasDescontoEnabled &&
      descontoInput &&
      descontoInput !== '0,00' &&
      descontoInput !== ''
    );

    return hasItems || hasNome || hasClient || hasObs || hasFrete || hasDesconto;
  }, [
    initialOrcamento,
    items.length,
    nomeOrcamento,
    selectedClientId,
    clientSearchQuery,
    observacoes,
    observacoesRodape,
    hasFreteEnabled,
    freteValorInput,
    freteEndereco,
    hasDescontoEnabled,
    descontoInput,
  ]);

  // Notifica o componente pai sobre a existência de orçamento em andamento
  useEffect(() => {
    onStatusChangeInProgress?.(isBudgetInProgress);
    return () => {
      onStatusChangeInProgress?.(false);
    };
  }, [isBudgetInProgress, onStatusChangeInProgress]);

  // Função para descartar o rascunho e recomeçar do zero caso desejado
  const handleDiscardDraft = () => {
    if (window.confirm('Tem certeza de que deseja descartar este rascunho em andamento e começar um novo orçamento do zero?')) {
      try {
        localStorage.removeItem(ACTIVE_DRAFT_KEY);
        localStorage.removeItem('fenix_orcamento_in_progress_draft');
      } catch {}
      resetAllInsumoLinks();
      setItems([]);
      setLimpaPisoEnabled(false);
      setAreaTerreaEnabled(false);
      setAreaTerreaSqm('');
      setNomeOrcamento('');
      setObservacoes('');
      setObservacoesRodape('');
      setHasFreteEnabled(false);
      setFreteValorInput('0,00');
      setFreteCep('');
      setFreteLogradouro('');
      setFreteNumero('');
      setFreteComplemento('');
      setFreteBairro('');
      setFreteCidade('');
      setFreteUf('');
      setFreteEndereco('');
      setDescontoInput('0,00');
      setDescontoTexto('DESCONTO PARA PAGAMENTO VIA PIX');
      setHasDescontoEnabled(false);
      setExibirQuantidade(true);
      persistedOrcIdRef.current = null;
      showToast('Rascunho descartado. Orçamento limpo para novo preenchimento.');
    }
  };

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((acc, curr) => acc + curr.total, 0);
  }, [items]);

  const freteValor = useMemo(() => {
    if (!hasFreteEnabled) return 0;
    return (
      parseFloat(freteValorInput.replace(/\./g, '').replace(',', '.')) || 0
    );
  }, [hasFreteEnabled, freteValorInput]);

  const descontoValor = useMemo(() => {
    if (!hasDescontoEnabled) return 0;
    const rawVal =
      parseFloat(descontoInput.replace(/\./g, '').replace(',', '.')) || 0;
    if (descontoTipo === 'percent') {
      return Math.round(((subtotal * rawVal) / 100) * 100) / 100;
    }
    return rawVal;
  }, [hasDescontoEnabled, subtotal, descontoInput, descontoTipo]);

  // Total Final = Subtotal - Desconto + Frete
  const totalFinal = useMemo(() => {
    const val = subtotal - descontoValor + freteValor;
    return Math.max(0, Math.round(val * 100) / 100);
  }, [subtotal, descontoValor, freteValor]);

  // =========================================================
  // 7. AÇÕES FINAIS, SALVAMENTO AUTOMÁTICO E DUPLICAÇÃO
  // =========================================================
  type OrcamentoActionType = 'pdf' | 'image' | 'image_jpg' | 'print' | 'copy_image' | 'whatsapp' | 'save';

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [imageCopiedBadge, setImageCopiedBadge] = useState(false);
  const copiedBadgeTimerRef = useRef<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeActionType, setActiveActionType] = useState<OrcamentoActionType | null>(null);
  const isSavingRef = useRef(false);
  const actionLockRef = useRef(false);
  const hasSavedSuccessfullyRef = useRef(false);
  const persistedOrcIdRef = useRef<string | null>(initialOrcamento?.id || null);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastConfirmedOrcamentoRef = useRef<SavedOrcamento | null>(null);
  const pendingImageDownloadAfterDecisionRef = useRef<boolean>(false);
  const preparedImageCaptureRef = useRef<{
    fingerprint: string;
    themeKey: string;
    promise: Promise<Blob>;
  } | null>(null);

  // Tema visual local do Espelho Oficial (não altera o tema global do sistema nem duplica registros)
  const [localEspelhoThemeId, setLocalEspelhoThemeId] = useState<FenixThemeId | null>(null);
  const [localEspelhoVariant, setLocalEspelhoVariant] = useState<BudgetThemeVariant | null>(null);
  const activeBudgetThemeSnapshot = useFenixTheme('orcamento');
  const effectiveEspelhoThemeId: FenixThemeId =
    localEspelhoThemeId ?? activeBudgetThemeSnapshot.theme.id;
  const effectiveEspelhoVariant: BudgetThemeVariant = supportsDecoratedVariant(
    effectiveEspelhoThemeId
  )
    ? localEspelhoVariant ?? 'classico'
    : 'classico';

  // Janela de Decisão após salvamento confirmado e execução da ação
  const [postSaveDecisionOrcamento, setPostSaveDecisionOrcamento] = useState<SavedOrcamento | null>(null);
  const [postSaveTriggerAction, setPostSaveTriggerAction] = useState<OrcamentoActionType | null>(null);
  const [decisionBudgetName, setDecisionBudgetName] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isPreparingDuplicate, setIsPreparingDuplicate] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const finalizingLockRef = useRef(false);
  const decisionBudgetInputRef = useRef<HTMLInputElement>(null);

  // Janela de Nomeação para Duplicação de Orçamento
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateBudgetName, setDuplicateBudgetName] = useState('Orçamento de Materiais');
  const [duplicateNameError, setDuplicateNameError] = useState('');
  const [isCreatingDuplicate, setIsCreatingDuplicate] = useState(false);
  const creatingDuplicateLockRef = useRef(false);

  useEffect(() => {
    hasSavedSuccessfullyRef.current = false;
    lastSavedFingerprintRef.current = null;
    lastConfirmedOrcamentoRef.current = null;
    pendingImageDownloadAfterDecisionRef.current = false;
    preparedImageCaptureRef.current = null;
    setLocalEspelhoThemeId(null);
    setLocalEspelhoVariant(null);
    if (initialOrcamento?.id) {
      persistedOrcIdRef.current = initialOrcamento.id;
    } else {
      persistedOrcIdRef.current = null;
    }
  }, [initialOrcamento]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (copiedBadgeTimerRef.current) window.clearTimeout(copiedBadgeTimerRef.current);
    };
  }, []);

  const getCurrentBudgetFingerprint = () =>
    JSON.stringify({
      clientId: currentClient?.id || initialOrcamento?.clientId || 'cli_geral',
      clientName,
      clientType,
      clientContact,
      nomeOrcamento,
      consultoraName,
      dataOrcamento,
      observacoes,
      observacoesRodape,
      items,
      hasFreteEnabled,
      freteValor,
      freteEndereco,
      hasDescontoEnabled,
      descontoValor,
      descontoTexto,
      totalFinal,
      exibirQuantidade,
    });

  const showToast = (msg: string, durationMs = 4000) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  };

  const resolveClientAddressString = (cli?: ClientRecord | null, fallbackOrc?: SavedOrcamento | null): string => {
    if (cli) {
      if (cli.address && cli.address.trim()) return cli.address.trim();
      const parts = [
        cli.street,
        cli.number,
        cli.neighborhood,
        cli.city && cli.state ? `${cli.city} - ${cli.state}` : cli.city || cli.state,
      ].filter((p) => Boolean(p && String(p).trim()));
      if (parts.length > 0) return parts.join(', ');
    }
    return fallbackOrc?.clientAddress || '';
  };

  // Validação obrigatória antes de salvar automaticamente no Supabase
  const validateOrcamentoBeforeSave = (actionType: OrcamentoActionType): { valid: boolean; error?: string } => {
    if (!clientName || !clientName.trim()) {
      return {
        valid: false,
        error: 'Selecione ou informe o cliente antes de salvar ou gerar o orçamento.',
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        valid: false,
        error: 'Adicione pelo menos um produto ao orçamento antes de salvar ou exportar.',
      };
    }

    const hasInvalidItem = items.some(
      (it) =>
        !it.descricao ||
        !it.descricao.trim() ||
        Number.isNaN(Number(it.total)) ||
        Number(it.total) < 0
    );
    if (hasInvalidItem) {
      return {
        valid: false,
        error: 'Verifique os produtos do orçamento: há item sem descrição ou com valor inválido.',
      };
    }

    if (hasFreteEnabled && (Number.isNaN(freteValor) || freteValor < 0)) {
      return {
        valid: false,
        error: 'Informe um valor de frete válido.',
      };
    }

    if (hasDescontoEnabled && (Number.isNaN(descontoValor) || descontoValor < 0)) {
      return {
        valid: false,
        error: 'Informe um valor de desconto válido.',
      };
    }

    if (actionType === 'pdf' || actionType === 'image' || actionType === 'image_jpg' || actionType === 'copy_image') {
      const element = document.getElementById('espelho-oficial-orcamento');
      if (!element) {
        return {
          valid: false,
          error: 'Espelho oficial do orçamento não encontrado na tela.',
        };
      }
    }

    return { valid: true };
  };

  // Salvar Orçamento no Supabase e confirmar gravação real antes de prosseguir
  const persistOrcamentoToDatabase = async (
    silent = false,
    options?: {
      forcedOrcId?: string;
      fallbackSavedAt?: string;
      fallbackNomeOrcamento?: string;
      overrideNomeOrcamento?: string;
      skipActivityLog?: boolean;
    }
  ): Promise<{ success: boolean; data?: SavedOrcamento; error?: string }> => {
    // Reutiliza o mesmo ID enquanto estiver no mesmo orçamento para impedir duplicação acidental
    const orcId =
      options?.forcedOrcId ||
      initialOrcamento?.id ||
      persistedOrcIdRef.current ||
      `orc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    persistedOrcIdRef.current = orcId;
    const now = new Date();

    const rawNomeCandidate =
      options?.overrideNomeOrcamento !== undefined
        ? options.overrideNomeOrcamento
        : nomeOrcamento;

    const finalNomeOrcamento =
      rawNomeCandidate.trim() ||
      options?.fallbackNomeOrcamento?.trim() ||
      'Orçamento de Materiais';

    const resolvedConsultora =
      initialOrcamento?.consultoraName ||
      (initialOrcamento as any)?.responsavel ||
      currentUserName ||
      consultoraName;
    const sellerId =
      initialOrcamento?.vendedorId ||
      getSellerIdForUser(resolvedConsultora) ||
      getSellerIdForUser(currentUserName);

    const resolvedClientAddress = resolveClientAddressString(currentClient, initialOrcamento);

    const orcamentoData: SavedOrcamento = {
      id: orcId,
      clientId: currentClient?.id || initialOrcamento?.clientId || 'cli_geral',
      clientName: clientName || initialOrcamento?.clientName || '',
      clientType: clientType || initialOrcamento?.clientType,
      clientContact:
        clientContact ||
        initialOrcamento?.clientContact ||
        currentClient?.phone ||
        currentClient?.whatsapp ||
        (currentClient as any)?.celular ||
        '',
      clientDocument: currentClient?.document || initialOrcamento?.clientDocument || undefined,
      clientAddress: resolvedClientAddress || undefined,
      clientEmail: currentClient?.email || initialOrcamento?.clientEmail || undefined,
      nomeOrcamento: finalNomeOrcamento,
      consultoraName: resolvedConsultora,
      registeredBy: initialOrcamento?.registeredBy || currentUserName || consultoraName,
      vendedorId: sellerId,
      dataOrcamento,
      observacoes,
      observacoesRodape,
      items,
      limpaPisoAtivo: limpaPisoEnabled,
      areaTerreaAtiva: areaTerreaEnabled,
      areaTerreaSqm: areaTerreaEnabled ? areaTerreaSqm : '',
      freteAtivo: hasFreteEnabled,
      freteValor: hasFreteEnabled ? freteValor : 0,
      freteEndereco: hasFreteEnabled ? freteEndereco : '',
      freteCep: hasFreteEnabled ? freteCep : '',
      freteLogradouro: hasFreteEnabled ? freteLogradouro : '',
      freteNumero: hasFreteEnabled ? freteNumero : '',
      freteComplemento: hasFreteEnabled ? freteComplemento : '',
      freteBairro: hasFreteEnabled ? freteBairro : '',
      freteCidade: hasFreteEnabled ? freteCidade : '',
      freteUf: hasFreteEnabled ? freteUf : '',
      descontoValor,
      descontoTexto:
        hasDescontoEnabled && descontoValor > 0
          ? descontoTexto || 'DESCONTO PARA PAGAMENTO VIA PIX'
          : undefined,
      totalFinal,
      exibirQuantidade,
      status: initialOrcamento?.status || 'Orçamento Enviado',
      savedAt: initialOrcamento?.savedAt || options?.fallbackSavedAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const actorName = currentUserName || consultoraName;

    if (silent) {
      try {
        const historyList = getLocalCollectionSafe<SavedOrcamento>('fenix_orcamentos_history', []);
        const nextHistory = historyList.some((o) => o.id === orcId)
          ? historyList.map((o) => (o.id === orcId ? orcamentoData : o))
          : [orcamentoData, ...historyList];
        setLocalCollectionSafe('fenix_orcamentos_history', nextHistory);

        const savedList = getLocalCollectionSafe<SavedOrcamento>('fenix_saved_orcamentos', []);
        const nextSaved = savedList.some((o) => o.id === orcId)
          ? savedList.map((o) => (o.id === orcId ? orcamentoData : o))
          : [orcamentoData, ...savedList];
        setLocalCollectionSafe('fenix_saved_orcamentos', nextSaved);
        localStorage.removeItem(ACTIVE_DRAFT_KEY);
        localStorage.removeItem('fenix_orcamento_in_progress_draft');
      } catch {}
      window.dispatchEvent(new Event('fenix_orcamentos_updated'));
      saveItemToSupabase('fenix_orcamentos_history', orcamentoData, 'id', actorName).catch((e) =>
        console.warn('Erro ao salvar histórico do orçamento:', e)
      );
      saveItemToSupabase('fenix_saved_orcamentos', orcamentoData, 'id', actorName).catch((e) =>
        console.warn('Erro ao salvar espelho de orçamentos:', e)
      );
      syncSingleOrcamentoToFollowUp(orcamentoData, {
        currentUser: actorName,
        isEdit: Boolean(initialOrcamento),
      }).catch((e) => console.warn('Erro ao sincronizar orçamento com Follow-up:', e));
      return { success: true, data: orcamentoData };
    }

    try {
      // 1. Aguarda confirmação real da gravação oficial no Supabase antes de qualquer ação ou modal
      const resHistory = await saveItemToSupabase(
        'fenix_orcamentos_history',
        orcamentoData,
        'id',
        actorName
      );
      if (!resHistory.success) {
        return {
          success: false,
          error:
            resHistory.error ||
            'Não foi possível salvar o orçamento no Supabase. Os dados preenchidos foram preservados na tela.',
        };
      }

      hasSavedSuccessfullyRef.current = true;
      const confirmedData = (resHistory.data as SavedOrcamento) || orcamentoData;
      lastConfirmedOrcamentoRef.current = confirmedData;

      // 2. Atualiza espelho local/eventos e limpa rascunho somente após confirmação do Supabase
      try {
        const historyList = getLocalCollectionSafe<SavedOrcamento>('fenix_orcamentos_history', []);
        const nextHistory = historyList.some((o) => o.id === orcId)
          ? historyList.map((o) => (o.id === orcId ? confirmedData : o))
          : [confirmedData, ...historyList];
        setLocalCollectionSafe('fenix_orcamentos_history', nextHistory);

        const savedList = getLocalCollectionSafe<SavedOrcamento>('fenix_saved_orcamentos', []);
        const nextSaved = savedList.some((o) => o.id === orcId)
          ? savedList.map((o) => (o.id === orcId ? confirmedData : o))
          : [confirmedData, ...savedList];
        setLocalCollectionSafe('fenix_saved_orcamentos', nextSaved);
        localStorage.removeItem(ACTIVE_DRAFT_KEY);
        localStorage.removeItem('fenix_orcamento_in_progress_draft');
      } catch {}

      window.dispatchEvent(new Event('fenix_orcamentos_updated'));

      // 3. Atualização imediata do Follow-up local e espelhamento secundário em segundo plano (sem bloquear a UI)
      try {
        await syncSingleOrcamentoToFollowUp(confirmedData, {
          currentUser: actorName,
          isEdit: Boolean(initialOrcamento || options?.forcedOrcId),
          skipSupabaseSave: true,
          skipRemoteFetch: true,
        });
      } catch (fupErr) {
        console.warn('Erro ao sincronizar orçamento localmente com Follow-up:', fupErr);
      }

      if (currentClient?.id && !options?.skipActivityLog) {
        addClientActivity({
          clientId: currentClient.id,
          type: initialOrcamento || options?.forcedOrcId ? 'orcamento_atualizado' : 'orcamento_criado',
          title: initialOrcamento || options?.forcedOrcId ? 'Orçamento atualizado' : 'Orçamento gerado e salvo',
          description: `Orçamento "${finalNomeOrcamento}" (${items.length} itens) no valor de R$ ${totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} salvo no CRM.`,
          date: now.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
          relevantInfo: `Consultora: ${consultoraName} | Total: R$ ${totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        });
      }

      saveItemToSupabase('fenix_saved_orcamentos', confirmedData, 'id', actorName).catch((e) =>
        console.warn('Erro ao espelhar fenix_saved_orcamentos:', e)
      );
      syncSingleOrcamentoToFollowUp(confirmedData, {
        currentUser: actorName,
        isEdit: Boolean(initialOrcamento || options?.forcedOrcId),
      }).catch((e) => console.warn('Erro ao sincronizar Follow-up em segundo plano:', e));

      return { success: true, data: confirmedData };
    } catch (err: any) {
      console.warn('Erro na persistência do orçamento:', err);
      return {
        success: false,
        error:
          err?.message ||
          'Não foi possível salvar no Supabase. Verifique sua conexão e tente novamente.',
      };
    }
  };

  const getExportVisualKey = () =>
    `${effectiveEspelhoThemeId}:${effectiveEspelhoVariant}:${exibirQuantidade}`;

  const prepareEspelhoImageCapture = () => {
    const element = document.getElementById('espelho-oficial-orcamento');
    if (!element) return;
    const fingerprint = getCurrentBudgetFingerprint();
    const themeKey = getExportVisualKey();
    const current = preparedImageCaptureRef.current;
    if (current && current.fingerprint === fingerprint && current.themeKey === themeKey) {
      return;
    }
    const capturePromise = captureEspelhoToBlob(element, { skipSettlementDelay: true }).then(
      (res) => res.blob
    );
    capturePromise.catch(() => {
      if (preparedImageCaptureRef.current?.promise === capturePromise) {
        preparedImageCaptureRef.current = null;
      }
    });
    preparedImageCaptureRef.current = {
      fingerprint,
      themeKey,
      promise: capturePromise,
    };
  };

  // Ação 1: Baixar Orçamento como PDF Oficial
  const runPdfExportAction = async (): Promise<boolean> => {
    const element = document.getElementById('espelho-oficial-orcamento');
    if (!element) {
      showToast('Espelho do orçamento não encontrado na tela.');
      return false;
    }

    try {
      const filename = getOrcamentoExportFileName(clientName, dataOrcamento, 'pdf');
      await exportEspelhoToPdf(element, filename);
      showToast('✓ PDF oficial baixado com sucesso!');
      return true;
    } catch (err) {
      console.error('Erro na exportação de PDF:', err);
      showToast('Não foi possível exportar o PDF. Você pode utilizar a opção Imprimir.');
      return true;
    }
  };

  // Ação 2: Baixar como Imagem (PNG ou JPG) em Alta Resolução
  const runImageDownloadAction = async (format: 'png' | 'jpg' = 'png'): Promise<boolean> => {
    const element = document.getElementById('espelho-oficial-orcamento');
    if (!element) {
      showToast('Espelho do orçamento não encontrado na tela.');
      return false;
    }

    try {
      const filename = getOrcamentoExportFileName(clientName, dataOrcamento, format);
      let preCapturedBlob: Blob | null = null;
      const prepared = preparedImageCaptureRef.current;
      if (
        prepared &&
        prepared.fingerprint === getCurrentBudgetFingerprint() &&
        prepared.themeKey === getExportVisualKey()
      ) {
        try {
          preCapturedBlob = await prepared.promise;
        } catch {
          preCapturedBlob = null;
        }
      }
      preparedImageCaptureRef.current = null;

      await exportEspelhoToImage(element, filename, format, preCapturedBlob);
      showToast(`✓ Imagem ${format.toUpperCase()} baixada com sucesso!`);
      return true;
    } catch (err) {
      console.error('Erro ao baixar imagem:', err);
      showToast('Não foi possível gerar a imagem diretamente.');
      return true;
    }
  };

  // Ação 3: Copiar Imagem do Espelho Oficial
  const runCopyImageAction = async (): Promise<boolean> => {
    const element = document.getElementById('espelho-oficial-orcamento');
    if (!element) {
      showToast('Espelho do orçamento não encontrado na tela.');
      return false;
    }

    try {
      const copied = await copyEspelhoImageToClipboard(element);
      if (copied) {
        showToast('✓ Imagem copiada! Cole no WhatsApp (Ctrl+V).');
      } else {
        showToast('✓ Utilize "Baixar Imagem" para salvar o arquivo.');
      }
      return true;
    } catch (err) {
      console.warn('Falha ao copiar imagem:', err);
      showToast('Dica: Utilize "Baixar Imagem" para salvar o arquivo.');
      return true;
    }
  };

  // Ação 4: Enviar pelo WhatsApp (sem numeração visível)
  const runWhatsAppAction = (): boolean => {
    const phoneDigits = clientContact.replace(/\D/g, '');
    const template = getWhatsAppMessageTemplate('Envio de Orçamento');
    const message = formatOrcamentoMessage(template, {
      clientName,
      totalFinal,
      consultoraName,
      items: items.map((i) => ({
        qtd: i.qtd,
        unidade: i.unidade,
        descricao: i.descricao,
        total: i.total,
      })),
      freteAtivo: hasFreteEnabled,
      freteValor,
      freteEndereco,
      descontoValor: hasDescontoEnabled ? descontoValor : 0,
      descontoTexto: hasDescontoEnabled
        ? descontoTexto || 'DESCONTO PARA PAGAMENTO VIA PIX'
        : undefined,
      numeroOrcamento: nomeOrcamento.trim() || '',
      exibirQuantidade,
    });

    const encoded = encodeURIComponent(message);
    const targetUrl =
      phoneDigits.length >= 10
        ? `https://wa.me/55${phoneDigits}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;

    const link = document.createElement('a');
    link.href = targetUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ Mensagem preparada para envio pelo WhatsApp!');
    return true;
  };

  // Orquestrador único:
  // - Para BAIXAR IMAGEM: Valida -> Salva no Supabase -> Abre Janela de Decisão (duplicar ou manter) -> Gera e baixa a imagem.
  // - Para demais ações: Valida -> Salva no Supabase (quando necessário) -> Executa Ação -> Abre Janela de Decisão na 1ª gravação.
  const executeSaveAndAction = async (actionType: OrcamentoActionType) => {
    if (actionLockRef.current || isSavingRef.current || isSaving || isExporting) {
      return;
    }

    const validation = validateOrcamentoBeforeSave(actionType);
    if (!validation.valid) {
      showToast(validation.error || 'Preencha os dados obrigatórios do orçamento.');
      return;
    }

    const isImageAction = actionType === 'image' || actionType === 'image_jpg';
    if (isImageAction || actionType === 'pdf' || actionType === 'copy_image') {
      warmEspelhoFontCache();
    }

    const currentFingerprint = getCurrentBudgetFingerprint();
    const canExportDirectlyWithoutReSaving =
      actionType !== 'save' &&
      hasSavedSuccessfullyRef.current &&
      Boolean(persistedOrcIdRef.current) &&
      lastSavedFingerprintRef.current === currentFingerprint;

    actionLockRef.current = true;
    isSavingRef.current = true;
    setActiveActionType(actionType);
    if (!canExportDirectlyWithoutReSaving) {
      setIsSaving(true);
    }
    if (actionType === 'pdf' || actionType === 'copy_image') {
      setIsExporting(true);
    }

    try {
      let confirmedOrcamento: SavedOrcamento | null = null;

      if (!canExportDirectlyWithoutReSaving || (isImageAction && !lastConfirmedOrcamentoRef.current)) {
        const saveRes = await persistOrcamentoToDatabase(false);
        if (!saveRes.success || !saveRes.data) {
          showToast(
            saveRes.error ||
              'Não foi possível salvar no banco de dados. Verifique sua conexão e tente novamente.'
          );
          return;
        }
        confirmedOrcamento = saveRes.data;
        lastSavedFingerprintRef.current = currentFingerprint;
      } else if (isImageAction) {
        confirmedOrcamento = lastConfirmedOrcamentoRef.current;
      }

      if (isImageAction) {
        if (!confirmedOrcamento) return;
        pendingImageDownloadAfterDecisionRef.current = true;
        // Pré-renderiza o espelho em paralelo enquanto o usuário visualiza a confirmação de duplicação
        prepareEspelhoImageCapture();
        const initialModalNome =
          confirmedOrcamento.nomeOrcamento?.trim() ||
          nomeOrcamento.trim() ||
          'Orçamento de Materiais';
        setDecisionBudgetName(initialModalNome);
        setFinalizeError(null);
        setPostSaveTriggerAction(actionType);
        setPostSaveDecisionOrcamento(confirmedOrcamento);
        return;
      }

      let actionOk = true;

      if (actionType === 'pdf') {
        actionOk = await runPdfExportAction();
      } else if (actionType === 'print') {
        window.print();
        actionOk = true;
      } else if (actionType === 'copy_image') {
        actionOk = await runCopyImageAction();
      } else if (actionType === 'whatsapp') {
        actionOk = runWhatsAppAction();
      } else if (actionType === 'save') {
        showToast('✓ Orçamento salvo com sucesso!');
        actionOk = true;
      }

      if (!actionOk || canExportDirectlyWithoutReSaving || !confirmedOrcamento) return;

      // Abre a Janela de Decisão somente após confirmação do Supabase e conclusão da ação
      const initialModalNome =
        confirmedOrcamento.nomeOrcamento?.trim() ||
        nomeOrcamento.trim() ||
        'Orçamento de Materiais';
      setDecisionBudgetName(initialModalNome);
      setFinalizeError(null);
      setPostSaveTriggerAction(actionType);
      if (actionType === 'print') {
        window.setTimeout(() => {
          setPostSaveDecisionOrcamento(confirmedOrcamento);
        }, 180);
      } else {
        setPostSaveDecisionOrcamento(confirmedOrcamento);
      }
    } catch (err: any) {
      showToast(
        err?.message || 'Não foi possível concluir a operação. Verifique sua conexão e tente novamente.'
      );
    } finally {
      actionLockRef.current = false;
      isSavingRef.current = false;
      setActiveActionType(null);
      setIsSaving(false);
      setIsExporting(false);
    }
  };

  const handleSaveOrcamento = () => executeSaveAndAction('save');
  const handlePrintPdf = () => executeSaveAndAction('print');
  const handleDownloadPdf = () => executeSaveAndAction('pdf');
  const handleDownloadImage = () => executeSaveAndAction('image');
  const handleCopyImageFromEditor = async () => {
    if (isExporting || actionLockRef.current) return;
    const element = document.getElementById('espelho-oficial-orcamento');
    if (!element) {
      showToast('Espelho oficial do orçamento não encontrado na tela.', 2500);
      return;
    }

    try {
      setIsExporting(true);
      setActiveActionType('copy_image');
      warmEspelhoFontCache(element);
      const copied = await copyEspelhoImageToClipboard(element);
      if (copied) {
        if (copiedBadgeTimerRef.current) window.clearTimeout(copiedBadgeTimerRef.current);
        setImageCopiedBadge(true);
        copiedBadgeTimerRef.current = window.setTimeout(() => {
          setImageCopiedBadge(false);
          copiedBadgeTimerRef.current = null;
        }, 2200);
        showToast('✓ Imagem copiada! Cole no WhatsApp (Ctrl+V).', 2500);
      } else {
        showToast('Não foi possível acessar a área de transferência.', 2800);
      }
    } catch (err) {
      console.warn('Falha ao copiar imagem:', err);
      showToast('Não foi possível copiar a imagem diretamente.', 2800);
    } finally {
      setActiveActionType(null);
      setIsExporting(false);
    }
  };
  const handleSendWhatsApp = () => executeSaveAndAction('whatsapp');

  const completePendingImageDownloadIfNeeded = async () => {
    if (!pendingImageDownloadAfterDecisionRef.current) return;
    pendingImageDownloadAfterDecisionRef.current = false;
    setIsExporting(true);
    try {
      await runImageDownloadAction('png');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDismissDecisionModal = async () => {
    if (isFinalizing || isPreparingDuplicate) return;
    setFinalizeError(null);
    setPostSaveDecisionOrcamento(null);
    setPostSaveTriggerAction(null);
    await completePendingImageDownloadIfNeeded();
  };

  const handleCancelDuplicateModal = async () => {
    if (isCreatingDuplicate) return;
    setIsDuplicateModalOpen(false);
    await completePendingImageDownloadIfNeeded();
  };

  // Opção FINALIZAR na Janela de Decisão:
  // Mantém o orçamento original (atualizando no Supabase apenas se o nome foi alterado na modal),
  // baixa a imagem se o fluxo veio de BAIXAR IMAGEM, fecha a janela e redireciona para a aba ORÇAMENTOS.
  const handleFinalizeDecisionModal = async () => {
    const savedOrc = postSaveDecisionOrcamento;
    if (!savedOrc || finalizingLockRef.current || isFinalizing || isPreparingDuplicate) return;

    const trimmedDecisionNome = decisionBudgetName.trim();
    if (!trimmedDecisionNome) {
      setFinalizeError('Informe o nome do orçamento antes de finalizar.');
      decisionBudgetInputRef.current?.focus();
      return;
    }

    finalizingLockRef.current = true;
    setIsFinalizing(true);
    setFinalizeError(null);

    try {
      const nomeChanged = trimmedDecisionNome !== (savedOrc.nomeOrcamento || '').trim();
      setNomeOrcamento(trimmedDecisionNome);

      const needsRemoteSave =
        nomeChanged ||
        !hasSavedSuccessfullyRef.current ||
        lastSavedFingerprintRef.current !== getCurrentBudgetFingerprint();

      let confirmedOrc = lastConfirmedOrcamentoRef.current || savedOrc;
      if (needsRemoteSave) {
        const saveRes = await persistOrcamentoToDatabase(false, {
          forcedOrcId: savedOrc.id,
          fallbackSavedAt: savedOrc.savedAt,
          fallbackNomeOrcamento: savedOrc.nomeOrcamento,
          overrideNomeOrcamento: trimmedDecisionNome,
          skipActivityLog: !nomeChanged,
        });

        if (!saveRes.success || !saveRes.data) {
          setFinalizeError(
            saveRes.error ||
              'Não foi possível salvar as alterações no Supabase. Tente novamente.'
          );
          return;
        }
        confirmedOrc = saveRes.data;
        lastSavedFingerprintRef.current = getCurrentBudgetFingerprint();
      }

      // Gera e baixa a imagem antes de sair da tela (enquanto o Espelho Oficial ainda está montado)
      await completePendingImageDownloadIfNeeded();

      setFinalizeError(null);
      setPostSaveDecisionOrcamento(null);
      setPostSaveTriggerAction(null);

      if (onSaveSuccess) {
        onSaveSuccess(confirmedOrc);
      } else if (onBackToList) {
        onBackToList();
      } else if (onBackToCadastro) {
        onBackToCadastro();
      }
    } catch (err: any) {
      setFinalizeError(
        err?.message ||
          'Não foi possível salvar as alterações no Supabase. Tente novamente.'
      );
    } finally {
      finalizingLockRef.current = false;
      setIsFinalizing(false);
    }
  };

  // Opção DUPLICAR ORÇAMENTO na Janela de Decisão:
  // Salva primeiro eventual alteração feita no nome do orçamento original e abre a segunda janela com "Orçamento de Materiais".
  const handleChooseDuplicateOption = async () => {
    const savedOrc = postSaveDecisionOrcamento;
    if (!savedOrc || isFinalizing || isPreparingDuplicate || finalizingLockRef.current) return;

    const trimmedDecisionNome = decisionBudgetName.trim();
    if (!trimmedDecisionNome) {
      setFinalizeError('Informe o nome do orçamento antes de duplicar.');
      decisionBudgetInputRef.current?.focus();
      return;
    }

    const nomeChanged = trimmedDecisionNome !== (savedOrc.nomeOrcamento || '').trim();
    if (nomeChanged) {
      finalizingLockRef.current = true;
      setIsPreparingDuplicate(true);
      setFinalizeError(null);
      try {
        setNomeOrcamento(trimmedDecisionNome);
        const saveRes = await persistOrcamentoToDatabase(false, {
          forcedOrcId: savedOrc.id,
          fallbackSavedAt: savedOrc.savedAt,
          fallbackNomeOrcamento: savedOrc.nomeOrcamento,
          overrideNomeOrcamento: trimmedDecisionNome,
          skipActivityLog: false,
        });
        if (!saveRes.success) {
          setFinalizeError(
            saveRes.error ||
              'Não foi possível salvar a alteração do nome no Supabase. Tente novamente.'
          );
          return;
        }
        lastSavedFingerprintRef.current = getCurrentBudgetFingerprint();
      } catch (err: any) {
        setFinalizeError(
          err?.message ||
            'Não foi possível salvar a alteração do nome no Supabase. Tente novamente.'
        );
        return;
      } finally {
        finalizingLockRef.current = false;
        setIsPreparingDuplicate(false);
      }
    }

    setFinalizeError(null);
    setPostSaveDecisionOrcamento(null);
    setPostSaveTriggerAction(null);
    setDuplicateBudgetName('Orçamento de Materiais');
    setDuplicateNameError('');
    setIsDuplicateModalOpen(true);
  };

  // Criar Novo Orçamento Independente (mantém cliente, limpa produtos/cálculos/frete/desconto/obs e abre Orçamento Rápido)
  const handleConfirmCreateDuplicatedOrcamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingDuplicateLockRef.current || isCreatingDuplicate) return;

    const trimmedName = duplicateBudgetName.trim();
    if (!trimmedName) {
      setDuplicateNameError('Informe o nome do novo orçamento.');
      return;
    }

    creatingDuplicateLockRef.current = true;
    setIsCreatingDuplicate(true);
    setDuplicateNameError('');

    try {
      const now = new Date();
      const todayBr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const newOrcId = `orc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const resolvedConsultora = consultoraName || currentUserName;
      const sellerId =
        getSellerIdForUser(resolvedConsultora) ||
        getSellerIdForUser(currentUserName);
      const resolvedClientAddress = resolveClientAddressString(currentClient, initialOrcamento);

      const newDuplicatedOrcamento: SavedOrcamento = {
        id: newOrcId,
        clientId: currentClient?.id || selectedClientId || initialOrcamento?.clientId || 'cli_geral',
        clientName: currentClient?.name || clientName || initialOrcamento?.clientName || '',
        clientType: currentClient?.clientType || clientType || initialOrcamento?.clientType || 'Cliente Final',
        clientContact:
          currentClient?.whatsapp ||
          (currentClient as any)?.phone ||
          clientContact ||
          initialOrcamento?.clientContact ||
          '',
        clientDocument: currentClient?.document || initialOrcamento?.clientDocument || undefined,
        clientAddress: resolvedClientAddress || undefined,
        clientEmail: currentClient?.email || initialOrcamento?.clientEmail || undefined,
        nomeOrcamento: trimmedName,
        consultoraName: resolvedConsultora,
        registeredBy: currentUserName || resolvedConsultora,
        vendedorId: sellerId,
        responsavel: resolvedConsultora,
        responsavelId: sellerId,
        dataOrcamento: todayBr,
        observacoes: '',
        observacoesRodape: '',
        items: [],
        limpaPisoAtivo: false,
        areaTerreaAtiva: false,
        areaTerreaSqm: '',
        freteAtivo: false,
        freteValor: 0,
        freteEndereco: '',
        freteCep: '',
        freteLogradouro: '',
        freteNumero: '',
        freteComplemento: '',
        freteBairro: '',
        freteCidade: '',
        freteUf: '',
        descontoValor: 0,
        descontoTexto: undefined,
        totalFinal: 0,
        exibirQuantidade: true,
        status: 'Orçamento Enviado',
        savedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const actorName = currentUserName || resolvedConsultora;

      // Salva o novo orçamento vazio como registro independente no Supabase antes de redirecionar
      const saveRes = await saveItemToSupabase(
        'fenix_orcamentos_history',
        newDuplicatedOrcamento,
        'id',
        actorName
      );

      if (!saveRes.success) {
        setDuplicateNameError(
          saveRes.error ||
            'Não foi possível criar o novo orçamento no Supabase. Tente novamente.'
        );
        return;
      }

      const confirmedNewOrc = (saveRes.data as SavedOrcamento) || newDuplicatedOrcamento;

      try {
        const historyList = getLocalCollectionSafe<SavedOrcamento>('fenix_orcamentos_history', []);
        setLocalCollectionSafe('fenix_orcamentos_history', [
          confirmedNewOrc,
          ...historyList.filter((o) => o.id !== confirmedNewOrc.id),
        ]);
        const savedList = getLocalCollectionSafe<SavedOrcamento>('fenix_saved_orcamentos', []);
        setLocalCollectionSafe('fenix_saved_orcamentos', [
          confirmedNewOrc,
          ...savedList.filter((o) => o.id !== confirmedNewOrc.id),
        ]);
        localStorage.removeItem(ACTIVE_DRAFT_KEY);
        localStorage.removeItem('fenix_orcamento_in_progress_draft');
      } catch {}

      window.dispatchEvent(new Event('fenix_orcamentos_updated'));
      saveItemToSupabase('fenix_saved_orcamentos', confirmedNewOrc, 'id', actorName).catch((e) =>
        console.warn('Erro ao espelhar novo orçamento duplicado:', e)
      );
      syncSingleOrcamentoToFollowUp(confirmedNewOrc, {
        currentUser: actorName,
        isEdit: false,
      }).catch((e) => console.warn('Erro ao sincronizar orçamento duplicado no Follow-up:', e));

      if (currentClient?.id) {
        addClientActivity({
          clientId: currentClient.id,
          type: 'orcamento_criado',
          title: 'Novo orçamento criado',
          description: `Novo orçamento "${trimmedName}" criado para o mesmo cliente, pronto para preenchimento.`,
          date: now.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
          relevantInfo: `Consultora: ${resolvedConsultora}`,
        });
      }

      // Gera e baixa a imagem do orçamento original antes de trocar para a cópia independente
      await completePendingImageDownloadIfNeeded();

      setIsDuplicateModalOpen(false);
      setDuplicateBudgetName('');
      setDuplicateNameError('');

      if (onCreateDuplicatedOrcamento) {
        onCreateDuplicatedOrcamento(confirmedNewOrc, currentClient);
      } else {
        // Fallback defensivo caso o componente pai não passe onCreateDuplicatedOrcamento
        resetAllInsumoLinks();
        persistedOrcIdRef.current = confirmedNewOrc.id;
        hasSavedSuccessfullyRef.current = false;
        setItems([]);
        setNomeOrcamento(trimmedName);
        setObservacoes('');
        setObservacoesRodape('');
        setLimpaPisoEnabled(false);
        setAreaTerreaEnabled(false);
        setAreaTerreaSqm('');
        setHasFreteEnabled(false);
        setFreteValorInput('0,00');
        setFreteCep('');
        setFreteLogradouro('');
        setFreteNumero('');
        setFreteComplemento('');
        setFreteBairro('');
        setFreteCidade('');
        setFreteUf('');
        setFreteEndereco('');
        setHasDescontoEnabled(false);
        setDescontoInput('0,00');
        setDescontoTexto('DESCONTO PARA PAGAMENTO VIA PIX');
        setQuickPisoSqm('');
        setQuickRodapeMl('');
        setQuickRipadoSqm('');
        setQuickRipadoWidth('');
        setQuickRipadoHeight('');
        setQuickTetoSqm('');
        setQuickMantaSqm('');
        setProductSubTab('rapido');
        window.setTimeout(() => {
          const target =
            adicionarProdutosRef.current ||
            document.getElementById('adicionar-produtos-container');
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }

      showToast(`✓ Novo orçamento "${trimmedName}" criado! Preencha os produtos no Orçamento Rápido.`);
    } catch (err: any) {
      setDuplicateNameError(
        err?.message || 'Erro ao criar o novo orçamento. Tente novamente.'
      );
    } finally {
      creatingDuplicateLockRef.current = false;
      setIsCreatingDuplicate(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 sm:py-8 space-y-8">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="pointer-events-none fixed top-20 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#003865] text-white shadow-lg flex items-center gap-2.5 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-sky-400 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumb & Navigation (no-print) */}
      <div className="no-print space-y-4">
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
          <Home className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">›</span>
          <button
            onClick={onBackToList || onBackToCadastro}
            className="hover:text-slate-800 cursor-pointer transition-colors"
          >
            Orçamentos
          </button>
          <span className="text-slate-400">›</span>
          <span className="text-slate-900 font-semibold">
            {initialOrcamento ? 'Visualizar / Editar Orçamento' : 'Novo Orçamento'}
          </span>
        </nav>

        {/* Page Title Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div className="flex items-start gap-4">
            <div className="text-[#0057ff] flex-shrink-0 pt-0.5">
              <FileText className="w-9 h-9 sm:w-11 sm:h-11 stroke-[2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#091122] tracking-tight">
                {initialOrcamento ? 'Visualizar / Editar Orçamento' : 'Novo Orçamento'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
                Preencha os dados abaixo. O Espelho Oficial é gerado
                automaticamente em tempo real com fidelidade visual absoluta.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!initialOrcamento && (items.length > 0 || nomeOrcamento || selectedClientId) && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="self-start sm:self-center h-10 px-3.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/70 text-rose-700 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Limpar todos os campos e começar um orçamento do zero"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar / Novo</span>
              </button>
            )}
            <button
              onClick={onBackToList || onBackToCadastro}
              className="self-start sm:self-center h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Orçamentos</span>
            </button>
          </div>
        </div>

        {/* Banner de Rascunho em Andamento */}
        {!initialOrcamento && (items.length > 0 || nomeOrcamento || selectedClientId) && (
          <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-emerald-950">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span className="font-semibold text-emerald-900">
                Orçamento em andamento preservado:
              </span>
              <span className="text-emerald-700">
                {items.length} {items.length === 1 ? 'item adicionado' : 'itens adicionados'}. Você pode trocar de aba ou consultar outros módulos sem perder nenhum dado.
              </span>
            </div>
            <button
              onClick={handleDiscardDraft}
              type="button"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Descartar rascunho
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. DADOS DO CLIENTE (Área de Preenchimento) */}
      {/* ======================================================== */}
      <section className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              1
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#091122]">
              Dados do Cliente
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Vinculação automática do cadastro
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Seleção do Cliente (Permite digitar para localizar - Apenas do usuário logado) */}
          <div className="space-y-1.5" ref={clientDropdownRef}>
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#0057ff]" />
              <span>Cliente (Digite para localizar)</span>
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
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
                {clientSearchQuery ? (
                  <button
                    type="button"
                    onClick={handleClearClientSelection}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title="Limpar seleção"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 pointer-events-none" />
                )}
              </div>

              {/* Dropdown com resultados filtrados */}
              {isClientDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                  {filteredClientsForSearch.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">
                      Nenhum cliente encontrado para "{clientSearchQuery}"
                    </div>
                  ) : (
                    filteredClientsForSearch.map((c) => {
                      const isSelected = c.id === selectedClientId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectClientRecord(c)}
                          className={`w-full px-3.5 py-2.5 text-left text-xs sm:text-sm flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/70 font-bold text-[#0057ff]' : 'text-slate-800'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 font-semibold">
                              {c.name} {c.isImportant ? '★' : ''}
                            </span>
                            {c.phone || c.whatsapp ? (
                              <span className="text-[11px] text-slate-500">
                                {c.phone || c.whatsapp}
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {c.clientType}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tipo de Cliente (determina a tabela automaticamente) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#0057ff]" />
                <span>Tipo de Cliente</span>
              </label>
              <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                {getOfficialPriceTableLabel(priceTable)}
              </span>
            </div>
            <select
              value={activeClientType}
              onChange={(e) => handleClientTypeChange(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
            >
              <option value="Cliente Final">Cliente Final → Preço Cliente Final</option>
              <option value="Engenheiro">Engenheiro → Preço Cliente Final</option>
              <option value="Arquiteto">Arquiteto → Preço Cliente Final</option>
              <option value="Revenda">Revenda → Preço Revenda</option>
              <option value="Instalador">Instalador → Preço Revenda</option>
              <option value="Construtora">Construtora → Preço Construtora</option>
            </select>
          </div>

          {/* Contato (WhatsApp) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>Contato</span>
            </label>
            <div className={`w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 flex items-center text-xs sm:text-sm font-semibold ${
              clientContact ? 'text-slate-800' : 'text-slate-400 font-normal'
            }`}>
              {clientContact || 'Nenhum contato vinculado'}
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 2. INFORMAÇÕES DO ORÇAMENTO */}
      {/* ======================================================== */}
      <section className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              2
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#091122]">
              Informações do Orçamento
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Consultora e observações da proposta
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Consultora Comercial ou Diretor (preenchida automaticamente com usuária logada) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              {(consultoraName || '').toLowerCase().includes('eder')
                ? 'Diretor'
                : 'Consultora Comercial'}
            </label>
            <div className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 flex items-center text-xs sm:text-sm font-bold text-[#003865]">
              {consultoraName}
            </div>
            <p className="text-[11px] text-slate-400">
              {(consultoraName || '').toLowerCase().includes('eder')
                ? 'Diretor logado no sistema.'
                : 'Usuária logada no sistema.'}
            </p>
          </div>

          {/* Nome do Orçamento */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Nome do Orçamento
            </label>
            <input
              type="text"
              value={nomeOrcamento || ''}
              onChange={(e) => setNomeOrcamento(e.target.value)}
              placeholder="Ex: Teto Vinílico Pix e Insumos"
              className="w-full h-11 rounded-xl border border-slate-200 px-4 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10"
            />
            <p className="text-[11px] text-slate-400">
              Identificação na esteira de Follow-up.
            </p>
          </div>

          {/* Observação do orçamento (Aparece na parte superior do orçamento) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Observação do orçamento</span>
              <span className="text-[10px] text-blue-600 font-semibold">Topo</span>
            </label>
            <input
              type="text"
              value={observacoes || ''}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex: Validade da proposta: 5 dias úteis..."
              className="w-full h-11 rounded-xl border border-slate-200 px-4 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10"
            />
            <p className="text-[11px] text-slate-400">
              Aparece na parte superior (junto às informações).
            </p>
          </div>

          {/* Observação do rodapé (Aparece somente no rodapé do espelho oficial) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Observação do rodapé</span>
              <span className="text-[10px] text-amber-600 font-semibold">Rodapé oficial</span>
            </label>
            <input
              type="text"
              value={observacoesRodape || ''}
              onChange={(e) => setObservacoesRodape(e.target.value)}
              placeholder="Não realizamos instalação, indicamos profissionais caso precise!"
              className="w-full h-11 rounded-xl border border-slate-200 px-4 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10"
            />
            <p className="text-[11px] text-slate-400">
              Aparece somente no rodapé do espelho oficial.
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 3. ADICIONAR PRODUTOS (Fluxo com Busca com Dropdown, Categorias e Aba Produtos) */}
      {/* ======================================================== */}
      <section
        id="adicionar-produtos-container"
        ref={adicionarProdutosRef}
        className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-4 scroll-mt-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              3
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#091122] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#0057ff]" />
              Adicionar Produtos
            </h2>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Indicador Oficial da Tabela Selecionada Automaticamente */}
            <div className="flex items-center gap-2 bg-slate-100/90 border border-slate-200/80 px-3.5 py-1.5 rounded-xl">
              <span className="text-[11px] font-bold text-slate-600">
                Tabela Oficial:
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-blue-50 border border-blue-200 text-[#003865] shadow-2xs">
                {getOfficialPriceTableLabel(priceTable)}
              </span>
              <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
                (Automática • {activeClientType})
              </span>
            </div>

            {/* Botão de Catálogo Geral em Modal */}
            <button
              type="button"
              onClick={() => setIsProductModalOpen(true)}
              className="h-9 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
              title="Abrir catálogo completo em janela modal"
            >
              <Package className="w-3.5 h-3.5 text-slate-600" />
              <span>Catálogo Geral</span>
            </button>

            {/* Botão Cadastrar Novo Produto */}
            <button
              type="button"
              onClick={() => {
                setCadastrarInitialName('');
                setIsCadastrarProdutoModalOpen(true);
              }}
              className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-[#0B2046] to-[#0052cc] hover:from-[#081733] hover:to-[#0041a8] text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Cadastrar novo produto no catálogo e inserir no orçamento"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Cadastrar Novo Produto</span>
            </button>

            {/* Botão de Importar da Calculadora se houver rascunho */}
            {hasDraftFromCalculator && (
              <button
                type="button"
                onClick={handleImportFromCalculator}
                className="h-9 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors cursor-pointer border border-emerald-200"
              >
                <span>Importar Calculadora</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Abas de Navegação Solicitadas pelo Usuário */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl overflow-x-auto border border-slate-200/80">
          <button
            type="button"
            onClick={() => setProductSubTab('rapido')}
            className={`flex-1 min-w-[165px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              productSubTab === 'rapido'
                ? 'bg-white text-[#0057ff] shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>1. Orçamento Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => setProductSubTab('buscar')}
            className={`flex-1 min-w-[155px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              productSubTab === 'buscar'
                ? 'bg-white text-[#0057ff] shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>2. Barra de Busca</span>
          </button>

          <button
            type="button"
            onClick={() => setProductSubTab('categorias')}
            className={`flex-1 min-w-[165px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              productSubTab === 'categorias'
                ? 'bg-white text-[#0057ff] shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>3. Escolher Categoria</span>
            {selectedCategoryId && (
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setProductSubTab('produtos')}
            className={`flex-1 min-w-[175px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              productSubTab === 'produtos'
                ? 'bg-white text-[#0057ff] shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>4. Adicionar Produtos</span>
            {selectedProductCatalog ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                Puxado ✓
              </span>
            ) : null}
          </button>
        </div>

        {/* ======================================================== */}
        {/* ABA 1: ORÇAMENTO RÁPIDO */}
        {/* ======================================================== */}
        {productSubTab === 'rapido' && (
          <form onSubmit={handleGenerateQuickBudget} className="space-y-4 animate-in fade-in-50 duration-200">
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/80 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-[#0057ff]" />
                    Orçamento Rápido
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Preencha somente os produtos desejados e clique em Gerar Orçamento para configurar em etapas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuickPisoSqm('');
                    setQuickRodapeMl('');
                    setQuickRipadoSqm('');
                    setQuickRipadoWidth('');
                    setQuickRipadoHeight('');
                    setQuickTetoSqm('');
                    setQuickMantaSqm('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0057ff] transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-white/70 shrink-0"
                  title="Limpar metragens preenchidas"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>

              {/* Cinco campos independentes alinhados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
                {/* 1. Piso Vinílico (m²) */}
                <div className="flex flex-col gap-1.5">
                  <div className="h-6 flex items-center">
                    <label className="text-xs font-bold text-slate-700 leading-none whitespace-nowrap">
                      Piso Vinílico (m²)
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickPisoSqm}
                    onChange={(e) => setQuickPisoSqm(e.target.value)}
                    placeholder="Ex: 50"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                  />
                </div>

                {/* 2. Rodapé (ml) */}
                <div className="flex flex-col gap-1.5">
                  <div className="h-6 flex items-center">
                    <label className="text-xs font-bold text-slate-700 leading-none whitespace-nowrap">
                      Rodapé (ml)
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickRodapeMl}
                    onChange={(e) => setQuickRodapeMl(e.target.value)}
                    placeholder="Ex: 40"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                  />
                </div>

                {/* 3. Ripado (m² ou L × A) */}
                <div className="flex flex-col gap-1.5">
                  <div className="h-6 flex items-center justify-between gap-1.5">
                    <label className="text-xs font-bold text-slate-700 leading-none whitespace-nowrap">
                      Ripado
                    </label>
                    <div className="h-6 inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQuickRipadoMode('m2')}
                        className={`h-full px-2 rounded-md text-[10px] font-bold leading-none transition-colors cursor-pointer ${
                          quickRipadoMode === 'm2'
                            ? 'bg-[#0057ff] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        m²
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickRipadoMode('lxA')}
                        className={`h-full px-2 rounded-md text-[10px] font-bold leading-none transition-colors cursor-pointer ${
                          quickRipadoMode === 'lxA'
                            ? 'bg-[#0057ff] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        L × A
                      </button>
                    </div>
                  </div>
                  {quickRipadoMode === 'm2' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quickRipadoSqm}
                      onChange={(e) => setQuickRipadoSqm(e.target.value)}
                      placeholder="Ex: 12"
                      className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quickRipadoWidth}
                        onChange={(e) => setQuickRipadoWidth(e.target.value)}
                        placeholder="Larg. (m)"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quickRipadoHeight}
                        onChange={(e) => setQuickRipadoHeight(e.target.value)}
                        placeholder="Alt. (m)"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white px-2.5 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                      />
                    </div>
                  )}
                </div>

                {/* 4. Teto Vinílico (m²) */}
                <div className="flex flex-col gap-1.5">
                  <div className="h-6 flex items-center">
                    <label className="text-xs font-bold text-slate-700 leading-none whitespace-nowrap">
                      Teto Vinílico (m²)
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickTetoSqm}
                    onChange={(e) => setQuickTetoSqm(e.target.value)}
                    placeholder="Ex: 25"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                  />
                </div>

                {/* 5. Manta Hospitalar (m²) */}
                <div className="flex flex-col gap-1.5">
                  <div className="h-6 flex items-center">
                    <label className="text-xs font-bold text-slate-700 leading-none whitespace-nowrap">
                      Manta Hospitalar (m²)
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quickMantaSqm}
                    onChange={(e) => setQuickMantaSqm(e.target.value)}
                    placeholder="Ex: 45"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-xs text-slate-500">
                  Tabela ativa: <strong className="text-slate-700">{getOfficialPriceTableLabel(priceTable)}</strong>
                </p>
                <button
                  type="submit"
                  className="h-11 px-6 rounded-xl bg-[#0057ff] hover:bg-[#0048db] text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Gerar Orçamento</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* ABA 2: BARRA DE BUSCA COM DROPDOWN IMEDIATO EMBAIXO */}
        {/* ======================================================== */}
        {productSubTab === 'buscar' && (
          <div className="space-y-3 animate-in fade-in-50 duration-200">
            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-[#0057ff]" />
                    Barra de Busca de Produtos
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Digite o que está buscando. Os produtos aparecem embaixo imediatamente. Ao selecionar, já vai para a aba produtos!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProductSubTab('categorias')}
                  className="text-xs font-bold text-[#0057ff] hover:underline cursor-pointer self-start sm:self-auto"
                >
                  Prefere escolher por categoria? Clique aqui
                </button>
              </div>

              {/* Input com campo de busca */}
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchProductQuery}
                  onChange={(e) => setSearchProductQuery(e.target.value)}
                  placeholder="Digite o que está buscando..."
                  className="w-full h-12 rounded-xl border border-slate-300 bg-white pl-11 pr-10 text-sm font-medium text-slate-900 outline-none focus:border-[#0057ff] focus:ring-4 focus:ring-blue-500/10 shadow-xs transition-all"
                  autoFocus
                />
                {searchProductQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchProductQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Atalhos apenas botões de texto, simples e compactos, sem ícones */}
              {!searchProductQuery.trim() && (userShortcuts.categories.length > 0 || userShortcuts.products.length > 0) && (
                <div className="flex items-center gap-2 pt-1 flex-wrap animate-in fade-in-50 duration-150">
                  <span className="text-[11px] font-medium text-slate-400 select-none shrink-0">
                    Mais usados:
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Categorias mais utilizadas - apenas texto, sem ícones */}
                    {userShortcuts.categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          setProductSubTab('categorias');
                        }}
                        className="h-6 px-2.5 rounded-full bg-slate-100 hover:bg-blue-50 border border-slate-200/60 hover:border-blue-300 text-slate-600 hover:text-[#0052cc] text-[11px] font-medium transition-all cursor-pointer shadow-2xs"
                        title={`Filtrar por ${cat.name}`}
                      >
                        {cat.name}
                      </button>
                    ))}

                    {/* Divisor sutil se houver categorias e produtos */}
                    {userShortcuts.categories.length > 0 && userShortcuts.products.length > 0 && (
                      <span className="text-slate-300 select-none mx-0.5">•</span>
                    )}

                    {/* Produtos reais mais frequentes e recentes do usuário - apenas texto, sem ícones */}
                    {userShortcuts.products.map((prod) => {
                      const tierPrice = getProductTierPrice(prod, priceTable);
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleSelectAndPullProduct(prod)}
                          className="h-6 px-2.5 rounded-full bg-white hover:bg-blue-50/80 border border-slate-200/90 hover:border-blue-300 text-slate-700 hover:text-[#0052cc] text-[11px] transition-all cursor-pointer shadow-2xs group flex items-center gap-1.5"
                          title={`Selecionar ${prod.name}`}
                        >
                          <span className="font-medium text-slate-800 group-hover:text-[#0052cc] truncate max-w-[155px]">
                            {prod.name}
                          </span>
                          <span className="text-[10px] font-semibold text-blue-600/90">
                            {formatPriceToBrl(tierPrice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown / Lista suspensa de resultados embaixo da barra de busca */}
            {searchProductQuery.trim() && (
              <div className="border border-slate-200 rounded-2xl bg-white shadow-lg overflow-hidden animate-in fade-in-50 duration-150">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Resultados encontrados para "{searchProductQuery}" ({searchResults.length}):
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Clique no produto desejado para selecioná-lo e ir para a Aba Produtos
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.length === 0 ? (
                    <div className="py-8 px-4 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        Nenhum produto cadastrado com o termo "{searchProductQuery}".
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Você pode cadastrá-lo agora mesmo no catálogo oficial e adicioná-lo a este orçamento.
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setCadastrarInitialName(searchProductQuery);
                            setIsCadastrarProdutoModalOpen(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#0B2046] to-[#0052cc] hover:from-[#081733] hover:to-[#0041a8] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Cadastrar "{searchProductQuery}" como Novo Produto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductSubTab('categorias')}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Navegar por Categorias
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {searchResults.map((prod) => {
                        const tierPrice = getProductTierPrice(prod, priceTable);
                        return (
                          <div
                            key={prod.id}
                            onClick={() => handleSelectAndPullProduct(prod)}
                            className="p-3.5 hover:bg-blue-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-slate-900 group-hover:text-[#0057ff] transition-colors">
                                  {prod.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                                  {prod.category}
                                </span>
                                {prod.groupName && prod.groupName.trim().toUpperCase() !== 'SEM GRUPO' && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700">
                                    {prod.groupName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span>Unidade: <strong className="text-slate-700">{prod.unit}</strong></span>
                                <span>•</span>
                                <span>
                                  Tabela {getOfficialPriceTableLabel(priceTable)}:{' '}
                                  <strong className="text-blue-700 font-bold">
                                    {tierPrice.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAndPullProduct(prod);
                              }}
                              className="h-9 px-4 rounded-xl bg-blue-50 group-hover:bg-[#0057ff] text-[#0057ff] group-hover:text-white font-bold text-xs flex items-center justify-center transition-all shadow-xs cursor-pointer self-end sm:self-auto"
                            >
                              <span>Puxar para Produtos</span>
                            </button>
                          </div>
                        );
                      })}

                      {/* Atalho rápido ao final da lista para novo produto */}
                      <div className="p-3 bg-slate-50 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>Não encontrou o que procura?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCadastrarInitialName(searchProductQuery);
                            setIsCadastrarProdutoModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-[#0052cc] font-bold border border-slate-200 shadow-2xs flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Cadastrar Novo Produto</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: ESCOLHER CATEGORIA (Ex: Piso -> só pisos cadastrados -> puxar) */}
        {/* ======================================================== */}
        {productSubTab === 'categorias' && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            {!selectedCategoryId ? (
              /* Grid de seleção da Categoria */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                      Escolha uma Categoria
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ao clicar em <strong>Piso</strong> por exemplo, só vai aparecer os pisos cadastrados para você escolher e puxar.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {categoriesList.map((cat) => {
                    const count = dynamicCatalog.filter(
                      (p) =>
                        p.categoryId === cat.id ||
                        p.category.toLowerCase() === cat.name.toLowerCase()
                    ).length;
                    const isPiso = cat.name.toLowerCase().includes('piso');

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          setCategoryFilterQuery('');
                        }}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between group hover:shadow-md ${
                          isPiso
                            ? 'bg-blue-50/50 border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                            : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isPiso
                                ? 'bg-blue-200/80 text-blue-900'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {count} itens
                          </span>
                        </div>
                        <div>
                          <span
                            className={`text-xs font-bold leading-snug block line-clamp-2 ${
                              isPiso
                                ? 'text-blue-950 font-extrabold'
                                : 'text-slate-800 group-hover:text-[#0057ff]'
                            }`}
                          >
                            {cat.name}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-1 block group-hover:text-blue-600">
                            Ver produtos
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Exibição dos produtos da categoria selecionada (ex: só pisos cadastrados) */
              <div className="space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(null)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                    >
                      <span>Trocar Categoria</span>
                    </button>
                    <div>
                      <span className="text-xs text-slate-500 font-medium">
                        Categoria Selecionada:
                      </span>
                      <h3 className="text-sm font-extrabold text-[#003865] flex items-center gap-2">
                        {activeCategoryObj?.name}
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white">
                          {categoryProducts.length} produtos
                        </span>
                      </h3>
                    </div>
                  </div>

                  {/* Campo de filtro rápido dentro da categoria */}
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categoryFilterQuery}
                      onChange={(e) => setCategoryFilterQuery(e.target.value)}
                      placeholder="Filtrar nesta categoria..."
                      className="w-full h-9 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-[#0057ff]"
                    />
                  </div>
                </div>

                {/* Lista de produtos da categoria selecionada */}
                <div className="border border-slate-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {categoryProducts.length === 0 ? (
                      <div className="py-8 px-4 text-center">
                        <p className="text-sm text-slate-500">
                          Nenhum produto encontrado nesta categoria com o filtro atual.
                        </p>
                      </div>
                    ) : (
                      categoryProducts.map((prod) => {
                        const tierPrice = getProductTierPrice(prod, priceTable);
                        const prodRule = resolveProductCalcRule({
                          productName: prod.name,
                          categoryName: prod.category,
                          categoryId: prod.categoryId,
                          groupName: prod.groupName,
                          groupId: prod.groupId,
                          groupCalcRule: prod.groupCalcRule,
                        });
                        return (
                          <div
                            key={prod.id}
                            className="p-3.5 hover:bg-blue-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-slate-900">
                                  {prod.name}
                                </span>
                                {prod.groupName && prod.groupName.trim().toUpperCase() !== 'SEM GRUPO' && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/70">
                                    {prod.groupName}
                                  </span>
                                )}
                                {prodRule !== 'padrao' && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                    Regra: {getCalcRuleShortLabel(prodRule)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span>Unidade: <strong className="text-slate-700">{prod.unit}</strong></span>
                                <span>•</span>
                                <span>
                                  Tabela {getOfficialPriceTableLabel(priceTable)}:{' '}
                                  <strong className="text-blue-700 font-bold">
                                    {tierPrice.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectAndPullProduct(prod)}
                              className="h-9 px-4 rounded-xl bg-[#0057ff] hover:bg-[#0048db] text-white font-bold text-xs flex items-center justify-center shadow-sm shadow-blue-500/20 transition-all cursor-pointer self-end sm:self-auto"
                            >
                              <span>Puxar</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 3: ABA PRODUTOS (Preenchimento do Produto Puxado) */}
        {/* ======================================================== */}
        {productSubTab === 'produtos' && (
          <div className="space-y-4 animate-in fade-in-50 duration-200">
            {/* Banner do Produto Selecionado */}
            <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50/40 p-4 rounded-2xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0057ff] text-white flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-500">
                      Produto Selecionado:
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                      {newCategoria || 'Geral'}
                    </span>
                    {effectiveGroupName && effectiveGroupName.trim().toUpperCase() !== 'SEM GRUPO' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        Grupo: {effectiveGroupName}
                      </span>
                    )}
                    {currentProductCalcRule !== 'padrao' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                        Regra: {getCalcRuleShortLabel(currentProductCalcRule)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-700">
                      Tabela: {getOfficialPriceTableLabel(priceTable)}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold text-[#003865] mt-0.5">
                    {selectedProductCatalog || 'Nenhum produto puxado'}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setProductSubTab('buscar')}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#0057ff] text-xs font-bold border border-slate-200 shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar Outro</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProductSubTab('categorias')}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                >
                  <span>Mudar Categoria</span>
                </button>
              </div>
            </div>

            {/* Banner de Edição de Produto */}
            {editingItemId && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs animate-in fade-in-50">
                <div className="flex items-center gap-2">
                  <div>
                    <span className="font-bold">Editando produto:</span>{' '}
                    <span className="font-semibold text-amber-950">"{selectedProductCatalog}"</span>
                    <p className="text-[11px] text-amber-700">
                      Altere os campos e clique em Salvar Alterações para atualizar este item sem criar duplicata.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-xs transition-colors cursor-pointer shrink-0"
                >
                  Cancelar Edição
                </button>
              </div>
            )}

            {/* Formulário com SOMENTE os 5 campos principais solicitados */}
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
                {/* 1. Produto / Descrição */}
                <div className="lg:col-span-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Produto / Descrição
                    </label>
                    <span className="text-[11px] text-blue-600 font-bold">
                      {newCategoria}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={selectedProductCatalog || ''}
                    onChange={(e) => setSelectedProductCatalog(e.target.value)}
                    placeholder="Nome ou descrição do produto..."
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                  />
                </div>

                {/* 2. Detalhe */}
                <div className="lg:col-span-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Detalhe
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Preenchimento manual
                    </span>
                  </div>
                  <input
                    type="text"
                    value={newSubtitulo || ''}
                    onChange={(e) => handlePisoDetalheInputChange(e.target.value)}
                    onBlur={handlePisoDetalheInputBlur}
                    placeholder="Ex: cor, quantidade de caixas, lote..."
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs placeholder:text-slate-400"
                    title="Preencha manualmente informações como cor, quantidade de caixas, lote, réguas, etc."
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Ex: cor, caixas, réguas, acabamento
                  </span>
                </div>

                {/* 3. Quantidade */}
                <div className="lg:col-span-1 space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Quantidade
                  </label>
                  <input
                    type="text"
                    value={newQtd || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewQtd(val);
                      if (isCurrentProductRodape) {
                        if (rodapeDebounceTimerRef.current) {
                          clearTimeout(rodapeDebounceTimerRef.current);
                          rodapeDebounceTimerRef.current = null;
                        }
                        const explicitBars = parseBarCountFromInput(val);
                        if (explicitBars && explicitBars > 0) {
                          const barLen = extractBarLengthFromProductName(selectedProductCatalog, 2.4);
                          rodapeLastBarrasRef.current = explicitBars;
                          rodapeRequestedMlRef.current = Math.round(explicitBars * barLen * 100) / 100;
                          return;
                        }
                        const parsedVal = parsePtBrNumeric(val);
                        if (
                          rodapeLastBarrasRef.current !== null &&
                          Math.abs(parsedVal - rodapeLastBarrasRef.current) <= 0.005
                        ) {
                          return;
                        }
                        rodapeLastBarrasRef.current = null;
                        if (!val.trim() || parsedVal <= 0) {
                          rodapeRequestedMlRef.current = null;
                          return;
                        }
                        rodapeDebounceTimerRef.current = setTimeout(() => {
                          rodapeDebounceTimerRef.current = null;
                          triggerRodapeQuantityConversion(val);
                        }, 650);
                      } else if (isCurrentProductPiso && isSquareMeterUnit(newUnid) && currentPisoBoxYield) {
                        handlePisoQuantityInputChange(val);
                      } else if (isCurrentProductTeto && isSquareMeterUnit(newUnid)) {
                        handleTetoQuantityInputChange(val);
                      }
                    }}
                    onBlur={() => {
                      if (isCurrentProductRodape) {
                        if (rodapeDebounceTimerRef.current) {
                          clearTimeout(rodapeDebounceTimerRef.current);
                          rodapeDebounceTimerRef.current = null;
                        }
                        triggerRodapeQuantityConversion(newQtd);
                      } else if (isCurrentProductPiso && isSquareMeterUnit(newUnid) && currentPisoBoxYield) {
                        if (pisoQtdDebounceRef.current) {
                          clearTimeout(pisoQtdDebounceRef.current);
                          pisoQtdDebounceRef.current = null;
                        }
                        applyPisoFromQuantity(newQtd, true);
                      } else if (isCurrentProductTeto && isSquareMeterUnit(newUnid)) {
                        if (tetoQtdDebounceRef.current) {
                          clearTimeout(tetoQtdDebounceRef.current);
                          tetoQtdDebounceRef.current = null;
                        }
                        applyTetoFromQuantity(newQtd, true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (isCurrentProductRodape) {
                          e.preventDefault();
                          if (rodapeDebounceTimerRef.current) {
                            clearTimeout(rodapeDebounceTimerRef.current);
                            rodapeDebounceTimerRef.current = null;
                          }
                          triggerRodapeQuantityConversion(newQtd);
                        } else if (isCurrentProductPiso && isSquareMeterUnit(newUnid) && currentPisoBoxYield) {
                          if (pisoQtdDebounceRef.current) {
                            clearTimeout(pisoQtdDebounceRef.current);
                            pisoQtdDebounceRef.current = null;
                          }
                          applyPisoFromQuantity(newQtd, true);
                        } else if (isCurrentProductTeto && isSquareMeterUnit(newUnid)) {
                          if (tetoQtdDebounceRef.current) {
                            clearTimeout(tetoQtdDebounceRef.current);
                            tetoQtdDebounceRef.current = null;
                          }
                          applyTetoFromQuantity(newQtd, true);
                        }
                      }
                    }}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-2 text-center text-xs sm:text-sm font-extrabold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                    placeholder={isCurrentProductRodape ? "Metros" : "1"}
                  />
                  <span className="text-[10px] text-slate-500 block text-center">
                    Manual
                  </span>
                </div>

                {/* 4. Unidade */}
                <div className="lg:col-span-1 space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Unidade
                  </label>
                  <input
                    type="text"
                    value={newUnid || ''}
                    onChange={(e) => setNewUnid(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-slate-50 px-1 text-center text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:border-[#0057ff]"
                    title="Unidade puxada automaticamente (ex: m², un, cx, kg)"
                  />
                  <span className="text-[10px] text-blue-600 block text-center font-medium">
                    Automático
                  </span>
                </div>

                {/* 5. Preço Unitário */}
                <div className="lg:col-span-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Preço Unitário (R$)
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      Editável
                    </span>
                  </div>
                  <input
                    type="text"
                    value={newPrecoUnitario || ''}
                    onChange={(e) => setNewPrecoUnitario(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-right text-xs sm:text-sm font-extrabold text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/10 shadow-2xs"
                    title="Preço puxado da tabela oficial, você pode alterar livremente."
                  />
                  <span className="text-[10px] text-slate-500 block text-right">
                    Puxa da tabela ou digite livremente
                  </span>
                </div>
              </div>

              {isCurrentProductRipado && (
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-extrabold text-[#003865]">
                    Calculadora de Ripado:
                  </span>
                  <div className="inline-flex rounded-lg border border-blue-200 bg-white p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setRipadoHelperMode('m2');
                        setRipadoHelperValA('');
                        setRipadoHelperValB('');
                      }}
                      className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                        ripadoHelperMode === 'm2'
                          ? 'bg-[#0057ff] text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Por m²
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRipadoHelperMode('lxA');
                        setRipadoHelperValA('');
                        setRipadoHelperValB('');
                      }}
                      className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                        ripadoHelperMode === 'lxA'
                          ? 'bg-[#0057ff] text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Por L × A
                    </button>
                  </div>

                  {ripadoHelperMode === 'm2' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ripadoHelperValA}
                      onChange={(e) => setRipadoHelperValA(e.target.value)}
                      placeholder="Área (m²)"
                      className="w-24 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ripadoHelperValA}
                        onChange={(e) => setRipadoHelperValA(e.target.value)}
                        placeholder="Larg (m)"
                        className="w-20 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                      />
                      <span className="text-slate-400 font-bold">×</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ripadoHelperValB}
                        onChange={(e) => setRipadoHelperValB(e.target.value)}
                        placeholder="Alt (m)"
                        className="w-20 h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                      />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const area = parsePtBrNumeric(ripadoHelperValA);
                      const w = parsePtBrNumeric(ripadoHelperValA);
                      const h = parsePtBrNumeric(ripadoHelperValB);
                      const calc = calculateRipadoInternalBars({
                        mode: ripadoHelperMode,
                        areaM2: area,
                        widthMeters: w,
                        heightMeters: h,
                        ripadoProduct: currentCatalogMatch || {
                          id: newCatalogProductId || 'ripado_tmp',
                          name: selectedProductCatalog,
                          category: newCategoria,
                          unit: newUnid || 'barras',
                          price: parsePriceToNumber(newPrecoUnitario),
                        },
                      });
                      if (calc.totalBars > 0) {
                        setNewQtd(String(calc.totalBars));
                        setNewUnid('barras');
                        const areaFmt = calc.areaSqm.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        setNewSubtitulo(
                          ripadoHelperMode === 'lxA'
                            ? `(${areaFmt} m² | ${w.toLocaleString('pt-BR')}m × ${h.toLocaleString('pt-BR')}m)`
                            : `(${areaFmt} m²)`
                        );
                        showToast(
                          `${calc.totalBars} barras calculadas (inclui +2 de perda/sobra) • Sugestão de cola: ${calc.colaTubos} tubo(s).`
                        );
                      } else {
                        showToast('Informe dimensões válidas para calcular as barras de ripado.');
                      }
                    }}
                    className="h-8 px-3 rounded-lg bg-[#0057ff] hover:bg-[#0048db] text-white text-[11px] font-bold cursor-pointer"
                  >
                    Calcular Barras
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  O total do item é calculado automaticamente (Qtd × Preço Unitário). Ao salvar, os campos são limpos para o próximo produto.
                </p>
                <div className="flex items-center gap-2">
                  {editingItemId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`h-11 px-6 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                      editingItemId
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                        : 'bg-[#0057ff] hover:bg-[#0048db] shadow-blue-500/20'
                    }`}
                  >
                    {editingItemId ? (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>Salvar Alterações</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>Adicionar ao Orçamento</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* 4. ITENS DO ORÇAMENTO (Tabela Interativa de Edição) */}
      {/* ======================================================== */}
      <section className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              4
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#091122]">
                Itens do Orçamento ({items.length})
              </h2>
              <span className="text-xs text-slate-500">
                Você pode ajustar quantidades ou preços diretamente na tabela
              </span>
            </div>
          </div>

          {/* Duas chaves no próprio cabeçalho, nesta ordem: LIMPA PISO e ÁREA TÉRREA */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. LIMPA PISO */}
            <button
              type="button"
              role="switch"
              aria-checked={limpaPisoEnabled}
              onClick={() => handleToggleLimpaPiso(!limpaPisoEnabled)}
              className={`h-9 px-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                limpaPisoEnabled
                  ? 'border-blue-300 bg-blue-50/70 text-[#0B2046]'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-xs font-extrabold tracking-wide uppercase">
                LIMPA PISO
              </span>
              <span
                className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                  limpaPisoEnabled ? 'bg-[#0057ff] justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-xs block" />
              </span>
            </button>

            {/* 2. ÁREA TÉRREA */}
            <div
              className={`min-h-9 px-3 py-1 rounded-xl border flex flex-wrap items-center gap-2.5 transition-all ${
                areaTerreaEnabled
                  ? 'border-blue-300 bg-blue-50/70 text-[#0B2046]'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <button
                type="button"
                role="switch"
                aria-checked={areaTerreaEnabled}
                onClick={() => handleToggleAreaTerrea(!areaTerreaEnabled)}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <span className="text-xs font-extrabold tracking-wide uppercase">
                  ÁREA TÉRREA
                </span>
                <span
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                    areaTerreaEnabled ? 'bg-[#0057ff] justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-xs block" />
                </span>
              </button>

              {areaTerreaEnabled && (
                <div className="flex items-center gap-1.5 pl-1 border-l border-blue-200">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={areaTerreaSqm}
                    onChange={(e) => handleAreaTerreaSqmChange(e.target.value)}
                    placeholder="Metragem (m²)"
                    className="w-28 h-7 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                  />
                  <span className="text-[11px] font-bold text-slate-500">m²</span>
                </div>
              )}
            </div>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                if (items.length === 0 && !limpaPisoEnabled && !areaTerreaEnabled) {
                  showToast('A tabela de itens já está vazia.');
                  return;
                }
                handleConfirmClearAllItems();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0057ff] transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 shrink-0"
              title="Limpar todos os itens do orçamento"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-center w-16">Qtd</th>
                <th className="py-2.5 px-4">Descrição do Produto</th>
                <th className="py-2.5 px-3 text-center w-20">Unid</th>
                <th className="py-2.5 px-4 text-right w-28">Preço Unit.</th>
                <th className="py-2.5 px-4 text-right w-32">Total</th>
                <th className="py-2.5 px-3 text-center w-28">Posição / Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-slate-400 italic"
                  >
                    Nenhum produto adicionado. Use o formulário acima.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const isEditingThis = editingItemId === item.id;
                  const isRodapeItem = isRodapeProduct(
                    item.descricao,
                    undefined,
                    undefined,
                    item.groupName,
                    item.calcRule
                  );
                  const visibleSubtitulo = isRodapeItem
                    ? stripRodapeAutoDetail(item.subtitulo)
                    : item.subtitulo;
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors cursor-pointer ${
                        isEditingThis
                          ? 'bg-amber-50/90 ring-1 ring-amber-300'
                          : 'hover:bg-blue-50/50'
                      }`}
                      onClick={() => handleEditItem(item)}
                      title="Clique neste produto para editar no formulário acima"
                    >
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={
                            itemQtdDrafts[item.id] !== undefined
                              ? itemQtdDrafts[item.id]
                              : (item.qtd || '')
                          }
                          onFocus={() => {
                            setItemQtdDrafts((prev) =>
                              prev[item.id] !== undefined
                                ? prev
                                : { ...prev, [item.id]: item.qtd || '' }
                            );
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItemQtdDrafts((prev) => ({ ...prev, [item.id]: val }));
                            handleItemQtdChange(item.id, val);
                          }}
                          onBlur={() => {
                            setItemQtdDrafts((prev) => {
                              if (prev[item.id] === undefined) return prev;
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          title={
                            isRodapeItem
                              ? 'Quantidade de barras de rodapé (use o lápis em Ações para editar por metros lineares)'
                              : 'Editar quantidade'
                          }
                          className="w-16 h-8 text-center font-bold text-slate-900 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-semibold text-slate-900 hover:text-[#0057ff] transition-colors">
                              {item.descricao}
                            </span>
                            {visibleSubtitulo && (
                              <span className="block text-[11px] text-slate-500 font-medium whitespace-pre-line">
                                {visibleSubtitulo}
                              </span>
                            )}
                            {!isRodapeItem &&
                              !visibleSubtitulo?.includes(item.qtdDetalhe || '') &&
                              item.qtdDetalhe && (
                                <span className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mt-0.5">
                                  {item.qtdDetalhe}
                                </span>
                              )}
                          </div>
                          {isEditingThis && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-200 text-amber-900 shrink-0">
                              Editando
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">
                        {item.unidade}
                      </td>
                      <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs font-bold text-slate-400">R$</span>
                          <input
                            type="text"
                            value={
                              itemPrecoDrafts[item.id] !== undefined
                                ? itemPrecoDrafts[item.id]
                                : formatPriceToBrl(item.precoUnitario)
                            }
                            onFocus={() => {
                              if (itemPrecoDrafts[item.id] === undefined) {
                                setItemPrecoDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: formatPriceToBrl(item.precoUnitario),
                                }));
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setItemPrecoDrafts((prev) => ({ ...prev, [item.id]: val }));
                              handleItemPrecoChange(item.id, val);
                            }}
                            onBlur={() => {
                              setItemPrecoDrafts((prev) => {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              });
                            }}
                            className="w-24 h-8 text-right font-extrabold text-slate-900 bg-white border border-slate-300 focus:border-[#0052cc] focus:ring-2 focus:ring-blue-500/20 rounded-lg outline-none px-2 shadow-2xs transition-all text-xs sm:text-sm"
                            title="Edite o preço unitário diretamente neste orçamento (sem alterar o catálogo)"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-bold text-[#003865]">
                        {parsePriceToNumber(item.total).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditItem(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Editar este produto no formulário"
                            aria-label="Editar este produto"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(index, 'up')}
                            disabled={index === 0}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              index === 0
                                ? 'text-slate-200 cursor-not-allowed'
                                : 'text-slate-400 hover:text-[#0057ff] hover:bg-blue-50'
                            }`}
                            title="Mover produto para cima"
                            aria-label="Mover produto para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(index, 'down')}
                            disabled={index === items.length - 1}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              index === items.length - 1
                                ? 'text-slate-200 cursor-not-allowed'
                                : 'text-slate-400 hover:text-[#0057ff] hover:bg-blue-50'
                            }`}
                            title="Mover produto para baixo"
                            aria-label="Mover produto para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer ml-1"
                            title="Remover produto do orçamento"
                            aria-label="Remover produto do orçamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 5. FRETE / DESCONTO / TOTAL */}
      {/* ======================================================== */}
      <section className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              5
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#091122]">
              Frete, Desconto e Total
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Cálculo interno consolidado
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Configuração de Frete */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFreteEnabled}
                  onChange={(e) => setHasFreteEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-[#0057ff] focus:ring-blue-500 cursor-pointer"
                />
                <Truck className="w-4 h-4 text-[#0057ff]" />
                <span>Incluir Frete no Orçamento</span>
              </label>
              {!hasFreteEnabled ? (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Desativado
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Ativado
                </span>
              )}
            </div>

            {!hasFreteEnabled ? (
              <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Frete não incluso — a calcular após fechamento.</strong> O valor não será somado ao total.
                </span>
              </div>
            ) : (
              <div className="space-y-3 pt-1 animate-in fade-in-50">
                {/* Valor do Frete (Manual) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700">
                      Valor do Frete (R$)
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Digite manualmente
                    </span>
                  </div>
                  <input
                    type="text"
                    value={freteValorInput || ''}
                    onChange={(e) => setFreteValorInput(e.target.value)}
                    placeholder="150,00"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                  />
                </div>

                {/* CEP com busca automática */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700">
                      CEP do Endereço de Entrega
                    </label>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      Busca automática
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={freteCep || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFreteCep(raw);
                        const digits = raw.replace(/\D/g, '');
                        if (digits.length === 8) {
                          handleSearchCep(digits);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearchCep();
                        }
                      }}
                      placeholder="00000-000"
                      maxLength={9}
                      className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-[#0057ff]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchCep()}
                      disabled={isSearchingCep}
                      className="h-10 px-3 rounded-lg bg-[#0057ff] hover:bg-[#0048db] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                      title="Pesquisar CEP"
                    >
                      {isSearchingCep ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>Buscar</span>
                    </button>
                  </div>
                </div>

                {/* Campos do Endereço auto-preenchidos e editáveis */}
                <div className="space-y-2 pt-1 border-t border-slate-200">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Logradouro / Endereço
                    </label>
                    <input
                      type="text"
                      value={freteLogradouro || ''}
                      onChange={(e) => {
                        setFreteLogradouro(e.target.value);
                        updateComposedAddress(
                          e.target.value,
                          freteNumero,
                          freteComplemento,
                          freteBairro,
                          freteCidade,
                          freteUf,
                          freteCep
                        );
                      }}
                      placeholder="Rua, Avenida, Alameda..."
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#0057ff]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        Número
                      </label>
                      <input
                        id="frete-numero-input"
                        type="text"
                        value={freteNumero || ''}
                        onChange={(e) => {
                          setFreteNumero(e.target.value);
                          updateComposedAddress(
                            freteLogradouro,
                            e.target.value,
                            freteComplemento,
                            freteBairro,
                            freteCidade,
                            freteUf,
                            freteCep
                          );
                        }}
                        placeholder="Ex: 368"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#0057ff]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        Complemento
                      </label>
                      <input
                        type="text"
                        value={freteComplemento || ''}
                        onChange={(e) => {
                          setFreteComplemento(e.target.value);
                          updateComposedAddress(
                            freteLogradouro,
                            freteNumero,
                            e.target.value,
                            freteBairro,
                            freteCidade,
                            freteUf,
                            freteCep
                          );
                        }}
                        placeholder="Sala, Apto, Bloco..."
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#0057ff]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5 space-y-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={freteBairro || ''}
                        onChange={(e) => {
                          setFreteBairro(e.target.value);
                          updateComposedAddress(
                            freteLogradouro,
                            freteNumero,
                            freteComplemento,
                            e.target.value,
                            freteCidade,
                            freteUf,
                            freteCep
                          );
                        }}
                        placeholder="Bairro"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#0057ff]"
                      />
                    </div>
                    <div className="col-span-5 space-y-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={freteCidade || ''}
                        onChange={(e) => {
                          setFreteCidade(e.target.value);
                          updateComposedAddress(
                            freteLogradouro,
                            freteNumero,
                            freteComplemento,
                            freteBairro,
                            e.target.value,
                            freteUf,
                            freteCep
                          );
                        }}
                        placeholder="Cidade"
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-[#0057ff]"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        UF
                      </label>
                      <input
                        type="text"
                        value={freteUf || ''}
                        onChange={(e) => {
                          setFreteUf(e.target.value);
                          updateComposedAddress(
                            freteLogradouro,
                            freteNumero,
                            freteComplemento,
                            freteBairro,
                            freteCidade,
                            e.target.value,
                            freteCep
                          );
                        }}
                        placeholder="SP"
                        maxLength={2}
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-1 text-center uppercase text-xs font-bold text-slate-800 outline-none focus:border-[#0057ff]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Endereço Completo no Espelho
                    </label>
                    <input
                      type="text"
                      value={freteEndereco || ''}
                      onChange={(e) => setFreteEndereco(e.target.value)}
                      placeholder="Endereço consolidado de entrega..."
                      className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-[#0057ff]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Configuração de Desconto */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDescontoEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHasDescontoEnabled(checked);
                  if (checked && !descontoTexto.trim()) {
                    setDescontoTexto('DESCONTO PARA PAGAMENTO VIA PIX');
                  }
                  if (!checked) {
                    setDescontoInput('0,00');
                  }
                }}
                className="w-4 h-4 rounded text-[#0057ff] focus:ring-blue-500 cursor-pointer"
              />
              <Tag className="w-4 h-4 text-[#0057ff]" />
              <span>Adicionar Desconto</span>
            </label>

            {hasDescontoEnabled && (
              <div className="space-y-3 pt-1">
                {/* 1. Valor do desconto (R$ ou %) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700">
                      Valor do desconto ({descontoTipo === 'reais' ? 'R$' : '%'})
                    </label>
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo('reais')}
                        className={`px-2.5 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          descontoTipo === 'reais'
                            ? 'bg-[#0057ff] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        R$
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescontoTipo('percent')}
                        className={`px-2.5 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                          descontoTipo === 'percent'
                            ? 'bg-[#0057ff] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={descontoInput || ''}
                    onChange={(e) => setDescontoInput(e.target.value)}
                    placeholder={descontoTipo === 'reais' ? '0,00' : '0'}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-[#0057ff]"
                  />
                </div>

                {/* 2. Texto do desconto */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Texto do desconto
                  </label>
                  <input
                    type="text"
                    value={descontoTexto}
                    onChange={(e) => setDescontoTexto(e.target.value)}
                    placeholder="DESCONTO PARA PAGAMENTO VIA PIX"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-[#0057ff]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumo Consolidado */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs text-slate-600">
            {hasDescontoEnabled && descontoValor > 0 && (
              <div>
                Desconto ({descontoTexto || 'Desconto aplicado'}):{' '}
                <strong className="text-emerald-600">
                  - R$ {formatPriceToBrl(descontoValor)}
                </strong>
              </div>
            )}
            {hasFreteEnabled && (
              <div>
                Frete:{' '}
                <strong>
                  R$ {formatPriceToBrl(freteValor)}
                </strong>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase">
              Valor Final Consolidado:
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#003865]">
              {totalFinal.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 6. ESPELHO OFICIAL DO ORÇAMENTO (FIDELIDADE MÁXIMA) */}
      {/* ======================================================== */}
      <section className="space-y-3">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center font-bold text-sm">
              6
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#091122]">
                Espelho Oficial do Orçamento
              </h2>
              <p className="text-xs text-slate-500">
                Modelo visual definitivo com reprodução fiel aprovada
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Botão Tema diretamente na seção Espelho Oficial do Orçamento */}
            <EspelhoThemeSelector
              selectedThemeId={localEspelhoThemeId}
              effectiveThemeId={effectiveEspelhoThemeId}
              selectedVariant={localEspelhoVariant}
              effectiveVariant={effectiveEspelhoVariant}
              customTheme={activeBudgetThemeSnapshot.state.customTheme}
              onSelectTheme={(id, variant) => {
                setLocalEspelhoThemeId(id);
                setLocalEspelhoVariant(variant ?? null);
              }}
            />

            <button
              type="button"
              role="switch"
              aria-checked={exibirQuantidade}
              onClick={() => {
                const nextVal = !exibirQuantidade;
                setExibirQuantidade(nextVal);
                const existingId = initialOrcamento?.id || persistedOrcIdRef.current;
                if (existingId) {
                  try {
                    const nowIso = new Date().toISOString();
                    const historyList = getLocalCollectionSafe<SavedOrcamento>('fenix_orcamentos_history', []);
                    let updatedRecord: SavedOrcamento | null = null;
                    if (historyList.some((o) => o.id === existingId)) {
                      const nextHist = historyList.map((o) => {
                        if (o.id === existingId) {
                          updatedRecord = { ...o, exibirQuantidade: nextVal, updatedAt: nowIso };
                          return updatedRecord;
                        }
                        return o;
                      });
                      setLocalCollectionSafe('fenix_orcamentos_history', nextHist);
                    }
                    const savedList = getLocalCollectionSafe<SavedOrcamento>('fenix_saved_orcamentos', []);
                    if (savedList.some((o) => o.id === existingId)) {
                      const nextSaved = savedList.map((o) => {
                        if (o.id === existingId) {
                          const rec = { ...o, exibirQuantidade: nextVal, updatedAt: nowIso };
                          if (!updatedRecord) updatedRecord = rec;
                          return rec;
                        }
                        return o;
                      });
                      setLocalCollectionSafe('fenix_saved_orcamentos', nextSaved);
                    }
                    if (updatedRecord) {
                      window.dispatchEvent(new Event('fenix_orcamentos_updated'));
                      saveItemToSupabase('fenix_orcamentos_history', updatedRecord, 'id', currentUserName || consultoraName).catch(() => {});
                      saveItemToSupabase('fenix_saved_orcamentos', updatedRecord, 'id', currentUserName || consultoraName).catch(() => {});
                    }
                  } catch {}
                }
              }}
              className="inline-flex items-center gap-2.5 cursor-pointer select-none focus:outline-none"
            >
              <span className="text-xs sm:text-sm font-semibold text-slate-700">
                Exibir quantidade
              </span>
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  exibirQuantidade ? 'bg-[#0057ff]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
                    exibirQuantidade ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* The Exact Visual Mirror Component - Strict Landscape Format Preserved */}
        <div className="space-y-2">
          <div className="no-print sm:hidden flex items-center justify-between text-[11px] text-slate-500 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
            <span>📄 Arraste para o lado para ver o espelho oficial completo</span>
          </div>

          <div
            id="espelho-oficial-orcamento-wrapper"
            className="w-full overflow-x-auto pb-4 rounded-2xl bg-slate-100/50 p-2 sm:p-4 border border-slate-200/80 flex justify-center"
          >
            <EspelhoOrcamento
              id="espelho-oficial-orcamento"
              clientName={clientName}
              clientType={clientType}
              clientContact={clientContact}
              consultoraName={consultoraName}
              dataOrcamento={dataOrcamento}
              observacoes={observacoes}
              observacoesRodape={observacoesRodape}
              items={items}
              freteValor={hasFreteEnabled ? freteValor : 0}
              freteEndereco={hasFreteEnabled ? freteEndereco : ''}
              subtotal={subtotal}
              descontoValor={hasDescontoEnabled && descontoValor > 0 ? descontoValor : undefined}
              descontoTexto={hasDescontoEnabled && descontoValor > 0 ? (descontoTexto || 'DESCONTO PARA PAGAMENTO VIA PIX') : undefined}
              totalFinal={totalFinal}
              exibirQuantidade={exibirQuantidade}
              previewThemeId={localEspelhoThemeId ?? undefined}
              previewCustomTheme={activeBudgetThemeSnapshot.state.customTheme}
              previewDecorated={effectiveEspelhoVariant === 'decorado'}
            />
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* 7. AÇÕES FINAIS: VISUALIZAÇÃO = IMAGEM = PDF = IMPRESSÃO */}
      {/* ======================================================== */}
      <section className="no-print bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Espelho Oficial Fênix World:</strong> visualização, imagem, PDF e impressão utilizam rigorosamente o mesmo modelo.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end">
            {/* Baixar Orçamento como PDF */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handleDownloadPdf}
              className="h-11 px-4 sm:px-5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Salvar e baixar orçamento como documento PDF oficial"
            >
              {activeActionType === 'pdf' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                {activeActionType === 'pdf'
                  ? isExporting
                    ? 'Gerando PDF...'
                    : 'Salvando...'
                  : 'Baixar PDF'}
              </span>
            </button>

            {/* Baixar Orçamento como Imagem (salva, pergunta se deseja duplicar e baixa a imagem) */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handleDownloadImage}
              className="h-11 px-4 sm:px-5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#0057ff] font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Salvar alterações, confirmar duplicação e baixar imagem do orçamento"
            >
              {activeActionType === 'image' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {activeActionType === 'image'
                  ? isSaving
                    ? 'Salvando...'
                    : 'Baixando...'
                  : 'Baixar Imagem'}
              </span>
            </button>

            {/* Imprimir Orçamento */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handlePrintPdf}
              className="h-11 px-4 sm:px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Salvar e imprimir orçamento no formato oficial A4 paisagem"
            >
              {activeActionType === 'print' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>{activeActionType === 'print' ? 'Salvando...' : 'Imprimir'}</span>
            </button>

            {/* Copiar Imagem do Espelho (cópia imediata para WhatsApp Ctrl+V) */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handleCopyImageFromEditor}
              className={`h-11 px-4 sm:px-5 rounded-xl border font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs ${
                imageCopiedBadge
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
              }`}
              title="Copiar imagem completa do orçamento para colar no WhatsApp (Ctrl+V)"
            >
              {activeActionType === 'copy_image' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : imageCopiedBadge ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{imageCopiedBadge ? 'Imagem copiada!' : 'Copiar Imagem'}</span>
            </button>

            {/* Enviar pelo WhatsApp */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handleSendWhatsApp}
              className="h-11 px-4 sm:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {activeActionType === 'whatsapp' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
              <span>{activeActionType === 'whatsapp' ? 'Salvando...' : 'Enviar WhatsApp'}</span>
            </button>

            {/* Cancelar / Voltar para a tela anterior (não salva nem abre duplicação) */}
            <button
              type="button"
              onClick={onBackToList || onBackToCadastro}
              className="h-11 px-4 sm:px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
              title="Cancelar e retornar para a tela anterior"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancelar</span>
            </button>

            {/* Salvar Orçamento */}
            <button
              type="button"
              disabled={isSaving || isExporting || activeActionType !== null}
              onClick={handleSaveOrcamento}
              className="h-11 px-6 sm:px-7 rounded-xl bg-[#0057ff] hover:bg-[#0047db] text-white font-bold text-xs sm:text-sm tracking-wide flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-80"
            >
              {activeActionType === 'save' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{activeActionType === 'save' ? 'Salvando...' : 'Salvar Orçamento'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Modal de Seleção de Produtos do Catálogo */}
      <ProductSelectionModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        clientType={clientType || 'Cliente Geral'}
        priceTable={priceTable}
        onSelectProduct={handleSelectProductFromModal}
        onOpenCadastrarNovoProduto={(initialTerm) => {
          setIsProductModalOpen(false);
          setCadastrarInitialName(initialTerm || '');
          setIsCadastrarProdutoModalOpen(true);
        }}
      />

      {/* Modal de Cadastro de Novo Produto no Catálogo e Orçamento */}
      <ModalCadastrarNovoProdutoOrcamento
        isOpen={isCadastrarProdutoModalOpen}
        onClose={() => setIsCadastrarProdutoModalOpen(false)}
        onSuccess={handleCadastrarProdutoSuccess}
        currentUserName={currentUserName}
        initialName={cadastrarInitialName}
        priceTableTier={priceTable}
      />

      {/* Modal de Confirmação de Insumos para Piso Vinílico Colado */}
      <ModalIncluirInsumosPiso
        isOpen={Boolean(pendingPisoPrompt)}
        plan={pendingPisoPrompt?.plan || null}
        onCancel={() => setPendingPisoPrompt(null)}
        onConfirmPisoOnly={() => commitPisoPrompt(false)}
        onConfirmWithInsumos={() => commitPisoPrompt(true)}
      />

      {/* Modal de Confirmação de Insumos para Rodapé */}
      <ModalIncluirInsumosRodape
        isOpen={Boolean(pendingRodapePrompt)}
        plan={pendingRodapePrompt?.plan || null}
        hidePrices={Boolean(pendingRodapePrompt?.preserveQuickTab)}
        onCancel={() => setPendingRodapePrompt(null)}
        onConfirmRodapeOnly={() => commitRodapePrompt(null)}
        onConfirmWithInsumos={(selection) => commitRodapePrompt(selection)}
      />

      {/* Modal Sequencial de Configuração do Orçamento Rápido */}
      {quickWizardMeasurements && (
        <ModalConfiguracaoOrcamentoRapido
          isOpen={quickWizardOpen}
          steps={quickWizardSteps}
          measurements={quickWizardMeasurements}
          initialConfig={quickWizardConfig}
          priceTable={priceTable}
          catalog={dynamicCatalog}
          onClose={() => setQuickWizardOpen(false)}
          onConfirm={handleConfirmQuickWizard}
        />
      )}

      {/* 1. JANELA — ORÇAMENTO SALVO (aparece SOMENTE após confirmação do Supabase + ação) */}
      {postSaveDecisionOrcamento && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Cabeçalho Azul-Marinho Fênix World */}
            <div className="bg-[#001d4a] text-white px-5 py-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-extrabold tracking-tight text-white">
                Orçamento Salvo
              </h3>
              <button
                type="button"
                disabled={isFinalizing || isPreparingDuplicate}
                onClick={handleDismissDecisionModal}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Ícone verde de confirmação */}
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-2xl bg-[#d1fae5] text-[#10b981] flex items-center justify-center shadow-2xs">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
              </div>

              {/* Quadro com Cliente e Novo orçamento editável */}
              <div className="p-4 rounded-xl bg-[#f4f8ff] border border-[#dce8fa] space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-32 flex-shrink-0 font-bold text-slate-900">
                    Cliente:
                  </span>
                  <span className="font-medium text-slate-800 truncate">
                    {postSaveDecisionOrcamento.clientName}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label
                    htmlFor="decision-orcamento-nome"
                    className="w-32 flex-shrink-0 font-bold text-slate-900"
                  >
                    Novo orçamento:
                  </label>
                  <div className="relative flex-1 min-w-0">
                    <input
                      id="decision-orcamento-nome"
                      ref={decisionBudgetInputRef}
                      type="text"
                      value={decisionBudgetName}
                      disabled={isFinalizing || isPreparingDuplicate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDecisionBudgetName(val);
                        setNomeOrcamento(val);
                        if (finalizeError) setFinalizeError(null);
                      }}
                      placeholder="Orçamento de Materiais"
                      className="w-full h-10 pl-3 pr-9 rounded-lg border border-blue-400 bg-white text-sm font-medium text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={isFinalizing || isPreparingDuplicate}
                      onClick={() => decisionBudgetInputRef.current?.focus()}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#0057ff] hover:text-[#0047db] cursor-pointer disabled:opacity-50"
                      title="Editar nome do orçamento"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {finalizeError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 text-left">
                  {finalizeError}
                </div>
              )}

              {/* Botões DUPLICAR ORÇAMENTO e FINALIZAR */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isFinalizing || isPreparingDuplicate}
                  onClick={handleChooseDuplicateOption}
                  className="w-full h-11 px-4 rounded-xl bg-[#0057ff] hover:bg-[#0047db] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isPreparingDuplicate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>
                    {isPreparingDuplicate ? 'Salvando...' : 'DUPLICAR ORÇAMENTO'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isFinalizing || isPreparingDuplicate}
                  onClick={handleFinalizeDecisionModal}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isFinalizing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                  )}
                  <span>{isFinalizing ? 'Salvando...' : 'FINALIZAR'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. JANELA — NOVO ORÇAMENTO PARA O CLIENTE */}
      {isDuplicateModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[460px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Cabeçalho Azul-Marinho Fênix World */}
            <div className="bg-[#001d4a] text-white px-5 py-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-extrabold tracking-tight text-white">
                Novo Orçamento para o Cliente
              </h3>
              <button
                type="button"
                disabled={isCreatingDuplicate}
                onClick={handleCancelDuplicateModal}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmCreateDuplicatedOrcamento}
              noValidate
              className="p-6 space-y-5"
            >
              {/* Dados mantidos: Cliente, Contato e Consultora responsável */}
              <div className="p-4 rounded-xl bg-[#f4f8ff] border border-[#dce8fa] space-y-1.5 text-sm text-slate-800">
                <div>
                  <span className="font-bold text-slate-900">Cliente:</span>{' '}
                  <span>{currentClient?.name || clientName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">Contato:</span>{' '}
                  <span>
                    {clientContact ||
                      currentClient?.whatsapp ||
                      (currentClient as any)?.phone ||
                      '—'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">
                    Consultora responsável:
                  </span>{' '}
                  <span>{consultoraName}</span>
                </div>
              </div>

              {/* Campo único obrigatório com valor padrão "Orçamento de Materiais" */}
              <div className="space-y-1.5">
                <label
                  htmlFor="duplicate-orcamento-nome"
                  className="block text-sm font-bold text-slate-900"
                >
                  Nome do novo orçamento <span className="text-rose-500">*</span>
                </label>
                <input
                  id="duplicate-orcamento-nome"
                  type="text"
                  autoFocus
                  value={duplicateBudgetName}
                  disabled={isCreatingDuplicate}
                  onChange={(e) => {
                    setDuplicateBudgetName(e.target.value);
                    if (duplicateNameError) setDuplicateNameError('');
                  }}
                  placeholder="Orçamento de Materiais"
                  className="w-full h-11 px-3.5 rounded-xl border border-blue-400 bg-white text-sm font-medium text-slate-900 outline-none focus:border-[#0057ff] focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
                />
                {duplicateNameError && (
                  <p className="text-xs font-bold text-rose-600">
                    {duplicateNameError}
                  </p>
                )}
              </div>

              {/* Botões CANCELAR e CRIAR NOVO ORÇAMENTO */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  disabled={isCreatingDuplicate}
                  onClick={handleCancelDuplicateModal}
                  className="h-11 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDuplicate}
                  className="h-11 px-5 rounded-xl bg-[#0057ff] hover:bg-[#0047db] text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isCreatingDuplicate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span>
                    {isCreatingDuplicate
                      ? 'Criando...'
                      : 'CRIAR NOVO ORÇAMENTO'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
