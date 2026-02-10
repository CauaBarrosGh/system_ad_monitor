const { exec } = require('child_process');
const path = require('path');

exports.runCollector = (req, res) => {
    const collectorPath = path.join(__dirname, '../collector.js');
    
    // 1. Recebe o tipo enviado pelo frontend (users, computers ou vazio)
    const { type } = req.body; 

    // 2. Define a flag baseada no tipo
    let flag = '';
    if (type === 'computers') {
        flag = ' --computers'; // Espaço antes é importante
    } else if (type === 'users') {
        flag = ' --users';
    }
    // Se não vier nada, flag fica vazia e roda tudo (comportamento padrão)

    console.log(`🔄 [API] Executando coletor. Tipo: ${type || 'COMPLETO'}`);
    
    // 3. Roda o comando com a flag (ex: node collector.js --computers)
    exec(`node "${collectorPath}"${flag}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erro no coletor: ${error.message}`);
            return res.status(500).json({ error: 'Falha na coleta.', details: error.message });
        }

        // Loga o que o collector imprimiu
        console.log(stdout);

        res.json({ 
            success: true, 
            message: 'Sincronização finalizada.',
            log: stdout 
        });
    });
};