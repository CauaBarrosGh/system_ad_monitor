export const store = {
  // Dados globais carregados do backend (cache em memória)
  globalUsers: [],
  globalComputers: [],
  globalSecurity: [],
  globalAudit: [],
  globalDisabled: [],

  // Controle de carregamento por aba (previne fetch desnecessário)
  loaded: { 
    overview: false, 
    details: false, 
    inventory: false, 
    security: false, 
    audit: false, 
    disabled: false 
  },

  // Armazena timestamp do último carregamento por aba (para refresh inteligente)
  loadedAt: { 
    overview: 0, 
    details: 0, 
    inventory: 0, 
    security: 0, 
    audit: 0, 
    disabled: 0 
  },

  // Estado de ordenação da tabela de usuários
  userSortDir: 1,    
  userLastCol: '',    

  // Estado de ordenação de computadores
  compSortDir: 1,
  compLastCol: '',

  // Ordenação de usuários desativados
  disabledSortDir: 1,
  disabledLastCol: '', 
  
  // Filtros da aba "Disabled"
  isDisabledLegacyFilter: false,

  // Filtros da aba "Inventário"
  currentTypeFilter: 'all',
  isSixMonthsFilter: false,
};