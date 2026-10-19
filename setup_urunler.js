"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const client = new pg_1.Client({
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
    }
    catch (error) {
        console.error('❌ HATA:', error);
    }
    finally {
        await client.end();
    }
}
urunTablolariKur();
