import { useState, useEffect } from 'react';
import {
  getLocalRawSafe,
  getSupabaseClient,
  recordSelfSave,
  setLocalCollectionSafe,
  withAbortableTimeout,
} from './supabaseClient';
import {
  isEmergencyOfflineMode,
  markRecordPendingSync,
  removePendingSyncRecord,
} from './indexedDbOfflineStore';
import {
  getSellerIdForUser,
  getUserIdByName,
  isUserRevoked,
  normalizeAuthorizedName,
} from './auth';

export type FenixThemeId =
  | 'padrao'
  | 'natal'
  | 'novembro_black'
  | 'ano_novo'
  | 'carnaval'
  | 'pascoa'
  | 'dia_das_maes'
  | 'dia_dos_pais'
  | 'halloween'
  | 'personalizado';

export type FenixThemeScope = 'crm' | 'orcamentos' | 'ambos';

export type BudgetThemeVariant = 'classico' | 'decorado';

export type DecorativeMotifId =
  | 'nenhum'
  | 'padrao'
  | 'natal'
  | 'novembro_black'
  | 'ano_novo'
  | 'carnaval'
  | 'pascoa'
  | 'dia_das_maes'
  | 'dia_dos_pais'
  | 'halloween';

export interface CustomThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  headerBg: string;
  buttonBg: string;
  motif: DecorativeMotifId;
}

export interface FenixThemeState {
  activeThemeId: FenixThemeId;
  scope: FenixThemeScope;
  applyToSystem: boolean;
  applyToBudgets: boolean;
  applyToPdf: boolean;
  showDecorationsInSystem: boolean;
  showDecorationsInBudgets: boolean;
  showDecorationsInPdf: boolean;
  autoScheduleEnabled: boolean;
  scheduledThemeId: FenixThemeId;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  customTheme: CustomThemeConfig;
  updatedAt: string;
}

export interface FenixThemeDefinition {
  id: FenixThemeId;
  name: string;
  shortTag: string;
  description: string;
  motif: DecorativeMotifId;
  badgeText?: string;
  paletteSwatches: [string, string, string, string];
  crm: {
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    accent: string;
    sidebarBg: string;
    sidebarFooterBg: string;
    sidebarBorder: string;
    sidebarText: string;
    sidebarMuted: string;
    sidebarHoverBg: string;
    sidebarActiveBg: string;
    sidebarActiveText: string;
    sidebarActiveAccent: string;
    logoLightBackdrop: boolean;
    headerOverlayFrom: string;
    headerOverlayVia: string;
    headerOverlayTo: string;
    headerAccent: string;
    headerSearchBg: string;
    headerSearchBorder: string;
    headerSearchFocusBorder: string;
    pageBg: string;
    cardBg: string;
    cardBorder: string;
    cardTintBg: string;
    cardTintBorder: string;
    panelSubtleBg: string;
    dividerColor: string;
    inputBg: string;
    inputBorder: string;
    inputFocusBorder: string;
    inputFocusRing: string;
    tableHeaderBg: string;
    tableHeaderText: string;
    tableRowHoverBg: string;
    tableBorder: string;
    highlightText: string;
    indicatorBg: string;
    indicatorText: string;
  };
  budget: {
    outerBorder: string;
    // Cabeçalho curvo PREMIUM
    headerLightBgStart: string;
    headerLightBgMid: string;
    headerLightBgEnd: string;
    headerWaveBackStart: string;
    headerWaveBackEnd: string;
    headerWaveFrontStart: string;
    headerWaveFrontMid: string;
    headerWaveFrontEnd: string;
    headerGlowStroke: string;
    headerBottomBarBg: string;
    dividerLine: string;
    companyTitleColor: string;
    companyAddressColor: string;
    bannerIconBorder: string;
    bannerIconBars: string;
    bannerDivider: string;
    bannerTitleColor: string;
    bannerSubtextColor: string;
    bannerDateColor: string;

    // Blocos Dados do Cliente & Informações do Orçamento
    blockBorder: string;
    sectionHeaderFrom: string;
    sectionHeaderTo: string;
    sectionHeaderBg: string;
    sectionHeaderText: string;
    rowDivider: string;
    labelColor: string;

    // Tabela de Produtos
    tableSectionFrom: string;
    tableSectionMid: string;
    tableSectionTo: string;
    tableSectionBg: string;
    tableSectionText: string;
    tableBarGlow: string;
    tableHeaderFrom: string;
    tableHeaderTo: string;
    tableHeaderBg: string;
    tableHeaderText: string;
    tableHeaderDivider: string;
    tableBorder: string;
    productDetailColor: string;
    totalColumnBg: string;
    itemTotalColor: string;

    // Desconto / Subtotal (somente quando há desconto)
    discountBg: string;
    discountBorder: string;
    discountTextColor: string;
    discountValueColor: string;
    discountIconColor: string;
    subtotalGradient: string;
    subtotalTextColor: string;
    subtotalValueColor: string;
    subtotalBorder: string;
    specialPriceHighlight: boolean;

    // Frete & Total em Destaque
    freightBorder: string;
    freightIconColor: string;
    freightTitleColor: string;
    freightDividerColor: string;
    freightValueColor: string;
    totalBoxBg: string;
    totalBoxBorder: string;
    totalBoxLeftStart: string;
    totalBoxLeftEnd: string;
    totalBoxWaveStart: string;
    totalBoxWaveMid: string;
    totalBoxWaveEnd: string;
    totalBoxGlow: string;
    totalIconBorder: string;
    totalLabelColor: string;
    totalDividerColor: string;
    totalValueColor: string;

    // Rodapé 3 colunas
    footerBorder: string;
    footerColumnDivider: string;
    footerAccent: string;
    footerObsTitleColor: string;
    footerScriptColor: string;
    footerUnderlineColor: string;
    whatsappBorder: string;
    whatsappText: string;

    // Ondas decorativas inferiores PREMIUM
    waveBackStart: string;
    waveBackEnd: string;
    waveMidStart: string;
    waveMidEnd: string;
    waveGlow: string;
    waveFrontStart: string;
    waveFrontEnd: string;

    // Alias de compatibilidade para miniaturas
    headerBg: string;
    headerBorder: string;
    slantedBannerBg: string;
    slantedBannerAccent: string;
  };
}

export const THEME_STORAGE_KEY = 'fenix_themes_config_v1';
export const THEME_USER_STORAGE_PREFIX = 'fenix_themes_config_user_';
export const THEME_UPDATED_EVENT = 'fenix_theme_updated';

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  primary: '#00386e',
  secondary: '#0b66c3',
  accent: '#1482e0',
  headerBg: '#00224a',
  buttonBg: '#00529e',
  motif: 'nenhum',
};

export const DEFAULT_THEME_STATE: FenixThemeState = {
  activeThemeId: 'padrao',
  scope: 'crm',
  applyToSystem: true,
  applyToBudgets: false,
  applyToPdf: false,
  showDecorationsInSystem: false,
  showDecorationsInBudgets: false,
  showDecorationsInPdf: false,
  autoScheduleEnabled: false,
  scheduledThemeId: 'natal',
  startDate: '',
  endDate: '',
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  updatedAt: '',
};

let currentPreviewThemeId: FenixThemeId | null = null;
let currentPreviewCustomOverride: CustomThemeConfig | null = null;
let currentExportRenderTarget: 'pdf' | null = null;

function adjustHex(hex: string, amount: number): string {
  const cleaned = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return hex || '#0052cc';
  const num = parseInt(cleaned, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return `rgba(0, 82, 204, ${alpha})`;
  const num = parseInt(cleaned, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isLightColor(hex: string): boolean {
  const cleaned = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return false;
  const num = parseInt(cleaned, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}

function mixHexWithWhite(hex: string, whiteRatio: number): string {
  const cleaned = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return '#f8fafc';
  const num = parseInt(cleaned, 16);
  const r = Math.round(((num >> 16) & 0xff) * (1 - whiteRatio) + 255 * whiteRatio);
  const g = Math.round(((num >> 8) & 0xff) * (1 - whiteRatio) + 255 * whiteRatio);
  const b = Math.round((num & 0xff) * (1 - whiteRatio) + 255 * whiteRatio);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const STATIC_THEME_DEFINITIONS: Record<
  Exclude<FenixThemeId, 'personalizado'>,
  FenixThemeDefinition
> = {
  padrao: {
    id: 'padrao',
    name: 'PREMIUM',
    shortTag: 'Modelo Oficial',
    description:
      'Identidade oficial Fênix World: azul-marinho executivo, azul corporativo, superfícies brancas limpas e cinza neutro.',
    motif: 'padrao',
    paletteSwatches: ['#091122', '#0052cc', '#1482e0', '#f1f5f9'],
    crm: {
      primary: '#0052cc',
      primaryHover: '#0044ad',
      secondary: '#091122',
      secondaryHover: '#14203b',
      accent: '#1482e0',
      sidebarBg: '#091122',
      sidebarFooterBg: '#070e1c',
      sidebarBorder: '#1e293b',
      sidebarText: '#cbd5e1',
      sidebarMuted: '#94a3b8',
      sidebarHoverBg: 'rgba(255, 255, 255, 0.06)',
      sidebarActiveBg: '#0052cc',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#38bdf8',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(9, 17, 34, 0.82)',
      headerOverlayVia: 'rgba(15, 29, 58, 0.64)',
      headerOverlayTo: 'rgba(9, 17, 34, 0.78)',
      headerAccent: '#1482e0',
      headerSearchBg: 'rgba(0, 0, 0, 0.40)',
      headerSearchBorder: 'rgba(255, 255, 255, 0.20)',
      headerSearchFocusBorder: '#38bdf8',
      pageBg: '#f1f5f9',
      cardBg: '#ffffff',
      cardBorder: '#e2e8f0',
      cardTintBg: '#eff6ff',
      cardTintBorder: '#bfdbfe',
      panelSubtleBg: '#f8fafc',
      dividerColor: '#e2e8f0',
      inputBg: '#f8fafc',
      inputBorder: '#cbd5e1',
      inputFocusBorder: '#0052cc',
      inputFocusRing: 'rgba(0, 82, 204, 0.14)',
      tableHeaderBg: '#f8fafc',
      tableHeaderText: '#334155',
      tableRowHoverBg: '#f8fafc',
      tableBorder: '#e2e8f0',
      highlightText: '#091122',
      indicatorBg: '#dbeafe',
      indicatorText: '#1d4ed8',
    },
    budget: {
      outerBorder: '#b8d0e6',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#f2f7fc',
      headerLightBgEnd: '#dceaf7',
      headerWaveBackStart: '#8ec4f0',
      headerWaveBackEnd: '#1a75c7',
      headerWaveFrontStart: '#0d63b8',
      headerWaveFrontMid: '#003e7a',
      headerWaveFrontEnd: '#001e42',
      headerGlowStroke: '#38bdf8',
      headerBottomBarBg: '#004d94',
      dividerLine: '#1e4e79',
      companyTitleColor: '#003366',
      companyAddressColor: '#1e293b',
      bannerIconBorder: 'rgba(255, 255, 255, 0.85)',
      bannerIconBars: '#ffffff',
      bannerDivider: 'rgba(255, 255, 255, 0.75)',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#dbeafe',
      bannerDateColor: '#ffffff',

      blockBorder: '#b8d0e6',
      sectionHeaderFrom: '#0b5ca6',
      sectionHeaderTo: '#00386e',
      sectionHeaderBg: '#004785',
      sectionHeaderText: '#ffffff',
      rowDivider: '#dbe6f0',
      labelColor: '#003b73',

      tableSectionFrom: '#00366b',
      tableSectionMid: '#0b5ca6',
      tableSectionTo: '#00366b',
      tableSectionBg: '#004482',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #00386b 0%, #38bdf8 30%, #e0f2fe 50%, #38bdf8 70%, #00386b 100%)',
      tableHeaderFrom: '#074785',
      tableHeaderTo: '#002c57',
      tableHeaderBg: '#00386b',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.28)',
      tableBorder: '#d4e1ee',
      productDetailColor: '#004b8d',
      totalColumnBg: '#e8f2fc',
      itemTotalColor: '#002f5c',

      discountBg: '#dbebf8',
      discountBorder: '#b8d0e6',
      discountTextColor: '#00386e',
      discountValueColor: '#002f5c',
      discountIconColor: '#0d63b8',
      subtotalGradient:
        'linear-gradient(90deg, #dbebf8 0%, #dbebf8 25%, #2b7bc4 58%, #00386e 82%, #00244d 100%)',
      subtotalTextColor: '#00386e',
      subtotalValueColor: '#ffffff',
      subtotalBorder: '#b8d0e6',
      specialPriceHighlight: false,

      freightBorder: '#c5d7e8',
      freightIconColor: '#0d63b8',
      freightTitleColor: '#0d63b8',
      freightDividerColor: '#4d8cc9',
      freightValueColor: '#00386e',
      totalBoxBg: '#002a58',
      totalBoxBorder: '#003366',
      totalBoxLeftStart: '#001e42',
      totalBoxLeftEnd: '#003266',
      totalBoxWaveStart: '#1888e8',
      totalBoxWaveMid: '#0a61b8',
      totalBoxWaveEnd: '#003875',
      totalBoxGlow: '#60c3ff',
      totalIconBorder: '#ffffff',
      totalLabelColor: '#ffffff',
      totalDividerColor: 'rgba(255, 255, 255, 0.55)',
      totalValueColor: '#ffffff',

      footerBorder: '#d8e4ef',
      footerColumnDivider: '#c7d8e8',
      footerAccent: '#00529e',
      footerObsTitleColor: '#004488',
      footerScriptColor: '#003366',
      footerUnderlineColor: '#0d63b8',
      whatsappBorder: '#003b73',
      whatsappText: '#003366',

      waveBackStart: '#38bdf8',
      waveBackEnd: '#0b66c3',
      waveMidStart: '#0056a3',
      waveMidEnd: '#003266',
      waveGlow: '#7dd3fc',
      waveFrontStart: '#00244d',
      waveFrontEnd: '#001633',

      headerBg: '#f4f9fd',
      headerBorder: '#00529e',
      slantedBannerBg: '#003e7a',
      slantedBannerAccent: '#ffffff',
    },
  },

  natal: {
    id: 'natal',
    name: 'Natal',
    shortTag: 'Sazonal',
    description:
      'Conceito premium natalino: borgonha veludo refinado, dourado champagne discreto, marfim limpo e alta legibilidade.',
    motif: 'natal',
    badgeText: 'Natal',
    paletteSwatches: ['#2f0c11', '#9f1d2c', '#c8a24b', '#fbf9f7'],
    crm: {
      primary: '#9f1d2c',
      primaryHover: '#821623',
      secondary: '#3a1218',
      secondaryHover: '#280b0f',
      accent: '#c8a24b',
      sidebarBg: '#2f0c11',
      sidebarFooterBg: '#22070b',
      sidebarBorder: '#4f1b22',
      sidebarText: '#f7ecee',
      sidebarMuted: '#d4aeb4',
      sidebarHoverBg: 'rgba(200, 162, 75, 0.12)',
      sidebarActiveBg: '#9f1d2c',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#e2c16b',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(42, 10, 15, 0.88)',
      headerOverlayVia: 'rgba(78, 18, 27, 0.74)',
      headerOverlayTo: 'rgba(42, 10, 15, 0.86)',
      headerAccent: '#d4af37',
      headerSearchBg: 'rgba(28, 7, 10, 0.48)',
      headerSearchBorder: 'rgba(212, 175, 55, 0.34)',
      headerSearchFocusBorder: '#e2c16b',
      pageBg: '#fbf9f7',
      cardBg: '#ffffff',
      cardBorder: '#ebe2df',
      cardTintBg: '#fdf4f4',
      cardTintBorder: '#ecd2d5',
      panelSubtleBg: '#faf5f4',
      dividerColor: '#efe6e4',
      inputBg: '#fcfaf9',
      inputBorder: '#dfd3d0',
      inputFocusBorder: '#9f1d2c',
      inputFocusRing: 'rgba(159, 29, 44, 0.14)',
      tableHeaderBg: '#f8f2f2',
      tableHeaderText: '#661721',
      tableRowHoverBg: '#fcf8f8',
      tableBorder: '#ede3e0',
      highlightText: '#4a1017',
      indicatorBg: '#f9ecef',
      indicatorText: '#8a1725',
    },
    budget: {
      outerBorder: '#e2c4b4',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#fef6f6',
      headerLightBgEnd: '#fae5e5',
      headerWaveBackStart: '#f5d061',
      headerWaveBackEnd: '#d4af37',
      headerWaveFrontStart: '#dc2626',
      headerWaveFrontMid: '#991b1b',
      headerWaveFrontEnd: '#52090d',
      headerGlowStroke: '#f5d061',
      headerBottomBarBg: '#7f1d1d',
      dividerLine: '#b8860b',
      companyTitleColor: '#7f1d1d',
      companyAddressColor: '#1e293b',
      bannerIconBorder: '#f5d061',
      bannerIconBars: '#ffffff',
      bannerDivider: 'rgba(245, 208, 97, 0.75)',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#fef3c7',
      bannerDateColor: '#ffffff',

      blockBorder: '#e2c8ba',
      sectionHeaderFrom: '#b91c1c',
      sectionHeaderTo: '#6b0f14',
      sectionHeaderBg: '#991b1b',
      sectionHeaderText: '#ffffff',
      rowDivider: '#f0dede',
      labelColor: '#7f1d1d',

      tableSectionFrom: '#6b0f14',
      tableSectionMid: '#b91c1c',
      tableSectionTo: '#6b0f14',
      tableSectionBg: '#881313',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #6b0f14 0%, #d4af37 30%, #fef3c7 50%, #d4af37 70%, #6b0f14 100%)',
      tableHeaderFrom: '#881313',
      tableHeaderTo: '#52090d',
      tableHeaderBg: '#6b0f14',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.25)',
      tableBorder: '#edd8d8',
      productDetailColor: '#166534',
      totalColumnBg: '#fdf2f2',
      itemTotalColor: '#7f1d1d',

      discountBg: '#fef2f2',
      discountBorder: '#e2c4b4',
      discountTextColor: '#7f1d1d',
      discountValueColor: '#7f1d1d',
      discountIconColor: '#b91c1c',
      subtotalGradient:
        'linear-gradient(90deg, #fef2f2 0%, #fee2e2 28%, #b91c1c 62%, #6b0f14 85%, #52090d 100%)',
      subtotalTextColor: '#7f1d1d',
      subtotalValueColor: '#ffffff',
      subtotalBorder: '#e2c4b4',
      specialPriceHighlight: false,

      freightBorder: '#e2c8ba',
      freightIconColor: '#b91c1c',
      freightTitleColor: '#991b1b',
      freightDividerColor: '#d4af37',
      freightValueColor: '#7f1d1d',
      totalBoxBg: '#5c0a0e',
      totalBoxBorder: '#d4af37',
      totalBoxLeftStart: '#4c070a',
      totalBoxLeftEnd: '#7f1d1d',
      totalBoxWaveStart: '#dc2626',
      totalBoxWaveMid: '#991b1b',
      totalBoxWaveEnd: '#5c0a0e',
      totalBoxGlow: '#f5d061',
      totalIconBorder: '#f5d061',
      totalLabelColor: '#fef3c7',
      totalDividerColor: 'rgba(245, 208, 97, 0.55)',
      totalValueColor: '#ffffff',

      footerBorder: '#edd8d8',
      footerColumnDivider: '#e2c8ba',
      footerAccent: '#b91c1c',
      footerObsTitleColor: '#7f1d1d',
      footerScriptColor: '#7f1d1d',
      footerUnderlineColor: '#d4af37',
      whatsappBorder: '#166534',
      whatsappText: '#7f1d1d',

      waveBackStart: '#f5d061',
      waveBackEnd: '#d4af37',
      waveMidStart: '#dc2626',
      waveMidEnd: '#7f1d1d',
      waveGlow: '#fde68a',
      waveFrontStart: '#6b0f14',
      waveFrontEnd: '#3f0508',

      headerBg: '#fef6f6',
      headerBorder: '#b91c1c',
      slantedBannerBg: '#991b1b',
      slantedBannerAccent: '#f5d061',
    },
  },

  novembro_black: {
    id: 'novembro_black',
    name: 'Novembro Black',
    shortTag: 'Campanha',
    description:
      'Grafite executivo, dourado champagne escovado e superfícies claras em pedra neutra com contraste limpo.',
    motif: 'novembro_black',
    badgeText: 'NOVEMBRO BLACK',
    paletteSwatches: ['#18181b', '#9c761c', '#d4af37', '#f6f5f2'],
    crm: {
      primary: '#232429',
      primaryHover: '#35373f',
      secondary: '#8c6916',
      secondaryHover: '#705310',
      accent: '#c89d28',
      sidebarBg: '#161619',
      sidebarFooterBg: '#0f0f12',
      sidebarBorder: '#2d2d33',
      sidebarText: '#f4f4f5',
      sidebarMuted: '#c5b17a',
      sidebarHoverBg: 'rgba(200, 157, 40, 0.12)',
      sidebarActiveBg: '#2b2922',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#e2bf58',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(18, 18, 21, 0.88)',
      headerOverlayVia: 'rgba(38, 34, 24, 0.75)',
      headerOverlayTo: 'rgba(18, 18, 21, 0.88)',
      headerAccent: '#d4af37',
      headerSearchBg: 'rgba(12, 12, 14, 0.50)',
      headerSearchBorder: 'rgba(212, 175, 55, 0.34)',
      headerSearchFocusBorder: '#e2bf58',
      pageBg: '#f6f5f2',
      cardBg: '#ffffff',
      cardBorder: '#e5e1d8',
      cardTintBg: '#faf7ed',
      cardTintBorder: '#e4d5aa',
      panelSubtleBg: '#f7f5ef',
      dividerColor: '#ebe7de',
      inputBg: '#faf9f6',
      inputBorder: '#dcd7cb',
      inputFocusBorder: '#9c761c',
      inputFocusRing: 'rgba(156, 118, 28, 0.15)',
      tableHeaderBg: '#f4f1e8',
      tableHeaderText: '#3a3016',
      tableRowHoverBg: '#faf8f2',
      tableBorder: '#eae5da',
      highlightText: '#18181b',
      indicatorBg: '#f4edd5',
      indicatorText: '#785a10',
    },
    budget: {
      outerBorder: '#d6c184',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#fbfaf6',
      headerLightBgEnd: '#f3ecd8',
      headerWaveBackStart: '#f5d061',
      headerWaveBackEnd: '#b48a1e',
      headerWaveFrontStart: '#27272a',
      headerWaveFrontMid: '#141416',
      headerWaveFrontEnd: '#050507',
      headerGlowStroke: '#f5d061',
      headerBottomBarBg: '#18181b',
      dividerLine: '#b48a1e',
      companyTitleColor: '#111113',
      companyAddressColor: '#27272a',
      bannerIconBorder: '#f5d061',
      bannerIconBars: '#f5d061',
      bannerDivider: 'rgba(245, 208, 97, 0.7)',
      bannerTitleColor: '#f5d061',
      bannerSubtextColor: '#e4e4e7',
      bannerDateColor: '#ffffff',

      blockBorder: '#d8c89e',
      sectionHeaderFrom: '#27272a',
      sectionHeaderTo: '#09090b',
      sectionHeaderBg: '#141416',
      sectionHeaderText: '#f5d061',
      rowDivider: '#ebe4cf',
      labelColor: '#18181b',

      tableSectionFrom: '#09090b',
      tableSectionMid: '#27272a',
      tableSectionTo: '#09090b',
      tableSectionBg: '#111113',
      tableSectionText: '#f5d061',
      tableBarGlow:
        'linear-gradient(90deg, #09090b 0%, #d4af37 30%, #fef3c7 50%, #d4af37 70%, #09090b 100%)',
      tableHeaderFrom: '#1f1f23',
      tableHeaderTo: '#09090b',
      tableHeaderBg: '#141416',
      tableHeaderText: '#f5d061',
      tableHeaderDivider: 'rgba(212, 175, 55, 0.35)',
      tableBorder: '#e4decb',
      productDetailColor: '#8a6610',
      totalColumnBg: '#fbf6e6',
      itemTotalColor: '#7a5908',

      discountBg: '#faf4df',
      discountBorder: '#d4af37',
      discountTextColor: '#18181b',
      discountValueColor: '#111113',
      discountIconColor: '#8a6610',
      subtotalGradient:
        'linear-gradient(90deg, #faf4df 0%, #f3e6be 28%, #7d6218 62%, #111113 85%, #09090b 100%)',
      subtotalTextColor: '#18181b',
      subtotalValueColor: '#f5d061',
      subtotalBorder: '#d4af37',
      specialPriceHighlight: true,

      freightBorder: '#d8c89e',
      freightIconColor: '#926c0c',
      freightTitleColor: '#111113',
      freightDividerColor: '#d4af37',
      freightValueColor: '#7a5908',
      totalBoxBg: '#09090b',
      totalBoxBorder: '#d4af37',
      totalBoxLeftStart: '#050507',
      totalBoxLeftEnd: '#18181b',
      totalBoxWaveStart: '#d4af37',
      totalBoxWaveMid: '#8a6610',
      totalBoxWaveEnd: '#141416',
      totalBoxGlow: '#fde68a',
      totalIconBorder: '#f5d061',
      totalLabelColor: '#f5d061',
      totalDividerColor: 'rgba(245, 208, 97, 0.55)',
      totalValueColor: '#ffffff',

      footerBorder: '#e5dcb9',
      footerColumnDivider: '#d8c89e',
      footerAccent: '#926c0c',
      footerObsTitleColor: '#18181b',
      footerScriptColor: '#111113',
      footerUnderlineColor: '#d4af37',
      whatsappBorder: '#18181b',
      whatsappText: '#111113',

      waveBackStart: '#f5d061',
      waveBackEnd: '#b48a1e',
      waveMidStart: '#27272a',
      waveMidEnd: '#141416',
      waveGlow: '#fde68a',
      waveFrontStart: '#0e0e11',
      waveFrontEnd: '#050507',

      headerBg: '#faf8f2',
      headerBorder: '#d4af37',
      slantedBannerBg: '#09090b',
      slantedBannerAccent: '#f5d061',
    },
  },

  ano_novo: {
    id: 'ano_novo',
    name: 'Ano Novo',
    shortTag: 'Celebração',
    description:
      'Azul safira meia-noite, prata perolado e detalhes champagne em um painel claro, moderno e sofisticado.',
    motif: 'ano_novo',
    badgeText: 'Ano Novo',
    paletteSwatches: ['#0b1d3a', '#163e7a', '#cfa744', '#f5f7fb'],
    crm: {
      primary: '#163e7a',
      primaryHover: '#0f2e5c',
      secondary: '#0b1d3a',
      secondaryHover: '#162d54',
      accent: '#c8a24b',
      sidebarBg: '#0b1d3a',
      sidebarFooterBg: '#07142b',
      sidebarBorder: '#1f3963',
      sidebarText: '#eef2f9',
      sidebarMuted: '#b5c5de',
      sidebarHoverBg: 'rgba(200, 162, 75, 0.12)',
      sidebarActiveBg: '#163e7a',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#e2c16b',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(11, 29, 58, 0.88)',
      headerOverlayVia: 'rgba(22, 54, 104, 0.74)',
      headerOverlayTo: 'rgba(11, 29, 58, 0.88)',
      headerAccent: '#d4af37',
      headerSearchBg: 'rgba(7, 20, 43, 0.48)',
      headerSearchBorder: 'rgba(212, 175, 55, 0.34)',
      headerSearchFocusBorder: '#e2c16b',
      pageBg: '#f5f7fb',
      cardBg: '#ffffff',
      cardBorder: '#dfe5ef',
      cardTintBg: '#f4f7fc',
      cardTintBorder: '#d2dceb',
      panelSubtleBg: '#f4f6fa',
      dividerColor: '#e5ebf4',
      inputBg: '#f9fafd',
      inputBorder: '#cfd8e6',
      inputFocusBorder: '#163e7a',
      inputFocusRing: 'rgba(22, 62, 122, 0.14)',
      tableHeaderBg: '#f0f4fa',
      tableHeaderText: '#13315e',
      tableRowHoverBg: '#f7f9fd',
      tableBorder: '#e3e8f1',
      highlightText: '#0b1d3a',
      indicatorBg: '#f6f0da',
      indicatorText: '#856513',
    },
    budget: {
      outerBorder: '#d5c3a8',
      headerLightBgStart: '#fbf8f6',
      headerLightBgMid: '#f3f2f1',
      headerLightBgEnd: '#e6ebf2',
      headerWaveBackStart: '#f5d061',
      headerWaveBackEnd: '#d4af37',
      headerWaveFrontStart: '#0a2f66',
      headerWaveFrontMid: '#042452',
      headerWaveFrontEnd: '#011e46',
      headerGlowStroke: '#f5d061',
      headerBottomBarBg: '#c89b3c',
      dividerLine: '#b89128',
      companyTitleColor: '#042f5f',
      companyAddressColor: '#1e293b',
      bannerIconBorder: '#f5d061',
      bannerIconBars: '#ffffff',
      bannerDivider: '#f5d061',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#ffffff',
      bannerDateColor: '#f5d061',

      blockBorder: '#cbb897',
      sectionHeaderFrom: '#042f5f',
      sectionHeaderTo: '#011e46',
      sectionHeaderBg: '#032851',
      sectionHeaderText: '#ffffff',
      rowDivider: '#e5dfd3',
      labelColor: '#042958',

      tableSectionFrom: '#072143',
      tableSectionMid: '#003972',
      tableSectionTo: '#072143',
      tableSectionBg: '#032851',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #061c3d 0%, #d4af37 30%, #fef08a 50%, #d4af37 70%, #061c3d 100%)',
      tableHeaderFrom: '#072c55',
      tableHeaderTo: '#021836',
      tableHeaderBg: '#042552',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.25)',
      tableBorder: '#d8e0ea',
      productDetailColor: '#042958',
      totalColumnBg: '#edf4fb',
      itemTotalColor: '#042958',

      discountBg: '#f8f5ee',
      discountBorder: '#cbb897',
      discountTextColor: '#042958',
      discountValueColor: '#042958',
      discountIconColor: '#b89128',
      subtotalGradient:
        'linear-gradient(90deg, #f8f5ee 0%, #ede6d6 28%, #1e4278 62%, #042552 85%, #011e46 100%)',
      subtotalTextColor: '#042958',
      subtotalValueColor: '#f5d061',
      subtotalBorder: '#cbb897',
      specialPriceHighlight: false,

      freightBorder: '#cbb897',
      freightIconColor: '#042958',
      freightTitleColor: '#042958',
      freightDividerColor: '#c8a552',
      freightValueColor: '#042958',
      totalBoxBg: '#041e42',
      totalBoxBorder: '#b8860b',
      totalBoxLeftStart: '#031838',
      totalBoxLeftEnd: '#072b5e',
      totalBoxWaveStart: '#0b3873',
      totalBoxWaveMid: '#072959',
      totalBoxWaveEnd: '#021633',
      totalBoxGlow: '#f5d061',
      totalIconBorder: '#f5d061',
      totalLabelColor: '#f5d061',
      totalDividerColor: 'rgba(245, 208, 97, 0.72)',
      totalValueColor: '#ffffff',

      footerBorder: '#e5dfd3',
      footerColumnDivider: '#c8a552',
      footerAccent: '#042958',
      footerObsTitleColor: '#042958',
      footerScriptColor: '#042958',
      footerUnderlineColor: '#c5942d',
      whatsappBorder: '#166534',
      whatsappText: '#042958',

      waveBackStart: '#e2e8f0',
      waveBackEnd: '#94a3b8',
      waveMidStart: '#d4af37',
      waveMidEnd: '#0a2f66',
      waveGlow: '#fef08a',
      waveFrontStart: '#042452',
      waveFrontEnd: '#011e46',

      headerBg: '#fbf8f6',
      headerBorder: '#d4af37',
      slantedBannerBg: '#042452',
      slantedBannerAccent: '#f5d061',
    },
  },

  carnaval: {
    id: 'carnaval',
    name: 'Carnaval',
    shortTag: 'Campanha',
    description:
      'Ameixa real elegante com toques contidos de âmbar dourado sobre seda clara, mantendo sobriedade executiva.',
    motif: 'carnaval',
    badgeText: 'Carnaval',
    paletteSwatches: ['#29143d', '#6d2899', '#cfa030', '#faf8fc'],
    crm: {
      primary: '#6d2899',
      primaryHover: '#581f7d',
      secondary: '#3c1854',
      secondaryHover: '#2b103d',
      accent: '#cfa030',
      sidebarBg: '#29143d',
      sidebarFooterBg: '#1d0d2c',
      sidebarBorder: '#442663',
      sidebarText: '#f5f1fa',
      sidebarMuted: '#cbbadd',
      sidebarHoverBg: 'rgba(207, 160, 48, 0.13)',
      sidebarActiveBg: '#6d2899',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#eab84b',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(41, 20, 61, 0.88)',
      headerOverlayVia: 'rgba(84, 30, 108, 0.74)',
      headerOverlayTo: 'rgba(41, 20, 61, 0.88)',
      headerAccent: '#dfb146',
      headerSearchBg: 'rgba(25, 11, 38, 0.46)',
      headerSearchBorder: 'rgba(223, 177, 70, 0.34)',
      headerSearchFocusBorder: '#eab84b',
      pageBg: '#faf8fc',
      cardBg: '#ffffff',
      cardBorder: '#e8e1ef',
      cardTintBg: '#f9f5fc',
      cardTintBorder: '#e2d2ee',
      panelSubtleBg: '#f7f4fb',
      dividerColor: '#ede7f4',
      inputBg: '#fcfbfe',
      inputBorder: '#dad0e5',
      inputFocusBorder: '#6d2899',
      inputFocusRing: 'rgba(109, 40, 153, 0.14)',
      tableHeaderBg: '#f4eff9',
      tableHeaderText: '#4c1d70',
      tableRowHoverBg: '#fbf8fd',
      tableBorder: '#ebe4f2',
      highlightText: '#3b1557',
      indicatorBg: '#f4eaf9',
      indicatorText: '#6d2899',
    },
    budget: {
      outerBorder: '#d8b4fe',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#faf5ff',
      headerLightBgEnd: '#f5e8ff',
      headerWaveBackStart: '#facc15',
      headerWaveBackEnd: '#be185d',
      headerWaveFrontStart: '#be185d',
      headerWaveFrontMid: '#6d28d9',
      headerWaveFrontEnd: '#3b0764',
      headerGlowStroke: '#fde047',
      headerBottomBarBg: '#5b21b6',
      dividerLine: '#be185d',
      companyTitleColor: '#4c1d95',
      companyAddressColor: '#1e293b',
      bannerIconBorder: '#fde047',
      bannerIconBars: '#ffffff',
      bannerDivider: 'rgba(253, 224, 71, 0.75)',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#fce7f3',
      bannerDateColor: '#fde047',

      blockBorder: '#e2ccfb',
      sectionHeaderFrom: '#be185d',
      sectionHeaderTo: '#6d28d9',
      sectionHeaderBg: '#7e22ce',
      sectionHeaderText: '#ffffff',
      rowDivider: '#efe3fc',
      labelColor: '#5b21b6',

      tableSectionFrom: '#4c1d95',
      tableSectionMid: '#be185d',
      tableSectionTo: '#4c1d95',
      tableSectionBg: '#5b21b6',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #4c1d95 0%, #facc15 30%, #fef9c3 50%, #facc15 70%, #4c1d95 100%)',
      tableHeaderFrom: '#5b21b6',
      tableHeaderTo: '#3b0764',
      tableHeaderBg: '#4c1d95',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.25)',
      tableBorder: '#e9d5ff',
      productDetailColor: '#be185d',
      totalColumnBg: '#f6effe',
      itemTotalColor: '#5b21b6',

      discountBg: '#faf5ff',
      discountBorder: '#d8b4fe',
      discountTextColor: '#4c1d95',
      discountValueColor: '#4c1d95',
      discountIconColor: '#be185d',
      subtotalGradient:
        'linear-gradient(90deg, #faf5ff 0%, #f3e8ff 28%, #be185d 64%, #5b21b6 88%, #4c1d95 100%)',
      subtotalTextColor: '#4c1d95',
      subtotalValueColor: '#fef08a',
      subtotalBorder: '#d8b4fe',
      specialPriceHighlight: false,

      freightBorder: '#e2ccfb',
      freightIconColor: '#be185d',
      freightTitleColor: '#5b21b6',
      freightDividerColor: '#eab308',
      freightValueColor: '#831843',
      totalBoxBg: '#3b0764',
      totalBoxBorder: '#d4af37',
      totalBoxLeftStart: '#2e1065',
      totalBoxLeftEnd: '#4c1d95',
      totalBoxWaveStart: '#eab308',
      totalBoxWaveMid: '#be185d',
      totalBoxWaveEnd: '#4c1d95',
      totalBoxGlow: '#fef08a',
      totalIconBorder: '#fde047',
      totalLabelColor: '#fde047',
      totalDividerColor: 'rgba(253, 224, 71, 0.5)',
      totalValueColor: '#ffffff',

      footerBorder: '#eadcf9',
      footerColumnDivider: '#d8b4fe',
      footerAccent: '#be185d',
      footerObsTitleColor: '#5b21b6',
      footerScriptColor: '#4c1d95',
      footerUnderlineColor: '#d4af37',
      whatsappBorder: '#5b21b6',
      whatsappText: '#4c1d95',

      waveBackStart: '#facc15',
      waveBackEnd: '#d4af37',
      waveMidStart: '#db2777',
      waveMidEnd: '#7e22ce',
      waveGlow: '#fef08a',
      waveFrontStart: '#4c1d95',
      waveFrontEnd: '#2e1065',

      headerBg: '#faf5ff',
      headerBorder: '#be185d',
      slantedBannerBg: '#5b21b6',
      slantedBannerAccent: '#fde047',
    },
  },

  pascoa: {
    id: 'pascoa',
    name: 'Páscoa',
    shortTag: 'Sazonal',
    description:
      'Lavanda fechada suave, sálvia botânica discreta e linho marfim para uma interface serena e equilibrada.',
    motif: 'pascoa',
    badgeText: 'Páscoa',
    paletteSwatches: ['#2e2242', '#654892', '#3c7a5c', '#faf9fc'],
    crm: {
      primary: '#654892',
      primaryHover: '#523978',
      secondary: '#2f6b4f',
      secondaryHover: '#24543e',
      accent: '#5d9b7b',
      sidebarBg: '#2e2242',
      sidebarFooterBg: '#221833',
      sidebarBorder: '#473663',
      sidebarText: '#f4f1f8',
      sidebarMuted: '#c6bad9',
      sidebarHoverBg: 'rgba(167, 196, 181, 0.14)',
      sidebarActiveBg: '#654892',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#9fd0b6',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(46, 34, 66, 0.86)',
      headerOverlayVia: 'rgba(72, 53, 102, 0.72)',
      headerOverlayTo: 'rgba(42, 64, 54, 0.80)',
      headerAccent: '#8ec0a6',
      headerSearchBg: 'rgba(28, 20, 41, 0.46)',
      headerSearchBorder: 'rgba(167, 196, 181, 0.34)',
      headerSearchFocusBorder: '#a7d6bd',
      pageBg: '#faf9fc',
      cardBg: '#ffffff',
      cardBorder: '#e6e2ec',
      cardTintBg: '#f6f3fb',
      cardTintBorder: '#dcd2ec',
      panelSubtleBg: '#f7f5fa',
      dividerColor: '#ebe7f1',
      inputBg: '#fcfbfd',
      inputBorder: '#d7d0e2',
      inputFocusBorder: '#654892',
      inputFocusRing: 'rgba(101, 72, 146, 0.14)',
      tableHeaderBg: '#f3f0f9',
      tableHeaderText: '#48326b',
      tableRowHoverBg: '#faf8fd',
      tableBorder: '#e9e4f0',
      highlightText: '#372654',
      indicatorBg: '#edf6f1',
      indicatorText: '#275941',
    },
    budget: {
      outerBorder: '#dcc2fa',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#fcf8ff',
      headerLightBgEnd: '#f4eafa',
      headerWaveBackStart: '#f9a8d4',
      headerWaveBackEnd: '#86efac',
      headerWaveFrontStart: '#a855f7',
      headerWaveFrontMid: '#7e22ce',
      headerWaveFrontEnd: '#581c87',
      headerGlowStroke: '#fef08a',
      headerBottomBarBg: '#7e22ce',
      dividerLine: '#a855f7',
      companyTitleColor: '#6b21a8',
      companyAddressColor: '#1e293b',
      bannerIconBorder: '#fef08a',
      bannerIconBars: '#ffffff',
      bannerDivider: 'rgba(254, 240, 138, 0.75)',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#fce7f3',
      bannerDateColor: '#fef08a',

      blockBorder: '#e5d1fc',
      sectionHeaderFrom: '#a855f7',
      sectionHeaderTo: '#6b21a8',
      sectionHeaderBg: '#7e22ce',
      sectionHeaderText: '#ffffff',
      rowDivider: '#f1e5fd',
      labelColor: '#6b21a8',

      tableSectionFrom: '#6b21a8',
      tableSectionMid: '#9333ea',
      tableSectionTo: '#6b21a8',
      tableSectionBg: '#7e22ce',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #6b21a8 0%, #f9a8d4 30%, #fef08a 50%, #86efac 70%, #6b21a8 100%)',
      tableHeaderFrom: '#7e22ce',
      tableHeaderTo: '#581c87',
      tableHeaderBg: '#6b21a8',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.28)',
      tableBorder: '#eadcf9',
      productDetailColor: '#15803d',
      totalColumnBg: '#f9f4ff',
      itemTotalColor: '#6b21a8',

      discountBg: '#faf5ff',
      discountBorder: '#d8b4fe',
      discountTextColor: '#6b21a8',
      discountValueColor: '#581c87',
      discountIconColor: '#db2777',
      subtotalGradient:
        'linear-gradient(90deg, #faf5ff 0%, #fce7f3 30%, #a855f7 65%, #6b21a8 88%, #581c87 100%)',
      subtotalTextColor: '#6b21a8',
      subtotalValueColor: '#ffffff',
      subtotalBorder: '#d8b4fe',
      specialPriceHighlight: false,

      freightBorder: '#e5d1fc',
      freightIconColor: '#16a34a',
      freightTitleColor: '#7e22ce',
      freightDividerColor: '#f472b6',
      freightValueColor: '#6b21a8',
      totalBoxBg: '#581c87',
      totalBoxBorder: '#f472b6',
      totalBoxLeftStart: '#4c1d95',
      totalBoxLeftEnd: '#6b21a8',
      totalBoxWaveStart: '#f472b6',
      totalBoxWaveMid: '#9333ea',
      totalBoxWaveEnd: '#581c87',
      totalBoxGlow: '#fef08a',
      totalIconBorder: '#fef08a',
      totalLabelColor: '#fef9c3',
      totalDividerColor: 'rgba(254, 240, 138, 0.5)',
      totalValueColor: '#ffffff',

      footerBorder: '#eddffb',
      footerColumnDivider: '#e5d1fc',
      footerAccent: '#db2777',
      footerObsTitleColor: '#6b21a8',
      footerScriptColor: '#6b21a8',
      footerUnderlineColor: '#4ade80',
      whatsappBorder: '#15803d',
      whatsappText: '#6b21a8',

      waveBackStart: '#fef08a',
      waveBackEnd: '#86efac',
      waveMidStart: '#f472b6',
      waveMidEnd: '#9333ea',
      waveGlow: '#fbcfe8',
      waveFrontStart: '#7e22ce',
      waveFrontEnd: '#581c87',

      headerBg: '#fcf8ff',
      headerBorder: '#9333ea',
      slantedBannerBg: '#7e22ce',
      slantedBannerAccent: '#fef08a',
    },
  },

  dia_das_maes: {
    id: 'dia_das_maes',
    name: 'Dia das Mães',
    shortTag: 'Homenagem',
    description:
      'Marsala rosé refinado, champagne suave e porcelana acolhedora com visual editorial limpo e elegante.',
    motif: 'dia_das_maes',
    badgeText: 'Dia das Mães',
    paletteSwatches: ['#3b1524', '#9e2a52', '#d4af63', '#fcf9fa'],
    crm: {
      primary: '#9e2a52',
      primaryHover: '#822042',
      secondary: '#521b30',
      secondaryHover: '#3d1323',
      accent: '#cfa454',
      sidebarBg: '#3b1524',
      sidebarFooterBg: '#2a0d19',
      sidebarBorder: '#5d263b',
      sidebarText: '#fbf2f5',
      sidebarMuted: '#dbb6c3',
      sidebarHoverBg: 'rgba(207, 164, 84, 0.13)',
      sidebarActiveBg: '#9e2a52',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#e6c27a',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(59, 21, 36, 0.88)',
      headerOverlayVia: 'rgba(108, 33, 60, 0.74)',
      headerOverlayTo: 'rgba(59, 21, 36, 0.86)',
      headerAccent: '#ddb56b',
      headerSearchBg: 'rgba(36, 11, 21, 0.46)',
      headerSearchBorder: 'rgba(221, 181, 107, 0.34)',
      headerSearchFocusBorder: '#e8c784',
      pageBg: '#fcf9fa',
      cardBg: '#ffffff',
      cardBorder: '#ede1e5',
      cardTintBg: '#fdf4f7',
      cardTintBorder: '#ecd0da',
      panelSubtleBg: '#faf5f7',
      dividerColor: '#f1e7ea',
      inputBg: '#fdfbfc',
      inputBorder: '#e1d1d7',
      inputFocusBorder: '#9e2a52',
      inputFocusRing: 'rgba(158, 42, 82, 0.14)',
      tableHeaderBg: '#f9f1f4',
      tableHeaderText: '#6e1b39',
      tableRowHoverBg: '#fdf8fa',
      tableBorder: '#efe4e8',
      highlightText: '#57152d',
      indicatorBg: '#faeef2',
      indicatorText: '#8a2246',
    },
    budget: {
      outerBorder: '#efc5ce',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#fff9fa',
      headerLightBgEnd: '#fdf1f4',
      headerWaveBackStart: '#f5b8c8',
      headerWaveBackEnd: '#d4af37',
      headerWaveFrontStart: '#c91d57',
      headerWaveFrontMid: '#a50f37',
      headerWaveFrontEnd: '#7a0624',
      headerGlowStroke: '#f5d061',
      headerBottomBarBg: '#c89b3c',
      dividerLine: '#dfb046',
      companyTitleColor: '#7d0620',
      companyAddressColor: '#0f172a',
      bannerIconBorder: '#f5d061',
      bannerIconBars: '#ffffff',
      bannerDivider: '#f5d061',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#ffffff',
      bannerDateColor: '#fde047',

      blockBorder: '#f3ced6',
      sectionHeaderFrom: '#cf194e',
      sectionHeaderTo: '#8a0b29',
      sectionHeaderBg: '#a50f37',
      sectionHeaderText: '#ffffff',
      rowDivider: '#f6e5e8',
      labelColor: '#8c0829',

      tableSectionFrom: '#940d2f',
      tableSectionMid: '#d22159',
      tableSectionTo: '#940d2f',
      tableSectionBg: '#a50f37',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #7e0726 0%, #e5b84b 30%, #fef3c7 50%, #e5b84b 70%, #7e0726 100%)',
      tableHeaderFrom: '#8a082b',
      tableHeaderTo: '#5e041c',
      tableHeaderBg: '#7a0624',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.28)',
      tableBorder: '#f3d8de',
      productDetailColor: '#9e1035',
      totalColumnBg: '#fef0f3',
      itemTotalColor: '#8e0a2b',

      discountBg: '#fff5f7',
      discountBorder: '#f3ced6',
      discountTextColor: '#8c0829',
      discountValueColor: '#8c0829',
      discountIconColor: '#b91c4a',
      subtotalGradient:
        'linear-gradient(90deg, #fff5f7 0%, #fce7ec 28%, #c91d57 62%, #8a0b29 85%, #6d0720 100%)',
      subtotalTextColor: '#8c0829',
      subtotalValueColor: '#ffffff',
      subtotalBorder: '#f3ced6',
      specialPriceHighlight: false,

      freightBorder: '#f3ced6',
      freightIconColor: '#8c0829',
      freightTitleColor: '#8c0829',
      freightDividerColor: '#e2aa3b',
      freightValueColor: '#8c0829',
      totalBoxBg: '#780924',
      totalBoxBorder: '#c8962e',
      totalBoxLeftStart: '#6d0720',
      totalBoxLeftEnd: '#940f32',
      totalBoxWaveStart: '#c41b4b',
      totalBoxWaveMid: '#a9153e',
      totalBoxWaveEnd: '#7e0a29',
      totalBoxGlow: '#fde68a',
      totalIconBorder: '#facc15',
      totalLabelColor: '#ffffff',
      totalDividerColor: 'rgba(255, 255, 255, 0.35)',
      totalValueColor: '#ffffff',

      footerBorder: '#f3dce2',
      footerColumnDivider: '#d9a536',
      footerAccent: '#8c0829',
      footerObsTitleColor: '#8c0829',
      footerScriptColor: '#8a0724',
      footerUnderlineColor: '#dfa32c',
      whatsappBorder: '#15803d',
      whatsappText: '#7a061c',

      waveBackStart: '#f9a8d4',
      waveBackEnd: '#f5d061',
      waveMidStart: '#d22159',
      waveMidEnd: '#940d2f',
      waveGlow: '#fef08a',
      waveFrontStart: '#940d2f',
      waveFrontEnd: '#6d0720',

      headerBg: '#fff9fa',
      headerBorder: '#be185d',
      slantedBannerBg: '#940d2f',
      slantedBannerAccent: '#fde047',
    },
  },

  dia_dos_pais: {
    id: 'dia_dos_pais',
    name: 'Dia dos Pais',
    shortTag: 'Homenagem',
    description:
      'Azul petróleo clássico, grafite metálico e prata fria com estética executiva precisa e atemporal.',
    motif: 'dia_dos_pais',
    badgeText: 'Dia dos Pais',
    paletteSwatches: ['#111c2d', '#1e4268', '#94a3b8', '#f3f5f8'],
    crm: {
      primary: '#1e4268',
      primaryHover: '#153250',
      secondary: '#334155',
      secondaryHover: '#1e293b',
      accent: '#94a3b8',
      sidebarBg: '#111c2d',
      sidebarFooterBg: '#0b1320',
      sidebarBorder: '#263850',
      sidebarText: '#edf2f7',
      sidebarMuted: '#a2b2c5',
      sidebarHoverBg: 'rgba(148, 163, 184, 0.14)',
      sidebarActiveBg: '#1e4268',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#cbd5e1',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(17, 28, 45, 0.88)',
      headerOverlayVia: 'rgba(30, 51, 80, 0.74)',
      headerOverlayTo: 'rgba(17, 28, 45, 0.88)',
      headerAccent: '#cbd5e1',
      headerSearchBg: 'rgba(11, 19, 32, 0.48)',
      headerSearchBorder: 'rgba(203, 213, 225, 0.30)',
      headerSearchFocusBorder: '#e2e8f0',
      pageBg: '#f3f5f8',
      cardBg: '#ffffff',
      cardBorder: '#dde3ec',
      cardTintBg: '#f2f5f9',
      cardTintBorder: '#ccd6e3',
      panelSubtleBg: '#f4f6f9',
      dividerColor: '#e4e9f0',
      inputBg: '#f8fafc',
      inputBorder: '#cbd5e1',
      inputFocusBorder: '#1e4268',
      inputFocusRing: 'rgba(30, 66, 104, 0.14)',
      tableHeaderBg: '#eef2f6',
      tableHeaderText: '#1b314b',
      tableRowHoverBg: '#f6f8fb',
      tableBorder: '#e2e7ef',
      highlightText: '#111c2d',
      indicatorBg: '#e7edf4',
      indicatorText: '#1e4268',
    },
    budget: {
      outerBorder: '#dce1ea',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#f8fafc',
      headerLightBgEnd: '#eef2f6',
      headerWaveBackStart: '#60a5fa',
      headerWaveBackEnd: '#d4af37',
      headerWaveFrontStart: '#005bb5',
      headerWaveFrontMid: '#003570',
      headerWaveFrontEnd: '#001942',
      headerGlowStroke: '#f5d061',
      headerBottomBarBg: '#c89b3c',
      dividerLine: '#e0aa2b',
      companyTitleColor: '#061a44',
      companyAddressColor: '#0f172a',
      bannerIconBorder: '#facc15',
      bannerIconBars: '#ffffff',
      bannerDivider: '#facc15',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#ffffff',
      bannerDateColor: '#fde047',

      blockBorder: '#e2d7cc',
      sectionHeaderFrom: '#005bb5',
      sectionHeaderTo: '#012250',
      sectionHeaderBg: '#023873',
      sectionHeaderText: '#ffffff',
      rowDivider: '#ede7df',
      labelColor: '#002a7a',

      tableSectionFrom: '#002e63',
      tableSectionMid: '#005bb5',
      tableSectionTo: '#002e63',
      tableSectionBg: '#023873',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #00234d 0%, #60a5fa 30%, #e0f2fe 50%, #60a5fa 70%, #00234d 100%)',
      tableHeaderFrom: '#002149',
      tableHeaderTo: '#000d2c',
      tableHeaderBg: '#001b3d',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.25)',
      tableBorder: '#e2e6ed',
      productDetailColor: '#003680',
      totalColumnBg: '#f3f5f8',
      itemTotalColor: '#002a7a',

      discountBg: '#f4f6fa',
      discountBorder: '#d7dee8',
      discountTextColor: '#061a44',
      discountValueColor: '#061a44',
      discountIconColor: '#003680',
      subtotalGradient:
        'linear-gradient(90deg, #f4f6fa 0%, #e2e8f0 28%, #004691 62%, #002149 85%, #000d2c 100%)',
      subtotalTextColor: '#061a44',
      subtotalValueColor: '#ffffff',
      subtotalBorder: '#d7dee8',
      specialPriceHighlight: false,

      freightBorder: '#e2d7cc',
      freightIconColor: '#002a7a',
      freightTitleColor: '#002a7a',
      freightDividerColor: '#e2aa3b',
      freightValueColor: '#002a7a',
      totalBoxBg: '#00173a',
      totalBoxBorder: '#0b3878',
      totalBoxLeftStart: '#001433',
      totalBoxLeftEnd: '#002c6a',
      totalBoxWaveStart: '#004294',
      totalBoxWaveMid: '#002d6b',
      totalBoxWaveEnd: '#00173c',
      totalBoxGlow: '#fde68a',
      totalIconBorder: '#facc15',
      totalLabelColor: '#ffffff',
      totalDividerColor: 'rgba(255, 255, 255, 0.35)',
      totalValueColor: '#ffffff',

      footerBorder: '#e8e2d9',
      footerColumnDivider: '#e0aa2b',
      footerAccent: '#061d4f',
      footerObsTitleColor: '#061d4f',
      footerScriptColor: '#061d4f',
      footerUnderlineColor: '#d49b1a',
      whatsappBorder: '#15803d',
      whatsappText: '#061d4f',

      waveBackStart: '#f5d061',
      waveBackEnd: '#d4af37',
      waveMidStart: '#004691',
      waveMidEnd: '#002149',
      waveGlow: '#fef08a',
      waveFrontStart: '#002659',
      waveFrontEnd: '#001333',

      headerBg: '#f8fafc',
      headerBorder: '#003680',
      slantedBannerBg: '#002659',
      slantedBannerAccent: '#fde047',
    },
  },

  halloween: {
    id: 'halloween',
    name: 'Halloween',
    shortTag: 'Temático',
    description:
      'Berinjela grafite, terracota queimada sofisticada e pergaminho claro com equilíbrio e legibilidade moderna.',
    motif: 'halloween',
    badgeText: 'Halloween',
    paletteSwatches: ['#1f1726', '#b84a1b', '#d99b43', '#faf8f6'],
    crm: {
      primary: '#b84a1b',
      primaryHover: '#993c14',
      secondary: '#462a57',
      secondaryHover: '#351f42',
      accent: '#d99b43',
      sidebarBg: '#1f1726',
      sidebarFooterBg: '#150f1a',
      sidebarBorder: '#3a2c47',
      sidebarText: '#f4eff7',
      sidebarMuted: '#c5b3d4',
      sidebarHoverBg: 'rgba(217, 155, 67, 0.13)',
      sidebarActiveBg: '#b84a1b',
      sidebarActiveText: '#ffffff',
      sidebarActiveAccent: '#eab05c',
      logoLightBackdrop: false,
      headerOverlayFrom: 'rgba(31, 23, 38, 0.88)',
      headerOverlayVia: 'rgba(66, 35, 56, 0.75)',
      headerOverlayTo: 'rgba(31, 23, 38, 0.88)',
      headerAccent: '#e0964a',
      headerSearchBg: 'rgba(21, 15, 26, 0.48)',
      headerSearchBorder: 'rgba(224, 150, 74, 0.34)',
      headerSearchFocusBorder: '#f0b069',
      pageBg: '#faf8f6',
      cardBg: '#ffffff',
      cardBorder: '#ebe3dd',
      cardTintBg: '#fdf5ef',
      cardTintBorder: '#ecd0bd',
      panelSubtleBg: '#f8f4f1',
      dividerColor: '#efe7e1',
      inputBg: '#fcfaf8',
      inputBorder: '#dfd3ca',
      inputFocusBorder: '#b84a1b',
      inputFocusRing: 'rgba(184, 74, 27, 0.14)',
      tableHeaderBg: '#f6f0eb',
      tableHeaderText: '#5e2d18',
      tableRowHoverBg: '#fcf8f5',
      tableBorder: '#ede5df',
      highlightText: '#382045',
      indicatorBg: '#faece2',
      indicatorText: '#993c14',
    },
    budget: {
      outerBorder: '#d8c5eb',
      headerLightBgStart: '#ffffff',
      headerLightBgMid: '#faf6fd',
      headerLightBgEnd: '#efe4fa',
      headerWaveBackStart: '#fb923c',
      headerWaveBackEnd: '#ea580c',
      headerWaveFrontStart: '#6b21a8',
      headerWaveFrontMid: '#3b0764',
      headerWaveFrontEnd: '#110a1c',
      headerGlowStroke: '#fb923c',
      headerBottomBarBg: '#581c87',
      dividerLine: '#ea580c',
      companyTitleColor: '#3b0764',
      companyAddressColor: '#1e293b',
      bannerIconBorder: '#fb923c',
      bannerIconBars: '#ffffff',
      bannerDivider: 'rgba(251, 146, 60, 0.75)',
      bannerTitleColor: '#ffffff',
      bannerSubtextColor: '#ffedd5',
      bannerDateColor: '#fb923c',

      blockBorder: '#dfd0ee',
      sectionHeaderFrom: '#6b21a8',
      sectionHeaderTo: '#3b0764',
      sectionHeaderBg: '#581c87',
      sectionHeaderText: '#ffffff',
      rowDivider: '#efe6f7',
      labelColor: '#581c87',

      tableSectionFrom: '#1f1630',
      tableSectionMid: '#581c87',
      tableSectionTo: '#1f1630',
      tableSectionBg: '#3b0764',
      tableSectionText: '#ffffff',
      tableBarGlow:
        'linear-gradient(90deg, #1f1630 0%, #ea580c 30%, #fed7aa 50%, #ea580c 70%, #1f1630 100%)',
      tableHeaderFrom: '#2e1065',
      tableHeaderTo: '#110a1c',
      tableHeaderBg: '#1f1630',
      tableHeaderText: '#ffffff',
      tableHeaderDivider: 'rgba(251, 146, 60, 0.35)',
      tableBorder: '#e6daf2',
      productDetailColor: '#c2410c',
      totalColumnBg: '#fff7ed',
      itemTotalColor: '#9a3412',

      discountBg: '#fff7ed',
      discountBorder: '#fed7aa',
      discountTextColor: '#581c87',
      discountValueColor: '#3b0764',
      discountIconColor: '#c2410c',
      subtotalGradient:
        'linear-gradient(90deg, #fff7ed 0%, #ffedd5 28%, #9a3412 62%, #181026 86%, #181026 100%)',
      subtotalTextColor: '#581c87',
      subtotalValueColor: '#fdba74',
      subtotalBorder: '#fed7aa',
      specialPriceHighlight: false,

      freightBorder: '#dfd0ee',
      freightIconColor: '#ea580c',
      freightTitleColor: '#581c87',
      freightDividerColor: '#ea580c',
      freightValueColor: '#9a3412',
      totalBoxBg: '#110a1c',
      totalBoxBorder: '#ea580c',
      totalBoxLeftStart: '#0b0612',
      totalBoxLeftEnd: '#2e1065',
      totalBoxWaveStart: '#ea580c',
      totalBoxWaveMid: '#581c87',
      totalBoxWaveEnd: '#181026',
      totalBoxGlow: '#fdba74',
      totalIconBorder: '#fb923c',
      totalLabelColor: '#fdba74',
      totalDividerColor: 'rgba(251, 146, 60, 0.5)',
      totalValueColor: '#ffffff',

      footerBorder: '#e7dbf3',
      footerColumnDivider: '#dfd0ee',
      footerAccent: '#ea580c',
      footerObsTitleColor: '#581c87',
      footerScriptColor: '#3b0764',
      footerUnderlineColor: '#ea580c',
      whatsappBorder: '#581c87',
      whatsappText: '#3b0764',

      waveBackStart: '#fb923c',
      waveBackEnd: '#ea580c',
      waveMidStart: '#6b21a8',
      waveMidEnd: '#3b0764',
      waveGlow: '#fdba74',
      waveFrontStart: '#181026',
      waveFrontEnd: '#090510',

      headerBg: '#faf6fd',
      headerBorder: '#ea580c',
      slantedBannerBg: '#181026',
      slantedBannerAccent: '#fb923c',
    },
  },
};

export function buildCustomThemeDefinition(custom: CustomThemeConfig): FenixThemeDefinition {
  const c = { ...DEFAULT_CUSTOM_THEME, ...custom };
  const primary = c.primary || '#00386e';
  const secondary = c.secondary || '#0b66c3';
  const accent = c.accent || '#1482e0';
  const headerBg = c.headerBg || '#00224a';
  const buttonBg = c.buttonBg || secondary;

  const primaryHover = adjustHex(buttonBg, -18);
  const secondaryHover = adjustHex(secondary, -16);
  const softTint = mixHexWithWhite(primary, 0.94);
  const softBorder = mixHexWithWhite(primary, 0.78);
  const subtlePanel = mixHexWithWhite(primary, 0.965);
  const pageBg = mixHexWithWhite(primary, 0.96);
  const lightAccentTint = mixHexWithWhite(accent, 0.88);
  const sidebarLightBg = isLightColor(headerBg);
  const buttonLightBg = isLightColor(buttonBg);
  const bannerLightBg = isLightColor(headerBg);
  const sectionLightBg = isLightColor(secondary);
  const headerDarkEnd = adjustHex(headerBg, -28);
  const sectionDark = adjustHex(primary, -20);
  const safeHighlightText = isLightColor(primary) ? '#0f172a' : adjustHex(primary, -18);
  const safeTableText = isLightColor(primary) ? '#1e293b' : adjustHex(primary, -12);

  return {
    id: 'personalizado',
    name: 'Personalizado',
    shortTag: 'Customizável',
    description:
      'Paleta sob medida aplicada com harmonia e alta legibilidade em menus, cabeçalhos, cards, tabelas e botões.',
    motif: 'nenhum',
    badgeText: 'Personalizado',
    paletteSwatches: [headerBg, buttonBg, accent, pageBg],
    crm: {
      primary: buttonBg,
      primaryHover,
      secondary,
      secondaryHover,
      accent,
      sidebarBg: headerBg,
      sidebarFooterBg: adjustHex(headerBg, -14),
      sidebarBorder: sidebarLightBg ? adjustHex(headerBg, -18) : adjustHex(headerBg, 22),
      sidebarText: sidebarLightBg ? '#0f172a' : '#f1f5f9',
      sidebarMuted: sidebarLightBg ? '#475569' : '#cbd5e1',
      sidebarHoverBg: sidebarLightBg ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.09)',
      sidebarActiveBg: buttonBg,
      sidebarActiveText: buttonLightBg ? '#0f172a' : '#ffffff',
      sidebarActiveAccent: accent,
      logoLightBackdrop: false,
      headerOverlayFrom: hexToRgba(headerBg, 0.88),
      headerOverlayVia: hexToRgba(primary, 0.72),
      headerOverlayTo: hexToRgba(headerBg, 0.88),
      headerAccent: accent,
      headerSearchBg: 'rgba(0, 0, 0, 0.40)',
      headerSearchBorder: hexToRgba(accent, 0.45),
      headerSearchFocusBorder: accent,
      pageBg,
      cardBg: '#ffffff',
      cardBorder: mixHexWithWhite(primary, 0.85),
      cardTintBg: softTint,
      cardTintBorder: softBorder,
      panelSubtleBg: subtlePanel,
      dividerColor: mixHexWithWhite(primary, 0.88),
      inputBg: subtlePanel,
      inputBorder: mixHexWithWhite(primary, 0.76),
      inputFocusBorder: buttonBg,
      inputFocusRing: hexToRgba(buttonBg, 0.16),
      tableHeaderBg: mixHexWithWhite(primary, 0.92),
      tableHeaderText: safeTableText,
      tableRowHoverBg: mixHexWithWhite(primary, 0.96),
      tableBorder: mixHexWithWhite(primary, 0.87),
      highlightText: safeHighlightText,
      indicatorBg: lightAccentTint,
      indicatorText: safeTableText,
    },
    budget: {
      outerBorder: softBorder,
      headerLightBgStart: '#ffffff',
      headerLightBgMid: hexToRgba(accent, 0.04),
      headerLightBgEnd: hexToRgba(secondary, 0.14),
      headerWaveBackStart: accent,
      headerWaveBackEnd: secondary,
      headerWaveFrontStart: secondary,
      headerWaveFrontMid: headerBg,
      headerWaveFrontEnd: headerDarkEnd,
      headerGlowStroke: adjustHex(accent, 35),
      headerBottomBarBg: primary,
      dividerLine: primary,
      companyTitleColor: isLightColor(primary) ? '#0f172a' : primary,
      companyAddressColor: '#1e293b',
      bannerIconBorder: bannerLightBg ? '#0f172a' : 'rgba(255,255,255,0.85)',
      bannerIconBars: bannerLightBg ? '#0f172a' : '#ffffff',
      bannerDivider: bannerLightBg ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.75)',
      bannerTitleColor: bannerLightBg ? '#0f172a' : '#ffffff',
      bannerSubtextColor: bannerLightBg ? '#334155' : '#f1f5f9',
      bannerDateColor: bannerLightBg ? '#0f172a' : '#ffffff',

      blockBorder: softBorder,
      sectionHeaderFrom: secondary,
      sectionHeaderTo: primary,
      sectionHeaderBg: primary,
      sectionHeaderText: sectionLightBg && isLightColor(primary) ? '#0f172a' : '#ffffff',
      rowDivider: hexToRgba(primary, 0.16),
      labelColor: isLightColor(primary) ? '#0f172a' : primary,

      tableSectionFrom: sectionDark,
      tableSectionMid: secondary,
      tableSectionTo: sectionDark,
      tableSectionBg: primary,
      tableSectionText: isLightColor(primary) ? '#0f172a' : '#ffffff',
      tableBarGlow: `linear-gradient(90deg, ${primary} 0%, ${accent} 35%, #ffffff 50%, ${accent} 65%, ${primary} 100%)`,
      tableHeaderFrom: primary,
      tableHeaderTo: headerBg,
      tableHeaderBg: primary,
      tableHeaderText: isLightColor(primary) && isLightColor(headerBg) ? '#0f172a' : '#ffffff',
      tableHeaderDivider: 'rgba(255, 255, 255, 0.28)',
      tableBorder: hexToRgba(primary, 0.2),
      productDetailColor: isLightColor(secondary) ? primary : secondary,
      totalColumnBg: hexToRgba(accent, 0.1),
      itemTotalColor: isLightColor(primary) ? '#0f172a' : primary,

      discountBg: hexToRgba(primary, 0.1),
      discountBorder: softBorder,
      discountTextColor: isLightColor(primary) ? '#0f172a' : primary,
      discountValueColor: isLightColor(primary) ? '#0f172a' : primary,
      discountIconColor: isLightColor(secondary)
        ? isLightColor(primary)
          ? '#0f172a'
          : primary
        : secondary,
      subtotalGradient: `linear-gradient(90deg, ${hexToRgba(primary, 0.1)} 0%, ${hexToRgba(secondary, 0.16)} 28%, ${secondary} 62%, ${primary} 85%, ${headerBg} 100%)`,
      subtotalTextColor: primary,
      subtotalValueColor: '#ffffff',
      subtotalBorder: softBorder,
      specialPriceHighlight: false,

      freightBorder: softBorder,
      freightIconColor: secondary,
      freightTitleColor: isLightColor(primary) ? '#0f172a' : primary,
      freightDividerColor: accent,
      freightValueColor: isLightColor(primary) ? '#0f172a' : primary,
      totalBoxBg: headerBg,
      totalBoxBorder: primary,
      totalBoxLeftStart: headerDarkEnd,
      totalBoxLeftEnd: headerBg,
      totalBoxWaveStart: accent,
      totalBoxWaveMid: secondary,
      totalBoxWaveEnd: primary,
      totalBoxGlow: adjustHex(accent, 45),
      totalIconBorder: '#ffffff',
      totalLabelColor: '#ffffff',
      totalDividerColor: 'rgba(255,255,255,0.55)',
      totalValueColor: '#ffffff',

      footerBorder: hexToRgba(primary, 0.18),
      footerColumnDivider: hexToRgba(primary, 0.22),
      footerAccent: secondary,
      footerObsTitleColor: isLightColor(primary) ? '#0f172a' : primary,
      footerScriptColor: isLightColor(primary) ? '#0f172a' : primary,
      footerUnderlineColor: accent,
      whatsappBorder: primary,
      whatsappText: isLightColor(primary) ? '#0f172a' : primary,

      waveBackStart: adjustHex(accent, 20),
      waveBackEnd: accent,
      waveMidStart: secondary,
      waveMidEnd: primary,
      waveGlow: adjustHex(accent, 50),
      waveFrontStart: headerBg,
      waveFrontEnd: headerDarkEnd,

      headerBg: '#fafbfd',
      headerBorder: accent,
      slantedBannerBg: headerBg,
      slantedBannerAccent: accent,
    },
  };
}

export const ALL_THEME_IDS: FenixThemeId[] = [
  'padrao',
  'natal',
  'novembro_black',
  'ano_novo',
  'carnaval',
  'pascoa',
  'dia_das_maes',
  'dia_dos_pais',
  'halloween',
  'personalizado',
];

export const DECORATABLE_THEME_IDS: FenixThemeId[] = [];

export function supportsDecoratedVariant(themeId: FenixThemeId): boolean {
  return DECORATABLE_THEME_IDS.includes(themeId);
}

export function getThemeDefinition(
  id: FenixThemeId,
  customConfig?: CustomThemeConfig
): FenixThemeDefinition {
  if (id === 'personalizado') {
    return buildCustomThemeDefinition(customConfig || DEFAULT_CUSTOM_THEME);
  }
  return STATIC_THEME_DEFINITIONS[id] || STATIC_THEME_DEFINITIONS.padrao;
}

export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getScheduleStatus(state: FenixThemeState): {
  isScheduled: boolean;
  isWithinWindow: boolean;
  statusLabel: string;
} {
  if (!state.autoScheduleEnabled) {
    return {
      isScheduled: false,
      isWithinWindow: false,
      statusLabel: 'Ativação manual',
    };
  }
  const today = getLocalTodayIso();
  const hasStart = Boolean(state.startDate);
  const hasEnd = Boolean(state.endDate);

  if (!hasStart && !hasEnd) {
    return {
      isScheduled: true,
      isWithinWindow: false,
      statusLabel: 'Defina as datas de início e término para ativar o agendamento',
    };
  }

  const afterStart = !hasStart || today >= state.startDate;
  const beforeEnd = !hasEnd || today <= state.endDate;

  if (afterStart && beforeEnd) {
    return {
      isScheduled: true,
      isWithinWindow: true,
      statusLabel: `Período programado ativo (${getThemeDefinition(state.scheduledThemeId, state.customTheme).name})`,
    };
  }

  if (hasStart && today < state.startDate) {
    return {
      isScheduled: true,
      isWithinWindow: false,
      statusLabel: `Programado para iniciar em ${state.startDate.split('-').reverse().join('/')}`,
    };
  }

  return {
    isScheduled: true,
    isWithinWindow: false,
    statusLabel: 'Período programado encerrado — tema PREMIUM restaurado',
  };
}

export function getActiveThemeUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionActive = sessionStorage.getItem('fenix_session_active') === 'true';
    const sessionUser = sessionStorage.getItem('fenix_session_user');
    let rawUser: string | null = null;
    if (sessionActive && sessionUser) {
      rawUser = sessionUser;
    } else {
      const lsAuthActive = localStorage.getItem('fenix_auth_active') === 'true';
      const lsUser = localStorage.getItem('fenix_active_user_name');
      if (lsAuthActive && lsUser) {
        rawUser = lsUser;
      }
    }
    if (!rawUser || isUserRevoked(rawUser)) return null;
    const canonical = normalizeAuthorizedName(rawUser) || rawUser.trim();
    if (!canonical || isUserRevoked(canonical)) return null;
    const resolvedId = getUserIdByName(canonical) || getSellerIdForUser(canonical);
    if (resolvedId) return resolvedId;
    return canonical
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_');
  } catch {
    return null;
  }
}

export function getUserThemeStorageKey(userId?: string | null): string | null {
  const id = userId !== undefined ? userId : getActiveThemeUserId();
  if (!id) return null;
  return `${THEME_USER_STORAGE_PREFIX}${id}`;
}

export function getThemeState(): FenixThemeState {
  try {
    const userKey = getUserThemeStorageKey();
    if (!userKey) {
      return {
        ...DEFAULT_THEME_STATE,
        customTheme: { ...DEFAULT_CUSTOM_THEME },
      };
    }
    const raw = getLocalRawSafe(userKey);
    if (!raw) {
      return {
        ...DEFAULT_THEME_STATE,
        customTheme: { ...DEFAULT_CUSTOM_THEME },
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ...DEFAULT_THEME_STATE,
        customTheme: { ...DEFAULT_CUSTOM_THEME },
      };
    }
    return {
      ...DEFAULT_THEME_STATE,
      ...parsed,
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        ...(parsed.customTheme || {}),
      },
    };
  } catch {
    return {
      ...DEFAULT_THEME_STATE,
      customTheme: { ...DEFAULT_CUSTOM_THEME },
    };
  }
}

export function getEffectiveActiveThemeId(state: FenixThemeState): FenixThemeId {
  if (currentPreviewThemeId) {
    return currentPreviewThemeId;
  }
  if (state.autoScheduleEnabled) {
    const sched = getScheduleStatus(state);
    if (sched.isWithinWindow) {
      return state.scheduledThemeId || 'padrao';
    }
    if (state.endDate && getLocalTodayIso() > state.endDate && state.activeThemeId === state.scheduledThemeId) {
      return 'padrao';
    }
  }
  return state.activeThemeId || 'padrao';
}

export function shouldApplyToTarget(
  state: FenixThemeState,
  target: 'crm' | 'orcamento' | 'pdf'
): boolean {
  const effectiveId = getEffectiveActiveThemeId(state);
  if (effectiveId === 'padrao') return false;

  // Separação obrigatória: temas do CRM nunca alteram modelos ou PDFs de orçamento
  if (target === 'crm') {
    return true;
  }
  return false;
}

export function resolveThemeForTarget(target: 'crm' | 'orcamento' | 'pdf'): {
  theme: FenixThemeDefinition;
  isThemed: boolean;
  showDecorations: boolean;
  isPreview: boolean;
  state: FenixThemeState;
} {
  const state = getThemeState();

  // Temas de orçamento permanecem 100% independentes dentro de Orçamentos
  if (target === 'orcamento' || target === 'pdf') {
    return {
      theme: STATIC_THEME_DEFINITIONS.padrao,
      isThemed: false,
      showDecorations: false,
      isPreview: false,
      state,
    };
  }

  const effectiveId = getEffectiveActiveThemeId(state);
  const customCfg =
    effectiveId === 'personalizado' && currentPreviewCustomOverride
      ? currentPreviewCustomOverride
      : state.customTheme;

  const isPreview = Boolean(currentPreviewThemeId);
  const applies = effectiveId !== 'padrao';

  const resolvedTheme = applies
    ? getThemeDefinition(effectiveId, customCfg)
    : STATIC_THEME_DEFINITIONS.padrao;

  // Regra de design: zero ilustrações ou ícones decorativos no CRM
  const showDecorations = false;

  return {
    theme: resolvedTheme,
    isThemed: applies,
    showDecorations,
    isPreview,
    state,
  };
}

const CRM_CSS_VAR_KEYS = [
  '--fenix-primary',
  '--fenix-primary-hover',
  '--fenix-secondary',
  '--fenix-secondary-hover',
  '--fenix-accent',
  '--fenix-sidebar-bg',
  '--fenix-sidebar-footer',
  '--fenix-sidebar-border',
  '--fenix-sidebar-text',
  '--fenix-sidebar-muted',
  '--fenix-sidebar-hover',
  '--fenix-sidebar-active-bg',
  '--fenix-sidebar-active-text',
  '--fenix-sidebar-active-accent',
  '--fenix-header-accent',
  '--fenix-header-search-focus',
  '--fenix-page-bg',
  '--fenix-card-bg',
  '--fenix-card-border',
  '--fenix-card-tint-bg',
  '--fenix-card-tint-border',
  '--fenix-panel-subtle-bg',
  '--fenix-divider-color',
  '--fenix-input-bg',
  '--fenix-input-border',
  '--fenix-input-focus-border',
  '--fenix-input-focus-ring',
  '--fenix-table-header-bg',
  '--fenix-table-header-text',
  '--fenix-table-row-hover',
  '--fenix-table-border',
  '--fenix-highlight-text',
  '--fenix-indicator-bg',
  '--fenix-indicator-text',
];

export function applyThemeToDocument(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { theme, isThemed } = resolveThemeForTarget('crm');

  if (!isThemed) {
    root.removeAttribute('data-fenix-crm-theme');
    root.setAttribute('data-fenix-theme-id', 'padrao');
    CRM_CSS_VAR_KEYS.forEach((prop) => root.style.removeProperty(prop));
    return;
  }

  root.setAttribute('data-fenix-crm-theme', 'active');
  root.setAttribute('data-fenix-theme-id', theme.id);
  root.style.setProperty('--fenix-primary', theme.crm.primary);
  root.style.setProperty('--fenix-primary-hover', theme.crm.primaryHover);
  root.style.setProperty('--fenix-secondary', theme.crm.secondary);
  root.style.setProperty('--fenix-secondary-hover', theme.crm.secondaryHover);
  root.style.setProperty('--fenix-accent', theme.crm.accent);
  root.style.setProperty('--fenix-sidebar-bg', theme.crm.sidebarBg);
  root.style.setProperty('--fenix-sidebar-footer', theme.crm.sidebarFooterBg);
  root.style.setProperty('--fenix-sidebar-border', theme.crm.sidebarBorder);
  root.style.setProperty('--fenix-sidebar-text', theme.crm.sidebarText);
  root.style.setProperty('--fenix-sidebar-muted', theme.crm.sidebarMuted);
  root.style.setProperty('--fenix-sidebar-hover', theme.crm.sidebarHoverBg);
  root.style.setProperty('--fenix-sidebar-active-bg', theme.crm.sidebarActiveBg);
  root.style.setProperty('--fenix-sidebar-active-text', theme.crm.sidebarActiveText);
  root.style.setProperty('--fenix-sidebar-active-accent', theme.crm.sidebarActiveAccent);
  root.style.setProperty('--fenix-header-accent', theme.crm.headerAccent);
  root.style.setProperty('--fenix-header-search-focus', theme.crm.headerSearchFocusBorder);
  root.style.setProperty('--fenix-page-bg', theme.crm.pageBg);
  root.style.setProperty('--fenix-card-bg', theme.crm.cardBg);
  root.style.setProperty('--fenix-card-border', theme.crm.cardBorder);
  root.style.setProperty('--fenix-card-tint-bg', theme.crm.cardTintBg);
  root.style.setProperty('--fenix-card-tint-border', theme.crm.cardTintBorder);
  root.style.setProperty('--fenix-panel-subtle-bg', theme.crm.panelSubtleBg);
  root.style.setProperty('--fenix-divider-color', theme.crm.dividerColor);
  root.style.setProperty('--fenix-input-bg', theme.crm.inputBg);
  root.style.setProperty('--fenix-input-border', theme.crm.inputBorder);
  root.style.setProperty('--fenix-input-focus-border', theme.crm.inputFocusBorder);
  root.style.setProperty('--fenix-input-focus-ring', theme.crm.inputFocusRing);
  root.style.setProperty('--fenix-table-header-bg', theme.crm.tableHeaderBg);
  root.style.setProperty('--fenix-table-header-text', theme.crm.tableHeaderText);
  root.style.setProperty('--fenix-table-row-hover', theme.crm.tableRowHoverBg);
  root.style.setProperty('--fenix-table-border', theme.crm.tableBorder);
  root.style.setProperty('--fenix-highlight-text', theme.crm.highlightText);
  root.style.setProperty('--fenix-indicator-bg', theme.crm.indicatorBg);
  root.style.setProperty('--fenix-indicator-text', theme.crm.indicatorText);
}

function notifyThemeChanged(): void {
  applyThemeToDocument();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
  }
}

const USER_THEMES_REMOTE_KEY = 'fenix_user_themes_v1';

function readLocalUserThemesMap(): Record<string, FenixThemeState> {
  try {
    const raw = getLocalRawSafe(USER_THEMES_REMOTE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return {};
}

async function syncUserThemeToSupabase(userId: string, state: FenixThemeState): Promise<void> {
  if (!userId) return;
  const localMap = readLocalUserThemesMap();
  localMap[userId] = state;
  setLocalCollectionSafe(USER_THEMES_REMOTE_KEY, localMap);

  if (isEmergencyOfflineMode()) {
    markRecordPendingSync({
      collectionKey: USER_THEMES_REMOTE_KEY,
      itemId: '__meta__',
      op: 'collection',
      item: localMap,
      user: userId,
    });
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    markRecordPendingSync({
      collectionKey: USER_THEMES_REMOTE_KEY,
      itemId: '__meta__',
      op: 'collection',
      item: localMap,
      user: userId,
    });
    return;
  }

  try {
    const { data: remoteRow } = await withAbortableTimeout<any>(
      (signal) =>
        client
          .from('fenix_kv_store')
          .select('data')
          .eq('key', USER_THEMES_REMOTE_KEY)
          .abortSignal(signal)
          .maybeSingle(),
      10000,
      'Tempo limite ao consultar temas por usuário.'
    );

    let mergedMap: Record<string, FenixThemeState> = { ...localMap };
    if (remoteRow?.data && typeof remoteRow.data === 'object' && !Array.isArray(remoteRow.data)) {
      mergedMap = { ...(remoteRow.data as Record<string, FenixThemeState>), ...localMap, [userId]: state };
    }

    const nowIso = new Date().toISOString();
    recordSelfSave(USER_THEMES_REMOTE_KEY, nowIso);
    const { data: upsertRow, error } = await withAbortableTimeout<any>(
      (signal) =>
        client
          .from('fenix_kv_store')
          .upsert(
            {
              key: USER_THEMES_REMOTE_KEY,
              data: mergedMap,
              updated_at: nowIso,
              updated_by: userId,
            },
            { onConflict: 'key' }
          )
          .select('updated_at')
          .abortSignal(signal)
          .maybeSingle(),
      10000,
      'Tempo limite ao salvar tema por usuário.'
    );
    if (error) throw error;
    if (upsertRow?.updated_at) {
      recordSelfSave(USER_THEMES_REMOTE_KEY, String(upsertRow.updated_at));
    }
    setLocalCollectionSafe(USER_THEMES_REMOTE_KEY, mergedMap);
    removePendingSyncRecord(USER_THEMES_REMOTE_KEY, '__meta__');
  } catch {
    markRecordPendingSync({
      collectionKey: USER_THEMES_REMOTE_KEY,
      itemId: '__meta__',
      op: 'collection',
      item: readLocalUserThemesMap(),
      user: userId,
    });
  }
}

export function applyRemoteUserThemesMap(remoteMap: Record<string, FenixThemeState> | null | undefined): void {
  if (!remoteMap || typeof remoteMap !== 'object') return;
  const activeUserId = getActiveThemeUserId();
  if (!activeUserId) return;
  const remoteState = remoteMap[activeUserId];
  if (!remoteState || typeof remoteState !== 'object') return;

  const userKey = getUserThemeStorageKey(activeUserId);
  if (!userKey) return;

  const localState = getThemeState();
  const remTs = Date.parse(remoteState.updatedAt || '') || 0;
  const locTs = Date.parse(localState.updatedAt || '') || 0;
  const hasLocalSaved = Boolean(getLocalRawSafe(userKey));

  if (!hasLocalSaved || remTs > locTs) {
    const normalized: FenixThemeState = {
      ...DEFAULT_THEME_STATE,
      ...remoteState,
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        ...(remoteState.customTheme || {}),
      },
    };
    setLocalCollectionSafe(userKey, normalized);
    notifyThemeChanged();
  }
}

export function saveThemeState(next: Partial<FenixThemeState>): FenixThemeState {
  const current = getThemeState();
  const merged: FenixThemeState = {
    ...current,
    ...next,
    customTheme: {
      ...current.customTheme,
      ...(next.customTheme || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  const activeUserId = getActiveThemeUserId();
  const userKey = getUserThemeStorageKey(activeUserId);
  if (userKey) {
    setLocalCollectionSafe(userKey, merged);
  }
  if (activeUserId) {
    syncUserThemeToSupabase(activeUserId, merged).catch(() => {});
  }
  notifyThemeChanged();
  return merged;
}

export function activateTheme(themeId: FenixThemeId): FenixThemeState {
  currentPreviewThemeId = null;
  currentPreviewCustomOverride = null;
  const current = getThemeState();
  const next: Partial<FenixThemeState> = {
    activeThemeId: themeId,
  };
  if (current.autoScheduleEnabled && themeId !== current.scheduledThemeId) {
    const sched = getScheduleStatus(current);
    if (sched.isWithinWindow) {
      next.autoScheduleEnabled = false;
    }
  }
  return saveThemeState(next);
}

export function deactivateTheme(): FenixThemeState {
  currentPreviewThemeId = null;
  currentPreviewCustomOverride = null;
  return saveThemeState({
    activeThemeId: 'padrao',
    autoScheduleEnabled: false,
  });
}

export function setPreviewTheme(
  themeId: FenixThemeId | null,
  customOverride?: CustomThemeConfig | null
): void {
  currentPreviewThemeId = themeId;
  currentPreviewCustomOverride = customOverride || null;
  notifyThemeChanged();
}

export function getPreviewThemeId(): FenixThemeId | null {
  return currentPreviewThemeId;
}

export async function runWithPdfThemeExport<T>(fn: () => Promise<T>): Promise<T> {
  currentExportRenderTarget = 'pdf';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-fenix-pdf-export', 'true');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
  }
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 48)))
  );
  try {
    return await fn();
  } finally {
    currentExportRenderTarget = null;
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-fenix-pdf-export');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
    }
  }
}

let lastTrackedThemeUserId: string | null = null;

export function initThemeSystem(): () => void {
  lastTrackedThemeUserId = getActiveThemeUserId();
  applyRemoteUserThemesMap(readLocalUserThemesMap());
  applyThemeToDocument();
  if (typeof window === 'undefined') return () => {};

  const handleAuthOrStorageChange = () => {
    const currentUid = getActiveThemeUserId();
    if (currentUid !== lastTrackedThemeUserId) {
      lastTrackedThemeUserId = currentUid;
      currentPreviewThemeId = null;
      currentPreviewCustomOverride = null;
      applyRemoteUserThemesMap(readLocalUserThemesMap());
    }
    applyThemeToDocument();
    window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
  };

  const handleRemoteUserThemes = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && typeof detail === 'object') {
      applyRemoteUserThemesMap(detail as Record<string, FenixThemeState>);
    } else {
      applyRemoteUserThemesMap(readLocalUserThemesMap());
    }
  };

  window.addEventListener('fenix_offline_hydrated', handleAuthOrStorageChange);
  window.addEventListener('fenix_auth_updated', handleAuthOrStorageChange);
  window.addEventListener('fenix_remote_user_themes_updated', handleRemoteUserThemes);
  window.addEventListener('storage', handleAuthOrStorageChange);

  const interval = window.setInterval(() => {
    applyThemeToDocument();
  }, 60_000);

  return () => {
    window.removeEventListener('fenix_offline_hydrated', handleAuthOrStorageChange);
    window.removeEventListener('fenix_auth_updated', handleAuthOrStorageChange);
    window.removeEventListener('fenix_remote_user_themes_updated', handleRemoteUserThemes);
    window.removeEventListener('storage', handleAuthOrStorageChange);
    window.clearInterval(interval);
  };
}

export function useFenixTheme(target: 'crm' | 'orcamento' | 'pdf' = 'crm') {
  const effectiveTarget =
    target === 'orcamento' && currentExportRenderTarget === 'pdf' ? 'pdf' : target;
  const [snapshot, setSnapshot] = useState(() => resolveThemeForTarget(effectiveTarget));

  useEffect(() => {
    const sync = () => {
      const nextTarget =
        target === 'orcamento' && currentExportRenderTarget === 'pdf' ? 'pdf' : target;
      setSnapshot(resolveThemeForTarget(nextTarget));
    };
    sync();
    window.addEventListener(THEME_UPDATED_EVENT, sync);
    window.addEventListener('fenix_offline_hydrated', sync);
    window.addEventListener('fenix_auth_updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_UPDATED_EVENT, sync);
      window.removeEventListener('fenix_offline_hydrated', sync);
      window.removeEventListener('fenix_auth_updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, [target]);

  return snapshot;
}
