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
// .env dosyasındaki şifreleri oku
dotenv.config();
// Veritabanına bağlanma ayarları
const client = new pg_1.Client({
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
    }
    catch (error) {
        console.error('❌ HATA:', error);
    }
    finally {
        await client.end();
    }
}
tablolariKur();
