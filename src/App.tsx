import { useState, useEffect, useMemo, useRef, lazy, Suspense, ReactNode } from 'react';
import { LoginForm } from './components/LoginForm';
import { ClientRecord, SavedOrcamento } from './types';
import { getStoredAccounts, isEderPerez, isUserRevoked, fetchAccountsFromSupabase } from './utils/auth';
import { flushAllPendingSync, initSupabaseRealtimeSubscription, syncModuleData } from './utils/supabaseClient';
import { startGlobalNotificationScheduler } from './utils/notificationScheduler';
import { loadUserNotificationPreferencesFromSupabase } from './utils/userNotificationPreferences';
import { setupGlobalSearchHighlighter } from './utils/searchHighlighter';
import { Loader2, Eye, Check, X } from 'lucide-react';
import officeBg from './assets/images/fenix_office_bg_1788695593982.jpg';
import mobileBg from './assets/images/fenix_mobile_bg_1788695610738.jpg';
import {
  activateTheme,
  applyThemeToDocument,
  setPreviewTheme,
  useFenixTheme,
} from './utils/themeService';
import {
  canonicalizeTabId,
  preloadPrimaryModulesIdle,
  preloadTabModule,
} from './utils/modulePreloader';

const ForgotPasswordModal = lazy(() =>
  import('./components/ForgotPasswordModal').then((m) => ({ default: m.ForgotPasswordModal }))
);
const Sidebar = lazy(() =>
  import('./components/Sidebar').then((m) => ({ default: m.Sidebar }))
);
const Header = lazy(() =>
  import('./components/Header').then((m) => ({ default: m.Header }))
);
const CadastroScreen = lazy(() =>
  import('./components/CadastroScreen').then((m) => ({ default: m.CadastroScreen }))
);
const ClientesScreen = lazy(() =>
  import('./components/ClientesScreen').then((m) => ({ default: m.ClientesScreen }))
);
const CalculadoraScreen = lazy(() =>
  import('./components/CalculadoraScreen').then((m) => ({ default: m.CalculadoraScreen }))
);
const OrcamentoScreen = lazy(() =>
  import('./components/OrcamentoScreen').then((m) => ({ default: m.OrcamentoScreen }))
);
const OrcamentosListScreen = lazy(() =>
  import('./components/OrcamentosListScreen').then((m) => ({ default: m.OrcamentosListScreen }))
);
const TarefaScreen = lazy(() =>
  import('./components/TarefaScreen').then((m) => ({ default: m.TarefaScreen }))
);
const ProdutosScreen = lazy(() =>
  import('./components/ProdutosScreen').then((m) => ({ default: m.ProdutosScreen }))
);
const BoletosScreen = lazy(() =>
  import('./components/BoletosScreen').then((m) => ({ default: m.BoletosScreen }))
);
const NotasScreen = lazy(() =>
  import('./components/NotasScreen').then((m) => ({ default: m.NotasScreen }))
);
const PosVendasScreen = lazy(() =>
  import('./components/PosVendasScreen').then((m) => ({ default: m.PosVendasScreen }))
);
const MetasScreen = lazy(() =>
  import('./components/MetasScreen').then((m) => ({ default: m.MetasScreen }))
);
const FollowUpScreen = lazy(() =>
  import('./components/FollowUpScreen').then((m) => ({ default: m.FollowUpScreen }))
);
const PendenciasScreen = lazy(() =>
  import('./components/PendenciasScreen').then((m) => ({ default: m.PendenciasScreen }))
);
const ConfiguracoesScreen = lazy(() =>
  import('./components/ConfiguracoesScreen').then((m) => ({ default: m.ConfiguracoesScreen }))
);
const ControleEstoqueScreen = lazy(() =>
  import('./components/ControleEstoqueScreen').then((m) => ({ default: m.ControleEstoqueScreen }))
);
const VendasScreen = lazy(() =>
  import('./components/VendasScreen').then((m) => ({ default: m.VendasScreen }))
);
const NotificacoesScreen = lazy(() =>
  import('./components/NotificacoesScreen').then((m) => ({ default: m.NotificacoesScreen }))
);
const AnotacoesScreen = lazy(() =>
  import('./components/AnotacoesScreen').then((m) => ({ default: m.AnotacoesScreen }))
);
const PromocoesAtivasScreen = lazy(() =>
  import('./components/PromocoesAtivasScreen').then((m) => ({ default: m.PromocoesAtivasScreen }))
);

export default function App() {
  const crmThemeSnapshot = useFenixTheme('crm');
  const isPreviewActive = crmThemeSnapshot.isPreview;
  const previewingTheme = crmThemeSnapshot.theme;

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    // Ao acessar o link publicado/deploy, sempre abrir primeiro a tela inicial de login do SISTEMA FÊNIX WORLD
    // Nunca abrir diretamente uma tela interna ou painel sem sessão ativa explícita
    const sessionAuth = sessionStorage.getItem('fenix_session_active');
    const sessionUser = sessionStorage.getItem('fenix_session_user');
    if (isUserRevoked(sessionUser)) {
      sessionStorage.removeItem('fenix_session_active');
      sessionStorage.removeItem('fenix_session_user');
      localStorage.removeItem('fenix_active_user_name');
      localStorage.removeItem('fenix_active_user');
      localStorage.removeItem('fenix_saved_username');
      return false;
    }
    return Boolean(sessionAuth === 'true' && sessionUser);
  });

  const [currentUserName, setCurrentUserName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const sessionAuth = sessionStorage.getItem('fenix_session_active');
    const sessionUser = sessionStorage.getItem('fenix_session_user');
    if (isUserRevoked(sessionUser)) return '';
    return sessionAuth === 'true' && sessionUser ? sessionUser : '';
  });

  const [permissionsVersion, setPermissionsVersion] = useState(0);

  useEffect(() => {
    document.title = 'SISTEMA FÊNIX WORLD';
  }, []);

  useEffect(() => {
    const handlePermissionsRefresh = () => {
      setPermissionsVersion((v) => v + 1);
    };
    const handleNavigateTab = (e: any) => {
      const tab = e.detail?.tab;
      const orc = e.detail?.orcamento;
      const mode = e.detail?.mode;
      if (tab) {
        setCurrentTab(tab);
        localStorage.setItem('fenix_last_active_tab', tab);
        if (tab === 'Orçamentos') {
          if (mode === 'edit' && orc) {
            setSelectedOrcamento(orc);
            setOrcamentoViewMode('edit');
          } else {
            setOrcamentoViewMode('list');
          }
        }
      }
    };
    window.addEventListener('fenix_navigate_tab', handleNavigateTab);
    window.addEventListener('fenix_users_updated', handlePermissionsRefresh);
    window.addEventListener('fenix_auth_updated', handlePermissionsRefresh);
    window.addEventListener('storage', handlePermissionsRefresh);
    return () => {
      window.removeEventListener('fenix_navigate_tab', handleNavigateTab);
      window.removeEventListener('fenix_users_updated', handlePermissionsRefresh);
      window.removeEventListener('fenix_auth_updated', handlePermissionsRefresh);
      window.removeEventListener('storage', handlePermissionsRefresh);
    };
  }, []);

  const [activeClient, setActiveClient] = useState<ClientRecord | null>(null);
  const [clientProfileToOpen, setClientProfileToOpen] = useState<ClientRecord | null>(null);

  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState(() => {
    const saved = localStorage.getItem('fenix_last_active_tab');
    const removedTabs = [
      'Documentos',
      'Estoque',
      'Pós Vendas',
      'Pós-Vendas',
      'PosVendas',
      'Boletos',
      'Pendências',
      'Pendencias',
      'Notas',
      'Vendas',
      'Negociações',
      'Negociacoes',
    ];
    if (!saved || removedTabs.includes(saved)) return 'Clientes';
    return saved;
  });
  const [orcamentoViewMode, setOrcamentoViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedOrcamento, setSelectedOrcamento] = useState<SavedOrcamento | null>(null);
  const [isOrcamentoInProgress, setIsOrcamentoInProgress] = useState(false);
  const [scrollToOrcamentoProducts, setScrollToOrcamentoProducts] = useState(false);
  const [initialOpenTaskModal, setInitialOpenTaskModal] = useState(false);
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;
  const activeCanonicalTab = canonicalizeTabId(currentTab);
  const [visitedTabs, setVisitedTabs] = useState<string[]>(() => [canonicalizeTabId(currentTab)]);

  useEffect(() => {
    if (!isAuthenticated) return;
    preloadTabModule(currentTab);
    const canonical = canonicalizeTabId(currentTab);
    setVisitedTabs((prev) => (prev.includes(canonical) ? prev : [...prev, canonical]));
  }, [currentTab, isAuthenticated]);

  // Inicialização segura do sistema (executada SOMENTE após autenticação para evitar consultas desnecessárias ao Supabase)
  useEffect(() => {
    if (!isAuthenticated) return;

    const activeUser = currentUserName || 'Usuário Fênix';

    // 1. Envia primeiro eventuais alterações pendentes salvas localmente no IndexedDB e depois puxa atualizações do módulo
    flushAllPendingSync(activeUser)
      .then(() => syncModuleData(currentTabRef.current, true))
      .catch(() => {});

    // Sincroniza permissões, preferências de notificação e contas de usuário em segundo plano após autenticação
    fetchAccountsFromSupabase().catch(() => {});
    loadUserNotificationPreferencesFromSupabase(activeUser).catch(() => {});

    // Sincronização periódica resiliente em background a cada 5 minutos do módulo ativo
    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        flushAllPendingSync(activeUser)
          .then(() => syncModuleData(currentTabRef.current))
          .catch(() => {});
      }
    }, 300000);

    // Sincronização automática assim que a internet voltar
    const handleOnline = () => {
      flushAllPendingSync(activeUser)
        .then(() => syncModuleData(currentTabRef.current, true))
        .catch(() => {});
    };
    window.addEventListener('online', handleOnline);

    // Sincronização resiliente ao retornar à aba/janela (com throttle mínimo de 30s)
    let lastVisibilitySyncAt = Date.now();
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilitySyncAt >= 30000) {
          lastVisibilitySyncAt = now;
          flushAllPendingSync(activeUser)
            .then(() => syncModuleData(currentTabRef.current))
            .catch(() => {});
        }
      }
    };
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    // Inscrição em tempo real via Realtime Supabase
    const unsubRealtime = initSupabaseRealtimeSubscription();

    // Verificador global de lembretes automáticos e alarmes de tarefas
    const stopNotificationScheduler = startGlobalNotificationScheduler();

    // Listener para abrir aba diretamente ao clicar em notificações externas ou atalhos
    const handleOpenTabEvent = (e: Event) => {
      try {
        const customEvent = e as CustomEvent;
        const target = customEvent.detail?.tab;
        if (target) {
          setCurrentTab(target);
        }
      } catch {}
    };
    window.addEventListener('fenix_open_tab', handleOpenTabEvent);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('fenix_open_tab', handleOpenTabEvent);
      if (unsubRealtime) unsubRealtime();
      if (stopNotificationScheduler) stopNotificationScheduler();
    };
  }, [isAuthenticated, currentUserName]);

  useEffect(() => {
    try {
      localStorage.setItem('fenix_last_active_tab', currentTab);
    } catch {
      // ignore
    }
    // Carrega sob demanda apenas os dados do módulo ativo quando autenticado
    if (isAuthenticated) {
      syncModuleData(currentTab).catch(() => {});
    }
  }, [currentTab, isAuthenticated]);

  useEffect(() => {
    try {
      localStorage.setItem('fenix_auth_active', isAuthenticated ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [isAuthenticated]);

  const handleLoginSuccess = (name: string) => {
    const user = name.trim();
    if (!user) return;
    setCurrentUserName(user);
    setIsAuthenticated(true);
    try {
      sessionStorage.setItem('fenix_session_active', 'true');
      sessionStorage.setItem('fenix_session_user', user);
      localStorage.setItem('fenix_auth_active', 'true');
      localStorage.setItem('fenix_saved_username', user);
      localStorage.setItem('fenix_active_user_name', user);
      localStorage.setItem('fenix_active_user', user);
    } catch {
      // ignore
    }
    setPreviewTheme(null);
    applyThemeToDocument();
    window.dispatchEvent(new Event('fenix_auth_updated'));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUserName('');
    setIsMobileMenuOpen(false);
    setVisitedTabs([]);
    setActiveClient(null);
    setClientProfileToOpen(null);
    setSelectedOrcamento(null);
    setOrcamentoViewMode('list');
    try {
      sessionStorage.removeItem('fenix_session_active');
      sessionStorage.removeItem('fenix_session_user');
      localStorage.setItem('fenix_auth_active', 'false');
      localStorage.removeItem('fenix_active_user_name');
    } catch {
      // ignore
    }
    setPreviewTheme(null);
    applyThemeToDocument();
    window.dispatchEvent(new Event('fenix_auth_updated'));
    window.location.hash = '';
  };

  const handleQuickAction = (
    action: 'Calculadora' | 'Orçamentos' | 'Tarefas',
    client: ClientRecord,
    options?: {
      createOrcamento?: boolean;
      openNewTaskModal?: boolean;
      openOrcamento?: SavedOrcamento;
      scrollToProducts?: boolean;
    }
  ) => {
    setActiveClient(client);
    try {
      localStorage.setItem('fenix_active_client', JSON.stringify(client));
    } catch {
      // ignore
    }

    if (action === 'Calculadora') {
      setScrollToOrcamentoProducts(false);
      setCurrentTab('Calculadora');
      return;
    }

    if (action === 'Orçamentos') {
      if (options?.openOrcamento) {
        setSelectedOrcamento(options.openOrcamento);
        setOrcamentoViewMode('edit');
        setScrollToOrcamentoProducts(false);
      } else if (options?.createOrcamento) {
        try {
          const userKey = `fenix_orcamento_in_progress_draft_${currentUserName || 'default'}`;
          localStorage.removeItem(userKey);
          localStorage.removeItem('fenix_orcamento_in_progress_draft');
        } catch {}
        setOrcamentoViewMode('create');
        setSelectedOrcamento(null);
        setScrollToOrcamentoProducts(!!options?.scrollToProducts);
      } else {
        setOrcamentoViewMode('list');
        setSelectedOrcamento(null);
        setScrollToOrcamentoProducts(false);
      }
      setCurrentTab('Orçamentos');
      return;
    }

    if (action === 'Tarefas') {
      setInitialOpenTaskModal(!!options?.openNewTaskModal);
      setCurrentTab('Tarefas');
      return;
    }

    setCurrentTab(action);
  };

  // Privilégios do Diretor Éder Perez vs Usuários Comuns (com normalização estrita de acentos)
  const isDirector = isEderPerez(currentUserName);

  // Inicializar o destacador e rolagem automática para resultados da busca global
  useEffect(() => {
    return setupGlobalSearchHighlighter();
  }, []);

  // Sincronização de Rota / URL Hash com Bloqueio Estrito de Segurança
  useEffect(() => {
    const handleRouteSync = () => {
      const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
      if (!hash) return;

      // Bloqueio das 6 abas removidas definitivamente do menu
      const removedHashes = [
        'vendas',
        'venda',
        'estoque',
        'controle-de-estoque',
        'controle de estoque',
        'boletos',
        'pendencias',
        'pendências',
        'notas',
        'pos-vendas',
        'posvendas',
        'pos vendas',
        'pós vendas',
        'pós-vendas',
        'negociacoes',
        'negociações',
      ];
      if (removedHashes.includes(hash)) {
        window.location.hash = 'clientes';
        setCurrentTab('Clientes');
        return;
      }

      const map: Record<string, string> = {
        clientes: 'Clientes',
        calculadora: 'Calculadora',
        orcamentos: 'Orçamentos',
        'orçamentos': 'Orçamentos',
        agenda: 'Agenda',
        'follow-up': 'Follow-up',
        followup: 'Follow-up',
        promocoes: 'Promoções Ativas',
        'promoções': 'Promoções Ativas',
        'promocoes-ativas': 'Promoções Ativas',
        'promoções-ativas': 'Promoções Ativas',
        promocoesativas: 'Promoções Ativas',
        metas: 'Metas',
        produtos: 'Produtos',
        tarefas: 'Tarefas',
        anotacoes: 'Anotações',
        'anotações': 'Anotações',
        configuracoes: 'Configurações',
        'configurações': 'Configurações',
      };

      if (map[hash]) {
        setCurrentTab(map[hash]);
      }
    };

    handleRouteSync();
    window.addEventListener('hashchange', handleRouteSync);
    return () => window.removeEventListener('hashchange', handleRouteSync);
  }, [currentUserName, isDirector]);

  // Atualizar hash e storage sempre que a aba mudar
  useEffect(() => {
    localStorage.setItem('fenix_last_active_tab', currentTab);
    const hashNormalized = currentTab.toLowerCase().replace(/\s+/g, '-');
    if (window.location.hash.replace('#', '').toLowerCase() !== hashNormalized) {
      window.location.hash = hashNormalized;
    }
  }, [currentTab]);

  // Abas autorizadas para o usuário logado (com as 6 abas removidas definitivamente do menu)
  const allowedTabs = useMemo(() => {
    const defaultActiveTabs = [
      'Clientes',
      'Calculadora',
      'Orçamentos',
      'Follow-up',
      'Promoções Ativas',
      'Metas',
      'Produtos',
      'Tarefas',
      'Anotações',
      'Configurações',
      'Notificações',
    ];

    if (!currentUserName) return defaultActiveTabs;

    const accounts = getStoredAccounts();
    const userAccount =
      accounts[currentUserName] ||
      Object.values(accounts).find(
        (u) =>
          u.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() ===
          currentUserName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      );

    const removedSet = new Set([
      'estoque',
      'posvendas',
      'pos-vendas',
      'boletos',
      'pendencias',
      'pendências',
      'notas',
      'vendas',
      'controle de estoque',
      'documentos',
      'negociacoes',
    ]);

    if (userAccount && Array.isArray(userAccount.modulos)) {
      const clean = userAccount.modulos.filter((m) => {
        const norm = m
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[-_\s]/g, '');
        return !removedSet.has(norm);
      });
      if (!clean.some((m) => {
        const nm = m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-_\s]/g, '');
        return nm === 'promocoesativas';
      })) {
        clean.push('Promoções Ativas');
      }
      if (!clean.some((m) => m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === 'anotacoes')) {
        clean.push('Anotações');
      }
      if (!clean.includes('Notificações')) {
        clean.push('Notificações');
      }
      return clean;
    }

    return defaultActiveTabs;
  }, [currentUserName, permissionsVersion]);

  // Preload silencioso dos chunks dos módulos autorizados em tempo ocioso
  useEffect(() => {
    if (!isAuthenticated) return;
    return preloadPrimaryModulesIdle(allowedTabs);
  }, [isAuthenticated, allowedTabs]);

  // Se o usuário tentar acessar uma aba não permitida pelo Éder, redireciona para a primeira permitida
  useEffect(() => {
    if (!isAuthenticated || !currentUserName) return;
    if (isDirector) return;
    if (allowedTabs.length === 0) return;

    // Normalização para comparar nome da aba
    const normCurrentTab = currentTab
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_\s]/g, '');

    const isCurrentAllowed = allowedTabs.some((t) => {
      const norm = t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_\s]/g, '');
      return norm === normCurrentTab;
    });

    if (!isCurrentAllowed) {
      const firstAllowed = allowedTabs.find((t) => t !== 'Notificações') || 'Clientes';
      setCurrentTab(firstAllowed);
      window.location.hash = firstAllowed.toLowerCase().replace(/\s+/g, '-');
    }
  }, [currentTab, allowedTabs, isDirector, isAuthenticated, currentUserName]);

  // REQUISITO DE LOGIN: Ao acessar o link publicado/deploy, sempre abrir primeiro a tela inicial de login
  // Sem sessão válida, nunca abrir diretamente uma tela interna ou painel
  if (!isAuthenticated || !currentUserName) {
    return (
      <main className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#0a0d14]">
        {/* Desktop Luxury Office Background */}
        <div className="absolute inset-0 hidden sm:block">
          <img
            src={officeBg}
            alt="Ambiente Corporativo Fênix World"
            referrerPolicy="no-referrer"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover object-center select-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/35 pointer-events-none" />
        </div>

        {/* Mobile Luxury Office Background */}
        <div className="absolute inset-0 sm:hidden">
          <img
            src={mobileBg}
            alt="Ambiente Corporativo Fênix World Mobile"
            referrerPolicy="no-referrer"
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover object-top select-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60 pointer-events-none" />
        </div>

        {/* Main Content Layout Container */}
        <div className="relative z-10 w-full min-h-screen flex flex-col justify-between p-4 sm:p-8 lg:p-12">
          {/* Center/Main Area */}
          <div className="w-full max-w-7xl mx-auto my-auto flex flex-col lg:flex-row items-center justify-end lg:pr-10 xl:pr-16">
            <div className="w-full sm:w-auto flex justify-center lg:justify-end">
              <LoginForm
                onOpenForgotPassword={() => setIsForgotModalOpen(true)}
                onLoginSuccess={handleLoginSuccess}
              />
            </div>
          </div>

          {/* Bottom copyright / environment indicator */}
          <footer className="w-full max-w-7xl mx-auto py-2 flex items-center justify-between text-[11px] sm:text-xs text-white/50 px-2 select-none">
            <span>SISTEMA FÊNIX WORLD &copy; {new Date().getFullYear()}</span>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline-block">Ambiente Corporativo Seguro</span>
            </div>
          </footer>
        </div>

        {/* Forgot Password Modal */}
        {isForgotModalOpen && (
          <Suspense fallback={null}>
            <ForgotPasswordModal
              isOpen={isForgotModalOpen}
              onClose={() => setIsForgotModalOpen(false)}
            />
          </Suspense>
        )}
      </main>
    );
  }

  // Render the official CRM layout
  return (
      <div
        className="min-h-screen bg-[#f1f5f9] text-slate-800 flex font-sans antialiased"
        style={
          crmThemeSnapshot.isThemed
            ? { backgroundColor: crmThemeSnapshot.theme.crm.pageBg }
            : undefined
        }
      >
        {/* Dark Sophisticated Sidebar (Visible on desktop, drawer on mobile) */}
        <Suspense fallback={<div className="hidden lg:block lg:w-60 xl:w-64 bg-[#0f172a] flex-shrink-0" />}>
          <Sidebar
            currentTab={currentTab}
            onSelectTab={(tab) => {
              if (tab === 'Calculadora') {
                setActiveClient(null);
              }
              setCurrentTab(tab);
              setInitialOpenTaskModal(false);
              if (tab === 'Orçamentos') {
                setActiveClient(null);
                setOrcamentoViewMode('list');
                setSelectedOrcamento(null);
              }
            }}
            isOpenMobile={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
            onLogout={handleLogout}
            currentUserName={currentUserName}
            allowedTabs={allowedTabs}
          />
        </Suspense>

        {/* Main Content Area (Offset by sidebar width on desktop) */}
        <div className="flex-1 lg:pl-60 xl:pl-64 flex flex-col min-h-screen w-full min-w-0 overflow-x-hidden">
          {/* Top Banner Header with Luxury Office Background, Greeting, Search, and Avatar */}
          <Suspense fallback={<div className="h-20 bg-[#0b1324]" />}>
            <Header
              onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
              userName={currentUserName}
              onOpenProfile={() => setCurrentTab('Configurações')}
              onLogout={handleLogout}
              onSelectTab={(tab) => {
                if (tab === 'Calculadora') {
                  setActiveClient(null);
                }
                setCurrentTab(tab);
                setInitialOpenTaskModal(false);
                if (tab === 'Orçamentos') {
                  setActiveClient(null);
                  setOrcamentoViewMode('list');
                  setSelectedOrcamento(null);
                }
              }}
              onSelectClient={(client) => {
                setActiveClient(client);
                setClientProfileToOpen(client);
                setCurrentTab('Clientes');
              }}
              onSelectSearchResult={(result) => {
                if (result.origin === 'Clientes' && result.clientRecord) {
                  setActiveClient(result.clientRecord);
                  setClientProfileToOpen(result.clientRecord);
                  setCurrentTab('Clientes');
                } else if (result.origin === 'Orçamentos' && result.rawItem) {
                  setSelectedOrcamento(result.rawItem);
                  setOrcamentoViewMode('edit');
                  setCurrentTab('Orçamentos');
                } else {
                  setCurrentTab(result.targetTab as any);
                }
              }}
            />
          </Suspense>

          {/* Barra de Pré-visualização de Tema (exibida somente durante Pré-visualizar) */}
          {isPreviewActive && (
            <div
              className="no-print no-theme-override bg-slate-900 text-white px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b shadow-sm z-20"
              style={{
                backgroundColor: previewingTheme.crm.sidebarBg,
                borderBottomColor: previewingTheme.crm.accent,
              }}
            >
              <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                <Eye
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: previewingTheme.crm.sidebarActiveAccent }}
                />
                <span>
                  Pré-visualizando o tema{' '}
                  <strong
                    className="font-bold"
                    style={{ color: previewingTheme.crm.sidebarActiveAccent }}
                  >
                    {previewingTheme.name}
                  </strong>{' '}
                  (alteração temporária ainda não salva)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTheme(null)}
                  className="px-3 py-1 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Sair da Pré-visualização</span>
                </button>
                <button
                  type="button"
                  onClick={() => activateTheme(previewingTheme.id)}
                  className="px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Ativar Tema Agora</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Content with Keep-Alive tab panels to preserve state, filters and avoid reload delays */}
          <main className="flex-1 pb-10 w-full min-w-0 flex flex-col">
            {(visitedTabs.includes(activeCanonicalTab)
              ? visitedTabs
              : [...visitedTabs, activeCanonicalTab]
            ).map((tabKey) => {
              const isTabActive = tabKey === activeCanonicalTab;
              let content: ReactNode = null;

              if (tabKey === 'Clientes') {
                content = (
                  <ClientesScreen
                    currentUserName={currentUserName}
                    initialClient={clientProfileToOpen}
                    onConsumeInitialClient={() => setClientProfileToOpen(null)}
                    isActive={isTabActive}
                    onSelectClientAction={handleQuickAction}
                  />
                );
              } else if (tabKey === 'Calculadora') {
                content = (
                  <CalculadoraScreen
                    client={activeClient}
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onGoToOrcamento={() => {
                      setCurrentTab('Orçamentos');
                      setOrcamentoViewMode('create');
                      setSelectedOrcamento(null);
                    }}
                    onSelectClient={(c) => setActiveClient(c)}
                  />
                );
              } else if (tabKey === 'Orçamentos') {
                content = (
                  <>
                    <div
                      className={
                        orcamentoViewMode === 'list'
                          ? 'flex-1 flex flex-col min-w-0'
                          : 'hidden'
                      }
                      aria-hidden={orcamentoViewMode !== 'list'}
                    >
                      <OrcamentosListScreen
                        currentUserName={currentUserName}
                        isActive={isTabActive && orcamentoViewMode === 'list'}
                        onNavigateTab={(tab) => setCurrentTab(tab as any)}
                        onNewOrcamento={() => {
                          setActiveClient(null);
                          setSelectedOrcamento(null);
                          setOrcamentoViewMode('create');
                        }}
                        onOpenOrcamento={(orc) => {
                          setSelectedOrcamento(orc);
                          setOrcamentoViewMode('edit');
                        }}
                      />
                    </div>
                    {orcamentoViewMode !== 'list' && (
                      <OrcamentoScreen
                        key={
                          selectedOrcamento?.id ||
                          (orcamentoViewMode === 'create'
                            ? 'novo_orcamento'
                            : 'orcamento_screen')
                        }
                        client={activeClient}
                        initialOrcamento={selectedOrcamento}
                        scrollToProductsOnMount={scrollToOrcamentoProducts}
                        onConsumeScrollToProducts={() => setScrollToOrcamentoProducts(false)}
                        onStatusChangeInProgress={(inProgress) =>
                          setIsOrcamentoInProgress(inProgress)
                        }
                        onBackToList={() => {
                          setIsOrcamentoInProgress(false);
                          setScrollToOrcamentoProducts(false);
                          setActiveClient(null);
                          setSelectedOrcamento(null);
                          setOrcamentoViewMode('list');
                        }}
                        onBackToCadastro={() => {
                          setIsOrcamentoInProgress(false);
                          setScrollToOrcamentoProducts(false);
                          setCurrentTab('Cadastro');
                        }}
                        onSaveSuccess={() => {
                          setIsOrcamentoInProgress(false);
                          setScrollToOrcamentoProducts(false);
                          setActiveClient(null);
                          setSelectedOrcamento(null);
                          setOrcamentoViewMode('list');
                        }}
                        onCreateDuplicatedOrcamento={(newOrc, clientRec) => {
                          setIsOrcamentoInProgress(false);
                          if (clientRec) {
                            setActiveClient(clientRec);
                          }
                          setSelectedOrcamento(newOrc);
                          setOrcamentoViewMode('edit');
                          setScrollToOrcamentoProducts(true);
                        }}
                        currentUserName={currentUserName}
                        onSelectClient={(c) => setActiveClient(c)}
                      />
                    )}
                  </>
                );
              } else if (tabKey === 'Tarefas') {
                content = (
                  <TarefaScreen
                    client={activeClient}
                    initialOpenCreateTask={initialOpenTaskModal}
                    onConsumeOpenCreateTask={() => setInitialOpenTaskModal(false)}
                    onBackToCadastro={() => setCurrentTab('Clientes')}
                    currentUserName={currentUserName}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Anotações') {
                content = (
                  <AnotacoesScreen
                    currentUserName={currentUserName}
                    isActive={isTabActive}
                  />
                );
              } else if (tabKey === 'Promoções Ativas') {
                content = (
                  <PromocoesAtivasScreen
                    currentUserName={currentUserName}
                    isActive={isTabActive}
                  />
                );
              } else if (tabKey === 'Follow-up') {
                content = (
                  <FollowUpScreen
                    currentUserName={currentUserName}
                    isActive={isTabActive}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                    onOpenOrcamento={(orc) => {
                      setSelectedOrcamento(orc);
                      setOrcamentoViewMode('edit');
                      setCurrentTab('Orçamentos');
                    }}
                  />
                );
              } else if (tabKey === 'Pós-Vendas') {
                content = (
                  <PosVendasScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Boletos') {
                content = (
                  <BoletosScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Pendências') {
                content = (
                  <PendenciasScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Notas') {
                content = (
                  <NotasScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Metas') {
                content = (
                  <MetasScreen
                    currentUserName={currentUserName}
                    isActive={isTabActive}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Configurações') {
                content = (
                  <ConfiguracoesScreen
                    currentUserName={currentUserName}
                    onUpdateUserName={(name) => {
                      setCurrentUserName(name);
                      localStorage.setItem('fenix_saved_username', name);
                    }}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Controle de Estoque') {
                content = (
                  <ControleEstoqueScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Vendas' && isDirector) {
                content = (
                  <VendasScreen
                    currentUserName={currentUserName}
                    onBackToCadastro={() => setCurrentTab('Cadastro')}
                    onNavigateTab={(tab) => setCurrentTab(tab as any)}
                  />
                );
              } else if (tabKey === 'Notificações') {
                content = (
                  <NotificacoesScreen
                    currentUserName={currentUserName}
                    onNavigateTab={(tab) => {
                      if (tab === 'Calculadora') {
                        setActiveClient(null);
                      }
                      setCurrentTab(tab);
                      if (tab === 'Orçamentos') {
                        setActiveClient(null);
                        setOrcamentoViewMode('list');
                        setSelectedOrcamento(null);
                      }
                    }}
                    onBack={() => setCurrentTab('Clientes')}
                  />
                );
              } else if (tabKey === 'Produtos') {
                content = <ProdutosScreen currentUserName={currentUserName} />;
              } else {
                content = (
                  <CadastroScreen
                    currentUserName={currentUserName}
                    selectedClient={activeClient}
                    onQuickAction={handleQuickAction}
                    onClientSaved={(saved) => setActiveClient(saved)}
                  />
                );
              }

              return (
                <div
                  key={tabKey}
                  className={isTabActive ? 'flex-1 flex flex-col min-w-0' : 'hidden'}
                  aria-hidden={!isTabActive}
                >
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center py-12 text-slate-400 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#0057ff]" />
                        <span className="text-xs font-medium">Preparando tela...</span>
                      </div>
                    }
                  >
                    {content}
                  </Suspense>
                </div>
              );
            })}
          </main>
        </div>
      </div>
    );
}
