import { initTheme, toggleDarkMode } from "./ui/theme.js";
import { switchTab } from "./ui/navigation.js";
import { toggleMobileMenu, initMobileMenuAutoClose } from "./ui/mobileMenu.js";
import { openUserModal, closeModal } from "./ui/modal.js";
import { loadOverview,loadDisabled,loadInventory} from "./features/sectionLoader.js";
import { sortTable } from "./features/usersTable.js";
import { setCompFilter, toggleSixMonths, sortCompTable } from "./features/computersTable.js";
import { exportCSV } from "./features/exportCsv.js";
import { loadAuditLogs } from "./features/audit.js";
import { toggleLegacyFilter, sortDisabledTable , confirmDeleteDisabled} from "./features/disabledTable.js";
import { confirmDeleteComputer } from "./features/computersTable.js";
import { triggerManualSync } from "./features/system.js";
import { generateLogonName, generateSecurePassword, submitNewUser, updateOuAndGroup } from "./features/createUser.js";

// Inicialização base
initTheme();
initMobileMenuAutoClose();

// Expor globais
window.toggleDarkMode = toggleDarkMode;
window.toggleMobileMenu = toggleMobileMenu;
window.switchTab = switchTab;
window.exportCSV = exportCSV; 
window.sortTable = sortTable;
window.setCompFilter = setCompFilter;
window.toggleSixMonths = toggleSixMonths;
window.sortCompTable = sortCompTable;
window.openUserModal = openUserModal;
window.closeModal = closeModal;
window.loadAuditLogs = loadAuditLogs;
window.loadDisabled = loadDisabled;
window.toggleLegacyFilter = toggleLegacyFilter;
window.sortDisabledTable = sortDisabledTable;
window.confirmDeleteDisabled = confirmDeleteDisabled;
window.confirmDeleteComputer = confirmDeleteComputer;
window.loadInventory = loadInventory;
window.triggerManualSync = triggerManualSync;
window.generateLogonName = generateLogonName;
window.generateSecurePassword = generateSecurePassword;
window.submitNewUser = submitNewUser;
window.updateOuAndGroup = updateOuAndGroup;


// Carregamento inicial
loadOverview();