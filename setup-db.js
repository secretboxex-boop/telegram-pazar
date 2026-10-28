import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Client } = pkg;

const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
    try {
        await db.connect();
        console.log("🔗 Veritabanına bağlandı, tablolar oluşturuluyor...");

        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(150),
                is_banned BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chip_wallets (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                available_balance INT DEFAULT 0,
                last_reward_date VARCHAR(20) DEFAULT null,
                reward_week_start VARCHAR(20) DEFAULT null,
                reward_weekly_count INT DEFAULT 0,
                daily_spent_chips INT DEFAULT 0,
                last_spend_date VARCHAR(20) DEFAULT null
            );

            CREATE TABLE IF NOT EXISTS seller_profiles (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                store_name VARCHAR(150),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                seller_id INT REFERENCES seller_profiles(id) ON DELETE CASCADE,
                title TEXT,
                unlock_cost_chips INT DEFAULT 50,
                is_messaging_enabled BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS product_images (
                id SERIAL PRIMARY KEY,
                product_id INT REFERENCES products(id) ON DELETE CASCADE,
                original_storage_key TEXT,
                preview_storage_key TEXT
            );

            CREATE TABLE IF NOT EXISTS product_drafts (
                telegram_id BIGINT PRIMARY KEY,
                title TEXT,
                price INT,
                file_id TEXT
            );

            CREATE TABLE IF NOT EXISTS seller_ratings (
                id SERIAL PRIMARY KEY,
                seller_id INT REFERENCES seller_profiles(id) ON DELETE CASCADE,
                buyer_id INT REFERENCES users(id) ON DELETE CASCADE,
                product_id INT REFERENCES products(id) ON DELETE CASCADE,
                rating INT,
                UNIQUE(buyer_id, product_id)
            );

            CREATE TABLE IF NOT EXISTS withdrawal_requests (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                chips_amount INT,
                tl_amount DECIMAL(10,2),
                iban VARCHAR(100),
                full_name VARCHAR(150),
                status VARCHAR(20) DEFAULT 'BEKLIYOR',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS system_vault (
                id INT PRIMARY KEY,
                total_profit INT DEFAULT 0
            );

            INSERT INTO system_vault (id, total_profit) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
        `);

        console.log("✅ Tüm veritabanı tabloları başarıyla oluşturuldu!");
        await db.end();
        process.exit(0);
    } catch (err) {
        console.error("❌ Hata oluştu:", err);
        process.exit(1);
    }
}

setupDatabase();