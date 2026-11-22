export type ProductCalcRule =
  | 'piso_vinilico'
  | 'rodape'
  | 'ripado'
  | 'teto_vinilico'
  | 'manta_hospitalar'
  | 'insumo'
  | 'padrao';

export const PRODUCT_CALC_RULE_OPTIONS: Array<{
  value: ProductCalcRule;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'piso_vinilico',
    label: 'Piso Vinílico (m² ↔ Caixas + Insumos)',
    shortLabel: 'Piso Vinílico',
    description:
      'Calcula por m², converte automaticamente para caixas fechadas e habilita os insumos de piso (autonivelante, primer e cola).',
  },
  {
    value: 'rodape',
    label: 'Rodapés (ML → Barras + Colas)',
    shortLabel: 'Rodapés',
    description:
      'Calcula por metro linear (ML), converte para barras conforme comprimento da embalagem e habilita colas de colar/calafetar.',
  },
  {
    value: 'ripado',
    label: 'Ripados (Dimensões / m² → Barras + Cola)',
    shortLabel: 'Ripados',
    description:
      'Calcula barras conforme dimensões/m² cadastradas e habilita acabamentos e cola de fixação.',
  },
  {
    value: 'teto_vinilico',
    label: 'Teto Vinílico (m² → Réguas / Caixas)',
    shortLabel: 'Teto Vinílico',
    description:
      'Calcula por m² considerando dimensões da régua e embalagem em caixas cadastradas.',
  },
  {
    value: 'manta_hospitalar',
    label: 'Manta Hospitalar (m² → Rolos)',
    shortLabel: 'Manta Hospitalar',
    description:
      'Calcula por rolos fechados de manta e habilita insumos e acabamentos hospitalares.',
  },
  {
    value: 'insumo',
    label: 'Insumo / Acabamento / Limpeza',
    shortLabel: 'Insumo / Acabamento',
    description:
      'Colas, primers, massas autonivelantes, acabamentos, perfis, cantoneiras e limpeza.',
  },
  {
    value: 'padrao',
    label: 'Padrão (Sem conversão especial)',
    shortLabel: 'Padrão',
    description:
      'Utiliza exatamente a unidade e quantidade informadas manualmente no orçamento.',
  },
];

export const VALID_PRODUCT_CALC_RULES = new Set<ProductCalcRule>([
  'piso_vinilico',
  'rodape',
  'ripado',
  'teto_vinilico',
  'manta_hospitalar',
  'insumo',
  'padrao',
]);

export function normalizeCalcRuleText(val?: string | null): string {
  return (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getCalcRuleShortLabel(rule: ProductCalcRule): string {
  return (
    PRODUCT_CALC_RULE_OPTIONS.find((opt) => opt.value === rule)?.shortLabel ||
    'Padrão'
  );
}

const KNOWN_PISO_CATEGORY_IDS = new Set([
  '0368b74c-2647-4e35-aeee-a3a5667561fd',
  'cat_pisos_vinilicos',
]);

const KNOWN_RODAPE_CATEGORY_IDS = new Set([
  '54ff2da7-1c77-458d-834e-77acaf3063f8',
  '5359db09-6718-4c3d-908f-59317607d223',
  'cat_rodapes_poliestireno',
  'cat_rodapes_mdf',
]);

const KNOWN_RIPADO_CATEGORY_IDS = new Set([
  '6f1a358c-63c6-4422-8066-d71e5938fbf3',
  '839e7b87-10d8-40d4-8f51-9fd294252b42',
  'cat_ripado_poliestireno',
  'cat_ripado_mdf',
]);

const KNOWN_MANTA_CATEGORY_IDS = new Set([
  '83c3e2f0-dfa2-4e09-a233-ce0222b78d3b',
  'cat_manta_hospitalar',
]);

const KNOWN_INSUMO_CATEGORY_IDS = new Set([
  '17e0cbc7-9c53-4284-ae38-a33e9d64cc18',
  'cat_cola_rodape',
  'cat_cola_ripado',
  'cat_adesivo_ripado',
]);

const INSUMO_NAME_REGEX =
  /\b(limpa|limpeza|detergente|removedor|cera|sabao|limpador|cola|colas|adesivo|adesivos|primer|primers|autonivelante|autonivelantes|massa|massas|endurecedor|contrapiso|cordao de solda|cordao|suporte canto|suporte|perfil de arremate|perfil|acabamento|cantoneira|emenda|terminacao|calafetar|bisnaga|selante|desempenadeira|espatula|bico|rolete|lixa|insumo|insumos)\b/;

const INSUMO_CAT_OR_GROUP_REGEX =
  /\b(limpa|limpeza|detergente|cola|colas|adesivo|adesivos|primer|primers|autonivelante|autonivelantes|massa|massas|endurecedor|insumo|insumos|selante|calafetar|ferramenta|ferramentas)\b/;

/**
 * Categorias técnicas incompatíveis que NÃO devem cair no fallback por nome de produto principal.
 * Categorias comerciais (ex: PROMOÇÕES ATIVAS, OFERTAS, BLACK FRIDAY, GERAL, OUTLET) NÃO são bloqueadas.
 */
const TECHNICAL_NON_MAIN_PRODUCT_CATEGORY_REGEX =
  /\b(limpa|limpeza|cola|colas|adesivo|adesivos|primer|primers|autonivelante|massa|massas|insumo|insumos|ferramenta|ferramentas|servico|servicos|mao de obra|frete)\b/;

export function isExplicitInsumoProductText(
  productName?: string,
  categoryName?: string,
  categoryId?: string,
  groupName?: string
): boolean {
  const cId = normalizeCalcRuleText(categoryId);
  if (cId && KNOWN_INSUMO_CATEGORY_IDS.has(cId)) {
    return true;
  }

  const pNorm = normalizeCalcRuleText(productName);
  const cNorm = normalizeCalcRuleText(categoryName);
  const gNorm = normalizeCalcRuleText(groupName);

  if (cNorm && INSUMO_CAT_OR_GROUP_REGEX.test(cNorm)) {
    return true;
  }

  if (gNorm && gNorm !== 'sem grupo' && INSUMO_CAT_OR_GROUP_REGEX.test(gNorm)) {
    return true;
  }

  if (pNorm && INSUMO_NAME_REGEX.test(pNorm)) {
    return true;
  }

  return false;
}

export function inferRuleFromCategoryText(
  categoryName?: string,
  categoryId?: string
): ProductCalcRule | null {
  const cId = normalizeCalcRuleText(categoryId);
  const cNorm = normalizeCalcRuleText(categoryName);

  if (cId && KNOWN_INSUMO_CATEGORY_IDS.has(cId)) return 'insumo';
  if (cNorm && INSUMO_CAT_OR_GROUP_REGEX.test(cNorm)) return 'insumo';

  if (
    KNOWN_MANTA_CATEGORY_IDS.has(cId) ||
    cId.includes('manta') ||
    cNorm.includes('manta')
  ) {
    return 'manta_hospitalar';
  }

  if (
    KNOWN_RODAPE_CATEGORY_IDS.has(cId) ||
    cId.includes('rodape') ||
    (cNorm.includes('rodape') && !cNorm.includes('cola'))
  ) {
    return 'rodape';
  }

  if (
    KNOWN_RIPADO_CATEGORY_IDS.has(cId) ||
    cId.includes('ripad') ||
    (cNorm.includes('ripad') && !cNorm.includes('cola') && !cNorm.includes('adesiv'))
  ) {
    return 'ripado';
  }

  if (cId.includes('teto') || cNorm.includes('teto') || cNorm.includes('forro')) {
    return 'teto_vinilico';
  }

  if (
    KNOWN_PISO_CATEGORY_IDS.has(cId) ||
    (cNorm.includes('piso') &&
      !cNorm.includes('contra') &&
      !cNorm.includes('cola') &&
      !cNorm.includes('limpa'))
  ) {
    return 'piso_vinilico';
  }

  return null;
}

export function inferRuleFromGroupNameText(
  groupName?: string
): ProductCalcRule | null {
  const gNorm = normalizeCalcRuleText(groupName);
  if (!gNorm || gNorm === 'sem grupo') return null;

  if (INSUMO_CAT_OR_GROUP_REGEX.test(gNorm) || gNorm.includes('acabamento')) {
    return 'insumo';
  }
  if (gNorm.includes('manta') || gNorm.includes('hospitalar')) {
    return 'manta_hospitalar';
  }
  if (gNorm.includes('rodape')) {
    return 'rodape';
  }
  if (gNorm.includes('ripad')) {
    return 'ripado';
  }
  if (gNorm.includes('teto') || gNorm.includes('forro')) {
    return 'teto_vinilico';
  }
  if (
    (gNorm.includes('piso') && !gNorm.includes('contra') && !gNorm.includes('limpa')) ||
    gNorm.includes('vinilico') ||
    gNorm.includes('vinilforte') ||
    gNorm.includes('flexfloor')
  ) {
    return 'piso_vinilico';
  }

  return null;
}

export function inferRuleFromProductNameText(
  productName?: string
): ProductCalcRule | null {
  const pNorm = normalizeCalcRuleText(productName);
  if (!pNorm) return null;

  if (INSUMO_NAME_REGEX.test(pNorm)) {
    return 'insumo';
  }
  if (pNorm.includes('rodape')) {
    return 'rodape';
  }
  if (pNorm.includes('ripad')) {
    return 'ripado';
  }
  if (
    pNorm.includes('teto vinilico') ||
    pNorm.startsWith('teto ') ||
    pNorm.includes('forro vinilico')
  ) {
    return 'teto_vinilico';
  }
  if (
    pNorm.includes('manta hospitalar') ||
    (pNorm.includes('manta') && !pNorm.includes('piso'))
  ) {
    return 'manta_hospitalar';
  }
  if (
    pNorm.includes('piso vinilico') ||
    pNorm.includes('piso flexfloor') ||
    pNorm.includes('piso vinilforte') ||
    (pNorm.startsWith('piso ') && !pNorm.includes('manta'))
  ) {
    return 'piso_vinilico';
  }

  return null;
}

export interface ResolveCalcRuleInput {
  productName?: string;
  categoryName?: string;
  categoryId?: string;
  groupName?: string;
  groupId?: string;
  groupCalcRule?: ProductCalcRule | string;
}

/**
 * Resolve a regra de cálculo do produto separando Categoria (organização comercial)
 * de Grupo (natureza técnica e regra de cálculo).
 *
 * Prioridade:
 * 1. Proteção de Insumo/Acabamento/Limpeza (cola, primer, autonivelante, perfil, limpa piso, etc.)
 * 2. Regra explícita cadastrada no Grupo (`groupCalcRule`)
 * 3. Inferência pelo nome do Grupo (`groupName`, ex: "PISO VINÍLICO", "RODAPÉS", "RIPADOS", "TETO VINÍLICO")
 * 4. Inferência pela categoria técnica padrão (ex: "PISOS VINÍLICOS" para grupos por marca como FLEXFLOOR/07CM)
 * 5. Inferência segura pelo nome do produto (quando a categoria é comercial, ex: "PROMOÇÕES ATIVAS", "Geral")
 */
export function resolveProductCalcRule(
  input: ResolveCalcRuleInput
): ProductCalcRule {
  const {
    productName,
    categoryName,
    categoryId,
    groupName,
    groupCalcRule,
  } = input;

  // 1. Proteção absoluta contra falso positivo em insumos, colas, acabamentos e limpeza
  if (isExplicitInsumoProductText(productName, categoryName, categoryId, groupName)) {
    return 'insumo';
  }

  // 2. Regra explícita do Grupo (permite que qualquer grupo em PROMOÇÕES ATIVAS defina a regra)
  const rawExplicitRule = (groupCalcRule || '').trim() as ProductCalcRule;
  if (rawExplicitRule && VALID_PRODUCT_CALC_RULES.has(rawExplicitRule)) {
    return rawExplicitRule;
  }

  // 3. Inferência pelo nome do Grupo (ex.: grupo "PISO VINÍLICO" dentro de "PROMOÇÕES ATIVAS")
  const byGroupName = inferRuleFromGroupNameText(groupName);
  if (byGroupName) {
    return byGroupName;
  }

  // 4. Inferência pela categoria técnica padrão (preserva grupos por marca/tamanho como FLEXFLOOR, 07CM, SLIM, PIX IN TETO)
  const byCategory = inferRuleFromCategoryText(categoryName, categoryId);
  if (byCategory) {
    return byCategory;
  }

  // 5. Fallback pelo nome do produto quando a categoria é comercial/customizada (ex: PROMOÇÕES ATIVAS, OFERTAS, GERAL)
  const cNorm = normalizeCalcRuleText(categoryName);
  if (!cNorm || !TECHNICAL_NON_MAIN_PRODUCT_CATEGORY_REGEX.test(cNorm)) {
    const byName = inferRuleFromProductNameText(productName);
    if (byName) {
      return byName;
    }
  }

  return 'padrao';
}

/**
 * Sugere automaticamente a regra de cálculo padrão ao criar ou editar um Grupo no CRM.
 */
export function inferDefaultCalcRuleForGroup(
  groupName?: string,
  categoryName?: string,
  categoryId?: string
): ProductCalcRule {
  return (
    inferRuleFromGroupNameText(groupName) ||
    inferRuleFromCategoryText(categoryName, categoryId) ||
    'padrao'
  );
}
