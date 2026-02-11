module.exports = {
    ALLOWED_OUS: [
        'OU=AD Power Users,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br',
        'OU=Administradores AD,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br'
    ],
    
    DOMINIO_PADRAO: process.env.AD_DOMAIN || 'soc.com.br',
    DISABLED_OU: 'OU=Desativados,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br'
};