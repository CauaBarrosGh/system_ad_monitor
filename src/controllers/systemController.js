const { exec } = require('child_process');
const path = require('path');

exports.runCollector = (req, res) => {
    const collectorPath = path.join(__dirname, '../collector.js');
    
    // Recebe o tipo enviado pelo frontend (users, computers ou vazio)
    const { type } = req.body; 

    // Define a flag baseada no tipo
    let flag = '';
    if (type === 'computers') {
        flag = ' --computers';
    } else if (type === 'users') {
        flag = ' --users';
    }

    console.log(`🔄 [API] Executando coletor. Tipo: ${type || 'COMPLETO'}`);
    
    // Roda o comando com a flag (ex: node collector.js --computers)
    exec(`node "${collectorPath}"${flag}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erro no coletor: ${error.message}`);
            return res.status(500).json({ error: 'Falha na coleta.', details: error.message });
        }
        console.log(stdout);

        res.json({ 
            success: true, 
            message: 'Sincronização finalizada.',
            log: stdout 
        });
    });
};