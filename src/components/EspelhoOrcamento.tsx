import React, { useId } from 'react';
import {
  User,
  FileText,
  Package,
  Truck,
  Tag,
  Calculator,
  DollarSign,
} from 'lucide-react';
import { FenixOfficialLogo } from './FenixOfficialLogo';
import { isRodapeProduct, stripRodapeAutoDetail } from '../utils/rodapeCalculator';
import { ProductCalcRule } from '../utils/productCalcRules';
import {
  CustomThemeConfig,
  FenixThemeId,
  getThemeDefinition,
  useFenixTheme,
} from '../utils/themeService';
import {
  EspelhoBottomWaveDecorations,
  EspelhoFooterUnderlineOrnament,
  EspelhoFrameCornerDecorations,
  EspelhoHeaderDecorations,
  EspelhoSectionHeaderAccent,
  EspelhoTotalBoxDecorations,
  NatalDecoradoHeaderWaveSvg,
} from './ThemeDecorations';
import {
  NATAL_DECORADO_BOTTOM_ART_BASE64,
  NATAL_DECORADO_HEADER_ART_BASE64,
} from '../assets/natalDecoradoAssets';
import {
  ANO_NOVO_BOTTOM_ART_BASE64,
  ANO_NOVO_HEADER_BG_BASE64,
  ANO_NOVO_HEADER_CORNER_BASE64,
} from '../assets/anoNovoAssets';
import {
  DIA_MAES_BOTTOM_ART_BASE64,
  DIA_MAES_HEADER_BG_BASE64,
  DIA_MAES_HEADER_CORNER_BASE64,
} from '../assets/diaDasMaesAssets';
import {
  DIA_PAIS_BOTTOM_ART_BASE64,
  DIA_PAIS_HEADER_BG_BASE64,
  DIA_PAIS_HEADER_CORNER_BASE64,
} from '../assets/diaDosPaisAssets';

export interface EspelhoItem {
  id: string;
  qtd: string;
  qtdDetalhe?: string;
  descricao: string;
  subtitulo?: string;
  unidade: string;
  precoUnitario: number;
  total: number;
  requestedMl?: number;
  barLengthMeters?: number;
  autoTag?: string;
  catalogProductId?: string;
  groupId?: string;
  groupName?: string;
  calcRule?: ProductCalcRule;
}

export interface EspelhoOrcamentoProps {
  id?: string;
  clientName: string;
  clientType: string;
  clientContact: string;
  consultoraName: string;
  dataOrcamento: string;
  observacoes: string;
  observacoesRodape?: string;
  items: EspelhoItem[];
  freteValor: number;
  freteEndereco: string;
  subtotal?: number;
  descontoValor?: number;
  descontoTexto?: string;
  totalFinal: number;
  companyAddress?: string;
  exibirQuantidade?: boolean;
  previewThemeId?: FenixThemeId;
  previewCustomTheme?: CustomThemeConfig;
  previewDecorated?: boolean;
  previewShowDecorations?: boolean;
}

const stripBoxQuantityText = (raw?: string): string => {
  if (!raw) return '';
  return raw
    .split('\n')
    .map((line) =>
      line
        .replace(
          /\b\d+\s*(?:caixas?|cxs?)(?:\s*\(\s*[\d.,]+\s*m[²2]\s*\))?(?:\s*\+\s*\d+\s*r[ée]guas?)?/gi,
          ''
        )
        .replace(/^[\s\-|•+/]+|[\s\-|•+/]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
};

export const EspelhoOrcamento: React.FC<EspelhoOrcamentoProps> = ({
  id = 'espelho-oficial-orcamento',
  clientName,
  clientType: _clientType,
  clientContact,
  consultoraName,
  dataOrcamento,
  observacoes,
  observacoesRodape,
  items,
  freteValor,
  freteEndereco,
  subtotal,
  descontoValor,
  descontoTexto,
  totalFinal,
  companyAddress,
  exibirQuantidade = true,
  previewThemeId,
  previewCustomTheme,
  previewDecorated,
  previewShowDecorations,
}) => {
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '');

  const exportTarget =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-fenix-pdf-export') === 'true'
      ? 'pdf'
      : 'orcamento';
  const activeBudgetTheme = useFenixTheme(exportTarget);

  const theme = previewThemeId
    ? getThemeDefinition(previewThemeId, previewCustomTheme)
    : activeBudgetTheme.theme;

  const isNatalDecorado = theme.id === 'natal';
  const isAnoNovo = theme.id === 'ano_novo';
  const isDiaDasMaes = theme.id === 'dia_das_maes';
  const isDiaDosPais = theme.id === 'dia_dos_pais';
  const isDecorated = isNatalDecorado;

  const b = theme.budget;

  const formatMoney = (val?: number | null) =>
    (typeof val === 'number' && !isNaN(val) ? val : 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  const calculatedSubtotal =
    typeof subtotal === 'number' && !isNaN(subtotal)
      ? subtotal
      : items.reduce((acc, item) => acc + (Number(item.total) || 0), 0);

  const hasDesconto =
    typeof descontoValor === 'number' &&
    !isNaN(descontoValor) &&
    descontoValor > 0;

  const hasFrete = freteValor > 0;

  const displayDescontoTexto =
    descontoTexto && descontoTexto.trim().length > 0
      ? descontoTexto.trim()
      : 'DESCONTO PARA PAGAMENTO VIA PIX';

  return (
    <div
      id={id}
      data-fenix-budget-theme={theme.id}
      data-fenix-budget-variant="classico"
      className="relative w-full min-w-[960px] max-w-[1040px] mx-auto bg-white text-slate-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border overflow-hidden select-none print:shadow-none print:rounded-none print:min-w-full"
      style={{
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
        borderColor: b.outerBorder,
      }}
    >
      {isDecorated && (
        <EspelhoFrameCornerDecorations themeId={theme.id} accentColor={b.headerGlowStroke} />
      )}
      {/* =================================================================== */}
      {/* 1. CABEÇALHO OFICIAL PREMIUM — REPRODUÇÃO FIEL DO MODELO MESTRE     */}
      {/* =================================================================== */}
      <div
        className={`relative w-full flex items-stretch justify-between ${
          isAnoNovo || isDiaDasMaes || isDiaDosPais
            ? 'min-h-[118px]'
            : 'overflow-hidden min-h-[116px]'
        }`}
      >
        {/* Fundo SVG Curvo Oficial PREMIUM (ou Arte Exata da Referência no Natal / Ano Novo / Dia das Mães / Dia dos Pais) */}
        {isAnoNovo || isDiaDasMaes || isDiaDosPais ? (
          <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
            <img
              src={
                isDiaDasMaes
                  ? DIA_MAES_HEADER_BG_BASE64
                  : isDiaDosPais
                  ? DIA_PAIS_HEADER_BG_BASE64
                  : ANO_NOVO_HEADER_BG_BASE64
              }
              alt=""
              aria-hidden="true"
              className="w-full h-full object-fill block"
            />
          </div>
        ) : isNatalDecorado ? (
          <NatalDecoradoHeaderWaveSvg uid={uid} />
        ) : (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none block"
          preserveAspectRatio="none"
          viewBox="0 0 1040 120"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`hdr-light-${uid}`} x1="0" y1="0" x2="1040" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerLightBgStart} />
              <stop offset="48%" stopColor={b.headerLightBgMid} />
              <stop offset="100%" stopColor={b.headerLightBgEnd} />
            </linearGradient>
            <linearGradient id={`hdr-back-${uid}`} x1="320" y1="120" x2="900" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerWaveBackStart} stopOpacity="0.3" />
              <stop offset="55%" stopColor={b.headerWaveBackEnd} stopOpacity="0.65" />
              <stop offset="100%" stopColor={b.headerWaveFrontStart} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id={`hdr-mid-${uid}`} x1="380" y1="115" x2="960" y2="10" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerWaveFrontStart} stopOpacity="0.85" />
              <stop offset="60%" stopColor={b.headerWaveFrontMid} stopOpacity="0.92" />
              <stop offset="100%" stopColor={b.headerWaveFrontEnd} stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id={`hdr-front-${uid}`} x1="450" y1="120" x2="1040" y2="10" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerWaveFrontStart} />
              <stop offset="45%" stopColor={b.headerWaveFrontMid} />
              <stop offset="100%" stopColor={b.headerWaveFrontEnd} />
            </linearGradient>
            <linearGradient id={`hdr-glow-${uid}`} x1="200" y1="116" x2="730" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerGlowStroke} stopOpacity="0" />
              <stop offset="38%" stopColor={b.headerGlowStroke} stopOpacity="0.85" />
              <stop offset="68%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor={b.headerGlowStroke} stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id={`hdr-bar-${uid}`} x1="0" y1="116" x2="1040" y2="116" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={b.headerBottomBarBg} />
              <stop offset="28%" stopColor={b.headerGlowStroke} />
              <stop offset="32%" stopColor="#ffffff" />
              <stop offset="36%" stopColor={b.headerGlowStroke} />
              <stop offset="66%" stopColor={b.headerBottomBarBg} />
              <stop offset="70%" stopColor="#ffffff" />
              <stop offset="74%" stopColor={b.headerGlowStroke} />
              <stop offset="100%" stopColor={b.headerWaveFrontEnd} />
            </linearGradient>
          </defs>

          {/* Base Clara Esquerda */}
          <rect x="0" y="0" width="1040" height="120" fill={`url(#hdr-light-${uid})`} />

          {/* Onda Translúcida Traseira */}
          <path
            d="M 275 118 C 435 106, 535 50, 650 0 L 1040 0 L 1040 120 L 275 120 Z"
            fill={`url(#hdr-back-${uid})`}
          />

          {/* Onda Intermediária */}
          <path
            d="M 350 118 C 495 96, 578 36, 698 0 L 1040 0 L 1040 120 L 350 120 Z"
            fill={`url(#hdr-mid-${uid})`}
          />

          {/* Painel Curvo Principal Direito */}
          <path
            d="M 425 118 C 548 92, 616 26, 748 0 L 1040 0 L 1040 120 L 425 120 Z"
            fill={`url(#hdr-front-${uid})`}
          />

          {/* Reflexo Sutil Superior */}
          <path
            d="M 520 0 C 615 36, 730 50, 885 16 C 955 2, 1005 0, 1040 0 L 1040 36 C 940 58, 760 66, 635 28 C 585 12, 545 4, 520 0 Z"
            fill="#ffffff"
            fillOpacity="0.11"
          />

          {/* Arco Luminoso na Transição da Onda */}
          <path
            d="M 225 116 C 425 110, 555 56, 706 0"
            stroke={`url(#hdr-glow-${uid})`}
            strokeWidth="2.4"
            fill="none"
          />

          {/* Faixa Inferior Brilhante do Cabeçalho */}
          <rect x="0" y="115.5" width="1040" height="4.5" fill={`url(#hdr-bar-${uid})`} />
        </svg>
        )}

        {isDecorated && <EspelhoHeaderDecorations themeId={theme.id} uid={uid} />}

        {/* Lado Esquerdo: Logo Oficial Fênix World (100% ORIGINAL) + Dados da Empresa */}
        <div
          className={`relative z-10 flex items-center gap-4 sm:gap-5 py-3.5 px-6 sm:px-7 min-w-0 flex-1 ${
            isDecorated || isAnoNovo || isDiaDasMaes || isDiaDosPais
              ? 'max-w-[calc(100%-465px)]'
              : 'max-w-[calc(100%-390px)]'
          }`}
        >
          {/* Logo Oficial Fênix World sem filtros, sem recoloração, mantendo proporções originais */}
          <div className="flex items-center flex-shrink-0">
            <FenixOfficialLogo height={64} className="py-0.5" />
          </div>

          {/* Linha Divisória Vertical */}
          <div
            className="h-14 w-[1.5px] flex-shrink-0 self-center"
            style={{ backgroundColor: b.dividerLine }}
          />

          {/* Dados da Empresa */}
          <div className="text-left leading-snug min-w-0 flex-1">
            <h2
              className="text-[14.5px] sm:text-[15.5px] font-black tracking-[0.02em] uppercase truncate"
              style={{ color: b.companyTitleColor }}
            >
              FÊNIX WORLD DISTRIBUIDORA
            </h2>
            <div
              className="text-[12px] font-medium mt-0.5 break-words whitespace-normal leading-[1.35]"
              style={{ color: b.companyAddressColor }}
            >
              {companyAddress ? (
                companyAddress.split('\n').map((line, idx) => (
                  <p key={idx} className="break-words whitespace-normal">
                    {line}
                  </p>
                ))
              ) : (
                <>
                  <p className="break-words whitespace-normal">
                    R. José Belesso, 368 - Vila Caodaglio
                  </p>
                  <p className="break-words whitespace-normal">
                    Jundiaí - SP, 13216-200
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Lado Direito: Ícone + Divisória + Título ORÇAMENTO e Data */}
        <div
          className={`relative flex items-center justify-end gap-4 py-4 flex-shrink-0 ${
            isNatalDecorado || isAnoNovo || isDiaDasMaes || isDiaDosPais
              ? 'z-[13] pr-32 sm:pr-[150px] pl-4'
              : isDecorated
              ? 'z-10 pr-36 sm:pr-40 pl-4'
              : 'z-10 pr-7 sm:pr-9 pl-6'
          }`}
        >
          {/* Ícone Arredondado com 3 Barras */}
          <div
            className="w-11 h-11 rounded-[11px] border-[1.8px] flex flex-col items-center justify-center gap-[4.5px] px-2.5 flex-shrink-0"
            style={{
              borderColor: b.bannerIconBorder,
              backgroundColor: isAnoNovo
                ? 'rgba(4, 28, 66, 0.55)'
                : isDiaDasMaes
                ? 'rgba(110, 8, 34, 0.45)'
                : isDiaDosPais
                ? 'rgba(0, 24, 72, 0.55)'
                : 'rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              className="w-full h-[2.4px] rounded-full"
              style={{ backgroundColor: b.bannerIconBars }}
            />
            <div
              className="w-full h-[2.4px] rounded-full"
              style={{ backgroundColor: b.bannerIconBars }}
            />
            <div
              className="w-[78%] self-start h-[2.4px] rounded-full"
              style={{ backgroundColor: b.bannerIconBars }}
            />
          </div>

          {/* Divisória Vertical */}
          <div
            className="h-12 w-[1.5px] flex-shrink-0"
            style={{ backgroundColor: b.bannerDivider }}
          />

          {/* Título ORÇAMENTO + Data */}
          <div className="flex flex-col items-center text-center flex-shrink-0">
            <h1
              className="text-[30px] sm:text-[32px] font-black tracking-[0.04em] uppercase leading-none whitespace-nowrap"
              style={{
                color: b.bannerTitleColor,
                textShadow: '0 2px 6px rgba(0,0,0,0.28)',
              }}
            >
              ORÇAMENTO
            </h1>
            <span
              className="text-[12.5px] font-medium mt-1.5 whitespace-nowrap"
              style={{ color: b.bannerSubtextColor }}
            >
              Data do Orçamento:{' '}
              <strong
                className="font-bold"
                style={{ color: isNatalDecorado ? '#fde047' : b.bannerDateColor }}
              >
                {dataOrcamento}
              </strong>
            </span>
          </div>
        </div>

        {/* Pontas decorativas no canto superior direito (Ano Novo / Dia das Mães) */}
        {isAnoNovo && (
          <img
            src={ANO_NOVO_HEADER_CORNER_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute top-[calc(100%-1px)] right-0 w-[15.88%] h-auto pointer-events-none select-none z-[12]"
          />
        )}
        {isDiaDasMaes && (
          <img
            src={DIA_MAES_HEADER_CORNER_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute top-[calc(100%-1px)] right-0 w-[15.09%] h-auto pointer-events-none select-none z-[12]"
          />
        )}
        {isDiaDosPais && (
          <img
            src={DIA_PAIS_HEADER_CORNER_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute top-[calc(100%-1px)] right-0 w-[11.42%] h-auto pointer-events-none select-none z-[12]"
          />
        )}
      </div>

      {/* Composição exata do canto superior direito do Natal Decorado (galhos, laço, sinos e bola) */}
      {isNatalDecorado && (
        <img
          src={NATAL_DECORADO_HEADER_ART_BASE64}
          alt=""
          aria-hidden="true"
          className="absolute top-0 right-0 w-[26%] h-auto pointer-events-none select-none z-[12]"
        />
      )}

      {/* =================================================================== */}
      {/* CORPO PRINCIPAL                                                     */}
      {/* =================================================================== */}
      <div className="px-5 pt-4 pb-3 space-y-3.5 bg-white">
        {/* ================================================================= */}
        {/* 2. DADOS DO CLIENTE & INFORMAÇÕES DO ORÇAMENTO                    */}
        {/* ================================================================= */}
        <div className="grid grid-cols-2 gap-4">
          {/* Quadro 1: DADOS DO CLIENTE */}
          <div
            className="rounded-[10px] border overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
            style={{ borderColor: b.blockBorder }}
          >
            <div
              className="relative overflow-hidden px-3.5 py-[7px] flex items-center gap-2"
              style={{
                background: isNatalDecorado
                  ? 'linear-gradient(180deg, #d3050c 0%, #a60106 52%, #7a0103 100%)'
                  : `linear-gradient(180deg, ${b.sectionHeaderFrom} 0%, ${b.sectionHeaderTo} 100%)`,
                color: b.sectionHeaderText,
              }}
            >
              <User className="w-[16px] h-[16px] stroke-[2] flex-shrink-0" />
              <span className="text-[12.5px] font-bold tracking-[0.04em] uppercase">
                DADOS DO CLIENTE
              </span>
              {isDecorated && <EspelhoSectionHeaderAccent themeId={theme.id} />}
            </div>

            <div className="text-[13px]">
              <div className="px-4 py-2.5 flex items-center">
                <span
                  className="w-[82px] font-bold flex-shrink-0"
                  style={{ color: b.labelColor }}
                >
                  Cliente:
                </span>
                <span className="text-slate-900 font-bold truncate">
                  {clientName || 'Cliente'}
                </span>
              </div>
              <div className="mx-4 border-t" style={{ borderColor: b.rowDivider }} />
              <div className="px-4 py-2.5 flex items-center">
                <span
                  className="w-[82px] font-bold flex-shrink-0"
                  style={{ color: b.labelColor }}
                >
                  Contato:
                </span>
                <span className="text-slate-900 font-bold">
                  {clientContact || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Quadro 2: INFORMAÇÕES DO ORÇAMENTO */}
          <div
            className="rounded-[10px] border overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
            style={{ borderColor: b.blockBorder }}
          >
            <div
              className="relative overflow-hidden px-3.5 py-[7px] flex items-center gap-2"
              style={{
                background: isNatalDecorado
                  ? 'linear-gradient(180deg, #d3050c 0%, #a60106 52%, #7a0103 100%)'
                  : `linear-gradient(180deg, ${b.sectionHeaderFrom} 0%, ${b.sectionHeaderTo} 100%)`,
                color: b.sectionHeaderText,
              }}
            >
              <FileText className="w-[15.5px] h-[15.5px] stroke-[2] flex-shrink-0" />
              <span className="text-[12.5px] font-bold tracking-[0.04em] uppercase">
                INFORMAÇÕES DO ORÇAMENTO
              </span>
              {isDecorated && <EspelhoSectionHeaderAccent themeId={theme.id} />}
            </div>

            <div className="text-[13px]">
              <div className="px-4 py-2.5 flex items-center">
                <span
                  className="w-[164px] font-bold flex-shrink-0"
                  style={{ color: b.labelColor }}
                >
                  {(consultoraName || '').toLowerCase().includes('eder')
                    ? 'Diretor Comercial:'
                    : 'Consultora Comercial:'}
                </span>
                <span className="text-slate-900 font-bold truncate">
                  {consultoraName || 'Jhessica Camargo'}
                </span>
              </div>
              <div className="mx-4 border-t" style={{ borderColor: b.rowDivider }} />
              <div className="px-4 py-2.5 flex items-center">
                <span
                  className="w-[164px] font-bold flex-shrink-0"
                  style={{ color: b.labelColor }}
                >
                  Observações:
                </span>
                <span className="text-slate-900 font-bold truncate">
                  {observacoes ? observacoes : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. SEÇÃO DESCRIÇÃO DOS PRODUTOS + TABELA                          */}
        {/* ================================================================= */}
        <div
          className="rounded-[10px] border overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
          style={{ borderColor: b.blockBorder }}
        >
          {/* Barra Superior: DESCRIÇÃO DOS PRODUTOS */}
          <div
            className="relative overflow-hidden px-4 py-[7px] flex items-center gap-2.5"
            style={{
              background: isNatalDecorado
                ? 'linear-gradient(90deg, #880105 0%, #cf0912 50%, #880105 100%)'
                : `linear-gradient(90deg, ${b.tableSectionFrom} 0%, ${b.tableSectionMid} 50%, ${b.tableSectionTo} 100%)`,
              color: b.tableSectionText,
            }}
          >
            <Package className="w-[17px] h-[17px] stroke-[2] flex-shrink-0" />
            <span className="text-[12.5px] font-bold tracking-[0.04em] uppercase">
              DESCRIÇÃO DOS PRODUTOS
            </span>
            {isDecorated && <EspelhoSectionHeaderAccent themeId={theme.id} />}
          </div>

          {/* Linha Luminosa Entre Título da Seção e Cabeçalho da Tabela */}
          <div className="h-[2px] w-full" style={{ background: b.tableBarGlow }} />

          {/* Tabela Oficial com 5 Colunas e Proporções Exatas */}
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="text-[11.5px] font-extrabold uppercase tracking-[0.04em]"
                style={{
                  background: isNatalDecorado
                    ? 'linear-gradient(180deg, #8b0106 0%, #580103 100%)'
                    : `linear-gradient(180deg, ${b.tableHeaderFrom} 0%, ${b.tableHeaderTo} 100%)`,
                  color: b.tableHeaderText,
                }}
              >
                {exibirQuantidade && (
                  <th
                    className="py-2 px-3 text-center w-[11%] border-r"
                    style={{ borderRightColor: b.tableHeaderDivider }}
                  >
                    QTD
                  </th>
                )}
                <th
                  className={`py-2 px-4 text-center ${
                    exibirQuantidade ? 'w-[43%]' : 'w-[54%]'
                  } border-r`}
                  style={{ borderRightColor: b.tableHeaderDivider }}
                >
                  DESCRIÇÃO DO PRODUTO
                </th>
                <th
                  className="py-2 px-3 text-center w-[11%] border-r"
                  style={{ borderRightColor: b.tableHeaderDivider }}
                >
                  UNID.
                </th>
                <th
                  className="py-2 px-3 text-center w-[17%] border-r"
                  style={{ borderRightColor: b.tableHeaderDivider }}
                >
                  PREÇO UNITÁRIO
                </th>
                <th className="py-2 px-3 text-center w-[18%]">TOTAL</th>
              </tr>
            </thead>

            <tbody className="text-[13px]">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={exibirQuantidade ? 5 : 4}
                    className="py-8 text-center text-slate-400 font-medium italic"
                  >
                    Nenhum produto adicionado ao orçamento.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr
                    key={item.id || index}
                    className="border-b last:border-b-0"
                    style={{ borderBottomColor: b.tableBorder }}
                  >
                    {/* QTD */}
                    {exibirQuantidade && (
                      <td
                        className="py-2.5 px-3 text-center font-medium text-slate-900 border-r"
                        style={{ borderRightColor: b.tableBorder }}
                      >
                        <div>{item.qtd}</div>
                      </td>
                    )}

                    {/* DESCRIÇÃO DO PRODUTO */}
                    <td
                      className="py-2.5 px-4 text-left border-r"
                      style={{ borderRightColor: b.tableBorder }}
                    >
                      {(() => {
                        const isRodapeItem = isRodapeProduct(
                          item.descricao,
                          undefined,
                          undefined,
                          item.groupName,
                          item.calcRule
                        );
                        const baseSubtitulo = isRodapeItem
                          ? stripRodapeAutoDetail(item.subtitulo)
                          : item.subtitulo;
                        const visibleSubtitulo = exibirQuantidade
                          ? baseSubtitulo
                          : stripBoxQuantityText(baseSubtitulo);
                        return (
                          <>
                            <div className="text-slate-900 font-medium leading-[1.35]">
                              {item.descricao}
                            </div>
                            {visibleSubtitulo && (
                              <div
                                className="text-[11px] font-bold uppercase tracking-wide mt-0.5 whitespace-pre-line"
                                style={{ color: b.productDetailColor }}
                              >
                                {visibleSubtitulo}
                              </div>
                            )}
                            {exibirQuantidade &&
                              !isRodapeItem &&
                              !visibleSubtitulo?.includes(item.qtdDetalhe || '') &&
                              item.qtdDetalhe && (
                                <div
                                  className="text-[11px] font-bold uppercase tracking-wide mt-0.5"
                                  style={{ color: b.productDetailColor }}
                                >
                                  {item.qtdDetalhe}
                                </div>
                              )}
                          </>
                        );
                      })()}
                    </td>

                    {/* UNID. */}
                    <td
                      className="py-2.5 px-3 text-center font-medium text-slate-800 border-r"
                      style={{ borderRightColor: b.tableBorder }}
                    >
                      {item.unidade}
                    </td>

                    {/* PREÇO UNITÁRIO */}
                    <td
                      className="py-2.5 px-3 text-center font-medium text-slate-900 border-r tabular-nums"
                      style={{ borderRightColor: b.tableBorder }}
                    >
                      {formatMoney(item.precoUnitario)}
                    </td>

                    {/* TOTAL DO ITEM */}
                    <td
                      className="py-2.5 px-3 text-center font-bold text-[14px] tabular-nums"
                      style={{
                        backgroundColor: b.totalColumnBg,
                        color: b.itemTotalColor,
                      }}
                    >
                      {formatMoney(item.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ================================================================= */}
        {/* DESCONTO & SUBTOTAL (EXIBIDOS SOMENTE QUANDO HÁ DESCONTO)         */}
        {/* ================================================================= */}
        {hasDesconto && (
          <div className="flex items-stretch gap-4">
            <div
              className="flex-1 rounded-[14px] border py-3 px-5 flex items-center justify-between shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
              style={{
                borderColor: b.discountBorder,
                backgroundColor: b.discountBg,
              }}
            >
              <div
                className="flex items-center gap-2.5 font-black text-[13px] uppercase tracking-wide"
                style={{ color: b.discountTextColor }}
              >
                <Tag
                  className="w-5 h-5 stroke-[2.2] flex-shrink-0"
                  style={{ color: b.discountIconColor }}
                />
                <span>{displayDescontoTexto}</span>
              </div>
              <div
                className="text-[18px] font-black whitespace-nowrap pl-2 tabular-nums"
                style={{ color: b.discountValueColor }}
              >
                - {formatMoney(descontoValor)}
              </div>
            </div>

            <div
              className="flex-1 rounded-[14px] border py-3 px-5 flex items-center justify-between shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden"
              style={{
                borderColor: b.subtotalBorder,
                background: b.subtotalGradient,
              }}
            >
              <div
                className="flex items-center gap-2.5 font-black text-[13px] uppercase tracking-wider"
                style={{ color: b.subtotalTextColor }}
              >
                <Calculator
                  className="w-5 h-5 stroke-[2.2] flex-shrink-0"
                  style={{ color: b.subtotalTextColor }}
                />
                <span>SUBTOTAL:</span>
              </div>
              <div
                className="text-[21px] font-black tracking-tight leading-none whitespace-nowrap pl-2 tabular-nums"
                style={{ color: b.subtotalValueColor }}
              >
                {formatMoney(calculatedSubtotal)}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. ÁREA DE FRETE & QUADRO DE VALOR TOTAL                          */}
        {/* ================================================================= */}
        <div className="flex items-stretch gap-4 w-full">
          {/* Lado Esquerdo: FRETE */}
          <div
            className="flex-1 min-w-0 rounded-[14px] border bg-white py-3 px-5 flex items-center gap-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
            style={{ borderColor: b.freightBorder }}
          >
            <Truck
              className="w-7 h-7 stroke-[1.9] flex-shrink-0"
              style={{ color: b.freightIconColor }}
            />
            <span
              className="text-[15px] font-black tracking-[0.03em] uppercase flex-shrink-0"
              style={{ color: b.freightTitleColor }}
            >
              FRETE
            </span>

            <div
              className="h-7 w-[1.5px] mx-1 flex-shrink-0 opacity-60"
              style={{ backgroundColor: b.freightDividerColor }}
            />

            <div className="flex-1 min-w-0 text-left">
              {hasFrete ? (
                <>
                  <div
                    className="text-[15px] font-black leading-tight tabular-nums"
                    style={{ color: b.freightValueColor }}
                  >
                    {formatMoney(freteValor)}
                  </div>
                  {freteEndereco && (
                    <div
                      className="text-[11.5px] text-slate-600 font-medium truncate mt-0.5"
                      title={freteEndereco}
                    >
                      {freteEndereco}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[12.5px] font-bold text-slate-800 truncate">
                  Frete não incluso — a calcular após fechamento.
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: QUADRO DE VALOR TOTAL PREMIUM */}
          <div
            className="w-[395px] flex-shrink-0 rounded-[14px] relative overflow-hidden py-3 px-6 flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.14)] border"
            style={{
              backgroundColor: b.totalBoxBg,
              borderColor: b.totalBoxBorder,
            }}
          >
            {/* Fundo Curvo do Quadro TOTAL */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none block"
              preserveAspectRatio="none"
              viewBox="0 0 400 60"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={`tot-left-${uid}`} x1="0" y1="0" x2="220" y2="60" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={isNatalDecorado ? '#4a0103' : b.totalBoxLeftStart} />
                  <stop offset="100%" stopColor={isNatalDecorado ? '#7b0206' : b.totalBoxLeftEnd} />
                </linearGradient>
                <linearGradient id={`tot-wave-${uid}`} x1="150" y1="55" x2="400" y2="5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={isNatalDecorado ? '#dc141c' : b.totalBoxWaveStart} />
                  <stop offset="48%" stopColor={isNatalDecorado ? '#a60d13' : b.totalBoxWaveMid} />
                  <stop offset="100%" stopColor={isNatalDecorado ? '#7b0102' : b.totalBoxWaveEnd} />
                </linearGradient>
                {(isAnoNovo || isDiaDasMaes || isDiaDosPais) && (
                  <>
                    <linearGradient id={`tot-an-gold-${uid}`} x1="130" y1="60" x2="245" y2="0" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#9a6b16" />
                      <stop offset="30%" stopColor="#f5d061" />
                      <stop offset="55%" stopColor="#fef9c3" />
                      <stop offset="80%" stopColor="#e5b84b" />
                      <stop offset="100%" stopColor="#a8761c" />
                    </linearGradient>
                    <radialGradient id={`tot-an-flare-${uid}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#fef9c3" stopOpacity="0.9" />
                      <stop offset="45%" stopColor="#f5d061" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#f5d061" stopOpacity="0" />
                    </radialGradient>
                  </>
                )}
              </defs>
              <rect x="0" y="0" width="400" height="60" fill={`url(#tot-left-${uid})`} />
              <path
                d={
                  isAnoNovo || isDiaDasMaes || isDiaDosPais
                    ? 'M 136 60 C 172 46, 198 10, 236 0 L 400 0 L 400 60 Z'
                    : 'M 142 60 C 175 44, 198 10, 234 0 L 400 0 L 400 60 Z'
                }
                fill={`url(#tot-wave-${uid})`}
              />
              {isAnoNovo || isDiaDasMaes || isDiaDosPais ? (
                <>
                  <path
                    d="M 128 60 C 166 47, 196 10, 235 0 L 248 0 C 209 12, 179 49, 146 60 Z"
                    fill={`url(#tot-an-gold-${uid})`}
                  />
                  <path
                    d="M 130 60 C 168 47, 197 10, 236 0"
                    stroke="#fffbeb"
                    strokeWidth="1.2"
                    strokeOpacity="0.85"
                    fill="none"
                  />
                  <circle cx="186" cy="40" r="18" fill={`url(#tot-an-flare-${uid})`} />
                </>
              ) : (
                <path
                  d="M 142 60 C 175 44, 198 10, 234 0"
                  stroke={b.totalBoxGlow}
                  strokeWidth="2"
                  strokeOpacity="0.65"
                  fill="none"
                />
              )}
            </svg>

            {isDecorated && <EspelhoTotalBoxDecorations themeId={theme.id} uid={uid} />}

            <div className="relative z-10 flex items-center gap-2.5 flex-shrink-0">
              <div
                className="w-7 h-7 rounded-full border-[1.8px] flex items-center justify-center flex-shrink-0"
                style={{ borderColor: b.totalIconBorder, color: b.totalIconBorder }}
              >
                <DollarSign
                  className="w-4 h-4 stroke-[2.4]"
                  style={{ color: b.totalIconBorder }}
                />
              </div>
              <span
                className="text-[15px] font-extrabold tracking-[0.04em] uppercase whitespace-nowrap"
                style={{ color: b.totalLabelColor }}
              >
                TOTAL
              </span>
              <div
                className="h-6 w-[1.5px] mx-2 flex-shrink-0"
                style={{ backgroundColor: b.totalDividerColor }}
              />
            </div>

            <span
              className="relative z-10 text-[25px] sm:text-[26px] font-black tracking-tight leading-none whitespace-nowrap ml-2 flex-shrink-0 tabular-nums"
              style={{ color: b.totalValueColor }}
            >
              {formatMoney(totalFinal)}
            </span>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 5. RODAPÉ OFICIAL COM 3 COLUNAS                                   */}
        {/* ================================================================= */}
        <div
          className="pt-3.5 pb-1.5 px-2 border-t flex items-center justify-between"
          style={{ borderTopColor: b.footerBorder }}
        >
          {/* Coluna 1: OBSERVAÇÃO */}
          <div className="flex items-center gap-3 w-[34%]">
            <div
              className="w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-bold text-[19px] leading-none"
              style={{ borderColor: b.footerAccent, color: b.footerAccent }}
            >
              !
            </div>
            <div className="text-left text-xs leading-tight">
              <span
                className="block font-black uppercase tracking-[0.02em] text-[11px]"
                style={{ color: b.footerObsTitleColor }}
              >
                OBSERVAÇÃO:
              </span>
              <p className="text-slate-700 font-medium text-[11px] mt-0.5 leading-[1.3]">
                {observacoesRodape && observacoesRodape.trim()
                  ? observacoesRodape
                  : 'Não realizamos instalação, indicamos profissionais caso precise!'}
              </p>
            </div>
          </div>

          {/* Divisória Vertical 1 */}
          <div
            className="h-11 w-[1px] flex-shrink-0"
            style={{ backgroundColor: isNatalDecorado ? '#d4af37' : b.footerColumnDivider }}
          />

          {/* Coluna 2: Obrigado pela confiança! */}
          <div className="flex flex-col items-center justify-center px-3 w-[32%] text-center">
            <span
              className="text-[28px] leading-none select-none"
              style={{
                fontFamily: "'Dancing Script', 'Caveat', 'Brush Script MT', cursive",
                fontWeight: 700,
                letterSpacing: '0.01em',
                color: isNatalDecorado ? '#880106' : b.footerScriptColor,
              }}
            >
              Obrigado pela confiança!
            </span>
            <EspelhoFooterUnderlineOrnament
              themeId={isDecorated ? theme.id : 'padrao'}
              strokeColor={b.footerUnderlineColor}
              uid={uid}
            />
          </div>

          {/* Divisória Vertical 2 */}
          <div
            className="h-11 w-[1px] flex-shrink-0"
            style={{ backgroundColor: isNatalDecorado ? '#d4af37' : b.footerColumnDivider }}
          />

          {/* Coluna 3: FALE CONOSCO PELO WHATSAPP */}
          <div className="flex items-center justify-end gap-3 w-[31%]">
            <div
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{ color: b.whatsappBorder }}
            >
              <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.04 20.16C10.56 20.16 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.11 7.39C8.94 7.39 8.68 7.46 8.45 7.7C8.23 7.95 7.6 8.54 7.6 9.74C7.6 10.94 8.47 12.1 8.6 12.27C8.73 12.44 10.33 14.91 12.78 15.97C14.82 16.85 15.24 16.68 15.69 16.63C16.14 16.59 17.14 16.04 17.35 15.45C17.56 14.87 17.56 14.37 17.49 14.26C17.43 14.16 17.26 14.1 17.01 13.97C16.76 13.85 15.53 13.24 15.3 13.16C15.07 13.07 14.91 13.03 14.74 13.28C14.57 13.53 14.09 14.1 13.95 14.26C13.8 14.43 13.66 14.45 13.41 14.33C13.16 14.2 12.11 13.86 10.86 12.75C9.89 11.88 9.23 10.81 9.11 10.6C8.98 10.39 9.09 10.28 9.22 10.15C9.33 10.04 9.47 9.86 9.6 9.71C9.72 9.56 9.77 9.46 9.85 9.29C9.93 9.12 9.89 8.98 9.83 8.85C9.76 8.73 9.27 7.52 9.06 7.03C8.86 6.55 8.66 6.62 8.5 6.61C8.35 6.6 8.18 6.6 8.01 6.6" />
              </svg>
            </div>
            <div className="text-left leading-tight">
              <span
                className="block text-[10px] font-black tracking-[0.03em] uppercase"
                style={{ color: b.whatsappText }}
              >
                FALE CONOSCO PELO WHATSAPP
              </span>
              <span
                className="text-[17.5px] font-black tracking-tight leading-tight"
                style={{ color: b.whatsappText }}
              >
                (11) 99374-7618
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 6. ONDAS DECORATIVAS INFERIORES OFICIAIS PREMIUM                    */}
      {/* =================================================================== */}
      {isNatalDecorado ? (
        <div className="relative w-full h-[78px] leading-none bg-white pointer-events-none select-none">
          <img
            src={NATAL_DECORADO_BOTTOM_ART_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 w-full h-auto block pointer-events-none select-none z-[5]"
          />
        </div>
      ) : isAnoNovo ? (
        <div className="relative w-full h-[78px] leading-none bg-white pointer-events-none select-none">
          <img
            src={ANO_NOVO_BOTTOM_ART_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 w-full h-auto block pointer-events-none select-none z-[5]"
          />
        </div>
      ) : isDiaDasMaes ? (
        <div className="relative w-full h-[84px] leading-none bg-white pointer-events-none select-none">
          <img
            src={DIA_MAES_BOTTOM_ART_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 w-full h-auto block pointer-events-none select-none z-[5]"
          />
        </div>
      ) : isDiaDosPais ? (
        <div className="relative w-full h-[84px] leading-none bg-white pointer-events-none select-none">
          <img
            src={DIA_PAIS_BOTTOM_ART_BASE64}
            alt=""
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 w-full h-auto block pointer-events-none select-none z-[5]"
          />
        </div>
      ) : (
        <div className="relative w-full overflow-hidden leading-none bg-white">
          <svg
            className="w-full h-[64px] block pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 1040 68"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`wave-back-${uid}`} x1="0" y1="20" x2="1040" y2="20" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={b.waveMidStart} stopOpacity="0.55" />
                <stop offset="48%" stopColor={b.waveBackStart} stopOpacity="0.88" />
                <stop offset="100%" stopColor={b.waveBackEnd} stopOpacity="0.92" />
              </linearGradient>
              <linearGradient id={`wave-mid-${uid}`} x1="0" y1="10" x2="1040" y2="55" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={b.waveMidStart} />
                <stop offset="55%" stopColor={b.waveMidEnd} />
                <stop offset="100%" stopColor={b.waveFrontStart} />
              </linearGradient>
              <linearGradient id={`wave-front-${uid}`} x1="0" y1="30" x2="1040" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={b.waveFrontStart} />
                <stop offset="65%" stopColor={b.waveFrontEnd} />
                <stop offset="100%" stopColor={b.waveFrontStart} />
              </linearGradient>
            </defs>

            {/* Onda Clara / Destaque ao Fundo */}
            <path
              d="M 0 18 C 190 46, 420 52, 660 28 C 835 10, 955 2, 1040 7 L 1040 68 L 0 68 Z"
              fill={`url(#wave-back-${uid})`}
            />

            {/* Onda Intermediária */}
            <path
              d="M 0 5 C 185 40, 395 58, 630 39 C 815 24, 945 14, 1040 24 L 1040 68 L 0 68 Z"
              fill={`url(#wave-mid-${uid})`}
            />

            {/* Brilho Suave na Crista da Onda */}
            <path
              d="M 410 47 C 610 40, 825 14, 1040 13"
              stroke={b.waveGlow}
              strokeWidth="2"
              strokeOpacity="0.72"
              fill="none"
            />

            {/* Onda Profunda Principal */}
            <path
              d="M 0 26 C 215 56, 485 62, 745 41 C 895 29, 982 28, 1040 34 L 1040 68 L 0 68 Z"
              fill={`url(#wave-front-${uid})`}
            />
          </svg>

          {isDecorated && <EspelhoBottomWaveDecorations themeId={theme.id} uid={uid} />}
        </div>
      )}
    </div>
  );
};
