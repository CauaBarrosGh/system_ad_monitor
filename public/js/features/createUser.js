import { refreshAfterUserAction } from "./sectionLoader.js";

// Gera o logon automaticamente (nome.sobrenome)
export function generateLogonName() {
    const firstNameInput = document.getElementById('regFirstName').value.trim();
    const lastNameInput = document.getElementById('regLastName').value.trim();
    const logonInput = document.getElementById('regLogonName');

    if (firstNameInput || lastNameInput) {
        const first = firstNameInput.split(' ')[0] || '';
        const lastParts = lastNameInput.split(' ');
        const last = lastParts.length > 0 ? lastParts[lastParts.length - 1] : '';   

        let baseName = '';
        if (first && last) {
            baseName = `${first}.${last}`;
        } else if (first) {
            baseName = first;
        } else if (last) {
            baseName = last;
        }

        const cleanName = baseName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") 
            .replace(/[^a-z0-9.]/g, "");     

        logonInput.value = cleanName;
    } else {
        logonInput.value = '';
    }
}

// Preenche OU e Grupos baseado no perfil
export function updateOuAndGroup() {
    const profile = document.getElementById('regProfileType').value;
    const ouInput = document.getElementById('regTargetOU');
    const groupInput = document.getElementById('regTargetGroup');

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

    if (map[profile]) {
        ouInput.value = map[profile].ou;
        groupInput.value = map[profile].groups.join('\n'); 
    }
}

export function generateSecurePassword() {
    const passwordInput = document.getElementById('regPassword');
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#";
    let password = "";
    
    password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
    password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
    password += "0123456789"[Math.floor(Math.random() * 10)];                 
    password += "@#"[Math.floor(Math.random() * 2)];                    

    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        password += chars.charAt(randomIndex);
    }

    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    passwordInput.value = password;
}

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

    // SWAL VALIDAÇÃO
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

    // SWAL CONFIRMAÇÃO
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

    // Loading UI no botão
    const originalBtnContent = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-75', 'cursor-not-allowed');
    btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Cadastrando...`;
    if (window.lucide) { window.lucide.createIcons(); }

    try {
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

        const token = localStorage.getItem('token'); 

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
            // SWAL SUCESSO
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
            
            // Limpa tudo
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
            
            await refreshAfterUserAction();

        } else {
            throw new Error(data.error || 'Erro desconhecido retornado pelo servidor.');
        }

    } catch (error) {
        console.error("Erro ao Cadastrar usuário:", error);
        
        // SWAL ERRO
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
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed');
        btnSubmit.innerHTML = originalBtnContent;
        if (window.lucide) { window.lucide.createIcons(); }
    }
}