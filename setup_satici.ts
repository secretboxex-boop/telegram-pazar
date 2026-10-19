import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function saticiTablosuKur() {
    try {
        await client.connect();
        console.log('🔌 Veritabanına bağlanıldı, Satıcı tablosu ekleniyor...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS seller_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                store_name VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                is_verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ "seller_profiles" (Satıcı Profilleri) tablosu başarıyla eklendi!');
    } catch (error) {
        console.error('❌ HATA:', error);
    } finally {
        await client.end();
    }
}

saticiTablosuKur();