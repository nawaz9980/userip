const mysql = require('mysql2');
const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
    const { token } = req.query;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'TELEGRAM_BOT_TOKEN'];
    if (requiredEnv.some(key => !process.env[key])) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    if (!token) return res.status(400).send('Verification token is required');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        }).promise();

        // Find user by secure token
        const [users] = await connection.execute('SELECT id FROM users WHERE verify_token = ?', [token]);
        if (users.length === 0) {
            await connection.end();
            return res.status(404).send('Invalid or expired verification link.');
        }
        const id = users[0].id;

        // 0. Always collect the IP first
        await connection.execute('UPDATE users SET ip = ? WHERE id = ?', [ip, id]);

        // 1. VPN / Hosting Detection
        const ipCheck = await fetch(`http://ip-api.com/json/${ip}?fields=status,proxy,hosting`)
            .then(r => r.json())
            .catch(() => ({ status: 'fail' }));

        if (ipCheck.status === 'success' && (ipCheck.proxy || ipCheck.hosting)) {
            await connection.execute('UPDATE users SET is_banned = 1 WHERE id = ?', [id]);
            await connection.end();
            const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
            await bot.sendMessage(id, '❌ Banned: VPN or Proxy detected.');
            return res.status(403).send('VPN detected.');
        }

        // 2. Multi-Account Detection
        const [duplicates] = await connection.execute(
            'SELECT id FROM users WHERE ip = ? AND id != ?',
            [ip, id]
        );

        if (duplicates.length > 0) {
            await connection.execute('UPDATE users SET is_banned = 1 WHERE id = ?', [id]);
            await connection.end();
            const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
            await bot.sendMessage(id, '❌ Banned: Multiple accounts detected from this IP.');
            return res.status(403).send('Multi-account detected.');
        }

        await connection.end();
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
        await bot.sendMessage(id, '✅ Verification Successful!');
        return res.redirect(`https://t.me/botipcollectbot`);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
