import { Client } from 'pg';
import * as dotenv from 'dotenv';

// .env dosyasındaki şifreleri oku
dotenv.config();

// Veritabanına bağlanma ayarları
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Bulut veritabanı için güvenlik ayarı
});

async function tablolariKur() {
    try {
        await client.connect();
        console.log('🔌 Veritabanına bağlanıldı, tablolar inşa ediliyor...');

        // 1. Kullanıcılar Tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_user_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ "users" (Kullanıcılar) tablosu hazır.');

        // 2. Çip Cüzdanları Tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS chip_wallets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                available_balance INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ "chip_wallets" (Çip Cüzdanları) tablosu hazır.');

        console.log('🎉 BÜTÜN TABLOLAR BAŞARIYLA OLUŞTURULDU!');
    } catch (error) {
        console.error('❌ HATA:', error);
    } finally {
        await client.end();
    }
}

tablolariKur();