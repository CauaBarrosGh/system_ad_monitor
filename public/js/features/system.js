import { refreshAfterUserAction, getActiveTabFromDOM } from "./sectionLoader.js";

export async function triggerManualSync() {
    // Pegamos apenas o Botão e o Texto
    const btn = document.getElementById('btn-sync-now');
    const textSpan = document.getElementById('text-sync');

    // Bloqueia o botão e muda o texto para avisar que começou
    if (btn) btn.disabled = true;
    if (textSpan) textSpan.innerText = "Sincronizando...";

    try {
        // Descobre a aba ativa para economizar tempo
        const activeTab = getActiveTabFromDOM();
        let syncType = 'users';
        
        if (activeTab === 'inventory') {
            syncType = 'computers';
        } 
        
        console.log(`⏳ Iniciando sincronização: ${syncType.toUpperCase()}`);
        
        // Chama a API
        const response = await fetch('/system/sync', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: syncType })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Erro no servidor');

        console.log("✅ Sucesso:", data);

        // Atualiza a tela
        await refreshAfterUserAction();

        // Avisa que acabou (Visual)
        if (textSpan) textSpan.innerText = "Concluído!";

    } catch (error) {
        console.error("❌ Erro:", error);
        alert("Erro na sincronização: " + error.message);
        if (textSpan) textSpan.innerText = "Erro!";
    } finally {
        // Destrava o botão imediatamente
        if (btn) btn.disabled = false;
        
        // Espera 2 segundos e volta o texto para o original
        setTimeout(() => {
            if (textSpan) textSpan.innerText = "Sincronizar AD";
        }, 2000);
    }
}