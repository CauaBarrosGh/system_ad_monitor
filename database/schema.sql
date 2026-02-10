-- Criação do Banco de Dados (caso não exista)
CREATE DATABASE IF NOT EXISTS monitor_ad;
USE monitor_ad;

-- --------------------------------------------------------
-- 1. Tabela de Usuários Ativos (Risk Score & Perfil)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_ad (
    username VARCHAR(100) NOT NULL PRIMARY KEY,
    display_name VARCHAR(255),
    email VARCHAR(255),
    data_inicio DATETIME,             -- Data de admissão/criação
    is_enabled BOOLEAN DEFAULT TRUE,
    last_logon DATETIME,
    role VARCHAR(50),                 -- Ex: DEV, ADMIN, LIDER, COLABORADOR
    job_title VARCHAR(255),           -- Cargo (Description do AD)
    department VARCHAR(100),          -- Departamento calculado ou via AD
    seniority VARCHAR(50),            -- DepartmentNumber do AD
    manager VARCHAR(255),             -- Nome do Gestor
    pwd_last_set DATETIME,            -- Última troca de senha
    bad_pwd_count INT DEFAULT 0,      -- Contagem de erros de senha
    is_admin BOOLEAN DEFAULT FALSE,   -- Se faz parte de grupos administrativos
    pwd_never_expires BOOLEAN DEFAULT FALSE,
    risk_score INT DEFAULT 0,         -- Pontuação de Risco (0-100)
    risk_factors JSON,                -- Array JSON com os motivos do risco
    collected_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- 2. Tabela de Inventário (Computadores & Servidores)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS computers_ad (
    hostname VARCHAR(100) NOT NULL PRIMARY KEY,
    os_name VARCHAR(255),             -- Ex: Windows Server 2019, Windows 10
    os_version VARCHAR(100),
    created_at DATETIME,              -- whenCreated do AD
    last_logon DATETIME,              -- lastLogonTimestamp
    is_active BOOLEAN DEFAULT TRUE,   -- Calculado (Logon < 90 dias)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- 3. Tabela de Histórico (Usuários Desligados)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS disabled_users_ad (
    username VARCHAR(100) NOT NULL PRIMARY KEY,
    display_name VARCHAR(255),
    description TEXT,                 -- Geralmente contém a data/motivo do desligamento
    department VARCHAR(100),
    when_changed DATETIME,            -- Data aproximada da desativação/movimentação
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- 4. Tabela de Auditoria (Opcional - baseada no contexto)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(50),               -- Ex: DESLIGAMENTO, LOGIN
    target VARCHAR(100),              -- Quem sofreu a ação
    executor VARCHAR(100),            -- Quem realizou a ação
    status VARCHAR(20),               -- SUCESSO, ERRO
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);