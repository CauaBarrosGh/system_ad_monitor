import { refreshAfterUserAction } from "./sectionLoader.js";

// Gera o logon automaticamente (nome.sobrenome)
export function generateLogonName() {
    const firstNameInput = document.getElementById('regFirstName').value.trim();
    const lastNameInput = document.getElementById('regLastName').value.trim();
    const logonInput = document.getElementById('regLogonName');

    // Só tenta montar se houver pelo menos nome ou sobrenome
    if (firstNameInput || lastNameInput) {
        // Pega o primeiro nome e o último sobrenome
        const first = firstNameInput.split(' ')[0] || '';
        const lastParts = lastNameInput.split(' ');
        const last = lastParts.length > 0 ? lastParts[lastParts.length - 1] : '';   

        // Monta base: "nome.sobrenome" | ou apenas "nome" | ou apenas "sobrenome"
        let baseName = '';
        if (first && last) {
            baseName = `${first}.${last}`;
        } else if (first) {
            baseName = first;
        } else if (last) {
            baseName = last;
        }

        // Normaliza: caixa baixa, remove acentos e caracteres inválidos
        const cleanName = baseName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove diacríticos (acentos)
            .replace(/[^a-z0-9.]/g, "");     // mantém apenas letras, números e ponto

        logonInput.value = cleanName;
    } else {
        // Se não houver nada, limpa o campo
        logonInput.value = '';
    }
}

// Preenche OU e Grupos baseado no perfil
export function updateOuAndGroup() {
    const profile = document.getElementById('regProfileType').value;
    const ouInput = document.getElementById('regTargetOU');
    const groupInput = document.getElementById('regTargetGroup');

    // Mapa de perfis -> OU padrão e grupos default
    const map = {
        'TI': { 
            ou: 'OU=Teste_Caua,DC=soc,DC=com,DC=br', 
            groups: [
                'CN=Dev - TI,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'
            ] 
        },
        'GSI': { 
            ou: 'OU=Engenharia,OU=Operações,OU=Operação e Tecnologia,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br', 
            groups: [
                'CN=DEV - Gestão de Sistemas Internos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'
            ] 
        },
        'SI': { 
            ou: 'OU=Seguranca da Informacao,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br', 
            groups: [] 
        },
        'COMERCIAL': { 
            ou: 'OU=Comercial,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br', 
            groups: [] 
        },
        'RH': { 
            ou: 'OU=Recursos Humanos,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br', 
            groups: [] 
        }
    };

    // Se houver mapeamento para o perfil selecionado, preenche os campos
    if (map[profile]) {
        ouInput.value = map[profile].ou;
        groupInput.value = map[profile].groups.join('\n'); // um grupo por linha
    }
}

// Gera senha temporária de 10 caracteres com requisitos mínimos
export function generateSecurePassword() {
    const passwordInput = document.getElementById('regPassword');
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#";
    let password = "";
    
    // Garante pelo menos 1 maiúscula, 1 minúscula, 1 número e 1 símbolo
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];                 
    password += "@#"[Math.floor(Math.random() * 2)];                    

    // Completa até 10 caracteres com caracteres aleatórios do conjunto
    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        password += chars.charAt(randomIndex);
    }

    // Embaralha os caracteres para não manter a ordem dos primeiros 4
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    passwordInput.value = password;
}

// Submete criação do usuário: valida campos, confirma, envia para API e faz pós-ação
export async function submitNewUser() {
    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const logonName = document.getElementById('regLogonName').value.trim();
    const profileType = document.getElementById('regProfileType').value;
    const password = document.getElementById('regPassword').value;
    const targetOU = document.getElementById('regTargetOU').value.trim();
    const rawGroups = document.getElementById('regTargetGroup').value;
    const targetGroupsArray = rawGroups.split('\n').map(g => g.trim()).filter(g => g !== '');
    const jobTitle = document.getElementById('regJobTitle').value.trim();
    const seniority = document.getElementById('regSeniority').value;
    const contractType = document.getElementById('regContractType').value;
    const forcePwdChange = document.getElementById('regForcePwdChange').checked;
    const btnSubmit = document.getElementById('btnSubmitRegister');

    // SWAL VALIDAÇÃO — checa obrigatórios antes de prosseguir
    if (!firstName || !lastName || !logonName || !targetOU || !password || !jobTitle || !seniority || !contractType) {
        Swal.fire({
            title: 'Campos Incompletos',
            text: 'Por favor, preencha todos os campos obrigatórios antes de continuar.',
            icon: 'warning',
            background: '#1e293b',
            color: '#fff',
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Entendi',
            heightAuto: false
        });
        return;
    }

    // SWAL CONFIRMAÇÃO — confirma criação com OU e grupos revisados
    const confirmResult = await Swal.fire({
        title: 'CONFIRMAR CRIAÇÃO',
        html: `Deseja cadastrar o usuário <b>${logonName}</b> no AD?<br><span class="text-xs text-slate-500">Verifique se a OU e os grupos estão corretos.</span>`,
        icon: 'question',
        showCancelButton: true,
        background: '#1e293b',
        color: '#fff',
        confirmButtonColor: '#2563eb',
        cancelButtonColor: '#64748b', 
        confirmButtonText: 'Sim, criar!',
        cancelButtonText: 'Cancelar',
        heightAuto: false
    });

    if (!confirmResult.isConfirmed) return;

    // Loading UI no botão (desabilita e mostra spinner)
    const originalBtnContent = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-75', 'cursor-not-allowed');
    btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Cadastrando...`;
    if (window.lucide) { window.lucide.createIcons(); }

    try {
        // Payload enviado ao backend
        const userData = {
            firstName,
            lastName,
            logonName,
            profileType,
            password,
            targetOU,
            targetGroups: targetGroupsArray,
            jobTitle,
            seniority,
            contractType,
            forcePwdChange
        };

        // Recupera token salvo (autorização Bearer)
        const token = localStorage.getItem('token'); 

        // Chamada à API para criar usuário no AD
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // SWAL SUCESSO — feedback positivo ao usuário
            Swal.fire({
                title: 'SUCESSO!',
                html: `O usuário <b>${logonName}</b> foi criado e ativado.<br>Senha definida com sucesso.`,
                icon: 'success',
                background: '#1e293b',
                color: '#fff',
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Perfeito!',
                heightAuto: false
            });
            
            // Limpa todos os campos do formulário
            document.getElementById('regFirstName').value = '';
            document.getElementById('regLastName').value = '';
            document.getElementById('regLogonName').value = '';
            document.getElementById('regProfileType').value = '';
            document.getElementById('regPassword').value = '';
            document.getElementById('regTargetOU').value = '';
            document.getElementById('regTargetGroup').value = '';
            document.getElementById('regJobTitle').value = '';
            document.getElementById('regSeniority').value = '';
            document.getElementById('regContractType').value = '';
            document.getElementById('regForcePwdChange').checked = false;
            
            // Atualiza seções/tabelas dependentes da criação
            await refreshAfterUserAction();

        } else {
            // Erro retornado pela API (com mensagem)
            throw new Error(data.error || 'Erro desconhecido retornado pelo servidor.');
        }

    } catch (error) {
        console.error("Erro ao Cadastrar usuário:", error);
        
        // SWAL ERRO — feedback de falha
        Swal.fire({
            title: 'FALHA NO CADASTRO',
            text: error.message,
            icon: 'error',
            background: '#1e293b',
            color: '#fff',
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Fechar',
            heightAuto: false
        });

    } finally {
        // Restaura estado do botão (sempre executa)
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed');
        btnSubmit.innerHTML = originalBtnContent;
        if (window.lucide) { window.lucide.createIcons(); }
    }
}