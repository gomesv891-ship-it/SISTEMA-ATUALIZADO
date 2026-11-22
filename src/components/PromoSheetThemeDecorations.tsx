import React from 'react';
import { PromoSheetThemeId } from '../utils/promocoesService';

export interface PromoSheetVisualTheme {
  id: PromoSheetThemeId;
  outerBorder: string;
  outerInnerRing: string;
  primary: string;
  primaryDark: string;
  primaryBorder: string;
  dividerColor: string;
  tagColor: string;
  badgeTopBg: string;
  badgeTopText: string;
  badgeTopBorder: string;
  badgeBottomBg: string;
  badgeBottomText: string;
  badgeBottomBorder: string;
  waveBack: string;
  waveBackHighlight: string;
  waveFrontStart: string;
  waveFrontMid: string;
  waveFrontEnd: string;
  waveAccentStroke: string;
  sectionHeaderBg: string;
  sectionHeaderBorderBottom: string;
  sectionHeaderShadow: string;
  subHeaderBg: string;
  subHeaderBorder: string;
  subcategoryRowBg: string;
  subcategoryRowText: string;
  cellBorder: string;
  conditionBarBg: string;
  conditionBarBorder: string;
  conditionIconColor: string;
  conditionIconBoxBg: string;
  conditionIconBoxBorder: string;
  conditionTextColor: string;
  commercialBoxBg: string;
  commercialBoxBorder: string;
  text: string;
  mutedText: string;
}

export function getPromoSheetThemeVisual(
  themeId: PromoSheetThemeId,
  isMono: boolean
): PromoSheetVisualTheme {
  if (isMono) {
    return {
      id: themeId,
      outerBorder: '#9ca3af',
      outerInnerRing: 'none',
      primary: '#111827',
      primaryDark: '#030712',
      primaryBorder: '#1f2937',
      dividerColor: '#1f2937',
      tagColor: '#111827',
      badgeTopBg: '#1f2937',
      badgeTopText: '#ffffff',
      badgeTopBorder: 'none',
      badgeBottomBg: '#111827',
      badgeBottomText: '#ffffff',
      badgeBottomBorder: 'none',
      waveBack: '#d1d5db',
      waveBackHighlight: '#e5e7eb',
      waveFrontStart: '#374151',
      waveFrontMid: '#1f2937',
      waveFrontEnd: '#111827',
      waveAccentStroke: '#9ca3af',
      sectionHeaderBg: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
      sectionHeaderBorderBottom: 'none',
      sectionHeaderShadow: 'none',
      subHeaderBg: '#ffffff',
      subHeaderBorder: '#6b7280',
      subcategoryRowBg: '#e5e7eb',
      subcategoryRowText: '#111827',
      cellBorder: '#9ca3af',
      conditionBarBg: '#111827',
      conditionBarBorder: 'none',
      conditionIconColor: '#ffffff',
      conditionIconBoxBg: 'rgba(255,255,255,0.1)',
      conditionIconBoxBorder: '1px solid rgba(255,255,255,0.35)',
      conditionTextColor: '#ffffff',
      commercialBoxBg: '#f9fafb',
      commercialBoxBorder: '#9ca3af',
      text: '#030712',
      mutedText: '#374151',
    };
  }

  switch (themeId) {
    case 'natal':
      return {
        id: 'natal',
        outerBorder: '#991B1B',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(212, 175, 55, 0.55)',
        primary: '#991B1B',
        primaryDark: '#6B0F14',
        primaryBorder: '#991B1B',
        dividerColor: '#111827',
        tagColor: '#111827',
        badgeTopBg: 'linear-gradient(180deg, #E11D24 0%, #B91C1C 55%, #880E14 100%)',
        badgeTopText: '#ffffff',
        badgeTopBorder: '1px solid rgba(245, 208, 97, 0.5)',
        badgeBottomBg: 'linear-gradient(180deg, #C81920 0%, #991B1B 55%, #6B0F14 100%)',
        badgeBottomText: '#ffffff',
        badgeBottomBorder: '1px solid rgba(245, 208, 97, 0.6)',
        waveBack: '#E5B94C',
        waveBackHighlight: '#FEF08A',
        waveFrontStart: '#DC2626',
        waveFrontMid: '#991B1B',
        waveFrontEnd: '#5F0C10',
        waveAccentStroke: '#FCE588',
        sectionHeaderBg: 'linear-gradient(180deg, #D92027 0%, #A61016 55%, #6E0A0E 100%)',
        sectionHeaderBorderBottom: '2px solid #D4AF37',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#D4A5A5',
        subcategoryRowBg: '#FCE7E7',
        subcategoryRowText: '#881318',
        cellBorder: '#E5C7C7',
        conditionBarBg: 'linear-gradient(180deg, #B91C1C 0%, #8E1115 55%, #660A0D 100%)',
        conditionBarBorder: '1.5px solid #D4AF37',
        conditionIconColor: '#FCE588',
        conditionIconBoxBg: 'rgba(255, 255, 255, 0.12)',
        conditionIconBoxBorder: '1px solid rgba(252, 229, 136, 0.6)',
        conditionTextColor: '#ffffff',
        commercialBoxBg: '#FFFDF9',
        commercialBoxBorder: '#DFC5A0',
        text: '#1F1212',
        mutedText: '#6E3B3B',
      };

    case 'novembro_black':
      return {
        id: 'novembro_black',
        outerBorder: '#18181B',
        outerInnerRing: 'inset 0 0 0 2px #E5C158',
        primary: '#18181B',
        primaryDark: '#09090B',
        primaryBorder: '#18181B',
        dividerColor: '#09090B',
        tagColor: '#09090B',
        badgeTopBg: 'linear-gradient(180deg, #FEF08A 0%, #E5B94C 52%, #B48216 100%)',
        badgeTopText: '#09090B',
        badgeTopBorder: '1px solid #9A7116',
        badgeBottomBg: 'linear-gradient(180deg, #3F3F46 0%, #18181B 48%, #09090B 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1.5px solid #E5C158',
        waveBack: '#E5C158',
        waveBackHighlight: '#FEF08A',
        waveFrontStart: '#27272A',
        waveFrontMid: '#18181B',
        waveFrontEnd: '#050507',
        waveAccentStroke: '#FDE047',
        sectionHeaderBg: 'linear-gradient(180deg, #3F3F46 0%, #18181B 48%, #09090B 100%)',
        sectionHeaderBorderBottom: '2px solid #D4AF37',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#A1A1AA',
        subcategoryRowBg: '#FEF3C7',
        subcategoryRowText: '#18181B',
        cellBorder: '#D4D4D8',
        conditionBarBg: 'linear-gradient(180deg, #27272A 0%, #111114 55%, #050507 100%)',
        conditionBarBorder: '1.5px solid #D4AF37',
        conditionIconColor: '#FDE047',
        conditionIconBoxBg: 'rgba(229, 193, 88, 0.14)',
        conditionIconBoxBorder: '1px solid rgba(229, 193, 88, 0.7)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#FFFDF5',
        commercialBoxBorder: '#D8C89E',
        text: '#09090B',
        mutedText: '#3F3F46',
      };

    case 'ano_novo':
      return {
        id: 'ano_novo',
        outerBorder: '#0E2854',
        outerInnerRing: 'inset 0 0 0 2px #E5C158',
        primary: '#0F2B5B',
        primaryDark: '#071733',
        primaryBorder: '#0F2B5B',
        dividerColor: '#0F2B5B',
        tagColor: '#0F2B5B',
        badgeTopBg: 'linear-gradient(180deg, #1E4D99 0%, #102F66 55%, #081C40 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(253, 224, 71, 0.55)',
        badgeBottomBg: 'linear-gradient(180deg, #153B7A 0%, #0A2147 55%, #051126 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(253, 224, 71, 0.65)',
        waveBack: '#F5D061',
        waveBackHighlight: '#FEF08A',
        waveFrontStart: '#1D4ED8',
        waveFrontMid: '#0F2B5B',
        waveFrontEnd: '#061329',
        waveAccentStroke: '#FDE047',
        sectionHeaderBg: 'linear-gradient(180deg, #1D4B94 0%, #0F2B5B 55%, #061530 100%)',
        sectionHeaderBorderBottom: '2px solid #E5C158',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#94A3B8',
        subcategoryRowBg: '#E2EBF8',
        subcategoryRowText: '#0A2147',
        cellBorder: '#CBD5E1',
        conditionBarBg: 'linear-gradient(180deg, #153B7A 0%, #0A2147 55%, #051126 100%)',
        conditionBarBorder: '1.5px solid #E5C158',
        conditionIconColor: '#FDE047',
        conditionIconBoxBg: 'rgba(253, 224, 71, 0.14)',
        conditionIconBoxBorder: '1px solid rgba(253, 224, 71, 0.65)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#F8FAFD',
        commercialBoxBorder: '#C7D6EA',
        text: '#0B172A',
        mutedText: '#334155',
      };

    case 'carnaval':
      return {
        id: 'carnaval',
        outerBorder: '#7E22CE',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(250, 204, 21, 0.45)',
        primary: '#7E22CE',
        primaryDark: '#581C87',
        primaryBorder: '#7E22CE',
        dividerColor: '#111827',
        tagColor: '#111827',
        badgeTopBg: 'linear-gradient(180deg, #D946EF 0%, #9333EA 55%, #6B21A8 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(250, 204, 21, 0.55)',
        badgeBottomBg: 'linear-gradient(180deg, #9333EA 0%, #6B21A8 55%, #4C1D95 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(250, 204, 21, 0.6)',
        waveBack: '#FACC15',
        waveBackHighlight: '#EC4899',
        waveFrontStart: '#C026D3',
        waveFrontMid: '#7E22CE',
        waveFrontEnd: '#581C87',
        waveAccentStroke: '#FDE047',
        sectionHeaderBg: 'linear-gradient(180deg, #C026D3 0%, #7E22CE 55%, #581C87 100%)',
        sectionHeaderBorderBottom: '2px solid #FACC15',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#C084FC',
        subcategoryRowBg: '#F3E0FF',
        subcategoryRowText: '#6B21A8',
        cellBorder: '#E9D5FF',
        conditionBarBg: 'linear-gradient(180deg, #9333EA 0%, #6B21A8 55%, #4C1D95 100%)',
        conditionBarBorder: '1.5px solid #FACC15',
        conditionIconColor: '#FDE047',
        conditionIconBoxBg: 'rgba(255,255,255,0.14)',
        conditionIconBoxBorder: '1px solid rgba(253, 224, 71, 0.6)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#FDF9FF',
        commercialBoxBorder: '#DFC4FA',
        text: '#230D3A',
        mutedText: '#5B3A7D',
      };

    case 'pascoa':
      return {
        id: 'pascoa',
        outerBorder: '#6B21A8',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(233, 213, 255, 0.65)',
        primary: '#6B21A8',
        primaryDark: '#4C1D95',
        primaryBorder: '#6B21A8',
        dividerColor: '#111827',
        tagColor: '#111827',
        badgeTopBg: 'linear-gradient(180deg, #9333EA 0%, #7E22CE 55%, #581C87 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(245, 208, 254, 0.6)',
        badgeBottomBg: 'linear-gradient(180deg, #7E22CE 0%, #581C87 55%, #3B0764 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(245, 208, 254, 0.5)',
        waveBack: '#F5D0FE',
        waveBackHighlight: '#FBCFE8',
        waveFrontStart: '#A855F7',
        waveFrontMid: '#7E22CE',
        waveFrontEnd: '#581C87',
        waveAccentStroke: '#E9D5FF',
        sectionHeaderBg: 'linear-gradient(180deg, #9333EA 0%, #6B21A8 55%, #4C1D95 100%)',
        sectionHeaderBorderBottom: '2px solid #E9D5FF',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.26)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#C4B5FD',
        subcategoryRowBg: '#EFE6FD',
        subcategoryRowText: '#581C87',
        cellBorder: '#E5DCF9',
        conditionBarBg: 'linear-gradient(180deg, #7E22CE 0%, #581C87 55%, #3B0764 100%)',
        conditionBarBorder: '1.5px solid #D8B4FE',
        conditionIconColor: '#F5D0FE',
        conditionIconBoxBg: 'rgba(255,255,255,0.14)',
        conditionIconBoxBorder: '1px solid rgba(245, 208, 254, 0.6)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#FCFAFF',
        commercialBoxBorder: '#DDD6FE',
        text: '#24123D',
        mutedText: '#5A417D',
      };

    case 'dia_das_maes':
      return {
        id: 'dia_das_maes',
        outerBorder: '#9D174D',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(249, 168, 212, 0.55)',
        primary: '#9D174D',
        primaryDark: '#831843',
        primaryBorder: '#9D174D',
        dividerColor: '#111827',
        tagColor: '#111827',
        badgeTopBg: 'linear-gradient(180deg, #EC4899 0%, #BE185D 55%, #831843 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(251, 207, 232, 0.65)',
        badgeBottomBg: 'linear-gradient(180deg, #BE185D 0%, #9D174D 55%, #6D0F35 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(251, 207, 232, 0.55)',
        waveBack: '#F9A8D4',
        waveBackHighlight: '#FDE2EE',
        waveFrontStart: '#EC4899',
        waveFrontMid: '#BE185D',
        waveFrontEnd: '#831843',
        waveAccentStroke: '#FBCFE8',
        sectionHeaderBg: 'linear-gradient(180deg, #EC4899 0%, #BE185D 52%, #831843 100%)',
        sectionHeaderBorderBottom: '2px solid #F9A8D4',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#F472B6',
        subcategoryRowBg: '#FCE4F0',
        subcategoryRowText: '#9D174D',
        cellBorder: '#FBCFE8',
        conditionBarBg: 'linear-gradient(180deg, #DB2777 0%, #9D174D 55%, #700F38 100%)',
        conditionBarBorder: '1.5px solid #F9A8D4',
        conditionIconColor: '#FDE2EE',
        conditionIconBoxBg: 'rgba(255,255,255,0.14)',
        conditionIconBoxBorder: '1px solid rgba(253, 226, 238, 0.6)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#FFF9FC',
        commercialBoxBorder: '#F7C6DF',
        text: '#380C1E',
        mutedText: '#7D3B55',
      };

    case 'dia_dos_pais':
      return {
        id: 'dia_dos_pais',
        outerBorder: '#0F294A',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(148, 163, 184, 0.5)',
        primary: '#0F294A',
        primaryDark: '#091830',
        primaryBorder: '#0F294A',
        dividerColor: '#0F294A',
        tagColor: '#0F294A',
        badgeTopBg: 'linear-gradient(180deg, #255799 0%, #133563 55%, #0A203E 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(203, 213, 225, 0.5)',
        badgeBottomBg: 'linear-gradient(180deg, #163C6E 0%, #0C2342 55%, #061326 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(203, 213, 225, 0.45)',
        waveBack: '#BFDBFE',
        waveBackHighlight: '#E2E8F0',
        waveFrontStart: '#3B82F6',
        waveFrontMid: '#163B6B',
        waveFrontEnd: '#091830',
        waveAccentStroke: '#CBD5E1',
        sectionHeaderBg: 'linear-gradient(180deg, #1E4474 0%, #0F294A 55%, #071428 100%)',
        sectionHeaderBorderBottom: '2px solid #94A3B8',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#94A3B8',
        subcategoryRowBg: '#E2ECF7',
        subcategoryRowText: '#0F294A',
        cellBorder: '#CBD5E1',
        conditionBarBg: 'linear-gradient(180deg, #163A66 0%, #0D2340 55%, #071428 100%)',
        conditionBarBorder: '1.5px solid #94A3B8',
        conditionIconColor: '#E2E8F0',
        conditionIconBoxBg: 'rgba(255,255,255,0.12)',
        conditionIconBoxBorder: '1px solid rgba(226, 232, 240, 0.55)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#F8FAFC',
        commercialBoxBorder: '#CBD5E1',
        text: '#0F172A',
        mutedText: '#334155',
      };

    case 'halloween':
      return {
        id: 'halloween',
        outerBorder: '#9A3412',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(245, 158, 11, 0.55)',
        primary: '#9A3412',
        primaryDark: '#431407',
        primaryBorder: '#9A3412',
        dividerColor: '#111827',
        tagColor: '#111827',
        badgeTopBg: 'linear-gradient(180deg, #FB923C 0%, #EA580C 55%, #9A3412 100%)',
        badgeTopText: '#FFFFFF',
        badgeTopBorder: '1px solid rgba(253, 224, 71, 0.5)',
        badgeBottomBg: 'linear-gradient(180deg, #C2410C 0%, #7C2D12 55%, #431407 100%)',
        badgeBottomText: '#FFFFFF',
        badgeBottomBorder: '1px solid rgba(251, 191, 36, 0.55)',
        waveBack: '#FBBF24',
        waveBackHighlight: '#FDE68A',
        waveFrontStart: '#EA580C',
        waveFrontMid: '#9A3412',
        waveFrontEnd: '#431407',
        waveAccentStroke: '#FCD34D',
        sectionHeaderBg: 'linear-gradient(180deg, #EA580C 0%, #9A3412 55%, #431407 100%)',
        sectionHeaderBorderBottom: '2px solid #F59E0B',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.26)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#FB923C',
        subcategoryRowBg: '#FFEDD5',
        subcategoryRowText: '#7C2D12',
        cellBorder: '#FED7AA',
        conditionBarBg: 'linear-gradient(180deg, #EA580C 0%, #9A3412 55%, #5C1D09 100%)',
        conditionBarBorder: '1.5px solid #F59E0B',
        conditionIconColor: '#FDE68A',
        conditionIconBoxBg: 'rgba(255,255,255,0.14)',
        conditionIconBoxBorder: '1px solid rgba(253, 230, 138, 0.6)',
        conditionTextColor: '#FFFFFF',
        commercialBoxBg: '#FFFAF4',
        commercialBoxBorder: '#FCD5A8',
        text: '#291206',
        mutedText: '#7C3E1D',
      };

    case 'padrao':
    default:
      return {
        id: 'padrao',
        outerBorder: '#0B56A8',
        outerInnerRing: 'inset 0 0 0 1.5px rgba(147, 197, 253, 0.5)',
        primary: '#0B3F7D',
        primaryDark: '#072B54',
        primaryBorder: '#0B4F9E',
        dividerColor: '#0B3F7D',
        tagColor: '#0B3F7D',
        badgeTopBg: 'linear-gradient(180deg, #1273D4 0%, #0B55A6 55%, #073873 100%)',
        badgeTopText: '#ffffff',
        badgeTopBorder: '1px solid rgba(186, 230, 253, 0.4)',
        badgeBottomBg: 'linear-gradient(180deg, #0D5CB3 0%, #093F7D 55%, #062752 100%)',
        badgeBottomText: '#ffffff',
        badgeBottomBorder: '1px solid rgba(186, 230, 253, 0.35)',
        waveBack: '#93C5FD',
        waveBackHighlight: '#E0F2FE',
        waveFrontStart: '#38BDF8',
        waveFrontMid: '#0C63B8',
        waveFrontEnd: '#072B54',
        waveAccentStroke: '#BAE6FD',
        sectionHeaderBg: 'linear-gradient(180deg, #1474D4 0%, #0B4D96 55%, #062D5E 100%)',
        sectionHeaderBorderBottom: '2px solid #38BDF8',
        sectionHeaderShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        subHeaderBg: '#ffffff',
        subHeaderBorder: '#94a3b8',
        subcategoryRowBg: '#DCEBFA',
        subcategoryRowText: '#0B3F7D',
        cellBorder: '#cbd5e1',
        conditionBarBg: 'linear-gradient(180deg, #0D67C2 0%, #09478C 55%, #062D5E 100%)',
        conditionBarBorder: '1.5px solid #38BDF8',
        conditionIconColor: '#E0F2FE',
        conditionIconBoxBg: 'rgba(255,255,255,0.14)',
        conditionIconBoxBorder: '1px solid rgba(224, 242, 254, 0.6)',
        conditionTextColor: '#ffffff',
        commercialBoxBg: '#f8fafc',
        commercialBoxBorder: '#cbd5e1',
        text: '#0f172a',
        mutedText: '#334155',
      };
  }
}

interface PromoSheetArtworkProps {
  themeId: PromoSheetThemeId;
  uid: string;
  isMono?: boolean;
}

/**
 * Cabeçalho contínuo + onda superior integrada exatamente como no modelo visual oficial.
 * Sem costuras horizontais entre a curva lateral direita e a onda sob o cabeçalho.
 */
export const PromoSheetUnifiedHeaderBackdrop: React.FC<PromoSheetArtworkProps> = ({
  themeId,
  uid,
  isMono,
}) => {
  const visual = getPromoSheetThemeVisual(themeId, Boolean(isMono));
  const gid = (name: string) => `psuh-${themeId}-${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 794 128"
      width="794"
      height="128"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <defs>
        <linearGradient id={gid('wave-back')} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={visual.waveBackHighlight} />
          <stop offset="50%" stopColor={visual.waveBack} />
          <stop offset="100%" stopColor={visual.waveBackHighlight} />
        </linearGradient>
        <linearGradient id={gid('wave-front')} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={visual.waveFrontStart} />
          <stop offset="55%" stopColor={visual.waveFrontMid} />
          <stop offset="100%" stopColor={visual.waveFrontEnd} />
        </linearGradient>
        <linearGradient id={gid('right-panel')} x1="0%" y1="0%" x2="100%" y2="100%">
          {themeId === 'padrao' && (
            <>
              <stop offset="0%" stopColor="#DBEAFE" />
              <stop offset="45%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#073168" />
            </>
          )}
          {themeId === 'natal' && (
            <>
              <stop offset="0%" stopColor="#DC2626" />
              <stop offset="52%" stopColor="#991B1B" />
              <stop offset="100%" stopColor="#58080D" />
            </>
          )}
          {themeId === 'novembro_black' && (
            <>
              <stop offset="0%" stopColor="#27272A" />
              <stop offset="45%" stopColor="#121215" />
              <stop offset="100%" stopColor="#040405" />
            </>
          )}
          {themeId === 'ano_novo' && (
            <>
              <stop offset="0%" stopColor="#153B7A" />
              <stop offset="50%" stopColor="#0B2047" />
              <stop offset="100%" stopColor="#040E21" />
            </>
          )}
          {themeId === 'carnaval' && (
            <>
              <stop offset="0%" stopColor="#E879F9" />
              <stop offset="48%" stopColor="#7E22CE" />
              <stop offset="100%" stopColor="#4C1D95" />
            </>
          )}
          {themeId === 'pascoa' && (
            <>
              <stop offset="0%" stopColor="#F5D0FE" />
              <stop offset="55%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#6B21A8" />
            </>
          )}
          {themeId === 'dia_das_maes' && (
            <>
              <stop offset="0%" stopColor="#FCE7F3" />
              <stop offset="52%" stopColor="#F472B6" />
              <stop offset="100%" stopColor="#9D174D" />
            </>
          )}
          {themeId === 'dia_dos_pais' && (
            <>
              <stop offset="0%" stopColor="#1E4474" />
              <stop offset="50%" stopColor="#0F294A" />
              <stop offset="100%" stopColor="#071326" />
            </>
          )}
          {themeId === 'halloween' && (
            <>
              <stop offset="0%" stopColor="#7C2D12" />
              <stop offset="55%" stopColor="#4C1D95" />
              <stop offset="100%" stopColor="#230C33" />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Onda suave secundária no fundo esquerdo-centro */}
      {!isMono && (
        <path
          d="M0,118 C185,96 420,118 610,64 C665,48 705,18 725,0 L794,0 L794,128 L0,128 Z"
          fill={visual.waveBackHighlight}
          opacity="0.45"
        />
      )}

      {/* Faixa curva contínua da lateral direita descendo para a onda superior */}
      {!isMono && (
        <path
          d="M0,122 C210,104 480,102 620,66 C660,55 680,26 692,0 L794,0 L794,128 L0,128 Z"
          fill={`url(#${gid('right-panel')})`}
        />
      )}

      {/* Crista luminosa / fita secundária da onda superior */}
      <path
        d="M0,120 C215,96 465,112 622,74 C672,62 698,28 712,0 L724,0 C708,34 680,70 624,84 C465,122 215,108 0,126 Z"
        fill={`url(#${gid('wave-back')})`}
      />

      {/* Onda principal frontal contínua sobre a borda inferior do cabeçalho */}
      <path
        d="M0,123 C230,102 475,118 660,88 C716,78 756,64 794,48 L794,128 L0,128 Z"
        fill={`url(#${gid('wave-front')})`}
      />

      {/* Filete de brilho ao longo da onda principal */}
      <path
        d="M0,123 C230,102 475,118 660,88 C716,78 756,64 794,48"
        fill="none"
        stroke={visual.waveAccentStroke}
        strokeWidth="1.6"
        opacity="0.88"
      />

      {/* Recorte inferior limpo branco para a área das tabelas logo abaixo da onda */}
      <path
        d="M0,128 C255,112 515,126 794,104 L794,128 Z"
        fill="#ffffff"
      />

    </svg>
  );
};

export const PromoSheetBottomWave: React.FC<PromoSheetArtworkProps> = ({
  themeId,
  uid,
  isMono,
}) => {
  const visual = getPromoSheetThemeVisual(themeId, Boolean(isMono));
  const gid = (name: string) => `psbw-${themeId}-${name}-${uid}`;

  return (
    <div style={{ width: '100%', lineHeight: 0, position: 'relative' }}>
      <svg
        viewBox="0 0 794 34"
        width="794"
        height="34"
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height: '30px' }}
      >
        <defs>
          <linearGradient id={gid('back')} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={visual.waveBack} />
            <stop offset="50%" stopColor={visual.waveBackHighlight} />
            <stop offset="100%" stopColor={visual.waveBack} />
          </linearGradient>
          <linearGradient id={gid('front')} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={visual.waveFrontEnd} />
            <stop offset="55%" stopColor={visual.waveFrontMid} />
            <stop offset="100%" stopColor={visual.waveFrontStart} />
          </linearGradient>
        </defs>
        <path
          d="M0,16 C210,4 520,26 794,4 L794,34 L0,34 Z"
          fill={`url(#${gid('back')})`}
        />
        <path
          d="M0,21 C230,8 510,29 794,9 L794,34 L0,34 Z"
          fill={`url(#${gid('front')})`}
        />
        <path
          d="M0,21 C230,8 510,29 794,9"
          fill="none"
          stroke={visual.waveAccentStroke}
          strokeWidth="1.3"
          opacity="0.78"
        />
      </svg>
    </div>
  );
};
