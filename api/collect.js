const mysql = require('mysql2');
const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
    const { id } = req.query;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Required Environment Variables in Vercel
    const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'TELEGRAM_BOT_TOKEN'];
    const missingEnv = requiredEnv.filter(key => !process.env[key]);
    
    if (missingEnv.length > 0) {
        return res.status(500).json({ error: 'Missing env variables', missing: missingEnv });
    }

    if (!id) return res.status(400).send('User ID missing');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        }).promise();

        await connection.execute('UPDATE users SET ip = ? WHERE id = ?', [ip, id]);
        await connection.end();

        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
        await bot.sendMessage(id, '✅ Thank you for verifying! Your IP has been recorded.');

        const botUsername = 'botipcollectbot'; 
        return res.redirect(`https://t.me/${botUsername}`);
    } catch (error) {
        return res.status(500).json({ error: 'Error', details: error.message });
    }
};
