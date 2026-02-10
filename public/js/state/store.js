export const store = {
  globalUsers: [],
  globalComputers: [],
  globalSecurity: [],
  globalAudit: [],
  globalDisabled: [],

  // flags de carregamento por aba
  loaded: { overview:false, details:false, inventory:false, security:false, audit:false, disabled:false }, 
  loadedAt: { overview:0, details:0, inventory:0, security:0, audit:0, disabled:0 }, 

  // sorting users
  userSortDir: 1,
  userLastCol: '',

  // sorting computers
  compSortDir: 1,
  compLastCol: '',

  disabledSortDir: 1,
  disabledLastCol: '', 
  
  // filters disabled
  isDisabledLegacyFilter: false,

  // filters inventory
  currentTypeFilter: 'all',
  isSixMonthsFilter: false,
};