// Carrega um arquivo HTML externo e substitui o elemento pelo conteúdo carregado
async function loadHtml(id, path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Erro ao carregar ${path}`);
        const html = await response.text();
        const element = document.getElementById(id);
        if (element) {
            element.outerHTML = html;
        }
    } catch (error) {
        console.error(error);
    }
}

// Carrega todos os componentes de layout e views em paralelo
export async function loadComponents() {
    await Promise.all([
        
        // Layout
        loadHtml('component-sidebar', '/components/layout/sidebar.html'),
        loadHtml('component-header', '/components/layout/header.html'),
        loadHtml('component-modal', '/components/layout/modal.html'),

        // Views
        loadHtml('component-overview', '/components/views/overview.html'),
        loadHtml('component-details', '/components/views/details.html'),
        loadHtml('component-inventory', '/components/views/inventory.html'),
        loadHtml('component-register', '/components/views/register.html'),
        loadHtml('component-disabled', '/components/views/disabled.html'),
        loadHtml('component-security', '/components/views/security.html'),
        loadHtml('component-audit', '/components/views/audit.html'),
    ]);
    
    if (window.lucide) window.lucide.createIcons();
}