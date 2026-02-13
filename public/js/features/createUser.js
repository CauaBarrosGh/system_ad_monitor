import { refreshAfterUserAction } from "./sectionLoader.js";

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
    const forcePwdChange = document.getElementById('regForcePwdChange').checked;
    const btnSubmit = document.getElementById('btnSubmitRegister');
    const contractType = document.getElementById('regContractType').value;

    if (!firstName || !lastName || !logonName || !targetOU || !password || !jobTitle || !seniority || !contractType) {
        alert("Por favor, preencha todos os campos obrigatórios.");
        return;
    }

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
            forcePwdChange,
            contractType   
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
            alert(`✨ Usuário ${logonName} provisionado com sucesso no AD!`);
            
            // Limpa o formulário para o próximo cadastro
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
            
            // Recarrega os caches do sistema em background sem mudar a tela atual
            await refreshAfterUserAction();

        } else {
            throw new Error(data.error || 'Erro desconhecido retornado pelo servidor.');
        }

    } catch (error) {
        console.error("Erro ao provisionar usuário:", error);
        alert(`❌ Erro ao criar usuário: ${error.message}`);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-75', 'cursor-not-allowed');
        btnSubmit.innerHTML = originalBtnContent;
        if (window.lucide) { window.lucide.createIcons(); }
    }
}

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