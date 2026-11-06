/**
 * FinFlow - Gestão Inteligente de Gastos (PF, PJ & Administrador Mestre)
 * Autenticação multiusuário, Painel Mensal (PF), Painel Semanal (PJ) e Painel Admin
 */

// Estado da Aplicação
const AppState = {
  currentUser: null, // { id, name, email, password, profileType: 'PF' | 'PJ', role: 'admin' | 'user' }
  expenses: [],
  budget: 3500.0,
  theme: 'light',
  currentView: 'home', // 'auth', 'home', 'detailed' ou 'admin'
  currentDetailTab: 'charts', // 'charts', 'history', 'budget'
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth(),
  selectedWeek: getWeekOfMonth(new Date()), // 1 a 5
  detailFilterScope: 'all', // 'all', 'empresarial', 'pessoal'
  currentExpenseScope: 'pessoal', // 'pessoal' ou 'empresarial'
  inspectingUserId: null, // ID do usuário que o admin está inspecionando
  charts: {
    category: null,
    timeline: null,
    pjComparison: null
  },
  speechRecognition: null,
  isRecording: false
};

// Cores e Ícones para as Categorias
const CategoryColors = {
  'Alimentação': { bg: '#f97316', light: '#ffedd5', text: '#9a3412', icon: 'utensils', emoji: '🍽️' },
  'Moradia':     { bg: '#0284c7', light: '#e0f2fe', text: '#0369a1', icon: 'home', emoji: '🏠' },
  'Transporte':  { bg: '#8b5cf6', light: '#ede9fe', text: '#6d28d9', icon: 'car', emoji: '🚗' },
  'Lazer':       { bg: '#ec4899', light: '#fce7f3', text: '#be185d', icon: 'party-popper', emoji: '🎉' },
  'Saúde':       { bg: '#10b981', light: '#d1fae5', text: '#047857', icon: 'heart-pulse', emoji: '💊' },
  'Educação':    { bg: '#6366f1', light: '#e0e7ff', text: '#4338ca', icon: 'book-open', emoji: '📚' },
  'Compras':     { bg: '#f59e0b', light: '#fef3c7', text: '#b45309', icon: 'shopping-bag', emoji: '🛍️' },
  'Serviços':    { bg: '#06b6d4', light: '#cffafe', text: '#0e7490', icon: 'zap', emoji: '⚡' },
  'Outros':      { bg: '#64748b', light: '#f1f5f9', text: '#334155', icon: 'tag', emoji: '📦' }
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
  setupEventListeners();
  initSpeechRecognition();
  lucide.createIcons();
});

// ==========================================
// TEMA DARK / LIGHT (SOL / LUA)
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem('finflow_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

window.toggleTheme = function() {
  const newTheme = AppState.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  showToast(`Modo ${newTheme === 'dark' ? 'Escuro' : 'Claro'} ativado`, 'info');
};

function applyTheme(theme) {
  AppState.theme = theme;
  localStorage.setItem('finflow_theme', theme);

  const html = document.documentElement;
  const themeIcon = document.getElementById('theme-toggle-icon');
  const metaTheme = document.getElementById('meta-theme-color');

  if (theme === 'dark') {
    html.classList.add('dark');
    if (metaTheme) metaTheme.setAttribute('content', '#0f172a');
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    html.classList.remove('dark');
    if (metaTheme) metaTheme.setAttribute('content', '#ffffff');
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
  }

  lucide.createIcons();
  if (AppState.charts.category || AppState.charts.timeline) {
    renderCharts();
  }
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO COM CONTA MESTRA
// ==========================================
function initAuth() {
  let users = getUsersFromStorage();

  // Garante a existência da Conta Mestra (Filipe Administrador)
  const masterEmail = 'filipedk7@gmail.com';
  let masterIndex = users.findIndex(u => u.email.toLowerCase() === masterEmail.toLowerCase());

  if (masterIndex === -1) {
    const masterUser = {
      id: 'user_master_filipe_admin',
      name: 'Filipe (Administrador)',
      email: masterEmail,
      password: '327526',
      profileType: 'PJ',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    users.unshift(masterUser);
  } else {
    // Atualiza a senha e permissão de admin
    users[masterIndex].password = '327526';
    users[masterIndex].role = 'admin';
  }

  // Garante usuários de demonstração adicionais para o admin gerenciar
  if (!users.some(u => u.email === 'demo_pf@finflow.com')) {
    users.push({
      id: 'user_pf_demo',
      name: 'Carlos Santos (PF)',
      email: 'demo_pf@finflow.com',
      password: '123',
      profileType: 'PF',
      role: 'user',
      createdAt: new Date().toISOString()
    });
  }

  if (!users.some(u => u.email === 'demo_pj@finflow.com')) {
    users.push({
      id: 'user_pj_demo',
      name: 'Mariana Lima (Empresa)',
      email: 'demo_pj@finflow.com',
      password: '123',
      profileType: 'PJ',
      role: 'user',
      createdAt: new Date().toISOString()
    });
  }

  saveUsersToStorage(users);

  // Popula dados de amostra para os usuários demo se estiverem vazios
  seedUserExpensesIfEmpty('user_pf_demo', 'PF');
  seedUserExpensesIfEmpty('user_pj_demo', 'PJ');

  // Verifica se há usuário ativo salvo na sessão
  const activeUserId = localStorage.getItem('finflow_active_user_id');
  if (activeUserId) {
    const user = users.find(u => u.id === activeUserId);
    if (user) {
      setAuthenticatedUser(user);
      return;
    }
  }

  // Se não houver sessão ativa, abre tela de login
  showAuthView();
}

function seedUserExpensesIfEmpty(userId, profileType) {
  const existing = localStorage.getItem(`finflow_expenses_${userId}`);
  if (!existing || JSON.parse(existing).length === 0) {
    const y = AppState.selectedYear;
    const m = String(AppState.selectedMonth + 1).padStart(2, '0');

    let sample = [];
    if (profileType === 'PJ') {
      sample = [
        { id: 'exp_biz_1', description: 'Fornecedor Embalagens', amount: 620.00, date: `${y}-${m}-02`, category: 'Compras', payment: 'Pix', scope: 'empresarial', notes: 'Lote 12' },
        { id: 'exp_biz_2', description: 'Energia do Escritório', amount: 280.00, date: `${y}-${m}-04`, category: 'Moradia', payment: 'Boleto', scope: 'empresarial', notes: 'Conta luz' },
        { id: 'exp_biz_3', description: 'Almoço Pessoal', amount: 48.00, date: `${y}-${m}-03`, category: 'Alimentação', payment: 'Cartão de Débito', scope: 'pessoal', notes: 'Restaurante' }
      ];
    } else {
      sample = [
        { id: 'exp_pers_1', description: 'Supermercado Mensal', amount: 530.00, date: `${y}-${m}-03`, category: 'Alimentação', payment: 'Cartão de Crédito', scope: 'pessoal', notes: 'Compras do mês' },
        { id: 'exp_pers_2', description: 'Combustível Posto Ipiranga', amount: 160.00, date: `${y}-${m}-05`, category: 'Transporte', payment: 'Pix', scope: 'pessoal', notes: 'Tanque' }
      ];
    }
    localStorage.setItem(`finflow_expenses_${userId}`, JSON.stringify(sample));
    localStorage.setItem(`finflow_budget_${userId}`, '4000');
  }
}

function getUsersFromStorage() {
  try {
    const data = localStorage.getItem('finflow_users_v2');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveUsersToStorage(users) {
  localStorage.setItem('finflow_users_v2', JSON.stringify(users));
}

function showAuthView() {
  AppState.currentUser = null;
  document.getElementById('view-auth')?.classList.remove('hidden');
  document.getElementById('main-header')?.classList.add('hidden');
  document.getElementById('main-content')?.classList.add('hidden');
  document.getElementById('main-bottom-nav')?.classList.add('hidden');
  lucide.createIcons();
}

function setAuthenticatedUser(user) {
  AppState.currentUser = user;
  localStorage.setItem('finflow_active_user_id', user.id);

  document.getElementById('view-auth')?.classList.add('hidden');
  document.getElementById('main-header')?.classList.remove('hidden');
  document.getElementById('main-content')?.classList.remove('hidden');
  document.getElementById('main-bottom-nav')?.classList.remove('hidden');

  // Carrega despesas deste usuário
  loadUserData(user.id);

  // Atualiza UI de identificação no header e perfil
  updateUserHeaderUI();

  // Se for Administrador, habilita a navegação de Admin na Bottom Nav
  const adminBtn = document.getElementById('bottom-btn-admin');
  const adminCrown = document.getElementById('user-admin-crown');
  const adminModalBtn = document.getElementById('modal-admin-access-btn');

  if (user.role === 'admin') {
    adminBtn?.classList.remove('hidden');
    adminCrown?.classList.remove('hidden');
    adminModalBtn?.classList.remove('hidden');
  } else {
    adminBtn?.classList.add('hidden');
    adminCrown?.classList.add('hidden');
    adminModalBtn?.classList.add('hidden');
  }

  // Redireciona para a Home
  switchView('home');
}

function updateUserHeaderUI() {
  if (!AppState.currentUser) return;

  const isPJ = AppState.currentUser.profileType === 'PJ';
  const isAdmin = AppState.currentUser.role === 'admin';
  const nameEl = document.getElementById('user-header-name');
  const badgeEl = document.getElementById('user-header-badge');
  const avatarBadge = document.getElementById('user-avatar-badge');

  if (nameEl) nameEl.textContent = AppState.currentUser.name.split(' ')[0];
  
  if (badgeEl) {
    if (isAdmin) {
      badgeEl.textContent = 'Administrador Mestre';
      badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded-md font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700';
    } else {
      badgeEl.textContent = isPJ ? 'Empresário' : 'Pessoa Física';
      badgeEl.className = isPJ 
        ? 'text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60'
        : 'text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60';
    }
  }

  if (avatarBadge) {
    if (isAdmin) {
      avatarBadge.textContent = '👑';
      avatarBadge.className = 'w-8 h-8 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shadow-sm';
    } else {
      avatarBadge.textContent = isPJ ? 'PJ' : 'PF';
      avatarBadge.className = isPJ
        ? 'w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-extrabold flex items-center justify-center text-xs shadow-xs border border-amber-300 dark:border-amber-700'
        : 'w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-extrabold flex items-center justify-center text-xs shadow-xs border border-emerald-300 dark:border-emerald-700';
    }
  }
}

// Atalho para entrar direto na conta de Administrador Mestre
window.loginMasterAdmin = function() {
  const users = getUsersFromStorage();
  const master = users.find(u => u.email.toLowerCase() === 'filipedk7@gmail.com');
  if (master) {
    setAuthenticatedUser(master);
    showToast('Acesso de Administrador Mestre concedido!', 'success');
  }
};

window.loginDemo = function(profileType) {
  const users = getUsersFromStorage();
  let user = users.find(u => u.profileType === profileType && u.role !== 'admin');
  if (user) {
    setAuthenticatedUser(user);
    showToast(`Conectado como ${user.name}!`, 'success');
  }
};

window.handleLogout = function() {
  localStorage.removeItem('finflow_active_user_id');
  closeUserProfileModal();
  showAuthView();
  showToast('Sessão encerrada.', 'info');
};

// Alternador entre Login e Cadastro
window.switchAuthTab = function(tab) {
  const loginForm = document.getElementById('form-login');
  const signupForm = document.getElementById('form-signup');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');

  if (tab === 'login') {
    loginForm?.classList.remove('hidden');
    signupForm?.classList.add('hidden');
    tabLogin?.classList.add('active');
    tabSignup?.classList.remove('active');
  } else {
    loginForm?.classList.add('hidden');
    signupForm?.classList.remove('hidden');
    tabLogin?.classList.remove('active');
    tabSignup?.classList.add('active');
  }
  lucide.createIcons();
};

window.updateProfileSelectionUI = function() {
  const isPf = document.querySelector('input[name="signup-profile"]:checked')?.value === 'PF';
  const labelPf = document.getElementById('label-profile-pf');
  const labelPj = document.getElementById('label-profile-pj');

  if (isPf) {
    labelPf?.classList.add('border-emerald-500', 'bg-emerald-50/50', 'dark:bg-emerald-950/40');
    labelPf?.classList.remove('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    labelPj?.classList.add('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    labelPj?.classList.remove('border-amber-500', 'bg-amber-50/50', 'dark:bg-amber-950/40');
  } else {
    labelPj?.classList.add('border-amber-500', 'bg-amber-50/50', 'dark:bg-amber-950/40');
    labelPj?.classList.remove('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    labelPf?.classList.add('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    labelPf?.classList.remove('border-emerald-500', 'bg-emerald-50/50', 'dark:bg-emerald-950/40');
  }
};

// Modal de Perfil
window.openUserProfileModal = function() {
  if (!AppState.currentUser) return;

  const modal = document.getElementById('user-profile-modal');
  const nameEl = document.getElementById('modal-user-name');
  const emailEl = document.getElementById('modal-user-email');
  const avatarEl = document.getElementById('modal-user-avatar');
  const adminBadge = document.getElementById('modal-user-admin-badge');
  const btnPf = document.getElementById('btn-modal-profile-pf');
  const btnPj = document.getElementById('btn-modal-profile-pj');

  if (nameEl) nameEl.textContent = AppState.currentUser.name;
  if (emailEl) emailEl.textContent = AppState.currentUser.email;

  const isAdmin = AppState.currentUser.role === 'admin';
  const isPJ = AppState.currentUser.profileType === 'PJ';

  if (adminBadge) {
    if (isAdmin) adminBadge.classList.remove('hidden');
    else adminBadge.classList.add('hidden');
  }

  if (avatarEl) {
    if (isAdmin) {
      avatarEl.textContent = '👑';
      avatarEl.className = 'w-10 h-10 rounded-2xl bg-amber-500 text-white font-black flex items-center justify-center text-sm shadow-xs';
    } else {
      avatarEl.textContent = isPJ ? 'PJ' : 'PF';
      avatarEl.className = isPJ
        ? 'w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm shadow-xs'
        : 'w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-sm shadow-xs';
    }
  }

  if (isPJ) {
    btnPj?.classList.add('border-amber-500', 'bg-amber-50', 'dark:bg-amber-950/40');
    btnPj?.classList.remove('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    btnPf?.classList.add('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    btnPf?.classList.remove('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/40');
  } else {
    btnPf?.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/40');
    btnPf?.classList.remove('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    btnPj?.classList.add('border-slate-200', 'dark:border-slate-700', 'bg-slate-50', 'dark:bg-slate-900');
    btnPj?.classList.remove('border-amber-500', 'bg-amber-50', 'dark:bg-amber-950/40');
  }

  modal?.classList.add('open');
  lucide.createIcons();
};

window.closeUserProfileModal = function() {
  document.getElementById('user-profile-modal')?.classList.remove('open');
};

window.changeUserProfileType = function(newType) {
  if (!AppState.currentUser) return;
  AppState.currentUser.profileType = newType;

  const users = getUsersFromStorage();
  const idx = users.findIndex(u => u.id === AppState.currentUser.id);
  if (idx !== -1) {
    users[idx].profileType = newType;
    saveUsersToStorage(users);
  }

  closeUserProfileModal();
  updateUserHeaderUI();
  updatePeriodDisplay();
  renderAll();
  showToast(`Perfil alterado para ${newType === 'PJ' ? 'Empresário (Semanal)' : 'Pessoa Física (Mensal)'}!`, 'success');
};

// ==========================================
// DADOS DE USUÁRIO ATIVO
// ==========================================
function loadUserData(userId) {
  const savedExpenses = localStorage.getItem(`finflow_expenses_${userId}`);
  const savedBudget = localStorage.getItem(`finflow_budget_${userId}`);

  if (savedExpenses) {
    try {
      AppState.expenses = JSON.parse(savedExpenses);
    } catch (e) {
      AppState.expenses = [];
    }
  } else {
    loadSampleDataForUser(AppState.currentUser.profileType);
  }

  if (savedBudget) {
    AppState.budget = parseFloat(savedBudget) || 3500.0;
  } else {
    AppState.budget = AppState.currentUser.profileType === 'PJ' ? 8000.0 : 3500.0;
  }

  initDefaults();
}

function saveUserData() {
  if (!AppState.currentUser) return;
  localStorage.setItem(`finflow_expenses_${AppState.currentUser.id}`, JSON.stringify(AppState.expenses));
  localStorage.setItem(`finflow_budget_${AppState.currentUser.id}`, AppState.budget.toString());
}

function initDefaults() {
  setDefaultDate();
  const budgetInput = document.getElementById('budget-input');
  if (budgetInput) {
    budgetInput.value = AppState.budget.toFixed(2);
  }
  updatePeriodDisplay();
}

function setDefaultDate() {
  const dateInput = document.getElementById('exp-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
}

// ==========================================
// CONFIGURAÇÃO DE EVENTOS
// ==========================================
function setupEventListeners() {
  // Login Form com verificação de credenciais
  document.getElementById('form-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const users = getUsersFromStorage();

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

    if (user) {
      setAuthenticatedUser(user);
      showToast(`Bem-vindo, ${user.name}!`, 'success');
    } else {
      showToast('E-mail ou senha incorretos.', 'error');
    }
  });

  // Cadastro Form
  document.getElementById('form-signup')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const profileType = document.querySelector('input[name="signup-profile"]:checked')?.value || 'PF';

    if (!name || !email || !password) {
      showToast('Preencha todos os campos.', 'warning');
      return;
    }

    const users = getUsersFromStorage();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      showToast('Este e-mail já está cadastrado.', 'warning');
      return;
    }

    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name,
      email: email,
      password: password,
      profileType: profileType,
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsersToStorage(users);
    setAuthenticatedUser(newUser);
    showToast(`Conta criada com sucesso!`, 'success');
  });

  // Cadastro de Novo Usuário pelo Admin
  document.getElementById('admin-create-user-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('admin-new-name').value.trim();
    const email = document.getElementById('admin-new-email').value.trim();
    const password = document.getElementById('admin-new-password').value;
    const profileType = document.getElementById('admin-new-profile').value;

    if (!name || !email || !password) {
      showToast('Preencha todos os campos.', 'warning');
      return;
    }

    const users = getUsersFromStorage();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      showToast('E-mail já cadastrado.', 'warning');
      return;
    }

    const newUser = {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name,
      email: email,
      password: password,
      profileType: profileType,
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsersToStorage(users);
    closeAdminCreateUserModal();
    renderAdminPanel();
    showToast(`Usuário ${name} criado com sucesso!`, 'success');
  });

  // Formulário de Despesa
  document.getElementById('expense-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleAddExpense();
  });

  // Orçamento
  document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseFloat(document.getElementById('budget-input').value);
    if (!isNaN(val) && val >= 0) {
      AppState.budget = val;
      saveUserData();
      renderAll();
      showToast('Meta atualizada!', 'success');
    }
  });

  // Navegação de Período
  document.getElementById('btn-prev-period')?.addEventListener('click', () => changePeriod(-1));
  document.getElementById('btn-next-period')?.addEventListener('click', () => changePeriod(1));

  // Filtros
  document.getElementById('filter-search')?.addEventListener('input', renderTransactionsList);
  document.getElementById('filter-category')?.addEventListener('change', renderTransactionsList);

  // Ações
  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);
  document.getElementById('btn-load-sample')?.addEventListener('click', () => {
    if (AppState.currentUser) {
      loadSampleDataForUser(AppState.currentUser.profileType, true);
      showToast('Despesas de teste adicionadas!', 'info');
    }
  });
  document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    if (confirm('Deseja apagar todas as despesas deste usuário?')) {
      AppState.expenses = [];
      saveUserData();
      renderAll();
      showToast('Despesas removidas.', 'warning');
    }
  });
}

// ==========================================
// CÁLCULOS DE PERÍODOS (SEMANAS & MESES)
// ==========================================
function getWeekOfMonth(date) {
  const day = date.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

function changePeriod(delta) {
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';
  const isHomeView = AppState.currentView === 'home';

  if (isPJ && isHomeView) {
    let w = AppState.selectedWeek + delta;
    if (w < 1) {
      w = 4;
      changeMonth(-1);
    } else if (w > 4) {
      w = 1;
      changeMonth(1);
    }
    AppState.selectedWeek = w;
  } else {
    changeMonth(delta);
  }

  updatePeriodDisplay();
  renderAll();
}

function changeMonth(delta) {
  let m = AppState.selectedMonth + delta;
  let y = AppState.selectedYear;

  if (m < 0) {
    m = 11;
    y--;
  } else if (m > 11) {
    m = 0;
    y++;
  }

  AppState.selectedMonth = m;
  AppState.selectedYear = y;
}

function updatePeriodDisplay() {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthsShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';
  const isHomeView = AppState.currentView === 'home';

  const el = document.getElementById('current-period-label');
  if (!el) return;

  if (isPJ && isHomeView) {
    const daysInMonth = new Date(AppState.selectedYear, AppState.selectedMonth + 1, 0).getDate();
    const startDay = (AppState.selectedWeek - 1) * 7 + 1;
    const endDay = Math.min(AppState.selectedWeek * 7, daysInMonth);
    el.textContent = `Semana ${AppState.selectedWeek} (${startDay}-${endDay} ${monthsShort[AppState.selectedMonth]})`;

    const weekBadge = document.getElementById('pj-week-badge');
    if (weekBadge) weekBadge.textContent = `Semana ${AppState.selectedWeek} de 4`;
  } else {
    el.textContent = `${months[AppState.selectedMonth]} ${AppState.selectedYear}`;
  }
}

function getFilteredExpensesForCurrentWeek() {
  const daysInMonth = new Date(AppState.selectedYear, AppState.selectedMonth + 1, 0).getDate();
  const startDay = (AppState.selectedWeek - 1) * 7 + 1;
  const endDay = Math.min(AppState.selectedWeek * 7, daysInMonth);

  return AppState.expenses.filter(item => {
    const d = new Date(item.date + 'T00:00:00');
    if (d.getMonth() !== AppState.selectedMonth || d.getFullYear() !== AppState.selectedYear) {
      return false;
    }
    const day = d.getDate();
    return day >= startDay && day <= endDay;
  });
}

function getFilteredExpensesForCurrentMonth() {
  return AppState.expenses.filter(item => {
    const d = new Date(item.date + 'T00:00:00');
    return d.getMonth() === AppState.selectedMonth && d.getFullYear() === AppState.selectedYear;
  });
}

// ==========================================
// NAVEGAÇÃO DE VISTAS (HOME / DETALHADO / ADMIN)
// ==========================================
window.switchView = function(viewName, subtab = null) {
  AppState.currentView = viewName;

  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('active');
  }

  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeNavBtn = document.getElementById(`bottom-btn-${viewName}`);
  if (activeNavBtn) activeNavBtn.classList.add('active');

  updatePeriodDisplay();

  const pjFilterBar = document.getElementById('pj-scope-filter-container');
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';
  if (pjFilterBar) {
    if (isPJ && viewName === 'detailed') {
      pjFilterBar.classList.remove('hidden');
    } else {
      pjFilterBar.classList.add('hidden');
    }
  }

  if (viewName === 'detailed') {
    const tabToActivate = subtab || AppState.currentDetailTab || 'charts';
    switchDetailTab(tabToActivate);
  } else if (viewName === 'admin') {
    renderAdminPanel();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
  lucide.createIcons();
};

window.switchDetailTab = function(subtabName) {
  AppState.currentDetailTab = subtabName;

  document.querySelectorAll('.detail-subtab').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`detail-tab-${subtabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.detail-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  const activePane = document.getElementById(`detail-content-${subtabName}`);
  if (activePane) activePane.classList.remove('hidden');

  if (subtabName === 'charts') {
    renderCharts();
  } else if (subtabName === 'history') {
    renderTransactionsList();
  }

  lucide.createIcons();
};

window.setDetailFilterScope = function(scope) {
  AppState.detailFilterScope = scope;

  document.querySelectorAll('.scope-pill').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`btn-scope-${scope === 'all' ? 'all' : scope === 'empresarial' ? 'business' : 'personal'}`);
  if (activeBtn) activeBtn.classList.add('active');

  renderCharts();
  renderTransactionsList();
};

// ==========================================
// PAINEL EXCLUSIVO DO ADMINISTRADOR (MESTRE)
// ==========================================
function renderAdminPanel() {
  if (!AppState.currentUser || AppState.currentUser.role !== 'admin') return;

  const users = getUsersFromStorage();
  let totalExpensesCount = 0;
  let totalVolumeAmount = 0;

  const usersListContainer = document.getElementById('admin-users-list');
  const statUsers = document.getElementById('admin-stat-total-users');
  const statExpenses = document.getElementById('admin-stat-total-expenses');
  const statAmount = document.getElementById('admin-stat-total-amount');
  const countBadge = document.getElementById('admin-user-count-badge');

  if (countBadge) countBadge.textContent = `${users.length} contas`;

  // Processa dados de cada usuário para métricas
  const userStats = users.map(user => {
    const expensesJson = localStorage.getItem(`finflow_expenses_${user.id}`);
    const userExpenses = expensesJson ? JSON.parse(expensesJson) : [];
    const totalSpent = userExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    totalExpensesCount += userExpenses.length;
    totalVolumeAmount += totalSpent;

    return {
      ...user,
      expensesCount: userExpenses.length,
      totalSpent: totalSpent
    };
  });

  if (statUsers) statUsers.textContent = users.length;
  if (statExpenses) statExpenses.textContent = totalExpensesCount;
  if (statAmount) statAmount.textContent = formatCurrency(totalVolumeAmount);

  // Renderiza a lista de usuários no painel
  if (usersListContainer) {
    usersListContainer.innerHTML = userStats.map(u => {
      const isMaster = u.email.toLowerCase() === 'filipedk7@gmail.com';
      const isPJ = u.profileType === 'PJ';

      return `
        <div class="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-2xl flex items-center justify-center font-extrabold text-xs shrink-0 ${isMaster ? 'bg-amber-500 text-white shadow-xs' : isPJ ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}">
              ${isMaster ? '👑' : isPJ ? 'PJ' : 'PF'}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <h5 class="font-extrabold text-xs text-slate-900 dark:text-white truncate">${escapeHtml(u.name)}</h5>
                ${isMaster ? '<span class="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-black">Mestre</span>' : ''}
              </div>
              <p class="text-[11px] text-slate-400 truncate">${escapeHtml(u.email)}</p>
              <div class="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                <span class="font-semibold text-slate-700 dark:text-slate-300">${isPJ ? 'Empresário' : 'Pessoa Física'}</span>
                <span>•</span>
                <span>${u.expensesCount} lançamentos</span>
              </div>
            </div>
          </div>

          <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
            <span class="font-black text-xs text-slate-900 dark:text-white">${formatCurrency(u.totalSpent)}</span>
            <button onclick="openAdminInspectModal('${u.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 dark:bg-slate-700 dark:hover:bg-amber-950/60 dark:text-slate-200 dark:hover:text-amber-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition">
              <i data-lucide="sliders" class="w-3 h-3"></i>
              Gerenciar
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  lucide.createIcons();
}

// Modal do Admin para inspecionar e gerenciar usuário específico
window.openAdminInspectModal = function(userId) {
  AppState.inspectingUserId = userId;
  const users = getUsersFromStorage();
  const user = users.find(u => u.id === userId);
  if (!user) return;

  const expensesJson = localStorage.getItem(`finflow_expenses_${user.id}`);
  const userExpenses = expensesJson ? JSON.parse(expensesJson) : [];
  const totalSpent = userExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const modal = document.getElementById('admin-inspect-modal');
  const nameEl = document.getElementById('inspect-user-name');
  const emailEl = document.getElementById('inspect-user-email');
  const totalEl = document.getElementById('inspect-user-total');
  const countEl = document.getElementById('inspect-user-count');
  const listEl = document.getElementById('inspect-user-expenses-list');
  const btnDelete = document.getElementById('btn-admin-delete-user');

  if (nameEl) nameEl.textContent = user.name;
  if (emailEl) emailEl.textContent = `${user.email} (${user.profileType === 'PJ' ? 'Empresário' : 'Pessoa Física'})`;
  if (totalEl) totalEl.textContent = formatCurrency(totalSpent);
  if (countEl) countEl.textContent = `${userExpenses.length} despesas`;

  // Desativa botão de excluir se for a própria conta mestra
  const isMaster = user.email.toLowerCase() === 'filipedk7@gmail.com';
  if (btnDelete) {
    if (isMaster) {
      btnDelete.classList.add('opacity-40', 'pointer-events-none');
      btnDelete.title = 'A conta mestra não pode ser excluída.';
    } else {
      btnDelete.classList.remove('opacity-40', 'pointer-events-none');
    }
  }

  // Lista de despesas do usuário
  if (listEl) {
    if (userExpenses.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-3">Nenhuma despesa lançada por este usuário.</p>`;
    } else {
      listEl.innerHTML = userExpenses.map(exp => `
        <div class="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-slate-800 dark:text-slate-100 block">${escapeHtml(exp.description)}</span>
            <span class="text-[10px] text-slate-400">${formatDateBR(exp.date)} • ${exp.category} ${exp.scope ? `• ${exp.scope}` : ''}</span>
          </div>
          <span class="font-black text-slate-900 dark:text-white">${formatCurrency(exp.amount)}</span>
        </div>
      `).join('');
    }
  }

  modal?.classList.add('open');
  lucide.createIcons();
};

window.closeAdminInspectModal = function() {
  AppState.inspectingUserId = null;
  document.getElementById('admin-inspect-modal')?.classList.remove('open');
};

// Ação Admin: Alternar tipo de conta de um usuário (PF <-> PJ)
window.adminToggleUserType = function() {
  if (!AppState.inspectingUserId) return;
  const users = getUsersFromStorage();
  const idx = users.findIndex(u => u.id === AppState.inspectingUserId);
  if (idx !== -1) {
    const currentType = users[idx].profileType;
    users[idx].profileType = currentType === 'PJ' ? 'PF' : 'PJ';
    saveUsersToStorage(users);
    openAdminInspectModal(AppState.inspectingUserId);
    renderAdminPanel();
    showToast(`Conta de ${users[idx].name} alterada para ${users[idx].profileType}!`, 'success');
  }
};

// Ação Admin: Zerar/Resetar despesas de um usuário
window.adminResetUserExpenses = function() {
  if (!AppState.inspectingUserId) return;
  if (confirm('Deseja zerar todas as despesas deste usuário?')) {
    localStorage.setItem(`finflow_expenses_${AppState.inspectingUserId}`, JSON.stringify([]));
    openAdminInspectModal(AppState.inspectingUserId);
    renderAdminPanel();
    showToast('Despesas deste usuário foram zeradas.', 'warning');
  }
};

// Ação Admin: Excluir usuário do sistema
window.adminDeleteUser = function() {
  if (!AppState.inspectingUserId) return;
  const users = getUsersFromStorage();
  const user = users.find(u => u.id === AppState.inspectingUserId);

  if (user && user.email.toLowerCase() === 'filipedk7@gmail.com') {
    showToast('A conta mestra não pode ser excluída.', 'error');
    return;
  }

  if (confirm(`Tem certeza que deseja excluir a conta de ${user ? user.name : 'este usuário'}? Todos os dados serão perdidos.`)) {
    const newUsers = users.filter(u => u.id !== AppState.inspectingUserId);
    saveUsersToStorage(newUsers);
    localStorage.removeItem(`finflow_expenses_${AppState.inspectingUserId}`);
    localStorage.removeItem(`finflow_budget_${AppState.inspectingUserId}`);
    closeAdminInspectModal();
    renderAdminPanel();
    showToast('Usuário excluído com sucesso.', 'info');
  }
};

// Modal de Criação de Usuário pelo Admin
window.openAdminCreateUserModal = function() {
  document.getElementById('admin-create-user-modal')?.classList.add('open');
};

window.closeAdminCreateUserModal = function() {
  document.getElementById('admin-create-user-modal')?.classList.remove('open');
  document.getElementById('admin-create-user-form')?.reset();
};

// ==========================================
// MODAL DE DESPESA E ESCOPOS
// ==========================================
window.openExpenseModal = function(presetScope = 'pessoal') {
  AppState.currentExpenseScope = presetScope;
  const modal = document.getElementById('expense-modal');
  const scopeSelector = document.getElementById('modal-scope-selector');
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';

  if (scopeSelector) {
    if (isPJ) {
      scopeSelector.classList.remove('hidden');
      setModalExpenseScope(presetScope);
    } else {
      scopeSelector.classList.add('hidden');
      AppState.currentExpenseScope = 'pessoal';
    }
  }

  if (modal) {
    modal.classList.add('open');
    setDefaultDate();
    document.getElementById('exp-amount')?.focus();
  }
  lucide.createIcons();
};

window.setModalExpenseScope = function(scope) {
  AppState.currentExpenseScope = scope;
  const btnPessoal = document.getElementById('scope-btn-pessoal');
  const btnEmpresarial = document.getElementById('scope-btn-empresarial');

  if (scope === 'empresarial') {
    btnEmpresarial?.classList.add('active');
    btnPessoal?.classList.remove('active');
  } else {
    btnPessoal?.classList.add('active');
    btnEmpresarial?.classList.remove('active');
  }
};

window.closeExpenseModal = function() {
  const modal = document.getElementById('expense-modal');
  if (modal) {
    modal.classList.remove('open');
    if (AppState.isRecording && AppState.speechRecognition) {
      AppState.speechRecognition.stop();
    }
  }
};

// ==========================================
// ADICIONAR E EXCLUIR DESPESAS
// ==========================================
function handleAddExpense() {
  const desc = document.getElementById('exp-description').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const payment = document.getElementById('exp-payment').value;
  const notes = document.getElementById('exp-notes').value.trim();
  const scope = AppState.currentExpenseScope || 'pessoal';

  if (!desc || isNaN(amount) || amount <= 0 || !date) {
    showToast('Preencha o valor e a descrição corretamente.', 'warning');
    return;
  }

  const newExpense = {
    id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    description: desc,
    amount: amount,
    date: date,
    category: category,
    payment: payment,
    scope: scope,
    notes: notes,
    createdAt: new Date().toISOString()
  };

  AppState.expenses.unshift(newExpense);
  saveUserData();

  const expenseDate = new Date(date + 'T00:00:00');
  AppState.selectedMonth = expenseDate.getMonth();
  AppState.selectedYear = expenseDate.getFullYear();
  AppState.selectedWeek = getWeekOfMonth(expenseDate);
  updatePeriodDisplay();

  closeExpenseModal();
  document.getElementById('expense-form').reset();
  setDefaultDate();

  renderAll();
  const scopeLabel = scope === 'empresarial' ? 'Empresa' : 'Pessoal';
  showToast(`Despesa ${scopeLabel} cadastrada!`, 'success');
}

window.deleteExpense = function(id) {
  if (confirm('Deseja realmente remover esta despesa?')) {
    AppState.expenses = AppState.expenses.filter(e => e.id !== id);
    saveUserData();
    renderAll();
    showToast('Despesa excluída.', 'info');
  }
};

// ==========================================
// RENDERIZAÇÃO COMPLETA DA APLICAÇÃO
// ==========================================
function renderAll() {
  if (!AppState.currentUser) return;

  const isPJ = AppState.currentUser.profileType === 'PJ';
  const pfContainer = document.getElementById('home-pf-container');
  const pjContainer = document.getElementById('home-pj-container');

  if (isPJ) {
    pfContainer?.classList.add('hidden');
    pjContainer?.classList.remove('hidden');
    renderPJHomeDashboard();
  } else {
    pfContainer?.classList.remove('hidden');
    pjContainer?.classList.add('hidden');
    renderPFHomeDashboard();
  }

  renderHomeRecentList();
  renderCharts();
  renderTransactionsList();
  lucide.createIcons();
}

function renderPFHomeDashboard() {
  const monthExpenses = getFilteredExpensesForCurrentMonth();
  const totalSpent = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  const statTotal = document.getElementById('stat-total-spent');
  const statCount = document.getElementById('stat-expenses-count');
  if (statTotal) statTotal.textContent = formatCurrency(totalSpent);
  if (statCount) statCount.textContent = `${monthExpenses.length} ${monthExpenses.length === 1 ? 'despesa' : 'despesas'}`;

  const catTotals = {};
  monthExpenses.forEach(exp => {
    catTotals[exp.category] = (catTotals[exp.category] || 0) + exp.amount;
  });

  let topCategory = 'Nenhuma';
  let topCategoryAmount = 0;
  for (const [cat, amt] of Object.entries(catTotals)) {
    if (amt > topCategoryAmount) {
      topCategory = cat;
      topCategoryAmount = amt;
    }
  }

  const statTopCat = document.getElementById('stat-top-category');
  const statTopCatAmt = document.getElementById('stat-top-category-amount');
  const iconWrap = document.getElementById('stat-top-cat-icon-wrap');
  const iconEl = document.getElementById('stat-top-cat-icon');

  if (statTopCat) {
    statTopCat.textContent = topCategory !== 'Nenhuma' ? `${CategoryColors[topCategory]?.emoji || ''} ${topCategory}` : 'Nenhuma';
  }
  if (statTopCatAmt) {
    statTopCatAmt.textContent = formatCurrency(topCategoryAmount);
  }

  if (iconWrap && topCategory !== 'Nenhuma') {
    const config = CategoryColors[topCategory] || CategoryColors['Outros'];
    iconWrap.style.backgroundColor = config.light;
    iconWrap.style.color = config.text;
    if (iconEl) iconEl.setAttribute('data-lucide', config.icon || 'pie-chart');
  }

  renderBudgetProgress(totalSpent);
}

function renderPJHomeDashboard() {
  const weekExpenses = getFilteredExpensesForCurrentWeek();

  const personalExpenses = weekExpenses.filter(e => e.scope !== 'empresarial');
  const businessExpenses = weekExpenses.filter(e => e.scope === 'empresarial');

  const totalPersonal = personalExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  const totalBusiness = businessExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  const statPjPersonal = document.getElementById('stat-pj-week-personal');
  const statPjCountPersonal = document.getElementById('stat-pj-count-personal');
  if (statPjPersonal) statPjPersonal.textContent = formatCurrency(totalPersonal);
  if (statPjCountPersonal) statPjCountPersonal.textContent = `${personalExpenses.length} ${personalExpenses.length === 1 ? 'despesa' : 'despesas'}`;

  const statPjBusiness = document.getElementById('stat-pj-week-business');
  const statPjCountBusiness = document.getElementById('stat-pj-count-business');
  if (statPjBusiness) statPjBusiness.textContent = formatCurrency(totalBusiness);
  if (statPjCountBusiness) statPjCountBusiness.textContent = `${businessExpenses.length} ${businessExpenses.length === 1 ? 'despesa' : 'despesas'}`;

  const monthExpenses = getFilteredExpensesForCurrentMonth();
  const totalMonthSpent = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  renderBudgetProgress(totalMonthSpent);
}

function renderBudgetProgress(totalSpent) {
  const budget = AppState.budget;
  const remaining = budget - totalSpent;
  const pct = budget > 0 ? (totalSpent / budget) * 100 : 0;

  const homeTarget = document.getElementById('home-budget-target');
  const homePct = document.getElementById('home-budget-pct');
  const homeBar = document.getElementById('home-budget-bar');
  const homeRemaining = document.getElementById('home-budget-remaining');

  if (homeTarget) homeTarget.textContent = formatCurrency(budget);
  if (homePct) {
    homePct.textContent = `${pct.toFixed(0)}%`;
    homePct.className = 'font-extrabold ' + (pct > 100 ? 'text-rose-600' : pct > 80 ? 'text-amber-600' : 'text-slate-900 dark:text-white');
  }
  if (homeBar) {
    homeBar.style.width = `${Math.min(pct, 100)}%`;
    homeBar.className = 'h-2.5 rounded-full transition-all duration-500 ' + 
      (pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500');
  }
  if (homeRemaining) {
    if (remaining >= 0) {
      homeRemaining.innerHTML = `Disponível: <span class="font-bold text-emerald-600 dark:text-emerald-400">${formatCurrency(remaining)}</span>`;
    } else {
      homeRemaining.innerHTML = `Excedido em: <span class="font-bold text-rose-600">${formatCurrency(Math.abs(remaining))}</span>`;
    }
  }
}

function renderHomeRecentList() {
  const container = document.getElementById('home-recent-expenses');
  const titleEl = document.getElementById('home-recent-title');
  if (!container) return;

  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';
  const expenses = isPJ ? getFilteredExpensesForCurrentWeek() : getFilteredExpensesForCurrentMonth();

  if (titleEl) {
    titleEl.textContent = isPJ ? `Lançamentos da Semana ${AppState.selectedWeek}` : 'Últimos Lançamentos do Mês';
  }

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
        Nenhum gasto registrado para este período.
      </div>
    `;
    return;
  }

  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  container.innerHTML = sorted.map(exp => {
    const cat = CategoryColors[exp.category] || CategoryColors['Outros'];
    const isBusiness = exp.scope === 'empresarial';

    return `
      <div class="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0"
               style="background-color: ${cat.light}; color: ${cat.text}">
            <i data-lucide="${cat.icon || 'tag'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h5 class="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">${escapeHtml(exp.description)}</h5>
            <div class="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              <span>${formatDateBR(exp.date)}</span>
              ${isPJ ? `
                <span>•</span>
                <span class="px-1.5 py-0.2 rounded-md font-bold text-[9px] ${isBusiness ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'}">
                  ${isBusiness ? 'Empresa' : 'Pessoal'}
                </span>
              ` : ''}
              <span>•</span>
              <span class="truncate">${exp.payment || 'Pix'}</span>
            </div>
          </div>
        </div>
        <span class="font-extrabold text-xs text-slate-900 dark:text-white shrink-0 ml-2">${formatCurrency(exp.amount)}</span>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderCharts() {
  const allMonthExpenses = getFilteredExpensesForCurrentMonth();
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';

  const comparisonCard = document.getElementById('pj-comparison-card');
  if (comparisonCard) {
    if (isPJ) {
      comparisonCard.classList.remove('hidden');
      const totalBiz = allMonthExpenses.filter(e => e.scope === 'empresarial').reduce((a, c) => a + c.amount, 0);
      const totalPers = allMonthExpenses.filter(e => e.scope !== 'empresarial').reduce((a, c) => a + c.amount, 0);
      document.getElementById('stat-month-total-business').textContent = formatCurrency(totalBiz);
      document.getElementById('stat-month-total-personal').textContent = formatCurrency(totalPers);
    } else {
      comparisonCard.classList.add('hidden');
    }
  }

  let displayExpenses = allMonthExpenses;
  if (isPJ && AppState.detailFilterScope !== 'all') {
    displayExpenses = allMonthExpenses.filter(e => 
      AppState.detailFilterScope === 'empresarial' ? e.scope === 'empresarial' : e.scope !== 'empresarial'
    );
  }

  const catTotals = {};
  displayExpenses.forEach(exp => {
    catTotals[exp.category] = (catTotals[exp.category] || 0) + exp.amount;
  });

  const daysInMonth = new Date(AppState.selectedYear, AppState.selectedMonth + 1, 0).getDate();
  const totalSpent = displayExpenses.reduce((a, c) => a + c.amount, 0);

  const statDailyAvg = document.getElementById('stat-daily-average');
  const statTotalCnt = document.getElementById('stat-total-count');
  if (statDailyAvg) statDailyAvg.textContent = formatCurrency(totalSpent / daysInMonth);
  if (statTotalCnt) statTotalCnt.textContent = `${displayExpenses.length} ${displayExpenses.length === 1 ? 'registro' : 'registros'}`;

  renderCategoryChart(catTotals);
  renderTimelineChart(displayExpenses, daysInMonth);
}

function renderCategoryChart(catTotals) {
  const ctx = document.getElementById('categoryChart');
  const emptyState = document.getElementById('category-empty-state');
  if (!ctx) return;

  const categories = Object.keys(catTotals);
  const data = Object.values(catTotals);

  if (categories.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (AppState.charts.category) {
      AppState.charts.category.destroy();
      AppState.charts.category = null;
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  const backgroundColors = categories.map(cat => CategoryColors[cat]?.bg || '#94a3b8');

  if (AppState.charts.category) {
    AppState.charts.category.destroy();
  }

  const isDark = AppState.theme === 'dark';

  AppState.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 2,
        borderColor: isDark ? '#1e293b' : '#ffffff',
        hoverOffset: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 10,
            font: { family: '"Plus Jakarta Sans"', size: 10, weight: '600' },
            color: isDark ? '#cbd5e1' : '#475569'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.parsed;
              const sum = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = sum > 0 ? ((val / sum) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${formatCurrency(val)} (${pct}%)`;
            }
          }
        }
      },
      cutout: '66%'
    }
  });
}

function renderTimelineChart(expenses, daysInMonth) {
  const ctx = document.getElementById('timelineChart');
  if (!ctx) return;

  const dailyTotals = Array(daysInMonth).fill(0);
  expenses.forEach(e => {
    const day = parseInt(e.date.split('-')[2], 10);
    if (day >= 1 && day <= daysInMonth) {
      dailyTotals[day - 1] += e.amount;
    }
  });

  const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

  if (AppState.charts.timeline) {
    AppState.charts.timeline.destroy();
  }

  const isDark = AppState.theme === 'dark';

  AppState.charts.timeline = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gasto no Dia',
        data: dailyTotals,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        hoverBackgroundColor: '#059669',
        borderRadius: 3,
        maxBarThickness: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: '"Plus Jakarta Sans"', size: 9 },
            color: isDark ? '#64748b' : '#94a3b8',
            maxTicksLimit: 10
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: isDark ? '#334155' : '#f1f5f9' },
          ticks: {
            font: { family: '"Plus Jakarta Sans"', size: 9 },
            color: isDark ? '#64748b' : '#94a3b8',
            callback: value => 'R$' + value
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` Total: ${formatCurrency(context.parsed.y)}`
          }
        }
      }
    }
  });
}

function renderTransactionsList() {
  const container = document.getElementById('transactions-mobile-list');
  const emptyMsg = document.getElementById('transactions-empty-msg');
  if (!container) return;

  const searchTerm = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
  const selectedCat = document.getElementById('filter-category')?.value || 'ALL';
  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';

  const filtered = AppState.expenses.filter(item => {
    const d = new Date(item.date + 'T00:00:00');
    const isSameMonth = d.getMonth() === AppState.selectedMonth && d.getFullYear() === AppState.selectedYear;
    if (!isSameMonth) return false;

    if (isPJ && AppState.detailFilterScope !== 'all') {
      if (AppState.detailFilterScope === 'empresarial' && item.scope !== 'empresarial') return false;
      if (AppState.detailFilterScope === 'pessoal' && item.scope === 'empresarial') return false;
    }

    if (selectedCat !== 'ALL' && item.category !== selectedCat) return false;

    if (searchTerm) {
      const matchDesc = item.description.toLowerCase().includes(searchTerm);
      const matchNotes = (item.notes || '').toLowerCase().includes(searchTerm);
      const matchPay = (item.payment || '').toLowerCase().includes(searchTerm);
      return matchDesc || matchNotes || matchPay;
    }
    return true;
  });

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  if (emptyMsg) emptyMsg.classList.add('hidden');

  container.innerHTML = filtered.map(item => {
    const cat = CategoryColors[item.category] || CategoryColors['Outros'];
    const isBusiness = item.scope === 'empresarial';

    return `
      <div class="bg-white dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" 
               style="background-color: ${cat.light}; color: ${cat.text}">
            <i data-lucide="${cat.icon || 'tag'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h5 class="font-bold text-slate-800 dark:text-slate-100 text-xs truncate">${escapeHtml(item.description)}</h5>
            <div class="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              <span>${formatDateBR(item.date)}</span>
              <span>•</span>
              <span class="font-medium text-slate-600 dark:text-slate-300">${item.category}</span>
              ${isPJ ? `
                <span>•</span>
                <span class="px-1.5 py-0.2 rounded-md font-bold text-[9px] ${isBusiness ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'}">
                  ${isBusiness ? 'Empresa' : 'Pessoal'}
                </span>
              ` : ''}
              <span>•</span>
              <span>${item.payment || 'Pix'}</span>
            </div>
            ${item.notes ? `<p class="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5 truncate">${escapeHtml(item.notes)}</p>` : ''}
          </div>
        </div>

        <div class="text-right shrink-0 flex flex-col items-end gap-1">
          <span class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">${formatCurrency(item.amount)}</span>
          <button onclick="deleteExpense('${item.id}')" class="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 active:scale-95 transition" title="Excluir">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function exportToCSV() {
  const expenses = getFilteredExpensesForCurrentMonth();
  if (expenses.length === 0) {
    showToast('Não há despesas para exportar neste mês.', 'warning');
    return;
  }

  const isPJ = AppState.currentUser && AppState.currentUser.profileType === 'PJ';
  const headers = ['Data', 'Descricao', 'Categoria', 'Forma de Pagamento', 'Escopo', 'Valor (R$)', 'Observacoes'];
  const rows = expenses.map(e => [
    e.date,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    `"${e.category}"`,
    `"${e.payment || ''}"`,
    `"${e.scope === 'empresarial' ? 'Empresa' : 'Pessoal'}"`,
    e.amount.toFixed(2).replace('.', ','),
    `"${(e.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
    + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `finflow_${isPJ ? 'pj' : 'pf'}_despesas_${AppState.selectedYear}_${AppState.selectedMonth + 1}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Planilha CSV gerada!', 'success');
}

function loadSampleDataForUser(profileType, force = false) {
  if (AppState.expenses.length > 0 && !force) return;

  const y = AppState.selectedYear;
  const m = String(AppState.selectedMonth + 1).padStart(2, '0');

  let sample = [];

  if (profileType === 'PJ') {
    sample = [
      {
        id: 'samp_pj_1',
        description: 'Fornecedor de Embalagens e Insumos',
        amount: 850.00,
        date: `${y}-${m}-02`,
        category: 'Compras',
        payment: 'Boleto',
        scope: 'empresarial',
        notes: 'Pedido lote #402',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pj_2',
        description: 'Energia Elétrica do Escritório',
        amount: 320.00,
        date: `${y}-${m}-03`,
        category: 'Moradia',
        payment: 'Pix',
        scope: 'empresarial',
        notes: 'Conta comercial Enel',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pj_3',
        description: 'Almoço Restaurante com Cliente',
        amount: 145.00,
        date: `${y}-${m}-04`,
        category: 'Alimentação',
        payment: 'Cartão de Crédito',
        scope: 'empresarial',
        notes: 'Reunião comercial',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pj_4',
        description: 'Supermercado da Família',
        amount: 380.00,
        date: `${y}-${m}-03`,
        category: 'Alimentação',
        payment: 'Cartão de Débito',
        scope: 'pessoal',
        notes: 'Compras pessoais',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pj_5',
        description: 'Abastecimento Combustível Carro Próprio',
        amount: 180.00,
        date: `${y}-${m}-05`,
        category: 'Transporte',
        payment: 'Pix',
        scope: 'pessoal',
        notes: 'Uso pessoal',
        createdAt: new Date().toISOString()
      }
    ];
  } else {
    sample = [
      {
        id: 'samp_pf_1',
        description: 'Supermercado Mensal Pão de Açúcar',
        amount: 684.50,
        date: `${y}-${m}-02`,
        category: 'Alimentação',
        payment: 'Cartão de Crédito',
        scope: 'pessoal',
        notes: 'Compras do mês',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pf_2',
        description: 'Condomínio e Energia Elétrica',
        amount: 850.00,
        date: `${y}-${m}-05`,
        category: 'Moradia',
        payment: 'Boleto',
        scope: 'pessoal',
        notes: 'Contas fixas',
        createdAt: new Date().toISOString()
      },
      {
        id: 'samp_pf_3',
        description: 'Abastecimento Combustível',
        amount: 195.00,
        date: `${y}-${m}-08`,
        category: 'Transporte',
        payment: 'Pix',
        scope: 'pessoal',
        notes: 'Tanque cheio',
        createdAt: new Date().toISOString()
      }
    ];
  }

  if (force) {
    AppState.expenses = [...sample, ...AppState.expenses];
  } else {
    AppState.expenses = sample;
  }

  saveUserData();
  renderAll();
}

// ==========================================
// RECONHECIMENTO DE ÁUDIO COM NLP
// ==========================================
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    AppState.isRecording = true;
    updateVoiceUI(true);
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interimTranscript;
    const previewEl = document.getElementById('voice-transcript-text');
    if (previewEl && currentText) {
      previewEl.textContent = `"${currentText}"`;
    }

    if (finalTranscript) {
      handleSpokenExpense(finalTranscript);
    }
  };

  recognition.onerror = () => {
    AppState.isRecording = false;
    updateVoiceUI(false);
  };

  recognition.onend = () => {
    AppState.isRecording = false;
    updateVoiceUI(false);
  };

  AppState.speechRecognition = recognition;
}

window.toggleVoiceRecording = function() {
  if (!AppState.speechRecognition) {
    showToast('Reconhecimento de voz não suportado neste navegador.', 'info');
    document.getElementById('exp-description')?.focus();
    return;
  }

  if (AppState.isRecording) {
    AppState.speechRecognition.stop();
  } else {
    try {
      AppState.speechRecognition.start();
    } catch (err) {
      AppState.speechRecognition.stop();
      setTimeout(() => AppState.speechRecognition.start(), 200);
    }
  }
};

window.startVoiceExpenseFlow = function(presetScope = 'pessoal') {
  openExpenseModal(presetScope);
  setTimeout(() => {
    toggleVoiceRecording();
  }, 400);
};

function updateVoiceUI(isRecording) {
  const btn = document.getElementById('btn-voice-record');
  const ping = document.getElementById('voice-ping-circle');
  const title = document.getElementById('voice-title-status');
  const desc = document.getElementById('voice-desc-status');
  const previewBox = document.getElementById('voice-transcription-preview');
  const badge = document.getElementById('voice-badge-status');
  const icon = document.getElementById('voice-mic-icon');

  if (isRecording) {
    btn?.classList.add('recording-active');
    ping?.classList.remove('hidden');
    previewBox?.classList.remove('hidden');
    if (title) title.textContent = 'Ouvindo sua voz... Fale agora!';
    if (desc) desc.textContent = 'Diga itens, categoria, valor e forma de pagamento';
    if (badge) badge.className = 'inline-block w-2 h-2 rounded-full bg-rose-500 animate-ping';
    if (icon) icon.setAttribute('data-lucide', 'square');
  } else {
    btn?.classList.remove('recording-active');
    ping?.classList.add('hidden');
    if (title) title.textContent = 'Lançar Despesa por Áudio';
    if (desc) desc.textContent = 'Diga os itens, categoria, valor e forma de pagamento';
    if (badge) badge.className = 'inline-block w-2 h-2 rounded-full bg-emerald-500';
    if (icon) icon.setAttribute('data-lucide', 'mic');
  }

  lucide.createIcons();
}

window.showVoiceHelp = function() {
  showToast('Ex: "Comprei leite, ovos. Categoria mercado, gastei 150$ no pix"', 'info');
};

function handleSpokenExpense(text) {
  if (!text || text.trim() === '') return;

  const original = text.trim();
  const lower = original.toLowerCase();

  const amount = extractAmount(lower);
  const category = detectCategory(lower);
  const payment = detectPaymentMethod(lower);

  if (AppState.currentUser && AppState.currentUser.profileType === 'PJ') {
    if (lower.includes('empresa') || lower.includes('empresarial') || lower.includes('cnpj') || lower.includes('fornecedor') || lower.includes('nota fiscal')) {
      setModalExpenseScope('empresarial');
    } else if (lower.includes('pessoal') || lower.includes('de casa') || lower.includes('pra mim')) {
      setModalExpenseScope('pessoal');
    }
  }

  const description = extractDescription(original, amount, category, payment);

  if (amount > 0) {
    const amountInput = document.getElementById('exp-amount');
    if (amountInput) amountInput.value = amount.toFixed(2);
  }

  if (description) {
    const descInput = document.getElementById('exp-description');
    if (descInput) descInput.value = description;
  }

  if (category) {
    const catInput = document.getElementById('exp-category');
    if (catInput) catInput.value = category;
  }

  if (payment) {
    const payInput = document.getElementById('exp-payment');
    if (payInput) payInput.value = payment;
  }

  const previewEl = document.getElementById('voice-transcript-text');
  if (previewEl) {
    previewEl.innerHTML = `<strong>${escapeHtml(description)}</strong> • R$ ${amount > 0 ? amount.toFixed(2).replace('.', ',') : '0,00'} • ${category} • ${payment}`;
  }

  const feedbackMsg = amount > 0 
    ? `Item: "${description}" | Valor: R$ ${amount.toFixed(2).replace('.', ',')} | Categoria: ${category}` 
    : `Item: "${description}" identificado. Confira os detalhes.`;

  showToast(feedbackMsg, 'success');
}

function extractAmount(text) {
  const dollarRegex = /(?:r\$|\$)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:r\$|\$)/i;
  const matchDollar = text.match(dollarRegex);
  if (matchDollar) {
    const rawVal = matchDollar[1] || matchDollar[2];
    const val = parseFloat(rawVal.replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }

  const reaisRegex = /(\d+)(?:[.,](\d{1,2}))?\s*(?:reais|real)(?:\s*(?:e\s*)?(\d{1,2})\s*centavos)?/i;
  const matchReais = text.match(reaisRegex);
  if (matchReais) {
    const intPart = parseInt(matchReais[1], 10);
    let decPart = matchReais[2] ? matchReais[2] : (matchReais[3] || '0');
    if (decPart.length === 1) decPart += '0';
    const val = parseFloat(`${intPart}.${decPart}`);
    if (!isNaN(val) && val > 0) return val;
  }

  const verbRegex = /(?:gastei|paguei|custou|deu|valor(?:\s+de)?|ficou\s+em)\s*(?:r\$|\$)?\s*(\d+(?:[.,]\d{1,2})?)/i;
  const matchVerb = text.match(verbRegex);
  if (matchVerb && matchVerb[1]) {
    const val = parseFloat(matchVerb[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }

  const genericRegex = /\b(\d+(?:[.,]\d{1,2})?)\b/;
  const matchGen = text.match(genericRegex);
  if (matchGen && matchGen[1]) {
    const val = parseFloat(matchGen[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }

  return 0;
}

function detectCategory(text) {
  const explicitMatch = text.match(/\bcategoria(?:\s+de)?\s+([a-záàâãéèêíïóôõöúçñ]+)/i);
  if (explicitMatch && explicitMatch[1]) {
    const spokenCat = explicitMatch[1].trim();
    const mapped = mapSpokenCategoryToOfficial(spokenCat);
    if (mapped) return mapped;
  }

  const dictionary = {
    'Alimentação': ['mercado', 'supermercado', 'leite', 'ovo', 'ovos', 'pão', 'carne', 'almoço', 'almoco', 'jantar', 'janta', 'lanche', 'ifood', 'comida', 'pizza', 'hambúrguer', 'hamburguer', 'restaurante', 'café', 'cafe', 'padaria', 'feira', 'açougue', 'acougue', 'cerveja', 'churrasco', 'açaí', 'acai', 'pastel'],
    'Transporte':  ['uber', '99', 'táxi', 'taxi', 'gasolina', 'combustível', 'combustivel', 'etanol', 'posto', 'abastecer', 'abastecimento', 'ônibus', 'onibus', 'metrô', 'metro', 'passagem', 'estacionamento', 'pedágio', 'pedagio', 'oficina', 'mecânico', 'pneu'],
    'Moradia':     ['aluguel', 'condomínio', 'condominio', 'luz', 'energia', 'água', 'agua', 'gás', 'gas', 'internet', 'wifi', 'iptu', 'faxina', 'diarista', 'reforma'],
    'Lazer':       ['cinema', 'show', 'teatro', 'festa', 'balada', 'bar', 'barzinho', 'viagem', 'hotel', 'praia', 'jogo', 'passeio'],
    'Saúde':       ['farmácia', 'farmacia', 'remédio', 'remedio', 'medicamento', 'médico', 'medico', 'dentista', 'consulta', 'exame', 'hospital', 'psicólogo', 'terapia'],
    'Educação':    ['livro', 'curso', 'faculdade', 'escola', 'matrícula', 'matricula', 'mensalidade', 'apostila'],
    'Compras':     ['shopping', 'roupa', 'camisa', 'calça', 'calca', 'tênis', 'tenis', 'sapato', 'vestuário', 'presente', 'eletrônico', 'celular', 'insumo', 'embalagem'],
    'Serviços':    ['netflix', 'spotify', 'academia', 'plano', 'assinatura', 'barbearia', 'barbeiro', 'corte de cabelo', 'salão', 'salao', 'contabilidade', 'honorário']
  };

  for (const [cat, keywords] of Object.entries(dictionary)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        return cat;
      }
    }
  }

  return 'Outros';
}

function mapSpokenCategoryToOfficial(term) {
  const t = term.toLowerCase();
  if (t.includes('mercado') || t.includes('aliment') || t.includes('comida') || t.includes('refei')) return 'Alimentação';
  if (t.includes('transporte') || t.includes('carro') || t.includes('combustivel') || t.includes('posto')) return 'Transporte';
  if (t.includes('moradia') || t.includes('casa') || t.includes('conta') || t.includes('aluguel')) return 'Moradia';
  if (t.includes('lazer') || t.includes('diver') || t.includes('festa')) return 'Lazer';
  if (t.includes('saude') || t.includes('saúde') || t.includes('farm') || t.includes('medic')) return 'Saúde';
  if (t.includes('educa') || t.includes('escola') || t.includes('estud')) return 'Educação';
  if (t.includes('compra') || t.includes('loja') || t.includes('vestu')) return 'Compras';
  if (t.includes('servi') || t.includes('assinat') || t.includes('plano')) return 'Serviços';
  if (t.includes('outro')) return 'Outros';
  return null;
}

function detectPaymentMethod(text) {
  if (text.includes('pix')) return 'Pix';
  if (text.includes('crédito') || text.includes('credito') || text.includes('cartão de crédito') || text.includes('no cartao')) return 'Cartão de Crédito';
  if (text.includes('débito') || text.includes('debito') || text.includes('cartão de débito')) return 'Cartão de Débito';
  if (text.includes('dinheiro') || text.includes('espécie') || text.includes('especie') || text.includes('à vista')) return 'Dinheiro';
  if (text.includes('boleto')) return 'Boleto';
  if (text.includes('transferência') || text.includes('transferencia') || text.includes('ted') || text.includes('doc')) return 'Transferência';
  return 'Pix';
}

function extractDescription(originalText, amount, category, payment) {
  let text = originalText.trim();

  const delimiterRegex = /(?:\.|\,)?\s*\b(?:categoria|gastei|custou|paguei|no\s+valor(?:\s+de)?|deu|ficou\s+em)\b/i;
  const delimiterMatch = text.search(delimiterRegex);

  let itemsPart = text;
  if (delimiterMatch > 0) {
    itemsPart = text.substring(0, delimiterMatch).trim();
  }

  if (itemsPart === text && text.includes('.')) {
    const firstSentence = text.split('.')[0].trim();
    if (firstSentence.length >= 3) {
      itemsPart = firstSentence;
    }
  }

  itemsPart = itemsPart.replace(/^(?:comprei(?:\s+um|\s+uma|\s+uns|\s+umas)?|gastei(?:\s+com)?|paguei(?:\s+por)?|despesa(?:\s+com)?|compra(?:\s+de)?|foi)\s+/i, '');
  itemsPart = itemsPart.replace(/(?:r\$|\$)\s*\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s*(?:r\$|\$|reais|real)?/gi, '');
  itemsPart = itemsPart.replace(/\s*(?:e\s+)?(?:no\s+pix|via\s+pix|no\s+cr[eé]dito|no\s+d[eé]bito|no\s+dinheiro|no\s+cart[aã]o|no\s+boleto)\b/gi, '');
  itemsPart = itemsPart.replace(/^[,\.\-\:\s]+|[,\.\-\:\s]+$/g, '').trim();

  if (itemsPart.length >= 2) {
    return itemsPart.charAt(0).toUpperCase() + itemsPart.slice(1);
  }

  if (category && category !== 'Outros') {
    return category;
  }
  return 'Despesa Lançada';
}

// Helpers
function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const typeStyles = {
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-slate-900 dark:bg-slate-800 text-white border border-slate-700',
    error: 'bg-rose-600 text-white'
  };

  const icons = {
    success: 'check-circle',
    warning: 'alert-triangle',
    info: 'info',
    error: 'x-circle'
  };

  toast.className = `toast px-3.5 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 border border-white/10 ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// ==========================================
// PWA & INSTALAÇÃO NO CELULAR (ANDROID / IOS)
// ==========================================
let deferredInstallPrompt = null;

// Registro do Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registrado:', reg.scope))
      .catch(err => console.log('Nota SW:', err.message));
  });
}

// Captura do evento de instalação no Android/Chrome
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  
  // Atualiza visibilidade dos botões de instalação
  const banner = document.getElementById('home-install-banner');
  const isDismissed = localStorage.getItem('finflow_install_banner_dismissed') === 'true';
  if (banner && !isDismissed && !isAppInstalled()) {
    banner.classList.remove('hidden');
  }

  const promptBox = document.getElementById('android-prompt-box');
  if (promptBox) promptBox.classList.remove('hidden');
});

// Evento quando o app for instalado com sucesso
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('FinFlow instalado com sucesso no seu dispositivo!', 'success');
  closeInstallModal();
  const banner = document.getElementById('home-install-banner');
  if (banner) banner.classList.add('hidden');
});

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

window.triggerAppInstall = function() {
  if (isAppInstalled()) {
    showToast('O FinFlow já está instalado como aplicativo!', 'info');
    return;
  }

  const modal = document.getElementById('install-modal');
  if (!modal) return;

  // Se for iPhone ou iPad, abre diretamente na aba iOS
  if (isIOS()) {
    switchInstallTab('ios');
  } else {
    switchInstallTab('android');
  }

  modal.classList.add('open');
  lucide.createIcons();
};

window.closeInstallModal = function() {
  document.getElementById('install-modal')?.classList.remove('open');
};

window.switchInstallTab = function(platform) {
  const tabAndroid = document.getElementById('tab-install-android');
  const tabIos = document.getElementById('tab-install-ios');
  const contentAndroid = document.getElementById('install-content-android');
  const contentIos = document.getElementById('install-content-ios');

  if (platform === 'ios') {
    tabAndroid?.classList.remove('active');
    tabIos?.classList.add('active');
    contentAndroid?.classList.add('hidden');
    contentIos?.classList.remove('hidden');
  } else {
    tabAndroid?.classList.add('active');
    tabIos?.classList.remove('active');
    contentAndroid?.classList.remove('hidden');
    contentIos?.classList.add('hidden');
  }
  lucide.createIcons();
};

window.installPWA = async function() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Instalando FinFlow...', 'success');
    }
    deferredInstallPrompt = null;
    closeInstallModal();
  } else {
    // Se o navegador não disparou o prompt nativo ainda
    showToast('Toque no menu (⋮) do seu navegador e escolha "Instalar Aplicativo".', 'info');
  }
};

window.dismissInstallBanner = function() {
  const banner = document.getElementById('home-install-banner');
  if (banner) banner.classList.add('hidden');
  localStorage.setItem('finflow_install_banner_dismissed', 'true');
};

// Verifica na inicialização se já está em modo standalone
document.addEventListener('DOMContentLoaded', () => {
  if (isAppInstalled()) {
    const banner = document.getElementById('home-install-banner');
    if (banner) banner.classList.add('hidden');
  } else if (localStorage.getItem('finflow_install_banner_dismissed') === 'true') {
    const banner = document.getElementById('home-install-banner');
    if (banner) banner.classList.add('hidden');
  }
});

