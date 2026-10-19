import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function urunTablolariKur() {
    try {
        await client.connect();
        console.log('🔌 Veritabanına bağlanıldı, Ürün tabloları ekleniyor...');

        // 1. Kategoriler Tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                is_active BOOLEAN DEFAULT true
            );
        `);
        console.log('✅ Kategoriler tablosu hazır.');

        // 2. Ürünler Tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                seller_id INTEGER REFERENCES seller_profiles(id) ON DELETE CASCADE,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price_amount VARCHAR(50),
                unlock_cost_chips INTEGER DEFAULT 15,
                publication_status VARCHAR(50) DEFAULT 'DRAFT',
                moderation_status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Ürünler tablosu hazır.');

        // 3. Ürün Görselleri (Gizli ve Bulanık Linklerin Tutulduğu Yer)
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_images (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                original_storage_key TEXT NOT NULL,
                preview_storage_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Ürün Görselleri tablosu hazır.');

        console.log('🎉 BÜTÜN ÜRÜN TABLOLARI BAŞARIYLA EKLENDİ!');
    } catch (error) {
        console.error('❌ HATA:', error);
    } finally {
        await client.end();
    }
}

urunTablolariKur();