import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Search,
  Pencil,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  Plus,
  Trash2,
  Tag,
  Sparkles,
  AlertTriangle,
  FolderEdit,
  Palette,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { PriceTableTier } from '../types';
import {
  saveItemToSupabase,
  saveBatchItemsToSupabase,
  deleteItemFromSupabase,
  deleteBatchItemsFromSupabase,
  saveCollectionOrderToSupabase,
  getSupabaseClient,
  fetchSupabaseKeysIndividually,
  getLocalCollectionSafe,
  getLocalRawSafe,
  setLocalCollectionSafe,
  getDeletedIdsForCollection,
  isItemTombstoned,
  mergeDeletionTombstoneMaps,
  safeMergeLists,
  deduplicateListById,
  DELETED_RECORDS_STORAGE_KEY,
} from '../utils/supabaseClient';
import {
  saveProductCostToSupabase,
  getLocalProductCosts,
  mergeProductCosts,
  KEY_PRODUCT_COSTS_DB,
  EVENT_PRODUCT_COSTS_UPDATED,
  ProductCostsMap,
} from '../utils/productCostsService';
import {
  detectSearchCategoryIntent,
  filterCatalogProducts,
  invalidateProductCatalogCache,
  normalizeSearchText,
} from '../data/productCatalog';
import {
  getPendingSyncRecords,
  isEmergencyOfflineMode,
  isRecordPendingSync,
  subscribePendingSync,
  SHOW_OFFLINE_SYNC_INDICATORS,
} from '../utils/indexedDbOfflineStore';
import {
  getCalcRuleShortLabel,
  inferDefaultCalcRuleForGroup,
  PRODUCT_CALC_RULE_OPTIONS,
  ProductCalcRule,
  VALID_PRODUCT_CALC_RULES,
} from '../utils/productCalcRules';

export interface ProductGroup {
  id: string;
  name: string;
  categoryId: string;
  categoryIds?: string[];
  color: string;
  calcRule?: ProductCalcRule;
}

export interface ProductCategory {
  id: string;
  name: string;
}

function getGroupCategoryIds(g: ProductGroup): string[] {
  return Array.from(
    new Set(
      [g.categoryId, ...(Array.isArray(g.categoryIds) ? g.categoryIds : [])].filter(
        Boolean
      )
    )
  );
}

function groupBelongsToCategory(g: ProductGroup, catId: string): boolean {
  return getGroupCategoryIds(g).includes(catId);
}

function resolveGroupRuleDisplay(
  g: ProductGroup,
  cat?: ProductCategory | null
): ProductCalcRule {
  if (g.calcRule && VALID_PRODUCT_CALC_RULES.has(g.calcRule)) {
    return g.calcRule;
  }
  return inferDefaultCalcRuleForGroup(g.name, cat?.name, g.categoryId);
}

export interface GroupProductItem {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  groupId: string;
  groupName?: string;
  unit: string;
  priceClienteFinal: number;
  priceRevenda: number;
  priceConstrutora: number;
  custo?: number; // Campo Custo (salvo separadamente dos preços de venda, visão exclusiva da Diretoria)
  price?: number;
  active?: boolean;
  description?: string;
  details?: string;
}

import {
  INITIAL_PRODUCT_CATEGORIES,
  INITIAL_PRODUCT_GROUPS,
  INITIAL_PRODUCT_ITEMS,
} from '../data/initialProductsSeed';

const DEFAULT_CATEGORIES: ProductCategory[] = INITIAL_PRODUCT_CATEGORIES;
const DEFAULT_GROUPS: ProductGroup[] = INITIAL_PRODUCT_GROUPS;
const DEFAULT_PRODUCTS: GroupProductItem[] = INITIAL_PRODUCT_ITEMS;

const PRESET_COLORS = [
  { name: 'Vermelho', hex: '#dc2626' },
  { name: 'Vinho', hex: '#9f1239' },
  { name: 'Azul Royal', hex: '#0057ff' },
  { name: 'Azul Escuro', hex: '#071a52' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Verde Floresta', hex: '#047857' },
  { name: 'Laranja', hex: '#ea580c' },
  { name: 'Âmbar', hex: '#d97706' },
  { name: 'Roxo', hex: '#7c3aed' },
  { name: 'Violeta', hex: '#6d28d9' },
  { name: 'Turquesa', hex: '#0891b2' },
  { name: 'Grafite', hex: '#334155' },
];

/**
 * Calculates contrasting colors to guarantee that the group text
 * and edit buttons are always crisp and clearly legible.
 */
function getContrastStyles(hexColor: string) {
  let c = (hexColor || '#0057ff').replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (luminance > 0.65) {
    // Light background
    return {
      textColor: '#091122',
      badgeBg: 'rgba(9, 17, 34, 0.12)',
      buttonBg: 'rgba(9, 17, 34, 0.08)',
      buttonHoverBg: 'rgba(9, 17, 34, 0.16)',
      buttonBorder: 'rgba(9, 17, 34, 0.18)',
    };
  } else {
    // Dark or vibrant background
    return {
      textColor: '#ffffff',
      badgeBg: 'rgba(255, 255, 255, 0.18)',
      buttonBg: 'rgba(255, 255, 255, 0.15)',
      buttonHoverBg: 'rgba(255, 255, 255, 0.25)',
      buttonBorder: 'rgba(255, 255, 255, 0.25)',
    };
  }
}

function normalizeProductItemPrices(item: any): GroupProductItem {
  const hasCF = item.priceClienteFinal !== undefined && item.priceClienteFinal !== null;
  const base = Number(hasCF ? item.priceClienteFinal : (item.price ?? 89.90));
  const safeBase = isNaN(base) ? 89.90 : base;
  const hasRev = item.priceRevenda !== undefined && item.priceRevenda !== null;
  const hasCons = item.priceConstrutora !== undefined && item.priceConstrutora !== null;
  return {
    ...item,
    priceClienteFinal: hasCF ? Number(item.priceClienteFinal) : safeBase,
    priceRevenda: hasRev
      ? Number(item.priceRevenda)
      : Math.round(safeBase * 0.82 * 100) / 100,
    priceConstrutora: hasCons
      ? Number(item.priceConstrutora)
      : Math.round(safeBase * 0.90 * 100) / 100,
  };
}

function readLocalCatalogFallback(currentUserName?: string): {
  categories: ProductCategory[];
  groups: ProductGroup[];
  products: GroupProductItem[];
} {
  let cats: ProductCategory[] = DEFAULT_CATEGORIES;
  try {
    const deletedMap = getDeletedIdsForCollection('fenix_product_categories_data');
    const raw = getLocalRawSafe('fenix_product_categories_data');
    const source = raw !== null
      ? getLocalCollectionSafe<ProductCategory>('fenix_product_categories_data', [])
      : DEFAULT_CATEGORIES;
    cats = deduplicateListById(
      source.filter((c) => !isItemTombstoned('fenix_product_categories_data', c, 'id', deletedMap)),
      'id'
    );
  } catch (e) {
    console.error('Failed to load stored categories', e);
  }

  let grps: ProductGroup[] = DEFAULT_GROUPS;
  try {
    const deletedMap = getDeletedIdsForCollection('fenix_product_groups_data');
    const raw = getLocalRawSafe('fenix_product_groups_data');
    const source = raw !== null
      ? getLocalCollectionSafe<ProductGroup>('fenix_product_groups_data', [])
      : DEFAULT_GROUPS;
    grps = deduplicateListById(
      source.filter((g) => !isItemTombstoned('fenix_product_groups_data', g, 'id', deletedMap)),
      'id'
    );
  } catch (e) {
    console.error('Failed to load stored product groups', e);
  }

  let prods: GroupProductItem[] = mergeProductCosts(DEFAULT_PRODUCTS, undefined, currentUserName);
  try {
    const deletedMap = getDeletedIdsForCollection('fenix_product_items_data');
    const raw = getLocalRawSafe('fenix_product_items_data');
    const source = raw !== null
      ? getLocalCollectionSafe<any>('fenix_product_items_data', [])
      : DEFAULT_PRODUCTS;
    const itemsWithPrices = deduplicateListById(
      source
        .filter((item) => !isItemTombstoned('fenix_product_items_data', item, 'id', deletedMap))
        .map(normalizeProductItemPrices),
      'id'
    );
    prods = mergeProductCosts(itemsWithPrices, undefined, currentUserName);
  } catch (e) {
    console.error('Failed to load stored product items', e);
  }

  return { categories: cats, groups: grps, products: prods };
}

interface ProdutosScreenProps {
  currentUserName?: string;
}

export const ProdutosScreen: React.FC<ProdutosScreenProps> = ({ currentUserName }) => {
  const isDirector = (currentUserName || '').toLowerCase().includes('eder');
  const shouldFetchRemoteOnMount =
    typeof window !== 'undefined' && !isEmergencyOfflineMode() && Boolean(getSupabaseClient());

  const initialFallbackRef = useRef<{
    categories: ProductCategory[];
    groups: ProductGroup[];
    products: GroupProductItem[];
  } | null>(null);
  if (!shouldFetchRemoteOnMount && initialFallbackRef.current === null) {
    initialFallbackRef.current = readLocalCatalogFallback(currentUserName);
  }

  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(shouldFetchRemoteOnMount);

  const [categories, setCategories] = useState<ProductCategory[]>(() =>
    shouldFetchRemoteOnMount ? [] : (initialFallbackRef.current?.categories ?? DEFAULT_CATEGORIES)
  );

  const [groups, setGroups] = useState<ProductGroup[]>(() =>
    shouldFetchRemoteOnMount ? [] : (initialFallbackRef.current?.groups ?? DEFAULT_GROUPS)
  );

  const [products, setProducts] = useState<GroupProductItem[]>(() =>
    shouldFetchRemoteOnMount ? [] : (initialFallbackRef.current?.products ?? DEFAULT_PRODUCTS)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [priceViewFilter, setPriceViewFilter] = useState<'all' | PriceTableTier>('all');
  
  // Categorias expandidas (padrão: abertas, mas recolhíveis ao clicar na seta ou cabeçalho)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('fenix_expanded_categories_data');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // ignore
    }
    const initial: Record<string, boolean> = {};
    INITIAL_PRODUCT_CATEGORIES.forEach((c) => {
      initial[c.id] = true;
    });
    return initial;
  });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      grp_flexfloor_piso: true,
      grp_vinilforte_piso: true,
    };
    INITIAL_PRODUCT_CATEGORIES.forEach((c) => {
      initial[`sem_grupo_${c.id}`] = true;
    });
    return initial;
  });

  // Central Modals: Editar Categoria & Editar Grupo
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [inlineEditingCatId, setInlineEditingCatId] = useState<string | null>(null);
  const [inlineEditingCatName, setInlineEditingCatName] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');

  const [isManageGroupsOpen, setIsManageGroupsOpen] = useState(false);
  const [groupFilterCategory, setGroupFilterCategory] = useState('all');
  const [isAddingNewGroupInModal, setIsAddingNewGroupInModal] = useState(false);
  const [newGroupCategoryId, setNewGroupCategoryId] = useState('');

  // Modal State for Editing Group
  const [editingGroup, setEditingGroup] = useState<ProductGroup | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupColor, setEditGroupColor] = useState('#dc2626');
  const [editGroupCategoryId, setEditGroupCategoryId] = useState('');
  const [editGroupExtraCategoryIds, setEditGroupExtraCategoryIds] = useState<string[]>([]);
  const [editGroupCalcRule, setEditGroupCalcRule] = useState<ProductCalcRule>('padrao');
  const [editGroupCalcRuleManual, setEditGroupCalcRuleManual] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<ProductGroup | null>(null);

  // Modal State for Adding New Group
  const [addingGroupToCategoryId, setAddingGroupToCategoryId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#0057ff');
  const [newGroupExtraCategoryIds, setNewGroupExtraCategoryIds] = useState<string[]>([]);
  const [newGroupCalcRule, setNewGroupCalcRule] = useState<ProductCalcRule>('padrao');
  const [newGroupCalcRuleManual, setNewGroupCalcRuleManual] = useState(false);

  // Modal State for Category Edit, Delete & Add
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<ProductCategory | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Modal State for Editing Product Prices
  const [editingProduct, setEditingProduct] = useState<GroupProductItem | null>(null);
  const [prodEditName, setProdEditName] = useState('');
  const [prodEditDescription, setProdEditDescription] = useState('');
  const [prodEditDetails, setProdEditDetails] = useState('');
  const [prodEditUnit, setProdEditUnit] = useState('m²');
  const [prodEditCategoryId, setProdEditCategoryId] = useState('');
  const [prodEditGroupId, setProdEditGroupId] = useState('');
  const [prodEditClienteFinal, setProdEditClienteFinal] = useState('');
  const [prodEditRevenda, setProdEditRevenda] = useState('');
  const [prodEditConstrutora, setProdEditConstrutora] = useState('');
  const [prodEditCusto, setProdEditCusto] = useState('');

  // Modal State for Adding New Product
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [addingProductToGroupId, setAddingProductToGroupId] = useState<string>('sem_grupo');
  const [addingProductToCategoryId, setAddingProductToCategoryId] = useState<string>('');
  const [newProdName, setNewProdName] = useState('');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdDetails, setNewProdDetails] = useState('');
  const [newProdUnit, setNewProdUnit] = useState('m²');
  const [newProdClienteFinal, setNewProdClienteFinal] = useState('');
  const [newProdRevenda, setNewProdRevenda] = useState('');
  const [newProdConstrutora, setNewProdConstrutora] = useState('');
  const [newProdCusto, setNewProdCusto] = useState('');

  // Modal State for Deleting Product
  const [productToDelete, setProductToDelete] = useState<GroupProductItem | null>(null);

  const isLoadedRef = useRef(!shouldFetchRemoteOnMount);
  const isSavingProductRef = useRef(false);

  const [isSavingCatalogAction, setIsSavingCatalogAction] = useState(false);
  const [catalogActionError, setCatalogActionError] = useState<string | null>(null);
  const [pendingSyncTick, setPendingSyncTick] = useState(0);

  useEffect(() => subscribePendingSync(() => setPendingSyncTick((t) => t + 1)), []);

  // Read authoritative catalog directly from Supabase before rendering products (no stale-data flash or duplicate queries)
  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    if (client && !isEmergencyOfflineMode()) {
      const keysToFetch = [
        DELETED_RECORDS_STORAGE_KEY,
        'fenix_product_items_data',
        'fenix_product_categories_data',
        'fenix_product_groups_data',
        ...(isDirector ? [KEY_PRODUCT_COSTS_DB] : []),
      ];

      fetchSupabaseKeysIndividually(keysToFetch, 25000, { maxCacheAgeMs: 2500 })
        .then(({ rows, succeededKeys }) => {
          if (!active || isSavingProductRef.current) return;

          const remoteTombstones = rows.get(DELETED_RECORDS_STORAGE_KEY);
          if (remoteTombstones && typeof remoteTombstones === 'object' && !Array.isArray(remoteTombstones)) {
            const mergedMap = mergeDeletionTombstoneMaps(
              remoteTombstones,
              (() => {
                try {
                  const r = getLocalRawSafe(DELETED_RECORDS_STORAGE_KEY);
                  return r ? JSON.parse(r) : {};
                } catch {
                  return {};
                }
              })()
            );
            const serializedTombstones = JSON.stringify(mergedMap);
            if (getLocalRawSafe(DELETED_RECORDS_STORAGE_KEY) !== serializedTombstones) {
              setLocalCollectionSafe(DELETED_RECORDS_STORAGE_KEY, mergedMap);
            }
          }

          let costsDb: ProductCostsMap = {};
          if (isDirector) {
            const localCosts = getLocalProductCosts(currentUserName);
            const remoteCosts = rows.get(KEY_PRODUCT_COSTS_DB);
            if (
              succeededKeys.has(KEY_PRODUCT_COSTS_DB) &&
              remoteCosts &&
              typeof remoteCosts === 'object' &&
              !Array.isArray(remoteCosts)
            ) {
              const mergedCosts: ProductCostsMap = { ...localCosts };
              for (const [pId, val] of Object.entries(remoteCosts)) {
                const numVal = Number(val);
                if (!isNaN(numVal) && numVal > 0) {
                  mergedCosts[pId] = Number(numVal.toFixed(2));
                }
              }
              const serializedCosts = JSON.stringify(mergedCosts);
              if (getLocalRawSafe(KEY_PRODUCT_COSTS_DB) !== serializedCosts) {
                setLocalCollectionSafe(KEY_PRODUCT_COSTS_DB, mergedCosts);
              }
              costsDb = mergedCosts;
            } else {
              costsDb = localCosts;
            }
          }

          const allPending = getPendingSyncRecords();

          const mergeRemoteCollection = <T extends { id?: string }>(
            collectionKey: string,
            remoteArr: T[]
          ): T[] => {
            const deletedMap = getDeletedIdsForCollection(collectionKey);
            const cleanRemote = deduplicateListById(
              remoteArr.filter((it) => !isItemTombstoned(collectionKey, it, 'id', deletedMap)),
              'id'
            );
            const localArr = deduplicateListById(
              getLocalCollectionSafe<T>(collectionKey, []).filter(
                (it) => !isItemTombstoned(collectionKey, it, 'id', deletedMap)
              ),
              'id'
            );
            const keyPending = allPending.filter((r) => r.collectionKey === collectionKey);
            const pendingUpserts = keyPending
              .filter((r) => r.op === 'upsert' && r.item)
              .map((r) => r.item as T);
            const pendingDeletes = new Set(
              keyPending.filter((r) => r.op === 'delete').map((r) => r.itemId)
            );
            const hasCollectionPending = keyPending.some((r) => r.op === 'collection');

            let result: T[] = cleanRemote;
            if (cleanRemote.length === 0 && localArr.length > 0 && pendingDeletes.size === 0 && deletedMap.size === 0) {
              result = localArr;
            } else if (hasCollectionPending && localArr.length > 0) {
              result = safeMergeLists(cleanRemote, localArr, 'id', deletedMap);
            } else if (pendingUpserts.length > 0) {
              result = safeMergeLists(cleanRemote, pendingUpserts, 'id', deletedMap);
            }

            if (pendingDeletes.size > 0) {
              result = result.filter((it: any) => !pendingDeletes.has(String(it?.id ?? '').trim()));
            }
            return deduplicateListById(result, 'id');
          };

          const fallback = readLocalCatalogFallback(currentUserName);

          const remoteProds = rows.get('fenix_product_items_data');
          if (succeededKeys.has('fenix_product_items_data') && Array.isArray(remoteProds)) {
            const mergedRemoteProds = mergeRemoteCollection<GroupProductItem>(
              'fenix_product_items_data',
              remoteProds
            ).map(normalizeProductItemPrices);
            const merged = deduplicateListById(
              mergeProductCosts(mergedRemoteProds, costsDb, currentUserName),
              'id'
            );
            setProducts(merged);
            const serialized = JSON.stringify(merged);
            if (getLocalRawSafe('fenix_product_items_data') !== serialized) {
              setLocalCollectionSafe('fenix_product_items_data', merged);
            }
          } else {
            setProducts(fallback.products);
          }

          const remoteCats = rows.get('fenix_product_categories_data');
          if (succeededKeys.has('fenix_product_categories_data') && Array.isArray(remoteCats)) {
            const mergedCats = mergeRemoteCollection<ProductCategory>(
              'fenix_product_categories_data',
              remoteCats
            );
            setCategories(mergedCats);
            const serialized = JSON.stringify(mergedCats);
            if (getLocalRawSafe('fenix_product_categories_data') !== serialized) {
              setLocalCollectionSafe('fenix_product_categories_data', mergedCats);
            }
          } else {
            setCategories(fallback.categories);
          }

          const remoteGroups = rows.get('fenix_product_groups_data');
          if (succeededKeys.has('fenix_product_groups_data') && Array.isArray(remoteGroups)) {
            const mergedGroups = mergeRemoteCollection<ProductGroup>(
              'fenix_product_groups_data',
              remoteGroups
            );
            setGroups(mergedGroups);
            const serialized = JSON.stringify(mergedGroups);
            if (getLocalRawSafe('fenix_product_groups_data') !== serialized) {
              setLocalCollectionSafe('fenix_product_groups_data', mergedGroups);
            }
          } else {
            setGroups(fallback.groups);
          }

          invalidateProductCatalogCache();
          isLoadedRef.current = true;
          setIsLoadingCatalog(false);
        })
        .catch(() => {
          if (!active) return;
          const fallback = readLocalCatalogFallback(currentUserName);
          setCategories(fallback.categories);
          setGroups(fallback.groups);
          setProducts(fallback.products);
          isLoadedRef.current = true;
          setIsLoadingCatalog(false);
        });
    } else {
      const fallback = readLocalCatalogFallback(currentUserName);
      setCategories(fallback.categories);
      setGroups(fallback.groups);
      setProducts(fallback.products);
      isLoadedRef.current = true;
      setIsLoadingCatalog(false);
    }
    return () => {
      active = false;
    };
  }, [currentUserName, isDirector]);

  // Listen to remote updates from Supabase sync (debounced and guarded against initial load / editing flicker)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleProductsUpdated = (event?: Event) => {
      if (!isLoadedRef.current || isSavingProductRef.current) return;
      if (
        typeof StorageEvent !== 'undefined' &&
        event instanceof StorageEvent &&
        event.key &&
        !event.key.includes('product') &&
        event.key !== DELETED_RECORDS_STORAGE_KEY
      ) {
        return;
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!isLoadedRef.current || isSavingProductRef.current) return;
        try {
          if (getLocalRawSafe('fenix_product_items_data') !== null) {
            const delProds = getDeletedIdsForCollection('fenix_product_items_data');
            const parsedProds = deduplicateListById(
              getLocalCollectionSafe<GroupProductItem>('fenix_product_items_data', [])
                .filter((p) => !isItemTombstoned('fenix_product_items_data', p, 'id', delProds))
                .map(normalizeProductItemPrices),
              'id'
            );
            const merged = mergeProductCosts(parsedProds, undefined, currentUserName);
            setProducts((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
              return merged;
            });
          }
          if (getLocalRawSafe('fenix_product_categories_data') !== null) {
            const delCats = getDeletedIdsForCollection('fenix_product_categories_data');
            const parsedCats = deduplicateListById(
              getLocalCollectionSafe<ProductCategory>('fenix_product_categories_data', []).filter(
                (c) => !isItemTombstoned('fenix_product_categories_data', c, 'id', delCats)
              ),
              'id'
            );
            setCategories((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(parsedCats)) return prev;
              return parsedCats;
            });
          }
          if (getLocalRawSafe('fenix_product_groups_data') !== null) {
            const delGrps = getDeletedIdsForCollection('fenix_product_groups_data');
            const parsedGrps = deduplicateListById(
              getLocalCollectionSafe<ProductGroup>('fenix_product_groups_data', []).filter(
                (g) => !isItemTombstoned('fenix_product_groups_data', g, 'id', delGrps)
              ),
              'id'
            );
            setGroups((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(parsedGrps)) return prev;
              return parsedGrps;
            });
          }
          invalidateProductCatalogCache();
        } catch (e) {
          console.warn('Erro ao recarregar produtos atualizados:', e);
        }
      }, 150);
    };

    window.addEventListener('fenix_products_updated', handleProductsUpdated);
    window.addEventListener(EVENT_PRODUCT_COSTS_UPDATED, handleProductsUpdated);
    window.addEventListener('storage', handleProductsUpdated);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('fenix_products_updated', handleProductsUpdated);
      window.removeEventListener(EVENT_PRODUCT_COSTS_UPDATED, handleProductsUpdated);
      window.removeEventListener('storage', handleProductsUpdated);
    };
  }, [currentUserName]);

  // Save expanded categories to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('fenix_expanded_categories_data', JSON.stringify(expandedCategories));
    } catch {}
  }, [expandedCategories]);

  // Toggle Category Expand/Collapse
  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleExpandAllCategories = () => {
    const next: Record<string, boolean> = {};
    categories.forEach((c) => {
      next[c.id] = true;
    });
    setExpandedCategories(next);
  };

  const handleCollapseAllCategories = () => {
    const next: Record<string, boolean> = {};
    categories.forEach((c) => {
      next[c.id] = false;
    });
    setExpandedCategories(next);
  };

  // Move Category Up or Down (persistindo localmente e no Supabase com ordenação preservada)
  const handleMoveCategory = async (catId: string, direction: 'up' | 'down') => {
    const index = categories.findIndex((c) => c.id === catId);
    if (index === -1) return;
    let nextCategories: ProductCategory[] | null = null;
    if (direction === 'up' && index > 0) {
      const copy = [...categories];
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      nextCategories = copy;
    } else if (direction === 'down' && index < categories.length - 1) {
      const copy = [...categories];
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      nextCategories = copy;
    }
    if (!nextCategories) return;

    setCatalogActionError(null);
    isSavingProductRef.current = true;
    try {
      setCategories(nextCategories);
      setLocalCollectionSafe('fenix_product_categories_data', nextCategories);
      invalidateProductCatalogCache();
      const res = await saveCollectionOrderToSupabase(
        'fenix_product_categories_data',
        nextCategories,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(res.error || 'Não foi possível confirmar a reordenação da categoria no servidor.');
      }
    } finally {
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Move Group Up or Down within Category (persistindo localmente e no Supabase)
  const handleMoveGroup = async (groupId: string, direction: 'up' | 'down') => {
    const curGroup = groups.find((g) => g.id === groupId);
    if (!curGroup) return;

    const catGroups = groups.filter((g) => g.categoryId === curGroup.categoryId);
    const idxInCat = catGroups.findIndex((g) => g.id === groupId);
    let nextGroups: ProductGroup[] | null = null;

    if (direction === 'up' && idxInCat > 0) {
      const targetGroup = catGroups[idxInCat - 1];
      const copy = [...groups];
      const idxA = copy.findIndex((g) => g.id === groupId);
      const idxB = copy.findIndex((g) => g.id === targetGroup.id);
      if (idxA !== -1 && idxB !== -1) {
        copy[idxA] = targetGroup;
        copy[idxB] = curGroup;
        nextGroups = copy;
      }
    } else if (direction === 'down' && idxInCat < catGroups.length - 1) {
      const targetGroup = catGroups[idxInCat + 1];
      const copy = [...groups];
      const idxA = copy.findIndex((g) => g.id === groupId);
      const idxB = copy.findIndex((g) => g.id === targetGroup.id);
      if (idxA !== -1 && idxB !== -1) {
        copy[idxA] = targetGroup;
        copy[idxB] = curGroup;
        nextGroups = copy;
      }
    }
    if (!nextGroups) return;

    setCatalogActionError(null);
    isSavingProductRef.current = true;
    try {
      setGroups(nextGroups);
      setLocalCollectionSafe('fenix_product_groups_data', nextGroups);
      invalidateProductCatalogCache();
      const res = await saveCollectionOrderToSupabase(
        'fenix_product_groups_data',
        nextGroups,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(res.error || 'Não foi possível confirmar a reordenação do grupo no servidor.');
      }
    } finally {
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleOpenEditGroup = (group: ProductGroup) => {
    setCatalogActionError(null);
    setEditingGroup(group);
    setEditGroupName(group.name);
    setEditGroupColor(group.color);
    setEditGroupCategoryId(group.categoryId);
    const allCatIds = getGroupCategoryIds(group);
    setEditGroupExtraCategoryIds(allCatIds.filter((id) => id !== group.categoryId));
    const catObj = categories.find((c) => c.id === group.categoryId);
    setEditGroupCalcRule(resolveGroupRuleDisplay(group, catObj));
    setEditGroupCalcRuleManual(Boolean(group.calcRule));
  };

  const handleSaveGroupEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || isSavingCatalogAction) return;

    const trimmedName = editGroupName.trim().toUpperCase() || editingGroup.name;
    const targetCatId = editGroupCategoryId || editingGroup.categoryId;
    const allCategoryIds = Array.from(
      new Set([targetCatId, ...editGroupExtraCategoryIds].filter(Boolean))
    );
    const chosenCat = categories.find((c) => c.id === targetCatId);
    const resolvedRule =
      editGroupCalcRule ||
      inferDefaultCalcRuleForGroup(trimmedName, chosenCat?.name, targetCatId);

    const updatedGroup: ProductGroup & { updatedAt?: string } = {
      ...editingGroup,
      name: trimmedName,
      color: editGroupColor,
      categoryId: targetCatId,
      categoryIds: allCategoryIds,
      calcRule: resolvedRule,
      updatedAt: new Date().toISOString(),
    };

    const nextGroups = groups.map((g) => (g.id === editingGroup.id ? updatedGroup : g));
    const affectedProducts = products.filter((p) => p.groupId === editingGroup.id);
    const updatedChildProducts = affectedProducts.map((p) => {
      const keepExistingCat = p.categoryId && allCategoryIds.includes(p.categoryId);
      const nextProdCatId = keepExistingCat ? p.categoryId! : targetCatId;
      const nextProdCatObj = categories.find((c) => c.id === nextProdCatId);
      return {
        ...p,
        groupName: trimmedName,
        categoryId: nextProdCatId,
        categoryName: nextProdCatObj ? nextProdCatObj.name : p.categoryName,
        updatedAt: new Date().toISOString(),
      };
    });
    const nextProducts =
      affectedProducts.length > 0
        ? products.map((p) => updatedChildProducts.find((u) => u.id === p.id) || p)
        : products;

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setGroups(nextGroups);
      setLocalCollectionSafe('fenix_product_groups_data', nextGroups);
      if (affectedProducts.length > 0) {
        setProducts(nextProducts);
        setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      }
      invalidateProductCatalogCache();

      const res = await saveItemToSupabase(
        'fenix_product_groups_data',
        updatedGroup,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar o salvamento do grupo no servidor. Tente novamente.'
        );
        return;
      }

      if (updatedChildProducts.length > 0) {
        await saveBatchItemsToSupabase(
          'fenix_product_items_data',
          updatedChildProducts,
          'id',
          currentUserName
        );
      }

      setExpandedGroups((prev) => ({ ...prev, [updatedGroup.id]: true }));
      if (targetCatId) {
        setExpandedCategories((prev) => ({ ...prev, [targetCatId]: true }));
      }
      invalidateProductCatalogCache();
      setEditingGroup(null);
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao salvar alterações do grupo.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Group Delete handlers
  const handleRequestDeleteGroup = (group: ProductGroup) => {
    setCatalogActionError(null);
    setGroupToDelete(group);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!groupToDelete || isSavingCatalogAction) return;
    const targetGroupId = groupToDelete.id;
    const targetProductIds = products.filter((p) => p.groupId === targetGroupId).map((p) => p.id);

    const nextGroups = groups.filter((g) => g.id !== targetGroupId);
    const nextProducts = products.filter((p) => p.groupId !== targetGroupId);

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setGroups(nextGroups);
      setProducts(nextProducts);
      setLocalCollectionSafe('fenix_product_groups_data', nextGroups);
      setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      invalidateProductCatalogCache();

      const grpRes = await deleteItemFromSupabase(
        'fenix_product_groups_data',
        targetGroupId,
        'id',
        currentUserName
      );
      if (!grpRes.success) {
        setCatalogActionError(
          grpRes.error || 'Não foi possível confirmar a exclusão do grupo no servidor.'
        );
        return;
      }

      if (targetProductIds.length > 0) {
        const prodsRes = await deleteBatchItemsFromSupabase(
          'fenix_product_items_data',
          targetProductIds,
          'id',
          currentUserName
        );
        if (!prodsRes.success) {
          setCatalogActionError(
            prodsRes.error || 'Grupo excluído, mas não foi possível confirmar a exclusão dos produtos vinculados.'
          );
          return;
        }
      }

      invalidateProductCatalogCache();
      setGroupToDelete(null);
      if (editingGroup?.id === targetGroupId) {
        setEditingGroup(null);
      }
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao excluir grupo.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Unified Group Create handler (usado pelo modal dedicado e pelo modal Editar Grupos)
  const createGroupWithPersistence = async (
    name: string,
    categoryId: string,
    color: string,
    calcRule?: ProductCalcRule,
    extraCategoryIds?: string[]
  ): Promise<boolean> => {
    const cleanName = name.trim().toUpperCase();
    if (!cleanName || !categoryId || isSavingCatalogAction) return false;

    const chosenCat = categories.find((c) => c.id === categoryId);
    const allCategoryIds = Array.from(
      new Set([categoryId, ...(extraCategoryIds || [])].filter(Boolean))
    );
    const resolvedRule =
      calcRule && VALID_PRODUCT_CALC_RULES.has(calcRule)
        ? calcRule
        : inferDefaultCalcRuleForGroup(cleanName, chosenCat?.name, categoryId);

    const newGrp: ProductGroup & { updatedAt?: string } = {
      id: `grp_${Date.now()}`,
      name: cleanName,
      categoryId,
      categoryIds: allCategoryIds,
      color: color || '#0057ff',
      calcRule: resolvedRule,
      updatedAt: new Date().toISOString(),
    };
    const nextGroups = [...groups, newGrp];

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setGroups(nextGroups);
      setLocalCollectionSafe('fenix_product_groups_data', nextGroups);
      setExpandedGroups((prev) => ({ ...prev, [newGrp.id]: true }));
      setExpandedCategories((prev) => ({ ...prev, [categoryId]: true }));
      invalidateProductCatalogCache();

      const res = await saveItemToSupabase(
        'fenix_product_groups_data',
        newGrp,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar o salvamento do novo grupo no servidor.'
        );
        return false;
      }
      invalidateProductCatalogCache();
      return true;
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao cadastrar grupo.');
      return false;
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Group Create handlers
  const handleOpenAddGroup = (catId: string) => {
    setCatalogActionError(null);
    setAddingGroupToCategoryId(catId);
    setNewGroupName('');
    setNewGroupColor('#0057ff');
    setNewGroupExtraCategoryIds([]);
    const catObj = categories.find((c) => c.id === catId);
    setNewGroupCalcRule(inferDefaultCalcRuleForGroup('', catObj?.name, catId));
    setNewGroupCalcRuleManual(false);
  };

  const handleSaveAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingGroupToCategoryId || !newGroupName.trim()) return;
    const ok = await createGroupWithPersistence(
      newGroupName,
      addingGroupToCategoryId,
      newGroupColor,
      newGroupCalcRule,
      newGroupExtraCategoryIds
    );
    if (ok) {
      setAddingGroupToCategoryId(null);
      setNewGroupName('');
      setNewGroupExtraCategoryIds([]);
    }
  };

  // Unified Category Rename helper (usado pelo modal Editar Categoria inline e modal Editar Categoria dedicado)
  const renameCategoryWithPersistence = async (
    catId: string,
    newName: string
  ): Promise<boolean> => {
    const trimmed = newName.trim().toUpperCase();
    const targetCat = categories.find((c) => c.id === catId);
    if (!targetCat || !trimmed || isSavingCatalogAction) return false;

    const updatedCat: ProductCategory & { updatedAt?: string } = {
      ...targetCat,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    const nextCategories = categories.map((c) => (c.id === catId ? updatedCat : c));
    const affectedProducts = products.filter((p) => p.categoryId === catId);
    const updatedChildProducts = affectedProducts.map((p) => ({
      ...p,
      categoryName: trimmed,
      updatedAt: new Date().toISOString(),
    }));
    const nextProducts =
      affectedProducts.length > 0
        ? products.map((p) => updatedChildProducts.find((u) => u.id === p.id) || p)
        : products;

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setCategories(nextCategories);
      setLocalCollectionSafe('fenix_product_categories_data', nextCategories);
      if (affectedProducts.length > 0) {
        setProducts(nextProducts);
        setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      }
      invalidateProductCatalogCache();

      const res = await saveItemToSupabase(
        'fenix_product_categories_data',
        updatedCat,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar a alteração da categoria no servidor.'
        );
        return false;
      }

      if (updatedChildProducts.length > 0) {
        await saveBatchItemsToSupabase(
          'fenix_product_items_data',
          updatedChildProducts,
          'id',
          currentUserName
        );
      }

      invalidateProductCatalogCache();
      return true;
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao renomear categoria.');
      return false;
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Unified Category Create helper (usado pelo modal Editar Categorias e modal Nova Categoria)
  const createCategoryWithPersistence = async (name: string): Promise<boolean> => {
    const cleanName = name.trim().toUpperCase();
    if (!cleanName || isSavingCatalogAction) return false;

    const newCat: ProductCategory & { updatedAt?: string } = {
      id: `cat_${Date.now()}`,
      name: cleanName,
      updatedAt: new Date().toISOString(),
    };
    const nextCategories = [...categories, newCat];

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setCategories(nextCategories);
      setLocalCollectionSafe('fenix_product_categories_data', nextCategories);
      setExpandedCategories((prev) => ({ ...prev, [newCat.id]: true }));
      invalidateProductCatalogCache();

      const res = await saveItemToSupabase(
        'fenix_product_categories_data',
        newCat,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar o salvamento da nova categoria no servidor.'
        );
        return false;
      }
      invalidateProductCatalogCache();
      return true;
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao criar categoria.');
      return false;
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Category Edit handlers
  const handleOpenEditCategory = (cat: ProductCategory) => {
    setCatalogActionError(null);
    setEditingCategory(cat);
    setEditCategoryName(cat.name);
  };

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCategoryName.trim()) return;
    const ok = await renameCategoryWithPersistence(editingCategory.id, editCategoryName);
    if (ok) {
      setEditingCategory(null);
    }
  };

  // Category Delete handlers
  const handleRequestDeleteCategory = (cat: ProductCategory) => {
    setCatalogActionError(null);
    setCategoryToDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete || isSavingCatalogAction) return;
    const targetCatId = categoryToDelete.id;

    // Separa grupos exclusivos da categoria vs grupos compartilhados com outras categorias
    const linkedGroups = groups.filter((g) => groupBelongsToCategory(g, targetCatId));
    const exclusiveGroups = linkedGroups.filter(
      (g) => getGroupCategoryIds(g).filter((id) => id !== targetCatId).length === 0
    );
    const sharedGroupsUpdated = linkedGroups
      .filter((g) => getGroupCategoryIds(g).filter((id) => id !== targetCatId).length > 0)
      .map((g) => {
        const remainingCatIds = getGroupCategoryIds(g).filter((id) => id !== targetCatId);
        return {
          ...g,
          categoryId: remainingCatIds[0],
          categoryIds: remainingCatIds,
          updatedAt: new Date().toISOString(),
        };
      });

    const targetGroupIds = exclusiveGroups.map((g) => g.id);
    const targetProductIds = products
      .filter((p) => p.categoryId === targetCatId || targetGroupIds.includes(p.groupId))
      .map((p) => p.id);

    const nextCategories = categories.filter((c) => c.id !== targetCatId);
    const nextGroups = groups
      .filter((g) => !targetGroupIds.includes(g.id))
      .map((g) => sharedGroupsUpdated.find((u) => u.id === g.id) || g);
    const nextProducts = products.filter(
      (p) => p.categoryId !== targetCatId && !targetGroupIds.includes(p.groupId)
    );

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setCategories(nextCategories);
      setGroups(nextGroups);
      setProducts(nextProducts);
      setLocalCollectionSafe('fenix_product_categories_data', nextCategories);
      setLocalCollectionSafe('fenix_product_groups_data', nextGroups);
      setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      invalidateProductCatalogCache();

      const catRes = await deleteItemFromSupabase(
        'fenix_product_categories_data',
        targetCatId,
        'id',
        currentUserName
      );
      if (!catRes.success) {
        setCatalogActionError(
          catRes.error || 'Não foi possível confirmar a exclusão da categoria no servidor.'
        );
        return;
      }

      if (sharedGroupsUpdated.length > 0) {
        await saveBatchItemsToSupabase(
          'fenix_product_groups_data',
          sharedGroupsUpdated,
          'id',
          currentUserName
        );
      }

      if (targetGroupIds.length > 0) {
        const grpsRes = await deleteBatchItemsFromSupabase(
          'fenix_product_groups_data',
          targetGroupIds,
          'id',
          currentUserName
        );
        if (!grpsRes.success) {
          setCatalogActionError(
            grpsRes.error || 'Categoria excluída, mas houve falha ao excluir grupos vinculados no servidor.'
          );
          return;
        }
      }

      if (targetProductIds.length > 0) {
        const prodsRes = await deleteBatchItemsFromSupabase(
          'fenix_product_items_data',
          targetProductIds,
          'id',
          currentUserName
        );
        if (!prodsRes.success) {
          setCatalogActionError(
            prodsRes.error || 'Categoria excluída, mas houve falha ao excluir produtos vinculados no servidor.'
          );
          return;
        }
      }

      invalidateProductCatalogCache();
      setCategoryToDelete(null);
      if (editingCategory?.id === targetCatId) {
        setEditingCategory(null);
      }
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao excluir categoria.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Category Create handlers
  const handleSaveAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const ok = await createCategoryWithPersistence(newCategoryName);
    if (ok) {
      setIsAddingCategory(false);
      setNewCategoryName('');
    }
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (product: GroupProductItem) => {
    setCatalogActionError(null);
    setEditingProduct(product);
    setProdEditName(product.name);
    setProdEditDescription(product.description || '');
    setProdEditDetails(product.details || '');
    setProdEditUnit(product.unit);

    // Identificar a categoria e grupo atuais do produto
    const associatedGroup = groups.find((g) => g.id === product.groupId);
    const catId =
      product.categoryId ||
      (associatedGroup ? associatedGroup.categoryId : categories[0]?.id || '');
    setProdEditCategoryId(catId);
    setProdEditGroupId(product.groupId || 'sem_grupo');

    setProdEditClienteFinal(
      (Number(product.priceClienteFinal) || 0).toFixed(2).replace('.', ',')
    );
    setProdEditRevenda((Number(product.priceRevenda) || 0).toFixed(2).replace('.', ','));
    setProdEditConstrutora(
      (Number(product.priceConstrutora) || 0).toFixed(2).replace('.', ',')
    );
    setProdEditCusto(
      product.custo !== undefined && product.custo !== null
        ? Number(product.custo).toFixed(2).replace('.', ',')
        : ''
    );
  };

  // Switch category in product edit modal
  const handleCategoryChangeInEdit = (newCatId: string) => {
    setProdEditCategoryId(newCatId);
    const catGroups = groups.filter((g) => groupBelongsToCategory(g, newCatId));
    const grpBelongs = catGroups.some((g) => g.id === prodEditGroupId);
    if (!grpBelongs) {
      setProdEditGroupId(catGroups.length > 0 ? catGroups[0].id : 'sem_grupo');
    }
  };

  // Auto-calculate suggested wholesale and contractor rates from Cliente Final
  const handleAutoSuggestRatesForEdit = () => {
    const cfVal =
      parseFloat(
        prodEditClienteFinal.replace(/\./g, '').replace(',', '.')
      ) || 0;
    if (cfVal > 0) {
      const rev = Math.round(cfVal * 0.82 * 100) / 100;
      const cons = Math.round(cfVal * 0.90 * 100) / 100;
      setProdEditRevenda(rev.toFixed(2).replace('.', ','));
      setProdEditConstrutora(cons.toFixed(2).replace('.', ','));
    }
  };

  // Save Product Edit (including category and group assignment)
  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || isSavingCatalogAction) return;

    const pCF =
      parseFloat(
        prodEditClienteFinal.replace(/\./g, '').replace(',', '.')
      ) || editingProduct.priceClienteFinal;
    const pRev =
      parseFloat(
        prodEditRevenda.replace(/\./g, '').replace(',', '.')
      ) || Math.round(pCF * 0.82 * 100) / 100;
    const pCons =
      parseFloat(
        prodEditConstrutora.replace(/\./g, '').replace(',', '.')
      ) || Math.round(pCF * 0.90 * 100) / 100;

    const rawCustoStr = prodEditCusto.trim();
    let pCusto: number | undefined = editingProduct.custo;
    if (rawCustoStr !== '') {
      const parsedCusto = parseFloat(rawCustoStr.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(parsedCusto)) {
        pCusto = parsedCusto;
      }
    }

    const chosenCat = categories.find((c) => c.id === prodEditCategoryId);
    const chosenGroup = groups.find(
      (g) => g.id === prodEditGroupId && groupBelongsToCategory(g, prodEditCategoryId)
    );

    const finalGroupId = prodEditGroupId === 'sem_grupo' ? '' : prodEditGroupId;
    const finalGroupName = chosenGroup
      ? chosenGroup.name
      : prodEditGroupId === 'sem_grupo'
      ? 'Sem Grupo'
      : undefined;
    const finalCategoryName = chosenCat ? chosenCat.name : undefined;
    const nowIso = new Date().toISOString();

    const updated = products.map((p) =>
      p.id === editingProduct.id
        ? {
            ...p,
            name: prodEditName.trim() || editingProduct.name,
            description: prodEditDescription.trim() || undefined,
            details: prodEditDetails.trim() || undefined,
            unit: prodEditUnit.trim() || editingProduct.unit,
            categoryId: prodEditCategoryId,
            categoryName: finalCategoryName,
            groupId: finalGroupId,
            groupName: finalGroupName,
            priceClienteFinal: pCF,
            priceRevenda: pRev,
            priceConstrutora: pCons,
            custo: pCusto,
            price: pCF,
            updatedAt: nowIso,
          }
        : p
    );

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      // 1. Atualiza estado e armazenamento local imediatamente
      setProducts(updated);
      setLocalCollectionSafe('fenix_product_items_data', updated);
      invalidateProductCatalogCache();

      // 2. Garante que a categoria e o grupo de destino continuem visíveis/expandidos
      if (prodEditCategoryId) {
        setExpandedCategories((prev) => ({ ...prev, [prodEditCategoryId]: true }));
      }
      if (finalGroupId) {
        setExpandedGroups((prev) => ({ ...prev, [finalGroupId]: true }));
      }

      // 3. Salva custo no Supabase se for diretor
      if (isDirector && pCusto !== undefined && pCusto !== null && !isNaN(pCusto)) {
        await saveProductCostToSupabase(editingProduct.id, pCusto, currentUserName);
      }

      // 4. Persiste o item atualizado de forma atômica no Supabase e aguarda confirmação real
      const targetUpdatedProduct = updated.find((p) => p.id === editingProduct.id);
      if (targetUpdatedProduct) {
        const res = await saveItemToSupabase(
          'fenix_product_items_data',
          targetUpdatedProduct,
          'id',
          currentUserName
        );
        if (!res.success) {
          setCatalogActionError(
            res.error || 'Não foi possível confirmar o salvamento da edição no servidor. Tente novamente.'
          );
          return;
        }
      }

      invalidateProductCatalogCache();
      setEditingProduct(null);
    } catch (err: any) {
      console.error('Erro ao salvar edição de produto:', err);
      setCatalogActionError(err?.message || 'Erro ao salvar edição do produto.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Move product up or down within its group or category (persistindo localmente e no Supabase)
  const handleMoveProduct = async (productId: string, direction: 'up' | 'down') => {
    const currentProd = products.find((p) => p.id === productId);
    if (!currentProd) return;

    const sameGroupProds = products.filter((p) => {
      if (currentProd.groupId) {
        return p.groupId === currentProd.groupId;
      }
      return (!p.groupId || p.groupId === '' || p.groupId === 'sem_grupo') && p.categoryId === currentProd.categoryId;
    });
    const indexInGroup = sameGroupProds.findIndex((p) => p.id === productId);
    let nextProducts: GroupProductItem[] | null = null;

    if (direction === 'up' && indexInGroup > 0) {
      const targetProd = sameGroupProds[indexInGroup - 1];
      const copy = [...products];
      const idxA = copy.findIndex((p) => p.id === productId);
      const idxB = copy.findIndex((p) => p.id === targetProd.id);
      if (idxA !== -1 && idxB !== -1) {
        copy[idxA] = targetProd;
        copy[idxB] = currentProd;
        nextProducts = copy;
      }
    } else if (direction === 'down' && indexInGroup < sameGroupProds.length - 1) {
      const targetProd = sameGroupProds[indexInGroup + 1];
      const copy = [...products];
      const idxA = copy.findIndex((p) => p.id === productId);
      const idxB = copy.findIndex((p) => p.id === targetProd.id);
      if (idxA !== -1 && idxB !== -1) {
        copy[idxA] = targetProd;
        copy[idxB] = currentProd;
        nextProducts = copy;
      }
    }
    if (!nextProducts) return;

    setCatalogActionError(null);
    isSavingProductRef.current = true;
    try {
      setProducts(nextProducts);
      setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      invalidateProductCatalogCache();
      const res = await saveCollectionOrderToSupabase(
        'fenix_product_items_data',
        nextProducts,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(res.error || 'Não foi possível confirmar a reordenação do produto no servidor.');
      }
    } finally {
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Open delete confirmation modal
  const handleRequestDeleteProduct = (product: GroupProductItem) => {
    setCatalogActionError(null);
    setProductToDelete(product);
  };

  // Confirm delete product
  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete || isSavingCatalogAction) return;
    const targetId = productToDelete.id;
    const nextProducts = products.filter((p) => p.id !== targetId);

    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setProducts(nextProducts);
      setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      invalidateProductCatalogCache();

      const res = await deleteItemFromSupabase(
        'fenix_product_items_data',
        targetId,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar a exclusão do produto no servidor.'
        );
        return;
      }

      invalidateProductCatalogCache();
      setProductToDelete(null);
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao excluir produto.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  // Open Add Product Modal (Pode ser chamado da toolbar principal ou de dentro de grupo)
  const handleOpenAddProduct = (groupId: string = '', categoryId?: string) => {
    setCatalogActionError(null);
    let targetCatId = categoryId;
    if (!targetCatId && groupId) {
      targetCatId = groups.find((g) => g.id === groupId)?.categoryId;
    }
    if (!targetCatId) {
      targetCatId = categories[0]?.id || '';
    }

    let targetGroupId = groupId;
    if (!targetGroupId) {
      const catGroups = groups.filter((g) => groupBelongsToCategory(g, targetCatId!));
      targetGroupId = catGroups.length > 0 ? catGroups[0].id : 'sem_grupo';
    }

    setAddingProductToCategoryId(targetCatId);
    setAddingProductToGroupId(targetGroupId);
    setNewProdName('');
    setNewProdDescription('');
    setNewProdDetails('');
    setNewProdUnit('m²');
    setNewProdClienteFinal('');
    setNewProdRevenda('');
    setNewProdConstrutora('');
    setNewProdCusto('');
    setIsAddProductModalOpen(true);
  };

  // Switch category in add product modal
  const handleCategoryChangeInAdd = (newCatId: string) => {
    setAddingProductToCategoryId(newCatId);
    const catGroups = groups.filter((g) => groupBelongsToCategory(g, newCatId));
    const grpBelongs = catGroups.some((g) => g.id === addingProductToGroupId);
    if (!grpBelongs) {
      setAddingProductToGroupId(catGroups.length > 0 ? catGroups[0].id : 'sem_grupo');
    }
  };

  const handleAutoSuggestRatesForNew = () => {
    const cfVal =
      parseFloat(
        newProdClienteFinal.replace(/\./g, '').replace(',', '.')
      ) || 0;
    if (cfVal > 0) {
      const rev = Math.round(cfVal * 0.82 * 100) / 100;
      const cons = Math.round(cfVal * 0.90 * 100) / 100;
      setNewProdRevenda(rev.toFixed(2).replace('.', ','));
      setNewProdConstrutora(cons.toFixed(2).replace('.', ','));
    }
  };

  // Save New Product
  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || isSavingCatalogAction) return;

    const pCF =
      parseFloat(
        newProdClienteFinal.replace(/\./g, '').replace(',', '.')
      ) || 89.90;
    const pRev =
      parseFloat(
        newProdRevenda.replace(/\./g, '').replace(',', '.')
      ) || Math.round(pCF * 0.82 * 100) / 100;
    const pCons =
      parseFloat(
        newProdConstrutora.replace(/\./g, '').replace(',', '.')
      ) || Math.round(pCF * 0.90 * 100) / 100;

    const pCusto = newProdCusto.trim()
      ? parseFloat(newProdCusto.replace(/\./g, '').replace(',', '.'))
      : undefined;

    const targetCatId = addingProductToCategoryId || (categories[0]?.id || '');
    if (!targetCatId) {
      setCatalogActionError('Selecione ou cadastre uma categoria antes de adicionar o produto.');
      return;
    }
    const chosenCat = categories.find((c) => c.id === targetCatId);
    const finalCatName = chosenCat ? chosenCat.name : undefined;

    const finalGroupId =
      !addingProductToGroupId || addingProductToGroupId === 'sem_grupo'
        ? ''
        : addingProductToGroupId;
    const chosenGroup = groups.find((g) => g.id === finalGroupId);
    const finalGroupName = chosenGroup
      ? chosenGroup.name
      : finalGroupId
      ? undefined
      : 'Sem Grupo';

    const newProdItem: GroupProductItem & { updatedAt?: string } = {
      id: `prod_custom_${Date.now()}`,
      name: newProdName.trim(),
      description: newProdDescription.trim() || undefined,
      details: newProdDetails.trim() || undefined,
      groupId: finalGroupId,
      groupName: finalGroupName,
      categoryId: targetCatId,
      categoryName: finalCatName,
      unit: newProdUnit.trim() || 'unidades',
      priceClienteFinal: pCF,
      priceRevenda: pRev,
      priceConstrutora: pCons,
      custo: pCusto,
      price: pCF,
      active: true,
      updatedAt: new Date().toISOString(),
    };

    const nextProducts = [...products, newProdItem];
    setCatalogActionError(null);
    setIsSavingCatalogAction(true);
    isSavingProductRef.current = true;
    try {
      setProducts(nextProducts);
      setLocalCollectionSafe('fenix_product_items_data', nextProducts);
      invalidateProductCatalogCache();

      const res = await saveItemToSupabase(
        'fenix_product_items_data',
        newProdItem,
        'id',
        currentUserName
      );
      if (!res.success) {
        setCatalogActionError(
          res.error || 'Não foi possível confirmar o salvamento do produto no servidor. Tente novamente.'
        );
        return;
      }

      // Atomic Supabase save for cost
      if (isDirector && pCusto !== undefined && pCusto !== null && !isNaN(pCusto) && pCusto > 0) {
        await saveProductCostToSupabase(newProdItem.id, pCusto, currentUserName).catch((err) =>
          console.warn('Erro ao salvar custo do produto (preservado localmente):', err)
        );
      }

      if (targetCatId) {
        setExpandedCategories((prev) => ({ ...prev, [targetCatId]: true }));
      }
      if (finalGroupId) {
        setExpandedGroups((prev) => ({ ...prev, [finalGroupId]: true }));
      }

      invalidateProductCatalogCache();
      setIsAddProductModalOpen(false);
      setNewProdCusto('');
    } catch (err: any) {
      setCatalogActionError(err?.message || 'Erro ao salvar novo produto.');
    } finally {
      setIsSavingCatalogAction(false);
      setTimeout(() => {
        isSavingProductRef.current = false;
      }, 250);
    }
  };

  const getProductsInGroupForCategory = (g: ProductGroup, catId: string) => {
    return products.filter(
      (p) =>
        p.groupId === g.id &&
        (p.categoryId === catId || (!p.categoryId && g.categoryId === catId))
    );
  };

  const filteredCategories = categories.map((cat) => {
    const catGroups = groups.filter((g) => groupBelongsToCategory(g, cat.id));
    const catSemGrupoProducts = products.filter(
      (p) =>
        (p.categoryId === cat.id || (!p.groupId && p.categoryId === cat.id)) &&
        (!p.groupId || p.groupId === '' || p.groupId === 'sem_grupo')
    );

    const trimmedQuery = searchTerm.trim();
    const normQuery = normalizeSearchText(trimmedQuery);
    const intent = detectSearchCategoryIntent(trimmedQuery);

    const enrichProduct = (
      p: GroupProductItem,
      fallbackGroup?: ProductGroup
    ) => ({
      ...p,
      category: cat.name,
      groupName: fallbackGroup?.name || p.groupName,
      groupCalcRule: fallbackGroup?.calcRule,
    });

    const matchingGroups = catGroups.filter((g) => {
      if (!trimmedQuery) return true;
      const groupProducts = getProductsInGroupForCategory(g, cat.id).map((p) =>
        enrichProduct(p, g)
      );
      const matchedProds = filterCatalogProducts(groupProducts, trimmedQuery);
      if (matchedProds.length > 0) return true;

      // Se a busca não exige categoria específica, permite casar diretamente pelo nome do grupo/marca
      if (!intent && normalizeSearchText(g.name).includes(normQuery)) {
        return true;
      }
      return false;
    });

    const matchingSemGrupoProducts = !trimmedQuery
      ? catSemGrupoProducts
      : filterCatalogProducts(
          catSemGrupoProducts.map((p) => enrichProduct(p)),
          trimmedQuery
        );

    return {
      ...cat,
      groups: matchingGroups,
      semGrupoProducts: matchingSemGrupoProducts,
    };
  });

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-6">
      {/* Top Banner & Search & Tabela de Preços */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Package className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[#071a52]">
                Produtos e Grupos
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-normal">
                Catálogo oficial Fênix World com divisão de preços: Cliente Final, Revenda e Construtora
              </p>
            </div>
          </div>

          {/* Search input */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              value={searchTerm || ''}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar grupo ou produto..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff] focus:bg-white transition-all shadow-2xs"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Divisão dos 3 Preços - Filtro e Indicadores */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#0057ff]" />
              Visualização de Preços:
            </span>
            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setPriceViewFilter('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceViewFilter === 'all'
                    ? 'bg-white text-[#071a52] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas as Tabelas
              </button>
              <button
                type="button"
                onClick={() => setPriceViewFilter('Cliente Final')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceViewFilter === 'Cliente Final'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-blue-700 hover:bg-blue-50/60'
                }`}
              >
                Cliente Final
              </button>
              <button
                type="button"
                onClick={() => setPriceViewFilter('Revenda')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceViewFilter === 'Revenda'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 hover:bg-emerald-50/60'
                }`}
              >
                Revenda
              </button>
              <button
                type="button"
                onClick={() => setPriceViewFilter('Construtora')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  priceViewFilter === 'Construtora'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-amber-700 hover:bg-amber-50/60'
                }`}
              >
                Construtora
              </button>
            </div>
          </div>

          {/* Legenda visual dos preços */}
          <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Cliente Final
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              Revenda
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
              Construtora
            </span>
            {isDirector && (
              <span className="flex items-center gap-1.5 text-purple-700 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                Custo (Diretoria)
              </span>
            )}
          </div>
        </div>
      </div>

      {isLoadingCatalog ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm py-16 px-6 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#0057ff]" />
          <span className="text-sm font-medium text-slate-600">Carregando produtos atualizados...</span>
        </div>
      ) : (
      <>
      {/* Categorias e Grupos - Toolbar de Ações Principais */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-base font-extrabold text-[#071a52] flex items-center gap-2">
            <span>Categorias e Grupos de Produtos</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#0057ff] border border-blue-100">
              {filteredCategories.length} categorias
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Catálogo completo com tabela de preços por perfil de cliente (Cliente Final, Revenda e Construtora).
          </p>
        </div>

        {/* Toolbar de Ações: + Adicionar Produto, Editar Categoria & Editar Grupo */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenAddProduct()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2"
            title="Cadastrar um novo produto diretamente (sem precisar entrar primeiro em categoria ou grupo)"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Adicionar Produto</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCatalogActionError(null);
              setIsManageCategoriesOpen(true);
              setInlineEditingCatId(null);
              setNewCategoryInput('');
            }}
            className="px-4 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2"
            title="Gerenciar, posicionar, criar, editar e excluir categorias"
          >
            <FolderEdit className="w-4 h-4" />
            <span>Editar Categoria</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCatalogActionError(null);
              setIsManageGroupsOpen(true);
              setIsAddingNewGroupInModal(false);
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2"
            title="Gerenciar, posicionar, criar, editar cores e excluir grupos"
          >
            <Palette className="w-4 h-4" />
            <span>Editar Grupo</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handleExpandAllCategories}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:text-[#0057ff] transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Abrir todas as categorias"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Expandir Todas</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAllCategories}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:text-[#0057ff] transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Fechar todas as categorias"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Recolher Todas</span>
          </button>
        </div>
      </div>

      {catalogActionError &&
        !isManageCategoriesOpen &&
        !isManageGroupsOpen &&
        !editingGroup &&
        !addingGroupToCategoryId &&
        !editingCategory &&
        !isAddingCategory &&
        !editingProduct &&
        !isAddProductModalOpen &&
        !categoryToDelete &&
        !groupToDelete &&
        !productToDelete && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{catalogActionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setCatalogActionError(null)}
              className="p-1 rounded-lg hover:bg-red-100 text-red-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

      {/* Lista de Categorias Reordenáveis e Recolhíveis */}
      <div className="space-y-4">
        {filteredCategories.map((cat, catIndex) => {
          if (searchTerm && cat.groups.length === 0 && cat.semGrupoProducts.length === 0) return null;
          const isCatExpanded = !!expandedCategories[cat.id];
          const totalCategoryProducts =
            cat.groups.reduce(
              (acc, g) => acc + getProductsInGroupForCategory(g, cat.id).length,
              0
            ) + cat.semGrupoProducts.length;

          return (
            <section
              key={cat.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
            >
              {/* Category Header Limpo e Sem Poluição: Clique para Expandir / Recolher */}
              <div
                onClick={() => toggleCategoryExpand(cat.id)}
                className={`w-full flex items-center justify-between p-4 sm:p-5 transition-colors cursor-pointer select-none ${
                  isCatExpanded
                    ? 'bg-slate-50/80 border-b border-slate-200/90'
                    : 'bg-white hover:bg-slate-50/60'
                }`}
                title={isCatExpanded ? 'Clique para recolher esta categoria' : 'Clique para abrir e ver os itens'}
              >
                {/* Nome da Categoria e Totais */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center flex-shrink-0 font-black text-xs">
                    {catIndex + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm sm:text-base font-extrabold tracking-wider text-[#071a52] uppercase truncate">
                        {cat.name}
                      </h2>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500">
                      {cat.groups.length > 0 && (
                        <>
                          <strong className="text-slate-700">{cat.groups.length}</strong> {cat.groups.length === 1 ? 'grupo' : 'grupos'}
                          {' • '}
                        </>
                      )}
                      <strong className="text-slate-700">{totalCategoryProducts}</strong> {totalCategoryProducts === 1 ? 'produto' : 'produtos'}
                    </p>
                  </div>
                </div>

                {/* Seta de Abrir/Fechar Limpa (Sem botões poluindo o cabeçalho) */}
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 flex-shrink-0">
                  <span className="hidden sm:inline">
                    {isCatExpanded ? 'Recolher' : cat.groups.length > 0 ? 'Ver Grupos' : 'Ver Produtos'}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all ${
                      isCatExpanded
                        ? 'bg-blue-50 text-[#0057ff] border-blue-200'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <ChevronDown
                      className={`w-4 h-4 stroke-[2.5] transition-transform duration-200 ${
                        isCatExpanded ? 'rotate-180 text-[#0057ff]' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Lista de Grupos: Renderizada APENAS quando a Categoria estiver expandida */}
              {isCatExpanded && (
                <div className="p-4 sm:p-6 space-y-3 bg-white">
                  {cat.groups.length === 0 && cat.semGrupoProducts.length === 0 ? (
                    <div className="text-center py-6 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <p className="text-xs font-bold text-slate-500">Nenhum produto cadastrado nesta categoria</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Adicione grupos ou cadastre produtos nesta categoria.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cat.groups.map((group) => {
                        const contrast = getContrastStyles(group.color);
                        const isExpanded = !!expandedGroups[group.id];
                        const rawGroupProducts = getProductsInGroupForCategory(group, cat.id);
                        const resolvedRule = resolveGroupRuleDisplay(group, cat);
                        const trimmedSearch = searchTerm.trim();
                        const groupNameMatchesOnly =
                          trimmedSearch &&
                          !detectSearchCategoryIntent(trimmedSearch) &&
                          normalizeSearchText(group.name).includes(normalizeSearchText(trimmedSearch));
                        const groupProducts =
                          !trimmedSearch || groupNameMatchesOnly
                            ? rawGroupProducts
                            : filterCatalogProducts(
                                rawGroupProducts.map((p) => ({
                                  ...p,
                                  category: cat.name,
                                  groupName: group.name,
                                  groupCalcRule: resolvedRule,
                                })),
                                trimmedSearch
                              );

                        return (
                          <div
                            key={`${cat.id}_${group.id}`}
                            className="w-full rounded-xl transition-all shadow-2xs overflow-hidden border border-black/5"
                          >
                            {/* Retângulo Horizontal Limpo: Clique para Expandir / Recolher Produtos */}
                            <div
                              onClick={() => toggleGroupExpand(group.id)}
                              className="w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer select-none"
                              style={{
                                backgroundColor: group.color,
                              }}
                              title={isExpanded ? 'Clique para recolher os produtos' : 'Clique para ver os produtos'}
                            >
                              {/* Nome do Grupo e Contagem */}
                              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                                <span
                                  className="text-sm sm:text-base font-black tracking-wide truncate uppercase select-none"
                                  style={{ color: contrast.textColor }}
                                >
                                  {group.name}
                                </span>
                                <span
                                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-md"
                                  style={{
                                    color: contrast.textColor,
                                    backgroundColor: contrast.badgeBg,
                                  }}
                                >
                                  {groupProducts.length} {groupProducts.length === 1 ? 'item' : 'itens'}
                                </span>
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide"
                                  style={{
                                    color: contrast.textColor,
                                    backgroundColor: contrast.buttonBg,
                                    border: `1px solid ${contrast.buttonBorder}`,
                                  }}
                                >
                                  Regra: {getCalcRuleShortLabel(resolvedRule)}
                                </span>
                              </div>

                              {/* Indicador de Expandir / Recolher Produtos */}
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                                style={{
                                  color: contrast.textColor,
                                  backgroundColor: contrast.buttonBg,
                                  border: `1px solid ${contrast.buttonBorder}`,
                                }}
                              >
                                <ChevronDown
                                  className={`w-4 h-4 stroke-[2.5] transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </div>

                        {/* Produtos do Grupo quando expandido com 3 Preços */}
                        {isExpanded && (
                        <div className="bg-slate-50/70 border-t border-slate-200/80 p-3 sm:p-4 space-y-3">
                          {groupProducts.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-2 px-3">
                              Nenhum produto cadastrado neste grupo.
                            </p>
                          ) : (
                            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200/70 shadow-2xs">
                              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-[#071a52]">
                                    <th className="py-3 px-3 sm:px-4">Produto</th>
                                    <th className="py-3 px-3 text-center w-20">Unidade</th>

                                    {/* Coluna 1: Cliente Final */}
                                    {(priceViewFilter === 'all' || priceViewFilter === 'Cliente Final') && (
                                      <th className="py-3 px-3 text-right w-32 bg-blue-50/40 text-blue-900 border-l border-slate-100">
                                        <div className="flex flex-col items-end">
                                          <span>Cliente Final</span>
                                          <span className="text-[9px] font-semibold text-blue-600 normal-case">
                                            Consumidor
                                          </span>
                                        </div>
                                      </th>
                                    )}

                                    {/* Coluna 2: Revenda */}
                                    {(priceViewFilter === 'all' || priceViewFilter === 'Revenda') && (
                                      <th className="py-3 px-3 text-right w-32 bg-emerald-50/40 text-emerald-900 border-l border-slate-100">
                                        <div className="flex flex-col items-end">
                                          <span>Revenda</span>
                                          <span className="text-[9px] font-semibold text-emerald-600 normal-case">
                                            Lojistas / Parceiros
                                          </span>
                                        </div>
                                      </th>
                                    )}

                                    {/* Coluna 3: Construtora */}
                                    {(priceViewFilter === 'all' || priceViewFilter === 'Construtora') && (
                                      <th className="py-3 px-3 text-right w-32 bg-amber-50/40 text-amber-900 border-l border-slate-100">
                                        <div className="flex flex-col items-end">
                                          <span>Construtora</span>
                                          <span className="text-[9px] font-semibold text-amber-600 normal-case">
                                            Obras / Corporativo
                                          </span>
                                        </div>
                                      </th>
                                    )}

                                    {/* Coluna 4: Custo (Exclusivo da Diretoria) */}
                                    {isDirector && (
                                      <th className="py-3 px-3 text-right w-32 bg-purple-50/60 text-purple-950 border-l border-slate-100">
                                        <div className="flex flex-col items-end">
                                          <span className="flex items-center gap-1 font-extrabold text-purple-900">
                                            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                                            Custo
                                          </span>
                                          <span className="text-[9px] font-semibold text-purple-600 normal-case">
                                            Diretoria
                                          </span>
                                        </div>
                                      </th>
                                    )}

                                    <th className="py-3 px-3 text-center w-36 border-l border-slate-100">
                                      Posição & Ações
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {groupProducts.map((prod, prodIndex) => (
                                    <tr
                                      key={prod.id}
                                      onClick={() => handleOpenEditProduct(prod)}
                                      className="hover:bg-blue-50/50 transition-colors group/row cursor-pointer"
                                      title="Clique para atribuir Categoria, trocar de Grupo ou editar Preços"
                                    >
                                      {/* Nome do Produto */}
                                      <td className="py-3 px-3 sm:px-4 font-semibold text-slate-800">
                                        <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                            <span className="group-hover/row:text-[#0057ff] transition-colors">{prod.name}</span>
                                            {(SHOW_OFFLINE_SYNC_INDICATORS && pendingSyncTick >= 0 && isRecordPendingSync('fenix_product_items_data', prod.id)) && (
                                              <span
                                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold shrink-0"
                                                title="Produto salvo no modo offline — pendente de sincronização com o Supabase"
                                              >
                                                Pendente sync
                                              </span>
                                            )}
                                            <span className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[10px] font-bold text-[#0057ff] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
                                              <FolderEdit className="w-3 h-3" />
                                              <span>Trocar Grupo / Editar</span>
                                            </span>
                                          </div>
                                          {prod.description && (
                                            <span className="text-[11px] text-slate-500 font-normal leading-tight">
                                              {prod.description}
                                            </span>
                                          )}
                                          {prod.details && (
                                            <span className="text-[10px] text-slate-400 font-normal leading-tight italic">
                                              {prod.details}
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      {/* Unidade */}
                                      <td className="py-3 px-3 text-center font-medium text-slate-500">
                                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold text-slate-700">
                                          {prod.unit}
                                        </span>
                                      </td>

                                      {/* Preço Cliente Final */}
                                      {(priceViewFilter === 'all' || priceViewFilter === 'Cliente Final') && (
                                        <td className="py-3 px-3 text-right font-extrabold text-blue-900 bg-blue-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                          R$ {(prod.priceClienteFinal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      )}

                                      {/* Preço Revenda */}
                                      {(priceViewFilter === 'all' || priceViewFilter === 'Revenda') && (
                                        <td className="py-3 px-3 text-right font-extrabold text-emerald-800 bg-emerald-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                          R$ {(prod.priceRevenda ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      )}

                                      {/* Preço Construtora */}
                                      {(priceViewFilter === 'all' || priceViewFilter === 'Construtora') && (
                                        <td className="py-3 px-3 text-right font-extrabold text-amber-800 bg-amber-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                          R$ {(prod.priceConstrutora ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                      )}

                                      {/* Custo (Exclusivo do Diretor) */}
                                      {isDirector && (
                                        <td className="py-3 px-3 text-right font-extrabold text-purple-950 bg-purple-50/25 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                          {prod.custo !== undefined && prod.custo !== null ? (
                                            <span>R$ {prod.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                          ) : (
                                            <span className="text-slate-400 font-normal text-xs">—</span>
                                          )}
                                        </td>
                                      )}

                                      {/* Posição (Cima / Baixo) & Ações (Editar / Excluir) */}
                                      <td className="py-3 px-3 text-center border-l border-slate-100">
                                        <div className="flex items-center justify-center gap-1">
                                          {/* Mover para Cima */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMoveProduct(prod.id, 'up');
                                            }}
                                            disabled={prodIndex === 0}
                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                              prodIndex === 0
                                                ? 'text-slate-200 cursor-not-allowed'
                                                : 'text-slate-400 hover:text-[#0057ff] hover:bg-blue-50'
                                            }`}
                                            title="Mover produto para cima"
                                            aria-label="Mover produto para cima"
                                          >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Mover para Baixo */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMoveProduct(prod.id, 'down');
                                            }}
                                            disabled={prodIndex === groupProducts.length - 1}
                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                              prodIndex === groupProducts.length - 1
                                                ? 'text-slate-200 cursor-not-allowed'
                                                : 'text-slate-400 hover:text-[#0057ff] hover:bg-blue-50'
                                            }`}
                                            title="Mover produto para baixo"
                                            aria-label="Mover produto para baixo"
                                          >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Editar / Atribuir Grupo */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEditProduct(prod);
                                            }}
                                            className="p-1.5 rounded-lg text-[#0057ff] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer ml-0.5"
                                            title="Atribuir Categoria, Grupo e Preços"
                                            aria-label="Atribuir Categoria, Grupo e Preços"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Excluir */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRequestDeleteProduct(prod);
                                            }}
                                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                            title="Excluir produto"
                                            aria-label="Excluir produto"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Botão para Adicionar Produto no Grupo */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpenAddProduct(group.id, cat.id)}
                              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-[#0057ff] border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#0057ff]" />
                              <span>Adicionar Produto em {group.name}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Bloco de Produtos Sem Grupo */}
                {cat.semGrupoProducts.length > 0 && (
                  <div className="w-full rounded-xl transition-all shadow-2xs overflow-hidden border border-slate-200">
                    {/* Cabeçalho do Bloco Sem Grupo */}
                    <div
                      onClick={() => toggleGroupExpand(`sem_grupo_${cat.id}`)}
                      className="w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer select-none bg-slate-800 text-white hover:bg-slate-750"
                      title={expandedGroups[`sem_grupo_${cat.id}`] !== false ? 'Clique para recolher os produtos' : 'Clique para ver os produtos'}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm sm:text-base font-black tracking-wide truncate uppercase select-none text-white">
                          SEM GRUPO
                        </span>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-white/20 text-white">
                          {cat.semGrupoProducts.length} {cat.semGrupoProducts.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>

                      <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all bg-white/15 border border-white/20 text-white">
                        <ChevronDown
                          className={`w-4 h-4 stroke-[2.5] transition-transform duration-200 ${
                            expandedGroups[`sem_grupo_${cat.id}`] !== false ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Tabela de Produtos Sem Grupo */}
                    {expandedGroups[`sem_grupo_${cat.id}`] !== false && (
                      <div className="bg-slate-50/70 border-t border-slate-200/80 p-3 sm:p-4 space-y-3">
                        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200/70 shadow-2xs">
                          <table className="w-full text-left border-collapse text-xs sm:text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-extrabold uppercase tracking-wider text-[#071a52]">
                                <th className="py-3 px-3 sm:px-4">Produto</th>
                                <th className="py-3 px-3 text-center w-20">Unidade</th>

                                {(priceViewFilter === 'all' || priceViewFilter === 'Cliente Final') && (
                                  <th className="py-3 px-3 text-right w-32 bg-blue-50/40 text-blue-900 border-l border-slate-100">
                                    <div className="flex flex-col items-end">
                                      <span>Cliente Final</span>
                                      <span className="text-[9px] font-semibold text-blue-600 normal-case">Consumidor</span>
                                    </div>
                                  </th>
                                )}

                                {(priceViewFilter === 'all' || priceViewFilter === 'Revenda') && (
                                  <th className="py-3 px-3 text-right w-32 bg-emerald-50/40 text-emerald-900 border-l border-slate-100">
                                    <div className="flex flex-col items-end">
                                      <span>Revenda</span>
                                      <span className="text-[9px] font-semibold text-emerald-600 normal-case">Lojistas / Parceiros</span>
                                    </div>
                                  </th>
                                )}

                                {(priceViewFilter === 'all' || priceViewFilter === 'Construtora') && (
                                  <th className="py-3 px-3 text-right w-32 bg-amber-50/40 text-amber-900 border-l border-slate-100">
                                    <div className="flex flex-col items-end">
                                      <span>Construtora</span>
                                      <span className="text-[9px] font-semibold text-amber-600 normal-case">Obras / Corporativo</span>
                                    </div>
                                  </th>
                                )}

                                {/* Coluna 4: Custo (Exclusivo do Diretor) */}
                                {isDirector && (
                                  <th className="py-3 px-3 text-right w-32 bg-purple-50/60 text-purple-950 border-l border-slate-100">
                                    <div className="flex flex-col items-end">
                                      <span className="flex items-center gap-1 font-extrabold text-purple-900">
                                        <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                                        Custo
                                      </span>
                                      <span className="text-[9px] font-semibold text-purple-600 normal-case">Diretoria</span>
                                    </div>
                                  </th>
                                )}

                                <th className="py-3 px-3 text-center w-36 border-l border-slate-100">
                                  Posição & Ações
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {cat.semGrupoProducts.map((prod, prodIndex) => (
                                <tr
                                  key={prod.id}
                                  onClick={() => handleOpenEditProduct(prod)}
                                  className="hover:bg-blue-50/50 transition-colors group/row cursor-pointer"
                                  title="Clique para atribuir Grupo/Categoria ou editar Preços"
                                >
                                  <td className="py-3 px-3 sm:px-4 font-semibold text-slate-800">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                        <span className="group-hover/row:text-[#0057ff] transition-colors">{prod.name}</span>
                                        {(SHOW_OFFLINE_SYNC_INDICATORS && pendingSyncTick >= 0 && isRecordPendingSync('fenix_product_items_data', prod.id)) && (
                                          <span
                                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold shrink-0"
                                            title="Produto salvo no modo offline — pendente de sincronização com o Supabase"
                                          >
                                            Pendente sync
                                          </span>
                                        )}
                                        <span className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[10px] font-bold text-[#0057ff] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
                                          <FolderEdit className="w-3 h-3" />
                                          <span>Atribuir a um Grupo</span>
                                        </span>
                                      </div>
                                      {prod.description && (
                                        <span className="text-[11px] text-slate-500 font-normal leading-tight">
                                          {prod.description}
                                        </span>
                                      )}
                                      {prod.details && (
                                        <span className="text-[10px] text-slate-400 font-normal leading-tight italic">
                                          {prod.details}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 text-center font-medium text-slate-500">
                                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold text-slate-700">
                                      {prod.unit}
                                    </span>
                                  </td>

                                  {(priceViewFilter === 'all' || priceViewFilter === 'Cliente Final') && (
                                    <td className="py-3 px-3 text-right font-extrabold text-blue-900 bg-blue-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                      R$ {(prod.priceClienteFinal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  )}

                                  {(priceViewFilter === 'all' || priceViewFilter === 'Revenda') && (
                                    <td className="py-3 px-3 text-right font-extrabold text-emerald-800 bg-emerald-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                      R$ {(prod.priceRevenda ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  )}

                                  {(priceViewFilter === 'all' || priceViewFilter === 'Construtora') && (
                                    <td className="py-3 px-3 text-right font-extrabold text-amber-800 bg-amber-50/20 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                      R$ {(prod.priceConstrutora ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  )}

                                  {/* Custo (Exclusivo do Diretor) */}
                                  {isDirector && (
                                    <td className="py-3 px-3 text-right font-extrabold text-purple-950 bg-purple-50/25 border-l border-slate-100 font-mono text-xs sm:text-sm">
                                      {prod.custo !== undefined && prod.custo !== null ? (
                                        <span>R$ {prod.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                      ) : (
                                        <span className="text-slate-400 font-normal text-xs">—</span>
                                      )}
                                    </td>
                                  )}

                                  <td className="py-3 px-3 text-center border-l border-slate-100">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveProduct(prod.id, 'up');
                                        }}
                                        disabled={prodIndex === 0}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                          prodIndex === 0
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveProduct(prod.id, 'down');
                                        }}
                                        disabled={prodIndex === cat.semGrupoProducts.length - 1}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                          prodIndex === cat.semGrupoProducts.length - 1
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenEditProduct(prod);
                                        }}
                                        className="p-1.5 rounded-lg text-[#0057ff] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer ml-0.5"
                                        title="Atribuir a Grupo ou Categoria"
                                        aria-label="Atribuir a Grupo ou Categoria"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRequestDeleteProduct(prod);
                                        }}
                                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                        title="Excluir produto"
                                        aria-label="Excluir produto"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Botão Adicionar Produto Sem Grupo */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenAddProduct('', cat.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-[#0057ff] border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#0057ff]" />
                            <span>Adicionar Produto (Sem Grupo)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      </>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR PRODUTO & ATRIBUIÇÃO (CATEGORIA, GRUPO, PREÇOS) */}
      {/* ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center">
                  <FolderEdit className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Editar Produto &amp; Atribuição
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atribua ou troque de Categoria e Grupo, e altere os preços
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProductEdit} className="p-6 space-y-4">
              {/* Box de Atribuição de Categoria e Grupo */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#0057ff]" />
                    Atribuição de Categoria &amp; Grupo
                  </span>
                  <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                    Troca de Grupos
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Select Categoria */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Categoria:
                    </label>
                    <select
                      value={prodEditCategoryId}
                      onChange={(e) => handleCategoryChangeInEdit(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-blue-200 bg-white text-xs font-bold text-[#071a52] outline-none focus:border-[#0057ff] cursor-pointer shadow-2xs"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Grupo */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Grupo de Destino:
                    </label>
                    <select
                      value={prodEditGroupId}
                      onChange={(e) => setProdEditGroupId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-blue-200 bg-white text-xs font-bold text-[#071a52] outline-none focus:border-[#0057ff] cursor-pointer shadow-2xs"
                    >
                      <option value="sem_grupo">Sem Grupo (Avulso na Categoria)</option>
                      {groups
                        .filter((g) => groupBelongsToCategory(g, prodEditCategoryId))
                        .map((grp) => (
                          <option key={grp.id} value={grp.id}>
                            {grp.name} ({getCalcRuleShortLabel(resolveGroupRuleDisplay(grp, categories.find((c) => c.id === prodEditCategoryId)))})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-blue-900/80 leading-tight">
                  Selecione outro grupo ou categoria para transferir este produto automaticamente.
                </p>
              </div>

              {/* Nome e Unidade */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Nome do Produto
                  </label>
                  <input
                    type="text"
                    value={prodEditName || ''}
                    onChange={(e) => setProdEditName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff]"
                    required
                  />
                </div>
                <div className="sm:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Unidade
                  </label>
                  <input
                    type="text"
                    value={prodEditUnit || ''}
                    onChange={(e) => setProdEditUnit(e.target.value)}
                    placeholder="Ex: m²"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 text-center outline-none focus:border-[#0057ff]"
                    required
                  />
                </div>
              </div>

              {/* Descrição e Detalhes */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Descrição do Produto
                  </label>
                  <input
                    type="text"
                    value={prodEditDescription || ''}
                    onChange={(e) => setProdEditDescription(e.target.value)}
                    placeholder="Ex: Piso vinílico de alta resistência com textura natural de madeira"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Detalhes / Especificações Técnicas
                  </label>
                  <textarea
                    value={prodEditDetails || ''}
                    onChange={(e) => setProdEditDetails(e.target.value)}
                    placeholder="Ex: Espessura: 3,0 mm | Capa de uso: 0,5 mm | Instalação: Cola"
                    rows={2}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff] resize-none"
                  />
                </div>
              </div>

              {/* Botão de Sugestão Automática de Margem */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="flex items-center gap-1.5 text-xs text-blue-900 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-[#0057ff]" />
                  <span>Calcular Revenda (-18%) e Construtora (-10%):</span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoSuggestRatesForEdit}
                  className="px-2.5 py-1 rounded-lg bg-[#0057ff] text-white text-[11px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  Sugerir Margens
                </button>
              </div>

              {/* Os 3 Preços */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Cliente Final */}
                <div className="p-3 rounded-xl bg-blue-50/30 border border-blue-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-blue-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    Cliente Final
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={prodEditClienteFinal || ''}
                      onChange={(e) => setProdEditClienteFinal(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-blue-200 bg-white text-xs sm:text-sm font-extrabold text-blue-900 text-right outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Varejo e consumidor</p>
                </div>

                {/* 2. Revenda */}
                <div className="p-3 rounded-xl bg-emerald-50/30 border border-emerald-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    Revenda
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={prodEditRevenda || ''}
                      onChange={(e) => setProdEditRevenda(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-emerald-200 bg-white text-xs sm:text-sm font-extrabold text-emerald-900 text-right outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Lojas e distribuidores</p>
                </div>

                {/* 3. Construtora */}
                <div className="p-3 rounded-xl bg-amber-50/30 border border-amber-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-amber-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    Construtora
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={prodEditConstrutora || ''}
                      onChange={(e) => setProdEditConstrutora(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-amber-200 bg-white text-xs sm:text-sm font-extrabold text-amber-900 text-right outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Engenharia e grandes obras</p>
                </div>
              </div>

              {/* Custo (Exclusivo do Diretor) */}
              {isDirector && (
                <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-700" />
                      <span>Custo do Produto (Diretoria)</span>
                    </label>
                    <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200">
                      Salvo separadamente dos preços de venda
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={prodEditCusto || ''}
                      onChange={(e) => setProdEditCusto(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-3 rounded-lg border border-purple-200 bg-white text-xs sm:text-sm font-extrabold text-purple-950 text-right outline-none focus:border-purple-600 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-purple-700 font-medium leading-tight">
                    O campo Custo é salvo separadamente e nunca sobrescreve ou altera os preços de venda ao cliente final, revenda ou construtora.
                  </p>
                </div>
              )}

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCatalogAction}
                  className="px-5 py-2.5 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  {isSavingCatalogAction ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NOVO PRODUTO COMPLETO (COM CATEGORIA E GRUPO)      */}
      {/* ======================================================== */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Adicionar Novo Produto
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cadastre o produto escolhendo ou alterando a Categoria e Grupo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveNewProduct} className="p-6 space-y-4">
              {/* Box de Atribuição de Categoria e Grupo */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border border-blue-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#0057ff]" />
                    Categoria &amp; Grupo de Destino
                  </span>
                  <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                    Organização
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Select Categoria */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Categoria:
                    </label>
                    <select
                      value={addingProductToCategoryId}
                      onChange={(e) => handleCategoryChangeInAdd(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-blue-200 bg-white text-xs font-bold text-[#071a52] outline-none focus:border-[#0057ff] cursor-pointer shadow-2xs"
                      required
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Grupo */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Grupo:
                    </label>
                    <select
                      value={addingProductToGroupId}
                      onChange={(e) => setAddingProductToGroupId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-blue-200 bg-white text-xs font-bold text-[#071a52] outline-none focus:border-[#0057ff] cursor-pointer shadow-2xs"
                    >
                      <option value="sem_grupo">Sem Grupo (Avulso na Categoria)</option>
                      {groups
                        .filter((g) => groupBelongsToCategory(g, addingProductToCategoryId))
                        .map((grp) => (
                          <option key={grp.id} value={grp.id}>
                            {grp.name} ({getCalcRuleShortLabel(resolveGroupRuleDisplay(grp, categories.find((c) => c.id === addingProductToCategoryId)))})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-blue-900/80 leading-tight">
                  O produto será registrado e alocado automaticamente na categoria e grupo selecionados.
                </p>
              </div>

              {/* Nome e Unidade */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Nome do Produto *
                  </label>
                  <input
                    type="text"
                    value={newProdName || ''}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="Ex: Piso Vinílico FlexFloor Supreme 3,0 mm"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff]"
                    required
                  />
                </div>
                <div className="sm:col-span-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Unidade
                  </label>
                  <select
                    value={newProdUnit || 'm²'}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    className="w-full h-10 px-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 bg-white outline-none focus:border-[#0057ff] cursor-pointer"
                  >
                    <option value="m²">m²</option>
                    <option value="barras">barras</option>
                    <option value="unidades">unidades</option>
                    <option value="sacos">sacos</option>
                    <option value="metros">metros</option>
                    <option value="baldes">baldes</option>
                    <option value="caixas">caixas</option>
                    <option value="rolos">rolos</option>
                  </select>
                </div>
              </div>

              {/* Descrição e Detalhes */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={newProdDescription || ''}
                    onChange={(e) => setNewProdDescription(e.target.value)}
                    placeholder="Ex: Piso vinílico de alta durabilidade e conforto térmico"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Detalhes / Especificações
                  </label>
                  <textarea
                    value={newProdDetails || ''}
                    onChange={(e) => setNewProdDetails(e.target.value)}
                    placeholder="Ex: Espessura 3mm | Capa de uso 0.5mm | Tráfego intenso comercial"
                    rows={2}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 outline-none focus:border-[#0057ff] resize-none"
                  />
                </div>
              </div>

              {/* Botão de Sugestão Automática de Margem */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="flex items-center gap-1.5 text-xs text-blue-900 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-[#0057ff]" />
                  <span>Calcular Revenda (-18%) e Construtora (-10%):</span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoSuggestRatesForNew}
                  className="px-2.5 py-1 rounded-lg bg-[#0057ff] text-white text-[11px] font-bold hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  Sugerir Margens
                </button>
              </div>

              {/* Os 3 Preços */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Cliente Final */}
                <div className="p-3 rounded-xl bg-blue-50/30 border border-blue-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-blue-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    Cliente Final
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={newProdClienteFinal || ''}
                      onChange={(e) => setNewProdClienteFinal(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-blue-200 bg-white text-xs sm:text-sm font-extrabold text-blue-900 text-right outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Varejo e consumidor</p>
                </div>

                {/* 2. Revenda */}
                <div className="p-3 rounded-xl bg-emerald-50/30 border border-emerald-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-emerald-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    Revenda
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={newProdRevenda || ''}
                      onChange={(e) => setNewProdRevenda(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-emerald-200 bg-white text-xs sm:text-sm font-extrabold text-emerald-900 text-right outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Lojas e parceiros</p>
                </div>

                {/* 3. Construtora */}
                <div className="p-3 rounded-xl bg-amber-50/30 border border-amber-100 space-y-1.5">
                  <label className="text-xs font-extrabold text-amber-950 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    Construtora
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={newProdConstrutora || ''}
                      onChange={(e) => setNewProdConstrutora(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-2 rounded-lg border border-amber-200 bg-white text-xs sm:text-sm font-extrabold text-amber-900 text-right outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">Obras corporativas</p>
                </div>
              </div>

              {/* Custo (Exclusivo do Diretor) */}
              {isDirector && (
                <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-700" />
                      <span>Custo do Produto (Diretoria)</span>
                    </label>
                    <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200">
                      Salvo separadamente dos preços de venda
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      value={newProdCusto || ''}
                      onChange={(e) => setNewProdCusto(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-10 pl-8 pr-3 rounded-lg border border-purple-200 bg-white text-xs sm:text-sm font-extrabold text-purple-950 text-right outline-none focus:border-purple-600 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-purple-700 font-medium leading-tight">
                    Salvo separadamente dos preços de venda. Não altera os valores de venda ao cliente final, revenda ou construtora.
                  </p>
                </div>
              )}

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCatalogAction}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSavingCatalogAction ? 'Salvando...' : 'Cadastrar Produto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL PRINCIPAL: EDITAR CATEGORIA                        */}
      {/* ======================================================== */}
      {isManageCategoriesOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center flex-shrink-0">
                  <FolderEdit className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Editar Categorias
                  </h3>
                  <p className="text-xs text-slate-500">
                    Posicione, crie, renomeie ou exclua categorias do catálogo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManageCategoriesOpen(false);
                  setInlineEditingCatId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Criar Nova Categoria */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 space-y-2">
                <span className="text-xs font-bold text-[#071a52] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#0057ff]" />
                  <span>Criar Nova Categoria</span>
                </span>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCategoryInput.trim() || isSavingCatalogAction) return;
                    const ok = await createCategoryWithPersistence(newCategoryInput);
                    if (ok) {
                      setNewCategoryInput('');
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Ex: TINTAS, VERNIZES, PISOS ESPECIAIS..."
                    className="flex-1 h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-[#0057ff] uppercase"
                  />
                  <button
                    type="submit"
                    disabled={!newCategoryInput.trim() || isSavingCatalogAction}
                    className="h-10 px-4 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isSavingCatalogAction ? 'Salvando...' : 'Adicionar'}</span>
                  </button>
                </form>
              </div>

              {/* Lista de Categorias com Posicionamento, Edição e Exclusão */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-bold text-slate-700">
                    Categorias Cadastradas ({categories.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Use as setas para alterar a posição no catálogo
                  </span>
                </div>

                {categories.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">
                    Nenhuma categoria cadastrada. Crie uma acima!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categories.map((cat, idx) => {
                      const isInlineEditing = inlineEditingCatId === cat.id;
                      const catGroups = groups.filter((g) => groupBelongsToCategory(g, cat.id));
                      const exclusiveGroupIds = catGroups
                        .filter((g) => getGroupCategoryIds(g).length <= 1)
                        .map((g) => g.id);
                      const catProdCount = products.filter(
                        (p) => p.categoryId === cat.id || exclusiveGroupIds.includes(p.groupId)
                      ).length;

                      return (
                        <div
                          key={cat.id}
                          className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs flex items-center justify-between gap-3 transition-all"
                        >
                          {/* Posição e Setas de Ordenação */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0057ff] font-bold text-xs flex items-center justify-center">
                              #{idx + 1}
                            </div>
                            <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleMoveCategory(cat.id, 'up')}
                                disabled={idx === 0 || isSavingCatalogAction}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  idx === 0
                                    ? 'text-slate-200 cursor-not-allowed'
                                    : 'text-slate-600 hover:text-[#0057ff] hover:bg-white'
                                }`}
                                title="Subir posição da categoria"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveCategory(cat.id, 'down')}
                                disabled={idx === categories.length - 1 || isSavingCatalogAction}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  idx === categories.length - 1
                                    ? 'text-slate-200 cursor-not-allowed'
                                    : 'text-slate-600 hover:text-[#0057ff] hover:bg-white'
                                }`}
                                title="Descer posição da categoria"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Nome da Categoria (Inline Edit ou Exibição) */}
                          <div className="flex-1 min-w-0">
                            {isInlineEditing ? (
                              <form
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  if (!inlineEditingCatName.trim() || isSavingCatalogAction) return;
                                  const ok = await renameCategoryWithPersistence(
                                    cat.id,
                                    inlineEditingCatName
                                  );
                                  if (ok) {
                                    setInlineEditingCatId(null);
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="text"
                                  value={inlineEditingCatName}
                                  onChange={(e) => setInlineEditingCatName(e.target.value)}
                                  className="flex-1 h-8 px-2.5 rounded-lg border border-[#0057ff] text-xs font-bold text-slate-800 uppercase outline-none"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  disabled={isSavingCatalogAction}
                                  className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white transition-colors cursor-pointer"
                                  title="Salvar nome"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingCatalogAction}
                                  onClick={() => setInlineEditingCatId(null)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                                  title="Cancelar edição"
                                >
                                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                </button>
                              </form>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-extrabold text-[#071a52] uppercase truncate">
                                  {cat.name}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium">
                                  ({catGroups.length} grupos • {catProdCount} itens)
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Botões de Ação: Renomear e Excluir */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {!isInlineEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInlineEditingCatId(cat.id);
                                  setInlineEditingCatName(cat.name);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 text-slate-600 hover:text-[#0057ff] text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                title="Alterar nome da categoria"
                              >
                                <Pencil className="w-3 h-3" />
                                <span className="hidden sm:inline">Renomear</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setCategoryToDelete(cat);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                              title="Excluir categoria e seus grupos"
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
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsManageCategoriesOpen(false);
                  setInlineEditingCatId(null);
                }}
                className="px-5 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL PRINCIPAL: EDITAR GRUPO                            */}
      {/* ======================================================== */}
      {isManageGroupsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
                  <Palette className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Editar Grupos
                  </h3>
                  <p className="text-xs text-slate-500">
                    Posicione, crie, altere cores, categorias e nomes, ou exclua grupos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManageGroupsOpen(false);
                  setIsAddingNewGroupInModal(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Barra de Filtro e Botão de Novo Grupo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600">Categoria:</label>
                  <select
                    value={groupFilterCategory}
                    onChange={(e) => setGroupFilterCategory(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-[#0057ff] cursor-pointer"
                  >
                    <option value="all">Todas as Categorias ({groups.length} grupos)</option>
                    {categories.map((c) => {
                      const count = groups.filter((g) => groupBelongsToCategory(g, c.id)).length;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !isAddingNewGroupInModal;
                    setIsAddingNewGroupInModal(nextOpen);
                    setNewGroupName('');
                    setNewGroupColor('#0057ff');
                    setNewGroupExtraCategoryIds([]);
                    const targetCat =
                      groupFilterCategory !== 'all' ? groupFilterCategory : categories[0]?.id || '';
                    setNewGroupCategoryId(targetCat);
                    const catObj = categories.find((c) => c.id === targetCat);
                    setNewGroupCalcRule(inferDefaultCalcRuleForGroup('', catObj?.name, targetCat));
                    setNewGroupCalcRuleManual(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingNewGroupInModal ? 'Cancelar Criação' : 'Novo Grupo'}</span>
                </button>
              </div>

              {/* Formulário de Criação de Novo Grupo (Quando acionado) */}
              {isAddingNewGroupInModal && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in duration-150">
                  <h4 className="text-xs font-extrabold text-[#071a52] uppercase tracking-wide flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-[#0057ff]" />
                    <span>Cadastrar Novo Grupo</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Nome do Grupo</label>
                      <input
                        type="text"
                        value={newGroupName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewGroupName(val);
                          if (!newGroupCalcRuleManual) {
                            const catObj = categories.find((c) => c.id === newGroupCategoryId);
                            setNewGroupCalcRule(
                              inferDefaultCalcRuleForGroup(val, catObj?.name, newGroupCategoryId)
                            );
                          }
                        }}
                        placeholder="Ex: PISO VINÍLICO, RODAPÉS, RIPADOS..."
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold uppercase outline-none focus:border-[#0057ff]"
                        autoFocus
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Categoria Principal</label>
                      <select
                        value={newGroupCategoryId}
                        onChange={(e) => {
                          const catId = e.target.value;
                          setNewGroupCategoryId(catId);
                          setNewGroupExtraCategoryIds((prev) => prev.filter((id) => id !== catId));
                          if (!newGroupCalcRuleManual) {
                            const catObj = categories.find((c) => c.id === catId);
                            setNewGroupCalcRule(
                              inferDefaultCalcRuleForGroup(newGroupName, catObj?.name, catId)
                            );
                          }
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold outline-none focus:border-[#0057ff] cursor-pointer"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Regra de Cálculo do Grupo */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      Regra de Cálculo do Grupo (Independente da Categoria)
                    </label>
                    <select
                      value={newGroupCalcRule}
                      onChange={(e) => {
                        setNewGroupCalcRule(e.target.value as ProductCalcRule);
                        setNewGroupCalcRuleManual(true);
                      }}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold outline-none focus:border-[#0057ff] cursor-pointer"
                    >
                      {PRODUCT_CALC_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      {PRODUCT_CALC_RULE_OPTIONS.find((o) => o.value === newGroupCalcRule)?.description}
                    </p>
                  </div>

                  {/* Categorias adicionais */}
                  {categories.filter((c) => c.id !== newGroupCategoryId).length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 block">
                        Também vincular às categorias (opcional):
                      </label>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {categories
                          .filter((c) => c.id !== newGroupCategoryId)
                          .map((c) => {
                            const checked = newGroupExtraCategoryIds.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                  checked
                                    ? 'bg-blue-50 border-blue-300 text-[#0057ff]'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewGroupExtraCategoryIds((prev) => [...prev, c.id]);
                                    } else {
                                      setNewGroupExtraCategoryIds((prev) =>
                                        prev.filter((id) => id !== c.id)
                                      );
                                    }
                                  }}
                                  className="rounded border-slate-300 text-[#0057ff]"
                                />
                                <span>{c.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Cores Pré-definidas */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Cor do Bloco</label>
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                      {PRESET_COLORS.map((color) => {
                        const isSelected = newGroupColor.toLowerCase() === color.hex.toLowerCase();
                        return (
                          <button
                            key={color.hex}
                            type="button"
                            onClick={() => setNewGroupColor(color.hex)}
                            className={`h-8 rounded-lg transition-all relative flex items-center justify-center cursor-pointer ${
                              isSelected ? 'ring-2 ring-offset-1 ring-[#0057ff] scale-105' : 'hover:scale-102'
                            }`}
                            style={{ backgroundColor: color.hex }}
                            title={color.name}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-[11px] text-slate-500 font-medium">Ou personalizada:</label>
                      <input
                        type="color"
                        value={newGroupColor}
                        onChange={(e) => setNewGroupColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0 bg-white"
                      />
                      <span className="text-[11px] font-mono font-bold text-slate-600 uppercase">
                        {newGroupColor}
                      </span>
                    </div>
                  </div>

                  {/* Pré-visualização do Bloco */}
                  <div
                    className="w-full px-4 py-2.5 rounded-xl shadow-2xs flex items-center justify-between"
                    style={{ backgroundColor: newGroupColor }}
                  >
                    <span
                      className="text-xs font-black uppercase truncate"
                      style={{ color: getContrastStyles(newGroupColor).textColor }}
                    >
                      {newGroupName.trim() || 'NOME DO NOVO GRUPO'}
                    </span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{
                        color: getContrastStyles(newGroupColor).textColor,
                        backgroundColor: getContrastStyles(newGroupColor).badgeBg,
                      }}
                    >
                      0 itens
                    </span>
                  </div>

                  {/* Botão de Salvar Novo Grupo */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingCatalogAction}
                      onClick={() => setIsAddingNewGroupInModal(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!newGroupName.trim() || !newGroupCategoryId || isSavingCatalogAction}
                      onClick={async () => {
                        if (!newGroupName.trim() || !newGroupCategoryId || isSavingCatalogAction) return;
                        const ok = await createGroupWithPersistence(
                          newGroupName,
                          newGroupCategoryId,
                          newGroupColor,
                          newGroupCalcRule,
                          newGroupExtraCategoryIds
                        );
                        if (ok) {
                          setIsAddingNewGroupInModal(false);
                          setNewGroupName('');
                          setNewGroupExtraCategoryIds([]);
                        }
                      }}
                      className="px-4 py-1.5 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                    >
                      {isSavingCatalogAction ? 'Salvando...' : 'Salvar Grupo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Grupos com Posicionamento, Alteração e Exclusão */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-bold text-slate-700">
                    Grupos Existentes ({
                      groupFilterCategory === 'all'
                        ? groups.length
                        : groups.filter((g) => groupBelongsToCategory(g, groupFilterCategory)).length
                    })
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Use as setas para alterar a ordem dentro da categoria
                  </span>
                </div>

                {(() => {
                  const filteredList =
                    groupFilterCategory === 'all'
                      ? groups
                      : groups.filter((g) => groupBelongsToCategory(g, groupFilterCategory));

                  if (filteredList.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 py-6 text-center italic border border-dashed border-slate-200 rounded-xl">
                        Nenhum grupo encontrado nesta seleção. Clique em "Novo Grupo" para cadastrar!
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {filteredList.map((group) => {
                        const cat = categories.find((c) => c.id === group.categoryId);
                        const linkedCatNames = getGroupCategoryIds(group)
                          .map((cid) => categories.find((c) => c.id === cid)?.name)
                          .filter(Boolean);
                        const resolvedRule = resolveGroupRuleDisplay(group, cat);
                        const groupProductsCount = products.filter((p) => p.groupId === group.id).length;
                        const contrast = getContrastStyles(group.color);

                        // Find sibling index within its category to control up/down disabled state
                        const categorySiblings = groups.filter((g) => g.categoryId === group.categoryId);
                        const siblingIndex = categorySiblings.findIndex((g) => g.id === group.id);

                        return (
                          <div
                            key={group.id}
                            className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs flex items-center justify-between gap-3 transition-all"
                          >
                            {/* Setas de Ordenação e Swatch */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div
                                className="w-5 h-5 rounded-md flex-shrink-0 border border-black/10 shadow-2xs"
                                style={{ backgroundColor: group.color }}
                                title={`Cor: ${group.color}`}
                              />
                              <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleMoveGroup(group.id, 'up')}
                                  disabled={siblingIndex === 0}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    siblingIndex === 0
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-slate-600 hover:text-[#0057ff] hover:bg-white'
                                  }`}
                                  title="Subir posição do grupo"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveGroup(group.id, 'down')}
                                  disabled={siblingIndex === categorySiblings.length - 1}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    siblingIndex === categorySiblings.length - 1
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-slate-600 hover:text-[#0057ff] hover:bg-white'
                                  }`}
                                  title="Descer posição do grupo"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Informações do Grupo: Nome, Categoria, Regra e Quantidade */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-black uppercase tracking-wide text-slate-800 truncate">
                                  {group.name}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 truncate">
                                  {linkedCatNames.join(' • ') || cat?.name || 'Sem categoria'}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-[#0057ff] border border-blue-200">
                                  Regra: {getCalcRuleShortLabel(resolvedRule)}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                {groupProductsCount} {groupProductsCount === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
                              </p>
                            </div>

                            {/* Botões de Ação: Editar e Excluir */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditGroup(group)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 text-slate-600 hover:text-[#0057ff] text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                title="Editar nome, categoria ou cor do grupo"
                              >
                                <Pencil className="w-3 h-3" />
                                <span className="hidden sm:inline">Editar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRequestDeleteGroup(group)}
                                className="p-1.5 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                                title="Excluir grupo e seus produtos"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsManageGroupsOpen(false);
                  setIsAddingNewGroupInModal(false);
                }}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR GRUPO (Nome, Categoria e Cor)              */}
      {/* ======================================================== */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center">
                  <Pencil className="w-4 h-4 stroke-[2.2]" />
                </div>
                <h3 className="text-base font-bold text-[#071a52]">
                  Editar Grupo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveGroupEdit} className="p-6 space-y-4">
              {/* Nome do Grupo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={editGroupName || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditGroupName(val);
                    if (!editGroupCalcRuleManual) {
                      const catObj = categories.find((c) => c.id === editGroupCategoryId);
                      setEditGroupCalcRule(
                        inferDefaultCalcRuleForGroup(val, catObj?.name, editGroupCategoryId)
                      );
                    }
                  }}
                  placeholder="Ex: PISO VINÍLICO, FLEXFLOOR..."
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] uppercase"
                  required
                />
              </div>

              {/* Categoria Principal do Grupo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Categoria Principal
                </label>
                <select
                  value={editGroupCategoryId}
                  onChange={(e) => {
                    const catId = e.target.value;
                    setEditGroupCategoryId(catId);
                    setEditGroupExtraCategoryIds((prev) => prev.filter((id) => id !== catId));
                    if (!editGroupCalcRuleManual) {
                      const catObj = categories.find((c) => c.id === catId);
                      setEditGroupCalcRule(
                        inferDefaultCalcRuleForGroup(editGroupName, catObj?.name, catId)
                      );
                    }
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] bg-white cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Regra de Cálculo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Regra de Cálculo (Natureza Técnica)
                </label>
                <select
                  value={editGroupCalcRule}
                  onChange={(e) => {
                    setEditGroupCalcRule(e.target.value as ProductCalcRule);
                    setEditGroupCalcRuleManual(true);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] bg-white cursor-pointer"
                >
                  {PRODUCT_CALC_RULE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {PRODUCT_CALC_RULE_OPTIONS.find((o) => o.value === editGroupCalcRule)?.description}
                </p>
              </div>

              {/* Categorias adicionais */}
              {categories.filter((c) => c.id !== editGroupCategoryId).length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Também exibir em outras categorias (opcional)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-slate-50/70">
                    {categories
                      .filter((c) => c.id !== editGroupCategoryId)
                      .map((c) => {
                        const checked = editGroupExtraCategoryIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                              checked
                                ? 'bg-blue-50 border-blue-300 text-[#0057ff]'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditGroupExtraCategoryIds((prev) => [...prev, c.id]);
                                } else {
                                  setEditGroupExtraCategoryIds((prev) =>
                                    prev.filter((id) => id !== c.id)
                                  );
                                }
                              }}
                              className="rounded border-slate-300 text-[#0057ff]"
                            />
                            <span>{c.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Escolha da Cor do Grupo */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">
                  Cor do Grupo (Fundo do Retângulo)
                </label>

                {/* Paleta de Cores Pré-definidas */}
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => {
                    const isSelected =
                      editGroupColor.toLowerCase() === color.hex.toLowerCase();
                    return (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => setEditGroupColor(color.hex)}
                        className={`h-10 rounded-xl transition-all relative flex items-center justify-center cursor-pointer shadow-2xs ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-[#0057ff] scale-105'
                            : 'hover:scale-102'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {isSelected && (
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Seletor Customizado de Cor */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs text-slate-500 font-medium">
                    Ou selecione uma cor personalizada:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editGroupColor}
                      onChange={(e) => setEditGroupColor(e.target.value)}
                      className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                    />
                    <span className="text-xs font-mono font-bold text-slate-600 uppercase">
                      {editGroupColor}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pré-visualização ao vivo do retângulo */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-bold text-slate-500">
                  Pré-visualização do Bloco:
                </span>
                <div
                  className="w-full px-5 py-3 rounded-xl shadow-2xs flex items-center justify-between transition-colors"
                  style={{ backgroundColor: editGroupColor }}
                >
                  <span
                    className="text-sm font-black tracking-wide uppercase truncate"
                    style={{
                      color: getContrastStyles(editGroupColor).textColor,
                    }}
                  >
                    {editGroupName.trim() || 'NOME DO GRUPO'}
                  </span>
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-md"
                    style={{
                      color: getContrastStyles(editGroupColor).textColor,
                      backgroundColor:
                        getContrastStyles(editGroupColor).badgeBg,
                    }}
                  >
                    Editar Grupo
                  </span>
                </div>
              </div>

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Botões do Modal com Excluir Grupo */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => {
                    const grp = editingGroup;
                    setEditingGroup(null);
                    setGroupToDelete(grp);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Grupo</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingCatalogAction}
                    onClick={() => setEditingGroup(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCatalogAction}
                    className="px-4 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                  >
                    {isSavingCatalogAction ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NOVO GRUPO DE PRODUTOS                            */}
      {/* ======================================================== */}
      {addingGroupToCategoryId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Novo Grupo de Produtos
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Na categoria:{' '}
                    <strong className="text-slate-700 uppercase">
                      {categories.find((c) => c.id === addingGroupToCategoryId)?.name}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddingGroupToCategoryId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAddGroup} className="p-6 space-y-4">
              {/* Nome do Grupo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nome do Grupo
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewGroupName(val);
                    if (!newGroupCalcRuleManual) {
                      const catObj = categories.find((c) => c.id === addingGroupToCategoryId);
                      setNewGroupCalcRule(
                        inferDefaultCalcRuleForGroup(val, catObj?.name, addingGroupToCategoryId || undefined)
                      );
                    }
                  }}
                  placeholder="Ex: PISO VINÍLICO, RODAPÉS, RIPADOS..."
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] uppercase"
                  required
                  autoFocus
                />
              </div>

              {/* Regra de Cálculo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Regra de Cálculo (Natureza Técnica)
                </label>
                <select
                  value={newGroupCalcRule}
                  onChange={(e) => {
                    setNewGroupCalcRule(e.target.value as ProductCalcRule);
                    setNewGroupCalcRuleManual(true);
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] bg-white cursor-pointer"
                >
                  {PRODUCT_CALC_RULE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {PRODUCT_CALC_RULE_OPTIONS.find((o) => o.value === newGroupCalcRule)?.description}
                </p>
              </div>

              {/* Categorias adicionais */}
              {categories.filter((c) => c.id !== addingGroupToCategoryId).length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Também vincular às categorias (opcional)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-slate-50/70">
                    {categories
                      .filter((c) => c.id !== addingGroupToCategoryId)
                      .map((c) => {
                        const checked = newGroupExtraCategoryIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                              checked
                                ? 'bg-blue-50 border-blue-300 text-[#0057ff]'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewGroupExtraCategoryIds((prev) => [...prev, c.id]);
                                } else {
                                  setNewGroupExtraCategoryIds((prev) =>
                                    prev.filter((id) => id !== c.id)
                                  );
                                }
                              }}
                              className="rounded border-slate-300 text-[#0057ff]"
                            />
                            <span>{c.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Escolha da Cor do Grupo */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700">
                  Cor do Bloco
                </label>

                {/* Paleta de Cores Pré-definidas */}
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => {
                    const isSelected =
                      newGroupColor.toLowerCase() === color.hex.toLowerCase();
                    return (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => setNewGroupColor(color.hex)}
                        className={`h-10 rounded-xl transition-all relative flex items-center justify-center cursor-pointer shadow-2xs ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-[#0057ff] scale-105'
                            : 'hover:scale-102'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {isSelected && (
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Seletor Customizado de Cor */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs text-slate-500 font-medium">
                    Cor personalizada:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newGroupColor}
                      onChange={(e) => setNewGroupColor(e.target.value)}
                      className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                    />
                    <span className="text-xs font-mono font-bold text-slate-600 uppercase">
                      {newGroupColor}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pré-visualização ao vivo do retângulo */}
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-bold text-slate-500">
                  Pré-visualização:
                </span>
                <div
                  className="w-full px-5 py-3 rounded-xl shadow-2xs flex items-center justify-between transition-colors"
                  style={{ backgroundColor: newGroupColor }}
                >
                  <span
                    className="text-sm font-black tracking-wide uppercase truncate"
                    style={{
                      color: getContrastStyles(newGroupColor).textColor,
                    }}
                  >
                    {newGroupName.trim() || 'NOME DO GRUPO'}
                  </span>
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-md"
                    style={{
                      color: getContrastStyles(newGroupColor).textColor,
                      backgroundColor:
                        getContrastStyles(newGroupColor).badgeBg,
                    }}
                  >
                    0 itens
                  </span>
                </div>
              </div>

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => setAddingGroupToCategoryId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCatalogAction}
                  className="px-5 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  {isSavingCatalogAction ? 'Salvando...' : 'Criar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DE GRUPO                       */}
      {/* ======================================================== */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071a52]">
                  Excluir Grupo
                </h3>
                <p className="text-xs text-slate-500">
                  Confirmação de exclusão do grupo e seus produtos
                </p>
              </div>
            </div>

            {/* Bloco do Grupo com a cor real */}
            <div
              className="w-full px-4 py-3 rounded-xl shadow-2xs flex items-center justify-between"
              style={{ backgroundColor: groupToDelete.color }}
            >
              <span
                className="text-sm font-black uppercase truncate"
                style={{ color: getContrastStyles(groupToDelete.color).textColor }}
              >
                {groupToDelete.name}
              </span>
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded"
                style={{
                  color: getContrastStyles(groupToDelete.color).textColor,
                  backgroundColor: getContrastStyles(groupToDelete.color).badgeBg,
                }}
              >
                {products.filter((p) => p.groupId === groupToDelete.id).length} produtos
              </span>
            </div>

            <div className="p-3 bg-red-50/70 rounded-xl border border-red-100 text-xs text-red-800 space-y-1">
              <p className="font-bold">Atenção ao excluir este grupo:</p>
              <p>
                Todos os{' '}
                <strong>
                  {products.filter((p) => p.groupId === groupToDelete.id).length} produto(s)
                </strong>{' '}
                cadastrados neste grupo também serão excluídos do catálogo.
              </p>
            </div>

            <p className="text-xs text-slate-600">
              Deseja realmente prosseguir com a exclusão definitiva do grupo?
            </p>

            {catalogActionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{catalogActionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSavingCatalogAction}
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingCatalogAction}
                onClick={handleConfirmDeleteGroup}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isSavingCatalogAction ? 'Excluindo...' : 'Sim, Excluir Grupo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NOVA CATEGORIA                                    */}
      {/* ======================================================== */}
      {isAddingCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-[#071a52]">
                  Nova Categoria
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingCategory(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAddCategory} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  value={newCategoryName || ''}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex: TINTAS E REVESTIMENTOS"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] uppercase"
                  required
                  autoFocus
                />
              </div>

              <p className="text-xs text-slate-500">
                Após criar a categoria, você poderá adicionar grupos com suas cores personalizadas e os produtos com a tabela de 3 preços.
              </p>

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => setIsAddingCategory(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCatalogAction}
                  className="px-5 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  {isSavingCatalogAction ? 'Salvando...' : 'Criar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR CATEGORIA                                  */}
      {/* ======================================================== */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0057ff] flex items-center justify-center">
                  <Pencil className="w-4 h-4 stroke-[2.2]" />
                </div>
                <h3 className="text-base font-bold text-[#071a52]">
                  Editar Categoria
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCategoryEdit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  value={editCategoryName || ''}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  placeholder="Ex: RESINAS E SELADORES"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-[#0057ff] uppercase"
                  required
                />
              </div>

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              {/* Botões do Modal com Excluir Categoria */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => {
                    const cat = editingCategory;
                    setEditingCategory(null);
                    setCategoryToDelete(cat);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Categoria</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingCatalogAction}
                    onClick={() => setEditingCategory(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCatalogAction}
                    className="px-4 py-2 rounded-xl bg-[#0057ff] hover:bg-blue-600 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
                  >
                    {isSavingCatalogAction ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DE CATEGORIA                   */}
      {/* ======================================================== */}
      {categoryToDelete && (() => {
        const catGroups = groups.filter((g) => groupBelongsToCategory(g, categoryToDelete.id));
        const exclusiveGroupIds = catGroups
          .filter((g) => getGroupCategoryIds(g).filter((id) => id !== categoryToDelete.id).length === 0)
          .map((g) => g.id);
        const catProductsCount = products.filter(
          (p) => p.categoryId === categoryToDelete.id || exclusiveGroupIds.includes(p.groupId)
        ).length;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071a52]">
                    Excluir Categoria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confirmação de exclusão da categoria
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Categoria:
                </p>
                <p className="text-sm font-extrabold text-[#071a52] uppercase">
                  {categoryToDelete.name}
                </p>
                <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                  <span>Grupos: <strong className="text-slate-800">{catGroups.length}</strong></span>
                  <span>•</span>
                  <span>Produtos: <strong className="text-slate-800">{catProductsCount}</strong></span>
                </div>
              </div>

              {(catGroups.length > 0 || catProductsCount > 0) && (
                <div className="p-3 bg-red-50/70 rounded-xl border border-red-100 text-xs text-red-800 space-y-1">
                  <p className="font-bold">Atenção ao excluir esta categoria:</p>
                  <p>
                    Esta categoria contém <strong>{catGroups.length} grupo(s)</strong> e{' '}
                    <strong>{catProductsCount} produto(s)</strong> vinculados. Todos serão removidos do catálogo.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-600">
                Tem certeza que deseja excluir esta categoria permanentemente?
              </p>

              {catalogActionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{catalogActionError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={() => setCategoryToDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingCatalogAction}
                  onClick={handleConfirmDeleteCategory}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSavingCatalogAction ? 'Excluindo...' : 'Sim, Excluir Categoria'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DE PRODUTO                     */}
      {/* ======================================================== */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071a52]">
                  Excluir Produto
                </h3>
                <p className="text-xs text-slate-500">
                  Confirmação de exclusão do catálogo
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Produto a ser excluído:
              </p>
              <p className="text-sm font-extrabold text-slate-900">
                {productToDelete.name}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                <span>Unidade: <strong className="text-slate-700">{productToDelete.unit}</strong></span>
                <span>•</span>
                <span>Final: <strong className="text-blue-700">R$ {(Number(productToDelete.priceClienteFinal) || 0).toFixed(2).replace('.', ',')}</strong></span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Tem certeza que deseja excluir este produto do grupo? Esta ação atualizará imediatamente o catálogo.
            </p>

            {catalogActionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{catalogActionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSavingCatalogAction}
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingCatalogAction}
                onClick={handleConfirmDeleteProduct}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isSavingCatalogAction ? 'Excluindo...' : 'Sim, Excluir Produto'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
