// Preload silencioso de chunks dos módulos do CRM para eliminar a espera de "Carregando módulo..."

const startedImports = new Set<string>();

const TAB_IMPORTERS: Record<string, () => Promise<unknown>> = {
  Clientes: () => import('../components/ClientesScreen'),
  Calculadora: () => import('../components/CalculadoraScreen'),
  Orçamentos: () => import('../components/OrcamentosListScreen'),
  OrcamentoEditor: () => import('../components/OrcamentoScreen'),
  'Follow-up': () => import('../components/FollowUpScreen'),
  'Promoções Ativas': () => import('../components/PromocoesAtivasScreen'),
  Metas: () => import('../components/MetasScreen'),
  Produtos: () => import('../components/ProdutosScreen'),
  Tarefas: () => import('../components/TarefaScreen'),
  Anotações: () => import('../components/AnotacoesScreen'),
  Configurações: () => import('../components/ConfiguracoesScreen'),
  Notificações: () => import('../components/NotificacoesScreen'),
};

export function canonicalizeTabId(tab: string): string {
  const raw = (tab || '').trim();
  const norm = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_\s]/g, '');

  if (norm === 'clientes') return 'Clientes';
  if (norm === 'calculadora') return 'Calculadora';
  if (norm === 'orcamentos') return 'Orçamentos';
  if (norm === 'agenda' || norm === 'tarefas') return 'Tarefas';
  if (norm === 'anotacoes') return 'Anotações';
  if (norm === 'promocoesativas') return 'Promoções Ativas';
  if (norm === 'followup') return 'Follow-up';
  if (norm === 'obras' || norm === 'posvendas') return 'Pós-Vendas';
  if (norm === 'boletos') return 'Boletos';
  if (norm === 'pendencias') return 'Pendências';
  if (norm === 'notas') return 'Notas';
  if (norm === 'metas' || norm === 'meta') return 'Metas';
  if (norm === 'configuracoes' || norm === 'settings') return 'Configurações';
  if (norm === 'materiais' || norm === 'controledeestoque' || norm === 'estoque') {
    return 'Controle de Estoque';
  }
  if (norm === 'vendas') return 'Vendas';
  if (norm === 'notificacoes') return 'Notificações';
  if (norm === 'produtos') return 'Produtos';
  if (norm === 'cadastro') return 'Cadastro';
  return raw || 'Clientes';
}

export function preloadTabModule(tabName: string): void {
  const canonical = canonicalizeTabId(tabName);
  const importer = TAB_IMPORTERS[canonical];
  if (importer && !startedImports.has(canonical)) {
    startedImports.add(canonical);
    importer().catch(() => {
      startedImports.delete(canonical);
    });
  }
  if (canonical === 'Orçamentos' && !startedImports.has('OrcamentoEditor')) {
    startedImports.add('OrcamentoEditor');
    TAB_IMPORTERS.OrcamentoEditor().catch(() => {
      startedImports.delete('OrcamentoEditor');
    });
  }
}

export function preloadPrimaryModulesIdle(allowedTabs?: string[]): () => void {
  if (typeof window === 'undefined') return () => {};

  const priorityOrder = [
    'Clientes',
    'Orçamentos',
    'OrcamentoEditor',
    'Follow-up',
    'Calculadora',
    'Produtos',
    'Metas',
    'Tarefas',
    'Anotações',
    'Promoções Ativas',
    'Configurações',
  ];

  const allowedSet = allowedTabs && allowedTabs.length > 0
    ? new Set(allowedTabs.map(canonicalizeTabId))
    : null;

  const queue = priorityOrder.filter((id) => {
    if (id === 'OrcamentoEditor') {
      return !allowedSet || allowedSet.has('Orçamentos');
    }
    return !allowedSet || allowedSet.has(id);
  });

  let cancelled = false;
  let idx = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;

  const scheduleNext = () => {
    if (cancelled || idx >= queue.length) return;
    const runStep = () => {
      if (cancelled || idx >= queue.length) return;
      const nextId = queue[idx++];
      const importer = TAB_IMPORTERS[nextId];
      if (importer && !startedImports.has(nextId)) {
        startedImports.add(nextId);
        importer().catch(() => {
          startedImports.delete(nextId);
        });
      }
      if (!cancelled && idx < queue.length) {
        timerId = setTimeout(scheduleNext, 280);
      }
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;

    if (typeof ric === 'function') {
      idleId = ric(runStep, { timeout: 1500 });
    } else {
      timerId = setTimeout(runStep, 350);
    }
  };

  timerId = setTimeout(scheduleNext, 600);

  return () => {
    cancelled = true;
    if (timerId !== null) clearTimeout(timerId);
    const cic = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
    if (idleId !== null && typeof cic === 'function') {
      cic(idleId);
    }
  };
}
