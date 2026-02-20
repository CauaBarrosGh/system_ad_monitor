// CONGIFURAÇÃO DO ACIVE DIRECTORY (AD)
module.exports = {
    url: process.env.AD_URL,
    baseDN: process.env.AD_BASE,
    username: process.env.AD_USER,
    password: process.env.AD_PASSWORD,
    tlsOptions: { rejectUnauthorized: false }
};