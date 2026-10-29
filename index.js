import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import express from 'express';
import pkg from 'pg';
import sharp from 'sharp';
import https from 'https';

dotenv.config();

const { Client } = pkg;
const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN bulunamadı!');

const bot = new Telegraf(token);
const app = express();

app.get('/', (req, res) => {
    res.send('Sunucu aktif ve çalışıyor.');
});

const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

db.connect().then(async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            telegram_user_id BIGINT UNIQUE NOT NULL,
            username VARCHAR(150),
            is_banned BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS jeton_wallets (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            available_balance INT DEFAULT 0,
            last_reward_date VARCHAR(20) DEFAULT null,
            reward_week_start VARCHAR(20) DEFAULT null,
            reward_weekly_count INT DEFAULT 0,
            daily_spent_jetons INT DEFAULT 0,
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
            unlock_cost_jetons INT DEFAULT 50,
            is_messaging_enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE products ADD COLUMN IF NOT EXISTS unlock_cost_jetons INT DEFAULT 50;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS is_messaging_enabled BOOLEAN DEFAULT true;

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
            jetons_amount INT,
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
    `).catch(err => console.error("Tablo oluşturma hatası:", err));

    console.log("✅ Veritabanı ve Kesintisiz Sistem aktif.");
}).catch(err => console.error("❌ Veritabanı hatası:", err));

const PATRON_ID = "1572275874"; 
const PATRON_IBAN = "TR00 0000 0000 0000 0000 0000 00"; 
const PATRON_AD_SOYAD = "İSİM SOYİSİM"; 
const GRUP_ID = "-100XXXXXXXXXX"; 

const sohbetHafizasi = {};
const geciciVeri = {};
const ilanKuyrugu = [];
let kuyrukİsleniyor = false;

async function getSellerBadge(sellerId) {
    try {
        const res = await db.query('SELECT AVG(rating) as avg_rating, COUNT(rating) as total_votes FROM seller_ratings WHERE seller_id = $1', [sellerId]);
        if (res.rows.length > 0 && res.rows[0].total_votes > 0) {
            const avg = parseFloat(res.rows[0].avg_rating).toFixed(1);
            const votes = res.rows[0].total_votes;
            if (avg >= 4.5 && votes >= 2) {
                return ` ⭐ ${avg} (👑 Güvenilir Satıcı)`;
            } else {
                return ` ⭐ ${avg} (${votes} Oy)`;
            }
        }
    } catch(e) {}
    return ' ⭐ Yeni Satıcı';
}

async function ilanKuyrugunuIsle() {
    if (kuyrukİsleniyor || ilanKuyrugu.length === 0) return;
    kuyrukİsleniyor = true;

    while (ilanKuyrugu.length > 0) {
        const ilan = ilanKuyrugu.shift();
        if (!ilan) break;

        try {
            const tumKullanicilar = await db.query('SELECT telegram_user_id FROM users');
            for (const hedefUser of tumKullanicilar.rows) {
                try {
                    await bot.telegram.sendPhoto(hedefUser.telegram_user_id, ilan.blurredFileId, { 
                        caption: ilan.captionText, 
                        ...ilan.butonlar 
                    });
                } catch (err) {}
            }
        } catch (e) {}

        if (ilanKuyrugu.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    kuyrukİsleniyor = false;
}

const anaMenu = Markup.keyboard([
    ['🏪 İlan Ver', '🎁 Günlük Ödül'],
    ['💰 Bakiye Çek', '🪙 Jeton Ekle'],
    ['💬 Admin ile Görüş']
]).resize();

bot.use(async (ctx, next) => {
    if (ctx.from) {
        try {
            const userCheck = await db.query('SELECT is_banned FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            if (userCheck.rows.length > 0 && userCheck.rows[0].is_banned) {
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('❌ BANLANDINIZ!', { show_alert: true }).catch(()=>{});
                } else if (ctx.message) {
                    await ctx.reply('🔨 Hesabınız KALICI OLARAK YASAKLANMIŞTIR.');
                }
                return; 
            }
        } catch (e) {}
    }
    return next();
});

async function sendWelcomeOrHelp(ctx, username) {
    await ctx.reply(
        `🎉 **Özel Pazara Hoş Geldin, ${username}!**\n\n` +
        `📖 **Kullanım Talimatı:**\n` +
        `1️⃣ **İlan Ver:** Kendi mağazanı kurup gizli görseller paylaşabilir ve jeton kazanabilirsin.\n` +
        `2️⃣ **Jeton Harca / İçerik Aç:** Vitrine düşen bulanık görselleri jetonlarını kullanarak açabilirsin.\n` +
        `3️⃣ **Günlük Ödül:** Her gün menüden günlük ödülünü alarak ücretsiz jeton toplayabilirsin.\n` +
        `4️⃣ **Jeton Ekle:** Jeton paketlerini inceleyebilir, kullanılabilir bakiyeni görebilir ve havale/EFT ile bakiye yükleyebilirsin.\n\n` +
        `Aşağıdaki menüyü dilediğin gibi kullanabilirsin! 🚀`,
        { parse_mode: 'Markdown', ...anaMenu }
    );
}

const handleStart = async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'Kullanıcı';

    try {
        const userCheck = await db.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (userCheck.rows.length === 0) {
            const insertUser = await db.query('INSERT INTO users (telegram_user_id, username) VALUES ($1, $2) RETURNING id', [telegramId, username]);
            await db.query('INSERT INTO jeton_wallets (user_id, available_balance) VALUES ($1, $2)', [insertUser.rows[0].id, 100]);
            await sendWelcomeOrHelp(ctx, username);
        } else {
            await ctx.reply(`👋 Tekrar hoş geldin ${username}! İşlemlerine menüden devam edebilirsin:`, anaMenu);
        }
    } catch (error) {}
};

bot.start(handleStart);
bot.command('start', handleStart);

bot.command('admin', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    try {
        const usersCount = await db.query('SELECT COUNT(*) FROM users');
        const sellersCount = await db.query('SELECT COUNT(*) FROM seller_profiles');
        const productsCount = await db.query('SELECT COUNT(*) FROM products');
        const vault = await db.query('SELECT total_profit FROM system_vault WHERE id = 1');
        const karlar = vault.rows[0] ? vault.rows[0].total_profit : 0;
        
        ctx.reply(`👑 **VIP YÖNETİCİ PANELİ** 👑\n\n👥 Kullanıcı: ${usersCount.rows[0].count}\n🏪 Mağaza: ${sellersCount.rows[0].count}\n📦 Ürün: ${productsCount.rows[0].count}\n\n💎 **SİSTEMİN NET KÂRI: ${karlar} Jeton**\n\n🚨 /ban <ID>\n🔨 /gruptancikar <ID>\n🔒 /grubukapat\n🔓 /grubuac\n💸 /jetonekle <ID> <Miktar>\n🗑️ /jetonsil <ID> <Miktar>\n🗑️ /urunsifirla (Tüm Ürünleri Siler)\n📢 /duyuru <Mesaj>\n🏪 /saticilar\n👥 /musteriler`);
    } catch (e) {}
});

bot.command('urunsifirla', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return ctx.reply('❌ Bu komutu kullanmaya yetkin yok.');
    try {
        await db.query('TRUNCATE TABLE product_images, seller_ratings, products RESTART IDENTITY CASCADE;');
        await ctx.reply('✅ Başarılı! Veritabanındaki tüm ürünler, görseller ve değerlendirmeler tamamen silindi.', anaMenu);
    } catch (error) {
        console.error('Ürün sifirlama hatası:', error);
        await ctx.reply(`❌ Ürünler sıfırlanırken bir hata oluştu: ${error.message}`);
    }
});

bot.command('magazadi', async (ctx) => {
    const yeniAd = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!yeniAd) {
        return ctx.reply('❌ Lütfen geçerli bir yeni mağaza adı yazın.\nÖrnek: `/magazadi Petshopya`', { parse_mode: 'Markdown' });
    }

    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0) {
            return ctx.reply('⚠️ Önce /start yazarak kayıt olmalısınız!');
        }
        const userId = userCheck.rows[0].id;

        const sellerCheck = await db.query('SELECT id FROM seller_profiles WHERE user_id = $1', [userId]);
        if (sellerCheck.rows.length === 0) {
            return ctx.reply('❌ Henüz kayıtlı bir mağazanız yok. Önce "İlan Ver" butonunu kullanarak mağazanızı oluşturmalısınız.');
        }

        await db.query('UPDATE seller_profiles SET store_name = $1 WHERE user_id = $2', [yeniAd, userId]);
        await ctx.reply(`✅ Mağaza adınız başarıyla **${yeniAd}** olarak güncellendi!`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Mağaza adı güncelleme hatası:', error);
        await ctx.reply('❌ Mağaza adı değiştirilirken bir veritabanı hatası oluştu.');
    }
});

bot.command('duyuru', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) {
        return ctx.reply('Bu komutu kullanmaya yetkin yok.');
    }

    const broadcastText = ctx.message.text.split(' ').slice(1).join(' ');
    if (!broadcastText) {
        return ctx.reply('Lütfen duyuru metnini yazın.\nÖrnek: /duyuru Yeni ürünler eklendi!');
    }

    await ctx.reply('📢 Özel duyuru gönderimi başlatıldı, lütfen bekleyin...');

    try {
        const result = await db.query('SELECT telegram_user_id FROM users');
        const users = result.rows;

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.telegram_user_id, broadcastText, {
                    parse_mode: 'Markdown'
                });
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                failCount++;
            }
        }

        await ctx.reply(`✅ Duyuru başarıyla tamamlandı!\n\nBaşarılı Özel Gönderim: ${successCount}\nBaşarısız (Botu engelleyenler): ${failCount}`);
    } catch (err) {
        console.error('Duyuru hatası:', err);
        await ctx.reply('❌ Duyuru gönderilirken bir veritabanı hatası oluştu.');
    }
});

bot.command('saticilar', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    try {
        const saticilar = await db.query(`
            SELECT s.id, s.store_name, u.telegram_user_id, w.available_balance 
            FROM seller_profiles s
            JOIN users u ON s.user_id = u.id
            JOIN jeton_wallets w ON u.id = w.user_id
            ORDER BY w.available_balance DESC LIMIT 20
        `);

        if (saticilar.rows.length === 0) return ctx.reply('Henüz hiç satıcı mağazası yok.');

        let mesaj = `🏆 **SATICI CÜZDANLARI VE PUANLARI** 🏆\n\n`;
        for (let i = 0; i < saticilar.rows.length; i++) {
            const sat = saticilar.rows[i];
            const rozet = await getSellerBadge(sat.id);
            mesaj += `${i + 1}. 🏪 ${sat.store_name} | 🪙 ${sat.available_balance} Jeton${rozet}\n(ID: \`${sat.telegram_user_id}\`)\n\n`;
        }
        ctx.reply(mesaj, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply('❌ Liste çekilemedi.');
    }
});

bot.command('musteriler', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    try {
        const musteriler = await db.query(`
            SELECT u.username, u.telegram_user_id, w.available_balance, w.daily_spent_jetons, w.last_spend_date 
            FROM users u
            JOIN jeton_wallets w ON u.id = w.user_id
            LEFT JOIN seller_profiles s ON u.id = s.user_id
            WHERE s.id IS NULL
            ORDER BY w.available_balance DESC LIMIT 20
        `);

        if (musteriler.rows.length === 0) return ctx.reply('Sistemde müşteri yok.');

        const bugun = new Date().toISOString().split('T')[0];
        let mesaj = `👥 **MÜŞTERİ CÜZDANLARI VE VIP DURUMU** 👥\n\n`;
        musteriler.rows.forEach((mus, index) => {
            const isim = mus.username || "İsimsiz";
            const spent = (mus.last_spend_date === bugun) ? (mus.daily_spent_jetons || 0) : 0;
            const isVip = spent >= 1500 ? "👑 [VIP ALICI]" : "";
            mesaj += `${index + 1}. 👤 ${isim} | 🪙 ${mus.available_balance} Jeton | Bugün Harcanan: ${spent} Jeton ${isVip}\n(ID: \`${mus.telegram_user_id}\`)\n\n`;
        });
        ctx.reply(mesaj, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply('❌ Liste çekilemedi.');
    }
});

bot.command('jetonekle', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length !== 2) {
        return ctx.reply('❌ Doğru Kullanım:\n`/jetonekle <Kullanici_ID> <Miktar>`\nÖrnek: `/jetonekle 1572275874 5000`', { parse_mode: 'Markdown' });
    }

    const hedefTelegramId = args[0].trim();
    const eklenecekJeton = Number(args[1]);

    if (isNaN(eklenecekJeton) || eklenecekJeton <= 0) {
        return ctx.reply('❌ Lütfen geçerli bir çip/jeton miktarı yazın.');
    }

    try {
        let userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [hedefTelegramId]);
        let userId;

        if (userCheck.rows.length === 0) {
            const newUser = await db.query('INSERT INTO users (telegram_user_id, username) VALUES ($1, $2) RETURNING id', [hedefTelegramId, 'Kullanici']);
            userId = newUser.rows[0].id;
        } else {
            userId = userCheck.rows[0].id;
        }

        let walletCheck = await db.query('SELECT id FROM jeton_wallets WHERE user_id = $1', [userId]);
        if (walletCheck.rows.length === 0) {
            await db.query('INSERT INTO jeton_wallets (user_id, available_balance) VALUES ($1, $2)', [userId, eklenecekJeton]);
        } else {
            await db.query('UPDATE jeton_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [eklenecekJeton, userId]);
        }

        const finalWallet = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userId]);
        const yeniBakiye = finalWallet.rows[0].available_balance;

        await ctx.reply(`✅ **İşlem Başarılı!**\n🆔 \`${hedefTelegramId}\` ID'li hesaba *${eklenecekJeton} Jeton* eklendi.\n🪙 Yeni Toplam Bakiye: *${yeniBakiye} Jeton*`, { parse_mode: 'Markdown' });
        
        bot.telegram.sendMessage(hedefTelegramId, `🎉 Hesabınıza yönetici tarafından **${eklenecekJeton} Jeton** eklendi! Güncel bakiyeniz: ${yeniBakiye} Jeton.`, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (error) {
        console.error("jetonekle hatasi:", error);
        await ctx.reply('❌ Veritabanında çip/jeton eklenirken bir hata oluştu.');
    }
});

bot.command('jetonsil', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length !== 2) {
        return ctx.reply('❌ Doğru kullanım:\n`/jetonsil 1572275874 100`', { parse_mode: 'Markdown' });
    }

    const hedefTelegramId = args[0].trim();
    const silinecekJeton = Number(args[1]);

    if (isNaN(silinecekJeton) || silinecekJeton <= 0) {
        return ctx.reply('❌ Lütfen geçerli bir jeton miktarı yazın.');
    }

    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [hedefTelegramId]);
        if (userCheck.rows.length === 0) {
            return ctx.reply('❌ Bu Telegram ID\'ye sahip bir kullanıcı veritabanında bulunamadı.');
        }

        const userId = userCheck.rows[0].id;
        const walletCheck = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userId]);
        if (walletCheck.rows.length === 0) {
            return ctx.reply('❌ Kullanıcının cüzdan kaydı bulunamadı.');
        }

        await db.query('UPDATE jeton_wallets SET available_balance = GREATEST(available_balance - $1, 0) WHERE user_id = $2', [silinecekJeton, userId]);

        const finalWallet = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userId]);
        const yeniBakiye = finalWallet.rows[0].available_balance;

        await ctx.reply(`🗑️ Başarılı!\n🆔 \`${hedefTelegramId}\` ID'li hesaptan *${silinecekJeton} Jeton* silindi.\n🪙 Güncel Kalan Bakiye: *${yeniBakiye} Jeton*`, { parse_mode: 'Markdown' });
        bot.telegram.sendMessage(hedefTelegramId, `⚠️ Hesabınızdan yönetici tarafından **${silinecekJeton} Jeton** silindi. Güncel bakiyeniz: ${yeniBakiye} Jeton.`, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (error) {
        await ctx.reply('❌ Veritabanından jeton silinirken bir hata oluştu.');
    }
});

bot.command('ban', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length !== 2) return ctx.reply('❌ Kullanım: /ban 123456789');
    
    try {
        await db.query('UPDATE users SET is_banned = true WHERE telegram_user_id = $1', [parts[1]]);
        ctx.reply(`🔨 ${parts[1]} SİSTEMDEN BANLANDI!`);
    } catch (e) {}
});

bot.command('gruptancikar', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length !== 2) return ctx.reply('❌ Kullanım: `/gruptancikar <Kullanici_ID>`', { parse_mode: 'Markdown' });
    
    const hedefId = parts[1].trim();

    try {
        await bot.telegram.banChatMember(GRUP_ID, hedefId);
        await bot.telegram.unbanChatMember(GRUP_ID, hedefId).catch(()=>{});
        await db.query('UPDATE users SET is_banned = true WHERE telegram_user_id = $1', [hedefId]).catch(()=>{});

        ctx.reply(`✅ \`${hedefId}\` ID'li kullanıcı gruptan ve sistemden başarıyla çıkarıldı!`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply('❌ Kullanıcı gruptan çıkarılamadı.');
    }
});

bot.command('grubukapat', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    try {
        await bot.telegram.setChatPermissions(GRUP_ID, {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false
        });
        ctx.reply('🔒 Grup başarıyla kapatıldı! Artık sadece yöneticiler mesaj yazabilir.');
    } catch (e) {
        ctx.reply('❌ Grup izinleri değiştirilemedi.');
    }
});

bot.command('grubuac', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return;
    try {
        await bot.telegram.setChatPermissions(GRUP_ID, {
            can_send_messages: true,
            can_send_media_messages: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
            can_change_info: false,
            can_invite_users: true,
            can_pin_messages: false
        });
        ctx.reply('🔓 Grup açıldı! Artık herkes mesaj yazabilir.');
    } catch (e) {
        ctx.reply('❌ Grup izinleri değiştirilemedi.');
    }
});

const bakiyeCekIslemiBaslat = async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0) return ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        
        const userId = userCheck.rows[0].id;
        const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userId]);
        
        if (sellerCheck.rows.length === 0) {
            return ctx.reply('❌ Bu özellik yalnızca **Kayıtlı Satıcılar** içindir!\n\nMağaza açmak ve bakiye çekebilmek için menüden **"🏪 İlan Ver"** butonuna basarak mağazanızı oluşturabilirsiniz.', anaMenu);
        }

        const walletCheck = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userId]);
        const mevcutBakiye = walletCheck.rows[0] ? walletCheck.rows[0].available_balance : 0;

        sohbetHafizasi[ctx.from.id] = 'CEKIM_JETON_BEKLENIYOR';
        geciciVeri[ctx.from.id] = {};
        
        if (ctx.chat.type !== 'private') {
            await ctx.answerCbQuery('⚠️ Güvenliğiniz için bakiye çekim işlemini botun özel sohbetinden başlatmalısınız.', { show_alert: true });
            try {
                await bot.telegram.sendMessage(
                    ctx.from.id,
                    `💸 **Bakiye Çekim Talebi**\n\n` +
                    `🪙 **Mevcut Bakiyeniz:** *${mevcutBakiye} Jeton*\n\n` +
                    `Çekmek istediğiniz **Jeton** miktarını yazın (Minimum 20.000 Jeton):`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {}
            return;
        }

        await ctx.reply(
            `💸 **Bakiye Çekim Talebi**\n\n` +
            `🪙 **Mevcut Bakiyeniz:** *${mevcutBakiye} Jeton*\n\n` +
            `Çekmek istediğiniz **Jeton** miktarını yazın (Minimum 20.000 Jeton):`,
            { parse_mode: 'Markdown', ...anaMenu }
        );
    } catch (e) {
        ctx.reply('❌ Bir hata oluştu.', anaMenu);
    }
};

bot.hears(['💰 Bakiye Çek', 'Bakiye Çek'], bakiyeCekIslemiBaslat);
bot.command('bakiyecek', bakiyeCekIslemiBaslat);

bot.hears(['💬 Admin ile Görüş', 'Admin ile Görüş'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    
    if (ctx.chat.type !== 'private') {
        try {
            await bot.telegram.sendMessage(
                ctx.from.id,
                `💬 **Yönetici ile İletişim**\n\nSoru, öneri, sorun bildirimleri veya ödeme bildirimleri (dekont) için aşağıdaki butonu kullanarak doğrudan yöneticiye ulaşabilirsin:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        Markup.button.url('💬 Admin\'e Mesaj Gönder', `tg://user?id=${PATRON_ID}`)
                    ])
                }
            );
            await ctx.answerCbQuery('💬 Bilgiler özel mesajınıza gönderildi.', { show_alert: false });
        } catch (e) {
            await ctx.answerCbQuery('⚠️ Lütfen önce bot ile özel sohbeti (private chat) başlatın.', { show_alert: true });
        }
        return;
    }

    await ctx.reply(`💬 **Yönetici ile İletişim**\n\nSoru, öneri, sorun bildirimleri veya ödeme bildirimleri (dekont) için aşağıdaki butonu kullanarak doğrudan yöneticiye ulaşabilirsin:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            Markup.button.url('💬 Admin\'e Mesaj Gönder', `tg://user?id=${PATRON_ID}`)
        ])
    });
});

bot.hears(['🪙 Jeton Ekle', 'Jeton Ekle'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    
    const telegramId = ctx.from.id;
    let bakiye = 0;

    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (userCheck.rows.length > 0) {
            const walletCheck = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userCheck.rows[0].id]);
            if (walletCheck.rows.length > 0) {
                bakiye = walletCheck.rows[0].available_balance;
            }
        }
    } catch (e) {}

    const paketMesaji = 
        `🪙 **JETON EKLE VE PAKETLER**\n\n` +
        `Kullanılabilir Bakiyeniz: \`${bakiye} Jeton\`\n\n` +
        `• 250 Jeton ➔ \`110 ₺\`\n` +
        `• 1.000 Jeton ➔ \`375 ₺\`\n` +
        `• 2.500 Jeton ➔ \`875 ₺\`\n` +
        `• 5.000 Jeton ➔ \`1.650 ₺\`\n\n` +
        `Yüklemek istediğiniz paketi seçmek için aşağıdaki butonları kullanabilirsiniz:`;

    const paketButonlari = Markup.inlineKeyboard([
        [Markup.button.callback('💳 250 Jeton Yükle (110 ₺)', 'paket_yukle_250_110')],
        [Markup.button.callback('💳 1.000 Jeton Yükle (375 ₺)', 'paket_yukle_1000_375')],
        [Markup.button.callback('💳 2.500 Jeton Yükle (875 ₺)', 'paket_yukle_2500_875')],
        [Markup.button.callback('💳 5.000 Jeton Yükle (1.650 ₺)', 'paket_yukle_5000_1650')]
    ]);

    if (ctx.chat.type !== 'private') {
        try {
            await bot.telegram.sendMessage(telegramId, paketMesaji, { parse_mode: 'Markdown', ...paketButonlari });
            await ctx.answerCbQuery('🪙 Jeton ekleme seçenekleri özel mesajınıza gönderildi!', { show_alert: false });
        } catch (e) {
            await ctx.answerCbQuery('⚠️ Lütfen önce bot ile özel sohbeti (private chat) başlatın.', { show_alert: true });
        }
        return;
    }

    await ctx.reply(paketMesaji, { parse_mode: 'Markdown', ...paketButonlari });
});

bot.action(/paket_yukle_(\d+)_(\d+)/, async (ctx) => {
    const jetonMiktari = ctx.match[1];
    const tlFiyati = ctx.match[2];
    const userId = ctx.from.id;

    await ctx.answerCbQuery(`✅ ${jetonMiktari} Jeton paketi seçildi!`);

    await ctx.reply(`💳 **Seçilen Paket:** \`${jetonMiktari} Jeton (${tlFiyati} ₺)\``, { parse_mode: 'Markdown' });
    
    await ctx.reply(`🏦 **IBAN Numarası:**`, { parse_mode: 'Markdown' });
    await ctx.reply(`\`${PATRON_IBAN}\``, { parse_mode: 'Markdown' });

    await ctx.reply(`👤 **Alıcı Ad Soyad:**`, { parse_mode: 'Markdown' });
    await ctx.reply(`\`${PATRON_AD_SOYAD}\``, { parse_mode: 'Markdown' });

    await ctx.reply(`✍️ **Açıklamaya Yazılacak ID Numarası:**`, { parse_mode: 'Markdown' });
    await ctx.reply(`\`${userId}\``, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.url('💬 Dekontu Admin\'e Gönder', `tg://user?id=${PATRON_ID}`)]
        ])
    });
});

bot.hears(['🎁 Günlük Ödül', 'Günlük Ödül'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0) return ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        
        const userId = userCheck.rows[0].id;
        const wallet = await db.query('SELECT available_balance, last_reward_date, reward_week_start, reward_weekly_count, daily_spent_jetons, last_spend_date FROM jeton_wallets WHERE user_id = $1', [userId]);
        
        const balance = wallet.rows[0].available_balance;
        const lastDate = wallet.rows[0].last_reward_date;
        let weekStart = wallet.rows[0].reward_week_start;
        let weeklyCount = wallet.rows[0].reward_weekly_count || 0;
        const dailySpent = wallet.rows[0].daily_spent_jetons || 0;
        const lastSpendDate = wallet.rows[0].last_spend_date;
        
        const bugun = new Date().toISOString().split('T')[0];
        const currentTime = new Date().getTime();

        if (weekStart) {
            const weekStartTime = new Date(weekStart).getTime();
            if ((currentTime - weekStartTime) / (1000 * 3600 * 24) >= 7) {
                weekStart = bugun;
                weeklyCount = 0;
            }
        } else {
            weekStart = bugun;
            weeklyCount = 0;
        }

        if (weeklyCount >= 5) return ctx.reply('⚠️ **Haftalık Bedava Sınırı Doldu!**', anaMenu);
        if (lastDate === bugun) return ctx.reply('⏳ **Bugünkü ödül hakkınızı kullandınız!**', anaMenu);
        
        const isVipToday = (lastSpendDate === bugun && dailySpent >= 1500);
        
        let odul = 0;
        let vipMesaj = "";
        if (isVipToday) {
            odul = Math.floor(Math.random() * 11) + 10;
            vipMesaj = "\n👑 **VIP ALICI ÖDÜLÜ UYGULANDI!** (Bugün 1500+ jeton harcadığın için)";
        } else {
            odul = Math.floor(Math.random() * 3) + 2;
        }

        weeklyCount += 1;
        
        await db.query('UPDATE jeton_wallets SET available_balance = available_balance + $1, last_reward_date = $2, reward_week_start = $3, reward_weekly_count = $4 WHERE user_id = $5', [odul, bugun, weekStart, weeklyCount, userId]);
        
        if (ctx.chat.type !== 'private') {
            await ctx.answerCbQuery(`🎁 ${odul} Jeton kazandın! Detaylar özel mesajına gönderildi.`, { show_alert: false });
            try {
                await bot.telegram.sendMessage(ctx.from.id, `🎁 **TEBRİKLER!** ${odul} Jeton kazandın!${vipMesaj}\n🪙 Yeni Bakiyen: ${balance + odul} Jeton`, { parse_mode: 'Markdown' });
            } catch (e) {}
            return;
        }

        ctx.reply(`🎁 **TEBRİKLER!** ${odul} Jeton kazandın!${vipMesaj}\n🪙 Yeni Bakiyen: ${balance + odul} Jeton`, anaMenu);
    } catch (e) {}
});

bot.hears(['🏪 İlan Ver', 'İlan Ver'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    delete geciciVeri[ctx.from.id];
    
    if (ctx.chat.type !== 'private') {
        try {
            await bot.telegram.sendMessage(
                ctx.from.id,
                `🏪 **İlan Ver / Mağaza Yönetimi**\n\nMağaza açmak ve ilan yönetmek için aşağıdaki adımdan devam edebilirsiniz:`,
                { parse_mode: 'Markdown' }
            );
            const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            if (userCheck.rows.length === 0) {
                await bot.telegram.sendMessage(ctx.from.id, '⚠️ Önce /start yazarak kayıt ol!', anaMenu);
                await ctx.answerCbQuery('⚠️ İlan verme adımları için botun özel mesajına yönlendirildiniz.', { show_alert: true });
                return;
            }
            const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userCheck.rows[0].id]);
            if (sellerCheck.rows.length > 0) {
                sohbetHafizasi[ctx.from.id] = 'URUN_ISMI_BEKLENIYOR';
                geciciVeri[ctx.from.id] = {};
                await db.query('INSERT INTO product_drafts (telegram_id, title, price, file_id) VALUES ($1, NULL, NULL, NULL) ON CONFLICT (telegram_id) DO UPDATE SET title = NULL, price = NULL, file_id = NULL', [ctx.from.id]);
                await bot.telegram.sendMessage(ctx.from.id, 'Lütfen ürünün Başlığını yaz:');
            } else {
                sohbetHafizasi[ctx.from.id] = 'MAGAZA_ISMI_BEKLENIYOR';
                geciciVeri[ctx.from.id] = {};
                await bot.telegram.sendMessage(ctx.from.id, 'İlan verebilmek için önce bir Mağaza Adı yazıp gönder:');
            }
            await ctx.answerCbQuery('🏪 İlan verme adımları özel mesajınıza gönderildi!', { show_alert: false });
        } catch (e) {
            await ctx.answerCbQuery('⚠️ Lütfen önce bot ile özel sohbeti (private chat) başlatın.', { show_alert: true });
        }
        return;
    }

    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0) return ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        
        const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userCheck.rows[0].id]);
        if (sellerCheck.rows.length > 0) {
            sohbetHafizasi[ctx.from.id] = 'URUN_ISMI_BEKLENIYOR';
            geciciVeri[ctx.from.id] = {};
            await db.query('INSERT INTO product_drafts (telegram_id, title, price, file_id) VALUES ($1, NULL, NULL, NULL) ON CONFLICT (telegram_id) DO UPDATE SET title = NULL, price = NULL, file_id = NULL', [ctx.from.id]);
            ctx.reply('Lütfen ürünün Başlığını yaz:', anaMenu); 
        } else {
            sohbetHafizasi[ctx.from.id] = 'MAGAZA_ISMI_BEKLENIYOR';
            geciciVeri[ctx.from.id] = {};
            ctx.reply('İlan verebilmek için önce bir Mağaza Adı yazıp gönder:', anaMenu);
        }
    } catch (error) {}
});

// KESİN ÇÖZÜM: answerOnce ile butona basıldığı an pop-up ve sonrasında Jeton Ekle butonlu mesaj iletilir
bot.action(/urunu_ac_(\d+)_(\d+)/, async (ctx) => {
    let callbackAnswered = false;
    async function answerOnce(message, options = {}) {
        if (callbackAnswered) return;
        try {
            await ctx.answerCbQuery(message, options);
            callbackAnswered = true;
        } catch (err) {
            console.error('Callback yanıtlanamadı:', err.message);
        }
    }

    const client = await db.connect();
    try {
        const productId = ctx.match[1];
        const displayedCost = Number(ctx.match[2]);
        const telegramId = ctx.from.id;

        if (!Number.isSafeInteger(displayedCost) || displayedCost <= 0) {
            return await answerOnce('❌ Geçersiz ürün fiyatı.', { show_alert: true });
        }

        // 1. Alıcı kullanıcı kontrolü
        const buyerCheck = await client.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (buyerCheck.rows.length === 0) {
            return await answerOnce('❌ Önce /start komutunu kullanarak kayıt olun.', { show_alert: true });
        }
        const buyerId = buyerCheck.rows[0].id;

        // 2. Ürün, gerçek fiyat ve satıcı bilgilerini veritabanından güvenli şekilde çek
        const urunSorgu = await client.query(`
            SELECT p.id, p.seller_id, p.unlock_cost_jetons, p.is_messaging_enabled,
                   s.user_id AS seller_user_id, u.telegram_user_id AS seller_telegram_id
            FROM products p
            JOIN seller_profiles s ON p.seller_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE p.id = $1
        `, [productId]);

        if (urunSorgu.rows.length === 0) {
            return await answerOnce('❌ Ürün bulunamadı.', { show_alert: true });
        }

        const sellerInfo = urunSorgu.rows[0];
        const gercekFiyat = Number(sellerInfo.unlock_cost_jetons);

        if (!Number.isSafeInteger(gercekFiyat) || gercekFiyat <= 0) {
            return await answerOnce('❌ Ürün fiyatı geçersiz.', { show_alert: true });
        }

        if (String(telegramId) === String(sellerInfo.seller_telegram_id)) {
            return await answerOnce('⚠️ Kendi ilanını açamazsın.', { show_alert: true });
        }

        // 3. Orijinal görsel kontrolü (Ödeme yapmadan önce doğrulanır)
        const photoCheck = await client.query(`
            SELECT original_storage_key
            FROM product_images
            WHERE product_id = $1
            LIMIT 1
        `, [productId]);

        if (photoCheck.rows.length === 0 || !photoCheck.rows[0].original_storage_key) {
            return await answerOnce('❌ Bu ürünün orijinal görseli bulunamadı. Jeton alınmadı.', { show_alert: true });
        }

        const originalPhotoId = photoCheck.rows[0].original_storage_key;

        // 4. Cüzdan kontrolü
        const buyerWallet = await client.query(`
            SELECT available_balance, daily_spent_jetons, last_spend_date
            FROM jeton_wallets
            WHERE user_id = $1
        `, [buyerId]);

        if (buyerWallet.rows.length === 0) {
            return await answerOnce('❌ Cüzdanınız bulunamadı. Lütfen /start komutunu kullanın.', { show_alert: true });
        }

        const currentBalance = Number(buyerWallet.rows[0].available_balance);

        if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
            console.error('Geçersiz cüzdan bakiyesi:', { buyerId, productId });
            return await answerOnce('❌ Cüzdan bilgisi doğrulanamadı. Lütfen tekrar deneyin.', { show_alert: true });
        }

        // 5. Yetersiz bakiye durumu ("❌ Yetersiz jeton!" uyarısı ve Jeton Ekle butonu)
        if (currentBalance < gercekFiyat) {
            await answerOnce('❌ Yetersiz jeton!', { show_alert: true });

            try {
                await bot.telegram.sendMessage(
                    telegramId,
                    `❌ Yetersiz jeton!\n\n` +
                    `🪙 Mevcut jetonun: ${currentBalance}\n` +
                    `🔒 Gereken jeton: ${gercekFiyat}\n` +
                    `➕ Eksik jeton: ${Math.max(0, gercekFiyat - currentBalance)}`,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🪙 Jeton Ekle', 'menu_jeton_ekle')]
                        ])
                    }
                );
            } catch (err) {
                console.error('Yetersiz jeton mesajı gönderilemedi:', {
                    telegramId,
                    error: err.message
                });
            }
            return;
        }

        // 6. PostgreSQL Transaction Başlat (Atomik ve Tutarlı İşlemler)
        await client.query('BEGIN');

        // Cüzdanı kilit altında tekrar doğrula (Race condition / Çift ödeme koruması)
        const lockedWallet = await client.query(`
            SELECT available_balance, daily_spent_jetons, last_spend_date
            FROM jeton_wallets
            WHERE user_id = $1
            FOR UPDATE
        `, [buyerId]);

        const lockedBalance = Number(lockedWallet.rows[0].available_balance);
        if (lockedBalance < gercekFiyat) {
            await client.query('ROLLBACK');
            return await answerOnce('❌ Yetersiz jeton!', { show_alert: true });
        }

        const bugun = new Date().toISOString().split('T')[0];
        let currentDailySpent = lockedWallet.rows[0].daily_spent_jetons || 0;
        let lastSpendDate = lockedWallet.rows[0].last_spend_date;

        if (lastSpendDate !== bugun) {
            currentDailySpent = 0;
            lastSpendDate = bugun;
        }
        currentDailySpent += gercekFiyat;

        const komisyon = Math.floor(gercekFiyat * 0.10);
        const saticiKazanci = gercekFiyat - komisyon;
        const newBalance = lockedBalance - gercekFiyat;

        // Atomik koşullu bakiye düşümü
        const updateWallet = await client.query(`
            UPDATE jeton_wallets
            SET available_balance = available_balance - $1,
                daily_spent_jetons = $2,
                last_spend_date = $3
            WHERE user_id = $4 AND available_balance >= $1
            RETURNING available_balance
        `, [gercekFiyat, currentDailySpent, lastSpendDate, buyerId]);

        if (updateWallet.rowCount === 0) {
            await client.query('ROLLBACK');
            return await answerOnce('❌ Ödeme sırasında eşzamanlılık hatası oluştu.', { show_alert: true });
        }

        // Satıcı kazancı ve sistem kârını ekle
        await client.query('UPDATE jeton_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [saticiKazanci, sellerInfo.seller_user_id]);
        await client.query('UPDATE system_vault SET total_profit = total_profit + $1 WHERE id = 1', [komisyon]).catch(() => {});

        // Transaction onaylanır
        await client.query('COMMIT');

        // 7. Görsel sunumu ve telafi (Refund) mekanizması
        try {
            await answerOnce(`✅ Başarılı! ${gercekFiyat} Jeton harcandı.`, { show_alert: false });

            const ozelMesajBedeli = Math.ceil(gercekFiyat * 1.5);
            let inlineButtons = [
                [
                    Markup.button.callback('⭐ 1', `rate_${productId}_1`),
                    Markup.button.callback('⭐ 2', `rate_${productId}_2`),
                    Markup.button.callback('⭐ 3', `rate_${productId}_3`),
                    Markup.button.callback('⭐ 4', `rate_${productId}_4`),
                    Markup.button.callback('⭐ 5', `rate_${productId}_5`)
                ]
            ];

            if (sellerInfo.is_messaging_enabled) {
                inlineButtons.push([Markup.button.callback(`✉️ Satıcıyla Özel Mesajlaş ( ${ozelMesajBedeli} Jeton )`, `ozel_mesaj_${productId}_${ozelMesajBedeli}`)]);
            }

            await ctx.editMessageMedia({
                type: 'photo',
                media: originalPhotoId,
                caption: `🔓 İŞTE GİZLİ GÖRSEL!\n\n💸 Bedel: ${gercekFiyat} Jeton\n⭐ Bu satıcıyı ve ürünü değerlendir:`
            }, {
                reply_markup: Markup.inlineKeyboard(inlineButtons).reply_markup
            }).catch(async () => {
                await ctx.replyWithPhoto(originalPhotoId, {
                    caption: `🔓 İŞTE GİZLİ GÖRSEL!\n\n💸 Bedel: ${gercekFiyat} Jeton\n⭐ Bu satıcıyı ve ürünü değerlendir:`,
                    ...Markup.inlineKeyboard(inlineButtons)
                });
                await ctx.deleteMessage().catch(() => {});
            });

            await bot.telegram.sendMessage(telegramId, `🔓 Görsel başarıyla açıldı!\n🪙 Kalan Bakiyeniz: ${newBalance} Jeton`, { parse_mode: 'Markdown' }).catch(() => {});
            bot.telegram.sendMessage(sellerInfo.seller_telegram_id, `💸 MÜJDE! Bir kullanıcı görselinizi açtı!\n🪙 Net Kazancınız: ${saticiKazanci} Jeton eklendi!`).catch(() => {});

        } catch (mediaError) {
            // Telafi mekanizması: Fotoğraf gönderimi başarısız olursa jetonları güvenle iade et
            await db.query('UPDATE jeton_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [gercekFiyat, buyerId]);
            await db.query('UPDATE jeton_wallets SET available_balance = available_balance - $1 WHERE user_id = $2', [saticiKazanci, sellerInfo.seller_user_id]);
            await db.query('UPDATE system_vault SET total_profit = total_profit - $1 WHERE id = 1', [komisyon]).catch(() => {});

            console.error('Görsel gönderim hatası, jetonlar güvenle iade edildi:', mediaError.message);
            await answerOnce('❌ Görsel yüklenirken bir hata oluştu, jetonunuz hesabınıza iade edildi.', { show_alert: true });
        }

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) {}
        console.error('Gizli ürün ödeme işlemi başarısız:', {
            productId: ctx.match[1],
            error: err.message
        });
        await answerOnce('❌ İşlem sırasında beklenmeyen bir hata oluştu.', { show_alert: true });
    } finally {
        client.release();
    }
});

bot.action('menu_jeton_ekle', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    let bakiye = 0;

    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (userCheck.rows.length > 0) {
            const walletCheck = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userCheck.rows[0].id]);
            if (walletCheck.rows.length > 0) {
                bakiye = walletCheck.rows[0].available_balance;
            }
        }
    } catch (e) {}

    try {
        await bot.telegram.sendMessage(
            telegramId,
            `🪙 **JETON EKLE VE PAKETLER**\n\n` +
            `Kullanılabilir Bakiyeniz: \`${bakiye} Jeton\`\n\n` +
            `• 250 Jeton ➔ \`110 ₺\`\n` +
            `• 1.000 Jeton ➔ \`375 ₺\`\n` +
            `• 2.500 Jeton ➔ \`875 ₺\`\n` +
            `• 5.000 Jeton ➔ \`1.650 ₺\`\n\n` +
            `Yüklemek istediğiniz paketi seçmek için aşağıdaki butonları kullanabilirsiniz:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💳 250 Jeton Yükle (110 ₺)', 'paket_yukle_250_110')],
                    [Markup.button.callback('💳 1.000 Jeton Yükle (375 ₺)', 'paket_yukle_1000_375')],
                    [Markup.button.callback('💳 2.500 Jeton Yükle (875 ₺)', 'paket_yukle_2500_875')],
                    [Markup.button.callback('💳 5.000 Jeton Yükle (1.650 ₺)', 'paket_yukle_5000_1650')]
                ])
            }
        );
    } catch (e) {}
});

bot.action(/rate_(\d+)_([1-5])/, async (ctx) => {
    try {
        const productId = ctx.match[1];
        const rating = parseInt(ctx.match[2]);
        const telegramId = ctx.from.id;

        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (userCheck.rows.length === 0) return ctx.answerCbQuery('❌ Hata.', { show_alert: true });
        const buyerId = userCheck.rows[0].id;

        const prodCheck = await db.query('SELECT seller_id, unlock_cost_jetons, is_messaging_enabled FROM products WHERE id = $1', [productId]);
        if (prodCheck.rows.length === 0) return ctx.answerCbQuery('❌ Ürün bulunamadı.', { show_alert: true });
        const cost = prodCheck.rows[0].unlock_cost_jetons || 50;
        const ozelMesajBedeli = Math.ceil(cost * 1.5);
        const isMessagingEnabled = prodCheck.rows[0].is_messaging_enabled;

        const existingRating = await db.query('SELECT id FROM seller_ratings WHERE buyer_id = $1 AND product_id = $2', [buyerId, productId]);
        if (existingRating.rows.length > 0) {
            return ctx.answerCbQuery('⚠️ Bu ürün için zaten oy kullandınız!', { show_alert: true });
        }

        await db.query('INSERT INTO seller_ratings (seller_id, buyer_id, product_id, rating) VALUES ($1, $2, $3, $4)', [prodCheck.rows[0].seller_id, buyerId, productId, rating]);

        await ctx.answerCbQuery(`✅ Teşekkürler! ${rating} yıldız verdiniz.`, { show_alert: true });
        
        let inlineKeys = [];
        if (isMessagingEnabled) {
            inlineKeys.push([Markup.button.callback(`✉️ Satıcıyla Özel Mesajlaş ( ${ozelMesajBedeli} Jeton )`, `ozel_mesaj_${productId}_${ozelMesajBedeli}`)]);
        }

        await ctx.editMessageReplyMarkup({ inline_keyboard: inlineKeys }).catch(() => {});
        try {
            await bot.telegram.sendMessage(telegramId, `⭐ Satıcıya **${rating} Yıldız** verdiniz. Geri bildiriminiz için teşekkürler!`, { parse_mode: 'Markdown' });
        } catch(e) {}
    } catch (e) {
        await ctx.answerCbQuery('⚠️ Bu ürünü zaten oyladınız!', { show_alert: true });
    }
});

bot.action(/ozel_mesaj_(\d+)_(\d+)/, async (ctx) => {
    try {
        const productId = ctx.match[1];
        const pmCost = parseInt(ctx.match[2]);
        const telegramId = ctx.from.id;

        const buyerCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        const buyerWallet = await db.query('SELECT available_balance, daily_spent_jetons, last_spend_date FROM jeton_wallets WHERE user_id = $1', [buyerCheck.rows[0].id]);
        const currentBalance = buyerWallet.rows[0].available_balance;

        if (currentBalance < pmCost) {
            return ctx.answerCbQuery('❌ Yetersiz bakiye!', { show_alert: true });
        }

        const bugun = new Date().toISOString().split('T')[0];
        let currentDailySpent = buyerWallet.rows[0].daily_spent_jetons || 0;
        let lastSpendDate = buyerWallet.rows[0].last_spend_date;

        if (lastSpendDate !== bugun) {
            currentDailySpent = 0;
            lastSpendDate = bugun;
        }
        currentDailySpent += pmCost;

        const urunSorgu = await db.query(`SELECT p.seller_id, p.is_messaging_enabled, s.user_id AS seller_user_id, u.telegram_user_id AS seller_telegram_id FROM products p JOIN seller_profiles s ON p.seller_id = s.id JOIN users u ON s.user_id = u.id WHERE p.id = $1`, [productId]);
        const sellerInfo = urunSorgu.rows[0];

        if (!sellerInfo.is_messaging_enabled) {
            return ctx.answerCbQuery('⚠️ Bu satıcı mesajlaşmayı kapalı tutuyor!', { show_alert: true });
        }

        if (telegramId.toString() === sellerInfo.seller_telegram_id.toString()) {
            return ctx.answerCbQuery('⚠️ Kendi ilanınız için özel mesaj açamazsınız!', { show_alert: true });
        }

        const saticiKazanci = Math.floor(pmCost * 0.15); 
        const komisyon = pmCost - saticiKazanci;        
        const newBalance = currentBalance - pmCost;

        await db.query('UPDATE jeton_wallets SET available_balance = $1, daily_spent_jetons = $2, last_spend_date = $3 WHERE user_id = $4', [newBalance, currentDailySpent, lastSpendDate, buyerCheck.rows[0].id]);
        await db.query('UPDATE jeton_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [saticiKazanci, sellerInfo.seller_user_id]);
        await db.query('UPDATE system_vault SET total_profit = total_profit + $1 WHERE id = 1', [komisyon]).catch(()=>{});

        await ctx.answerCbQuery('✅ Özel mesaj talebi oluşturuldu.', { show_alert: false });
        try {
            await bot.telegram.sendMessage(telegramId, `✅ **Ödeme Başarılı!**\n\n👉 [Satıcıya Özel Mesaj Gönder](tg://user?id=${sellerInfo.seller_telegram_id})\n\n🪙 Kalan: ${newBalance} Jeton`, { parse_mode: 'Markdown' });
        } catch(e) {}

        bot.telegram.sendMessage(sellerInfo.seller_telegram_id, `✉️ **YENİ ÖZEL MESAJ TALEBİ!**\n🪙 Net Kazancınız: ${saticiKazanci} Jeton eklendi!\n👉 [Müşterinin Profiline Git](tg://user?id=${telegramId})`, { parse_mode: 'Markdown' }).catch(() => {});
    } catch (error) {}
});

bot.action(/cek_onayla_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return ctx.answerCbQuery('Yetkiniz yok.', { show_alert: true });
    const reqId = ctx.match[1];

    try {
        const reqQuery = await db.query('SELECT * FROM withdrawal_requests WHERE id = $1', [reqId]);
        if (reqQuery.rows.length === 0) return ctx.answerCbQuery('Talep bulunamadı.', { show_alert: true });
        
        const req = reqQuery.rows[0];
        if (req.status !== 'BEKLIYOR') {
            return ctx.answerCbQuery(`Bu talep zaten ${req.status} durumunda!`, { show_alert: true });
        }

        await db.query('UPDATE withdrawal_requests SET status = $1 WHERE id = $2', ['ONAYLANDI', reqId]);

        const userQuery = await db.query('SELECT telegram_user_id FROM users WHERE id = $1', [req.user_id]);
        const sellerTelegramId = userQuery.rows[0].telegram_user_id;

        await ctx.answerCbQuery('✅ Talep onaylandı!', { show_alert: true });
        
        try {
            await ctx.editMessageText(`✅ ÇEKİM TALEBİ ONAYLANDI (#${reqId})\n\n🪙 Jeton: ${req.jetons_amount}\n💵 TL: ${req.tl_amount} ₺\n🏦 IBAN: \`${req.iban}\`\n👤 ${req.full_name}`, { parse_mode: 'Markdown' });
        } catch (e) {}

        await bot.telegram.sendMessage(
            sellerTelegramId,
            `✅ **Bakiye Çekim Talebiniz Onaylandı!**\n\n🪙 ${req.jetons_amount} Jeton karşılığı **${req.tl_amount} ₺** tutarındaki ödemeniz belirttiğiniz IBAN adresine gönderilmiştir. Hayırlı olsun!`,
            { parse_mode: 'Markdown' }
        ).catch(()=>{});

    } catch (e) {
        await ctx.answerCbQuery('Hata oluştu.', { show_alert: true });
    }
});

bot.action(/cek_reddet_(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID) return ctx.answerCbQuery('Yetkiniz yok.', { show_alert: true });
    const reqId = ctx.match[1];

    try {
        const reqQuery = await db.query('SELECT * FROM withdrawal_requests WHERE id = $1', [reqId]);
        if (reqQuery.rows.length === 0) return ctx.answerCbQuery('Talep bulunamadı.', { show_alert: true });
        
        const req = reqQuery.rows[0];
        if (req.status !== 'BEKLIYOR') {
            return ctx.answerCbQuery(`Bu talep zaten ${req.status} durumunda!`, { show_alert: true });
        }

        await db.query('UPDATE withdrawal_requests SET status = $1 WHERE id = $2', ['REDDEDILDI', reqId]);
        await db.query('UPDATE jeton_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [req.jetons_amount, req.user_id]);

        const userQuery = await db.query('SELECT telegram_user_id FROM users WHERE id = $1', [req.user_id]);
        const sellerTelegramId = userQuery.rows[0].telegram_user_id;

        await ctx.answerCbQuery('❌ Talep reddedildi ve jetonlar iade edildi.', { show_alert: true });
        
        try {
            await ctx.editMessageText(`❌ ÇEKİM TALEBİ REDDEDİLDİ VE İADE EDİLDİ (#${reqId})\n\n🪙 Jeton: ${req.jetons_amount}\n💵 TL: ${req.tl_amount} ₺`, { parse_mode: 'Markdown' });
        } catch (e) {}

        await bot.telegram.sendMessage(
            sellerTelegramId,
            `❌ **Bakiye Çekim Talebiniz Reddedildi!**\n\n${req.jetons_amount} Jeton tutarındaki çekim talebiniz reddedilmiş olup, jetonlarınız cüzdanınıza iade edilmiştir.`,
            { parse_mode: 'Markdown' }
        ).catch(()=>{});

    } catch (e) {
        await ctx.answerCbQuery('Hata oluştu.', { show_alert: true });
    }
});

bot.on('text', async (ctx) => {
    const mesaj = ctx.message.text;
    const butonlar = ['🏪 İlan Ver', '🎁 Günlük Ödül', '💰 Bakiye Çek', '🪙 Jeton Ekle', '💬 Admin ile Görüş', 'İlan Ver', 'Günlük Ödül', 'Bakiye Çek', 'Jeton Ekle', 'Admin ile Görüş'];
    
    if (!butonlar.includes(mesaj) && !sohbetHafizasi[ctx.from.id] && !mesaj.startsWith('/')) {
        const username = ctx.from.username || ctx.from.first_name || 'Kullanıcı';
        try {
            const userCheck = await db.query('SELECT * FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            if (userCheck.rows.length === 0) {
                const insertUser = await db.query('INSERT INTO users (telegram_user_id, username) VALUES ($1, $2) RETURNING id', [ctx.from.id, username]);
                await db.query('INSERT INTO jeton_wallets (user_id, available_balance) VALUES ($1, 100)', [insertUser.rows[0].id]);
            }
        } catch (e) {}
        return await ctx.reply(`Menüyü açmak için tıkla: /start`, anaMenu);
    }

    if (butonlar.includes(mesaj)) return;

    const asama = sohbetHafizasi[ctx.from.id];

    if (asama === 'CEKIM_JETON_BEKLENIYOR') {
        const miktar = parseInt(mesaj);
        if (isNaN(miktar) || miktar <= 0) return ctx.reply('❌ Lütfen geçerli bir jeton miktarı yazın:');
        
        if (miktar < 20000) {
            return ctx.reply('⚠️ Minimum çekim tutarı **20.000 Jeton**dir! Lütfen 20.000 veya üzerinde bir jeton miktarı yazın:');
        }

        try {
            const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            const userId = userCheck.rows[0].id;
            const walletCheck = await db.query('SELECT available_balance FROM jeton_wallets WHERE user_id = $1', [userId]);
            const bakiye = walletCheck.rows[0].available_balance;

            if (bakiye < miktar) {
                return ctx.reply(`❌ Yetersiz bakiye! Mevcut bakiyeniz: *${bakiye} Jeton*. Daha düşük bir miktar girin:`, { parse_mode: 'Markdown' });
            }

            geciciVeri[ctx.from.id].cekilecek_jeton = miktar;
            sohbetHafizasi[ctx.from.id] = 'CEKIM_IBAN_BEKLENIYOR';
            return ctx.reply('✅ Jeton miktarı alındı.\n\nŞimdi paranın yatacağı **IBAN** adresinizi yazın (Örn: TR...):');
        } catch (e) {
            delete sohbetHafizasi[ctx.from.id];
            delete geciciVeri[ctx.from.id];
            return ctx.reply('❌ Bir hata oluştu.', anaMenu);
        }
    } 

    if (asama === 'CEKIM_IBAN_BEKLENIYOR') {
        const iban = mesaj.trim();
        if (iban.length < 10) return ctx.reply('❌ Lütfen geçerli bir IBAN numarası girin:');

        geciciVeri[ctx.from.id].iban = iban;
        sohbetHafizasi[ctx.from.id] = 'CEKIM_ADSOYAD_BEKLENIYOR';
        return ctx.reply('✅ IBAN alındı.\n\nSon olarak IBAN sahibinin **Ad Soyad** bilgisini yazın:');
    }

    if (asama === 'CEKIM_ADSOYAD_BEKLENIYOR') {
        const adSoyad = mesaj.trim();
        if (adSoyad.length < 3) return ctx.reply('❌ Lütfen geçerli bir Ad Soyad girin:');

        const veri = geciciVeri[ctx.from.id];
        const jetonMiktari = veri.cekilecek_jeton;
        const iban = veri.iban;
        const telegramId = ctx.from.id;

        try {
            const userCheck = await db.query('SELECT id, username FROM users WHERE telegram_user_id = $1', [telegramId]);
            const userId = userCheck.rows[0].id;
            const username = userCheck.rows[0].username || 'Kullanici';

            const tlKarsiligi = (jetonMiktari * 0.375).toFixed(2);

            await db.query('UPDATE jeton_wallets SET available_balance = available_balance - $1 WHERE user_id = $2', [jetonMiktari, userId]);

            const insertReq = await db.query(
                'INSERT INTO withdrawal_requests (user_id, jetons_amount, tl_amount, iban, full_name, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [userId, jetonMiktari, tlKarsiligi, iban, adSoyad, 'BEKLIYOR']
            );
            const reqId = insertReq.rows[0].id;

            delete sohbetHafizasi[ctx.from.id];
            delete geciciVeri[ctx.from.id];

            await ctx.reply(`🎉 **Çekim Talebiniz Başarıyla Alındı!**\n\n🪙 Jeton Miktarı: **${jetonMiktari} Jeton**\n💵 TL Karşılığı: **${tlKarsiligi} ₺**\n🏦 IBAN: \`${iban}\`\n👤 Ad Soyad: ${adSoyad}\n\nİşleminiz incelendikten sonra ödemeniz IBAN'ınıza gönderilecektir.`, { parse_mode: 'Markdown', ...anaMenu });

            await bot.telegram.sendMessage(
                PATRON_ID,
                `🔔 **YENİ BAKIYE ÇEKİM TALEBİ (#${reqId})**\n\n` +
                `👤 Satıcı: @${username} (ID: \`${telegramId}\`)\n` +
                `🪙 Talep Edilen Jeton: **${jetonMiktari} Jeton**\n` +
                `💵 Ödenecek Tutar: **${tlKarsiligi} ₺**\n` +
                `🏦 IBAN: \`${iban}\`\n` +
                `👤 Alıcı Ad Soyad: ${adSoyad}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Onayla ve Ödendi İşaretle', `cek_onayla_${reqId}`),
                            Markup.button.callback('❌ Reddet ve İade Et', `cek_reddet_${reqId}`)
                        ]
                    ])
                }
            ).catch(()=>{});

        } catch (e) {
            delete sohbetHafizasi[ctx.from.id];
            delete geciciVeri[ctx.from.id];
            return ctx.reply('❌ Talep oluşturulurken bir veritabanı hatası oluştu.', anaMenu);
        }
    }

    if (asama === 'MAGAZA_ISMI_BEKLENIYOR') {
        if (!geciciVeri[ctx.from.id]) geciciVeri[ctx.from.id] = {};
        geciciVeri[ctx.from.id].isim = mesaj;
        sohbetHafizasi[ctx.from.id] = 'MAGAZA_ACIKLAMASI_BEKLENIYOR';
        return ctx.reply('Açıklama yaz:', anaMenu);
    } 
    
    if (asama === 'MAGAZA_ACIKLAMASI_BEKLENIYOR') {
        try {
            if (!geciciVeri[ctx.from.id]) geciciVeri[ctx.from.id] = { isim: "Mağaza" };
            const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            await db.query('INSERT INTO seller_profiles (user_id, store_name, description) VALUES ($1, $2, $3)', [userCheck.rows[0].id, geciciVeri[ctx.from.id].isim, mesaj]);
            delete sohbetHafizasi[ctx.from.id];
            delete geciciVeri[ctx.from.id];
            return ctx.reply(`🎉 Mağazanız kuruldu. Artık ilan verebilir ve bakiye çekebilirsiniz!`, anaMenu);
        } catch (error) { 
            delete sohbetHafizasi[ctx.from.id];
            delete geciciVeri[ctx.from.id];
            return ctx.reply('❌ Mağaza oluşturulamadı.', anaMenu); 
        }
    } 
    
    if (asama === 'URUN_ISMI_BEKLENIYOR') {
        if (!geciciVeri[ctx.from.id]) geciciVeri[ctx.from.id] = {};
        geciciVeri[ctx.from.id].baslik = mesaj;
        await db.query('INSERT INTO product_drafts (telegram_id, title) VALUES ($1, $2) ON CONFLICT (telegram_id) DO UPDATE SET title = $2', [ctx.from.id, mesaj]);
        sohbetHafizasi[ctx.from.id] = 'URUN_FIYATI_BEKLENIYOR'; 
        return ctx.reply('✅ Başlık alındı.\n\nŞimdi bu ürünün açılması için Kaç Jeton gerektiğini yaz (Minimum 50 Jeton):', anaMenu);
    } 
    
    if (asama === 'URUN_FIYATI_BEKLENIYOR') {
        const fiyat = parseInt(mesaj);
        if (isNaN(fiyat) || fiyat <= 0) return ctx.reply('❌ Lütfen sadece geçerli bir rakam yazın:');
        
        if (fiyat < 50) {
            return ctx.reply('⚠️ Minimum 50 jeton değerinde ilan açılabilir! Lütfen 50 veya üzerinde bir jeton miktarı yazın:');
        }

        if (!geciciVeri[ctx.from.id]) geciciVeri[ctx.from.id] = {};
        geciciVeri[ctx.from.id].fiyat = fiyat;
        await db.query('UPDATE product_drafts SET price = $2 WHERE telegram_id = $1', [ctx.from.id, fiyat]);
        sohbetHafizasi[ctx.from.id] = 'URUN_FOTOGRAFI_BEKLENIYOR';
        return ctx.reply(`✅ Fiyat ${fiyat} Jeton olarak belirlendi.\n\nŞimdi buraya anlık fotoğraf gönderin:`, anaMenu);
    } 
    
    if (asama === 'URUN_FOTOGRAFI_BEKLENIYOR') {
        delete sohbetHafizasi[ctx.from.id];
        delete geciciVeri[ctx.from.id];
        return ctx.reply('⚠️ **Bu görseli sadece siz görebilirsiniz. İşlem iptal edildi.**', anaMenu);
    }
});

bot.on('photo', async (ctx) => {
    const asama = sohbetHafizasi[ctx.from.id];
    if (asama !== 'URUN_FOTOGRAFI_BEKLENIYOR') {
        await ctx.reply('⚠️ Önce ilan adımlarını takip edin.', anaMenu);
        return;
    }

    try {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        await db.query('UPDATE product_drafts SET file_id = $2 WHERE telegram_id = $1', [ctx.from.id, fileId]);

        const draftRes = await db.query('SELECT * FROM product_drafts WHERE telegram_id = $1', [ctx.from.id]);
        const draft = draftRes.rows[0];
        const fiyat = draft && draft.price ? draft.price : 50;

        const ozelMesajBedeli = Math.ceil(fiyat * 1.5);

        await ctx.reply(
            `🔒 **İlan Mesajlaşma Ayarı**\n\nBu ilan için alıcıların sizinle özel mesajlaşabilmesini istiyor musunuz?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback(`💬 Açık (${ozelMesajBedeli} Jeton)`, 'ilan_ayar_acik')],
                    [Markup.button.callback('🔒 Gizli (Mesajlaşma Kapalı)', 'ilan_ayar_gizli')]
                ])
            }
        );
    } catch (error) {
         delete sohbetHafizasi[ctx.from.id];
         delete geciciVeri[ctx.from.id];
         ctx.reply(`❌ İşlem yapılamadı. Tekrar deneyin.`, anaMenu);
    }
});

bot.action(/ilan_ayar_(acik|gizli)/, async (ctx) => {
    try {
        const tercih = ctx.match[1];
        const isMessagingEnabled = (tercih === 'acik');
        const telegramId = ctx.from.id;

        const draftRes = await db.query('SELECT * FROM product_drafts WHERE telegram_id = $1', [telegramId]);
        const draft = draftRes.rows[0];

        const baslik = draft && draft.title ? draft.title : "Yeni İlan";
        const fiyat = draft && draft.price ? draft.price : 50;
        const fileId = draft && draft.file_id ? draft.file_id : null;

        if (!fileId) {
            return ctx.answerCbQuery('⚠️ Lütfen ilanın fotoğrafını tekrar gönderin.', { show_alert: true });
        }

        await ctx.answerCbQuery('✅ İlan işleniyor...');

        const fileLink = await ctx.telegram.getFileLink(fileId);
        const buffer = await new Promise((resolve, reject) => {
            https.get(fileLink.href, (res) => {
                if (res.statusCode !== 200) return reject(new Error('Dosya çekilemedi!'));
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            }).on('error', (err) => reject(err));
        });

        const blurredBuffer = await sharp(buffer).rotate().jpeg({ quality: 80 }).blur(30).toBuffer();
        const previewMsg = await ctx.replyWithPhoto({ source: blurredBuffer }, { caption: `⏳ İşleniyor...` });
        const blurredFileId = previewMsg.photo[previewMsg.photo.length - 1].file_id;
        
        await ctx.telegram.deleteMessage(ctx.chat.id, previewMsg.message_id).catch(() => {});

        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userCheck.rows[0].id]);
        const satici = sellerCheck.rows[0];
        
        const insertUrun = await db.query(
            'INSERT INTO products (seller_id, title, unlock_cost_jetons, is_messaging_enabled) VALUES ($1, $2, $3, $4) RETURNING id',
            [satici.id, baslik, fiyat, isMessagingEnabled]
        );
        const urunId = insertUrun.rows[0].id;

        await db.query('INSERT INTO product_images (product_id, original_storage_key, preview_storage_key) VALUES ($1, $2, $3)', [urunId, fileId, blurredFileId]);
        
        await db.query('DELETE FROM product_drafts WHERE telegram_id = $1', [telegramId]);
        delete sohbetHafizasi[telegramId];
        delete geciciVeri[telegramId];
        
        const rozet = await getSellerBadge(satici.id);
        const captionText = `🚨 YENİ GİZLİ ÜRÜN Eklendi!\n\n🏪 Mağaza: ${satici.store_name} ${rozet}\n📦 Ürün: ${baslik}\n🔒 Durum: GİZLİ\n🪙 Bedel: ${fiyat} Jeton`;
        const butonlar = Markup.inlineKeyboard([Markup.button.callback(`🔓 ${fiyat} Jetona Aç`, `urunu_ac_${urunId}_${fiyat}`)]);

        ilanKuyrugu.push({ sellerTelegramId: telegramId.toString(), blurredFileId, captionText, butonlar });
        ilanKuyrugunuIsle();

        await ctx.editMessageCaption({ caption: `🎉 İlanınız başarıyla oluşturuldu ve yayın sırasına eklendi!` }).catch(()=>{});
        await ctx.reply(`🎉 İşlem tamamlandı!`, anaMenu);
    } catch (error) {
        console.error(error);
        ctx.answerCbQuery('❌ İşlem yapılamadı. Tekrar deneyin.', { show_alert: true });
    }
});

bot.launch().then(async () => {
    await bot.telegram.setMyCommands([
        { command: 'start', description: 'Ana Menüyü Aç' },
        { command: 'magazadi', description: 'Mağaza Adını Değiştir' },
        { command: 'bakiyecek', description: 'Bakiye Çek' }
    ]).catch(()=>{});
    console.log('🤖 Bot aktif ve sol alt menü butonları ayarlandı!');
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 Sunucu çalışıyor.'));
process.once('SIGINT', () => { bot.stop('SIGINT'); db.end(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); db.end(); });