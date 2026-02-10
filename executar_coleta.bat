@echo off
:: --- CONFIGURAÇÃO ---
:: Navega para a pasta do projeto
cd /d "C:\Users\caua.costa\OneDrive - AGE LTDA\Área de Trabalho\monitor-ad"

:: Escreve a data no log
echo [INICIO] Coleta iniciada em %date% as %time% >> coleta.log

:: Executa o coletor e salva o resultado no arquivo coleta.log
node src/collector.js >> coleta.log 2>&1

:: Escreve o fim no log
echo [FIM] Coleta finalizada em %date% as %time% >> coleta.log
echo --------------------------------------------------- >> coleta.log