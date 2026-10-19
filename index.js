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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const dotenv = __importStar(require("dotenv"));
const express_1 = __importDefault(require("express"));
const pg_1 = require("pg");
const sharp_1 = __importDefault(require("sharp"));
const https_1 = __importDefault(require("https"));
dotenv.config();
const token = process.env.BOT_TOKEN;
if (!token)
    throw new Error('BOT_TOKEN bulunamadı!');
const bot = new telegraf_1.Telegraf(token);
const app = (0, express_1.default)();
const db = new pg_1.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
db.connect().then(async () => {
    await db.query('CREATE TABLE IF NOT EXISTS system_vault (id INT PRIMARY KEY, total_profit INT DEFAULT 0)').catch(() => { });
    await db.query('INSERT INTO system_vault (id, total_profit) VALUES (1, 0) ON CONFLICT DO NOTHING').catch(() => { });
    await db.query('ALTER TABLE users ADD COLUMN is_banned BOOLEAN DEFAULT false').catch(() => { });
    await db.query('ALTER TABLE chip_wallets ADD COLUMN last_reward_date VARCHAR(20) DEFAULT null').catch(() => { });
    await db.query('ALTER TABLE chip_wallets ADD COLUMN reward_week_start VARCHAR(20) DEFAULT null').catch(() => { });
    await db.query('ALTER TABLE chip_wallets ADD COLUMN reward_weekly_count INT DEFAULT 0').catch(() => { });
    console.log("✅ Veritabanı ve Kararlı Sistem aktif.");
}).catch(err => console.error("❌ Veritabanı hatası:", err));
// ==========================================
// 🚨 GÜVENLİK VE ÖDEME BİLGİLERİ (BURALARI KENDİNE GÖRE DOLDUR) 🚨
// ==========================================
const PATRON_ID = "BURAYA_ID_YAZILACAK"; // Örnek: "123456789"
const PATRON_IBAN = "TR00 0000 0000 0000 0000 0000 00";
const PATRON_AD_SOYAD = "İSİM SOYİSİM";
const sohbetHafizasi = {};
const geciciVeri = {};
const ilanKuyrugu = [];
let kuyrukİsleniyor = false;
async function ilanKuyrugunuIsle() {
    if (kuyrukİsleniyor || ilanKuyrugu.length === 0)
        return;
    kuyrukİsleniyor = true;
    while (ilanKuyrugu.length > 0) {
        const ilan = ilanKuyrugu.shift();
        if (!ilan)
            break;
        try {
            const tumKullanicilar = await db.query('SELECT telegram_user_id FROM users');
            for (const hedefUser of tumKullanicilar.rows) {
                try {
                    await bot.telegram.sendPhoto(hedefUser.telegram_user_id, ilan.blurredFileId, {
                        caption: ilan.captionText,
                        ...ilan.butonlar
                    });
                }
                catch (err) { }
            }
        }
        catch (e) { }
        if (ilanKuyrugu.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    kuyrukİsleniyor = false;
}
const anaMenu = telegraf_1.Markup.keyboard([
    ['🏪 İlan Ver', '💰 Bakiyem'],
    ['🎁 Günlük Ödül', 'ℹ️ Yardım']
]).resize().persistent();
bot.use(async (ctx, next) => {
    if (ctx.from) {
        try {
            const userCheck = await db.query('SELECT is_banned FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            if (userCheck.rows.length > 0 && userCheck.rows[0].is_banned) {
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('❌ BANLANDINIZ!', { show_alert: true }).catch(() => { });
                }
                else if (ctx.message) {
                    await ctx.reply('🔨 Hesabınız KALICI OLARAK YASAKLANMIŞTIR.').catch(() => { });
                }
                return;
            }
        }
        catch (e) { }
    }
    return next();
});
async function sendWelcomeOrHelp(ctx, username) {
    await ctx.reply(`🎉 **Özel Pazara Hoş Geldin, ${username}!**\n\n` +
        `📖 **Kullanım Talimatı:**\n` +
        `1️⃣ **İlan Ver:** Kendi mağazanı kurup gizli görseller paylaşabilir ve çip kazanabilirsin.\n` +
        `2️⃣ **Çip Harca / İçerik Aç:** Vitrine düşen bulanık görselleri çiplerini kullanarak açabilirsin.\n` +
        `3️⃣ **Günlük Ödül:** Her gün menüden günlük ödülünü alarak ücretsiz çip toplayabilirsin.\n` +
        `4️⃣ **Bakiye:** Çip bakiyeni kontrol edebilir ve havale/EFT ile bakiye yükleyebilirsin.\n\n` +
        `💡 Sohbet ekranını temizlediğinde menü kaybolursa dilediğin an **/start** komutunu yazarak menüyü ve başlangıç rehberini tekrar getirebilirsin!\n\n` +
        `Aşağıdaki kalıcı menüyü dilediğin gibi kullanmaya başlayabilirsin! 🚀`, { parse_mode: 'Markdown', ...anaMenu });
}
bot.start(async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    const telegramId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || 'Kullanıcı';
    try {
        const userCheck = await db.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (userCheck.rows.length === 0) {
            const insertUser = await db.query('INSERT INTO users (telegram_user_id, username) VALUES ($1, $2) RETURNING id', [telegramId, username]);
            await db.query('INSERT INTO chip_wallets (user_id, available_balance) VALUES ($1, $2)', [insertUser.rows[0].id, 100]);
            await sendWelcomeOrHelp(ctx, username);
        }
        else {
            await ctx.reply(`👋 Tekrar hoş geldin ${username}! İşlemlerine menüden devam edebilirsin:`, anaMenu);
        }
    }
    catch (error) { }
});
// ==========================================
// 👑 VIP YÖNETİCİ KOMUTLARI
// ==========================================
bot.command('admin', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    try {
        const usersCount = await db.query('SELECT COUNT(*) FROM users');
        const sellersCount = await db.query('SELECT COUNT(*) FROM seller_profiles');
        const productsCount = await db.query('SELECT COUNT(*) FROM products');
        const vault = await db.query('SELECT total_profit FROM system_vault WHERE id = 1');
        const karlar = vault.rows[0] ? vault.rows[0].total_profit : 0;
        ctx.reply(`👑 **VIP YÖNETİCİ PANELİ** 👑\n\n👥 Kullanıcı: ${usersCount.rows[0].count}\n🏪 Mağaza: ${sellersCount.rows[0].count}\n📦 Ürün: ${productsCount.rows[0].count}\n\n💎 **SİSTEMİN NET KÂRI: ${karlar} Çip**\n\n🚨 /ban <ID>\n💸 /cipekle <ID> <Miktar>\n🗑️ /cipsil <ID> <Miktar>\n🏪 /saticilar\n👥 /musteriler`);
    }
    catch (e) { }
});
bot.command('saticilar', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    try {
        const saticilar = await db.query(`
            SELECT s.store_name, u.telegram_user_id, w.available_balance 
            FROM seller_profiles s
            JOIN users u ON s.user_id = u.id
            JOIN chip_wallets w ON u.id = w.user_id
            ORDER BY w.available_balance DESC LIMIT 20
        `);
        if (saticilar.rows.length === 0)
            return ctx.reply('Henüz hiç satıcı mağazası yok.');
        let mesaj = `🏆 **SATICI CÜZDANLARI RÖNTGENİ** 🏆\n\n`;
        saticilar.rows.forEach((sat, index) => {
            mesaj += `${index + 1}. 🏪 ${sat.store_name} \vert{} 💰 ${sat.available_balance} Çip\n(ID: \`${sat.telegram_user_id}\`)\n\n`;
        });
        ctx.reply(mesaj, { parse_mode: 'Markdown' });
    }
    catch (e) {
        ctx.reply('❌ Liste çekilemedi.');
    }
});
bot.command('musteriler', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    try {
        const musteriler = await db.query(`
            SELECT u.username, u.telegram_user_id, w.available_balance 
            FROM users u
            JOIN chip_wallets w ON u.id = w.user_id
            LEFT JOIN seller_profiles s ON u.id = s.user_id
            WHERE s.id IS NULL
            ORDER BY w.available_balance DESC LIMIT 20
        `);
        if (musteriler.rows.length === 0)
            return ctx.reply('Sistemde müşteri yok.');
        let mesaj = `👥 **MÜŞTERİ CÜZDANLARI RÖNTGENİ** 👥\n\n`;
        musteriler.rows.forEach((mus, index) => {
            const isim = mus.username || "İsimsiz";
            mesaj += `${index + 1}. 👤 ${isim} \vert{} 💰 ${mus.available_balance} Çip\n(ID: \`${mus.telegram_user_id}\`)\n\n`;
        });
        ctx.reply(mesaj, { parse_mode: 'Markdown' });
    }
    catch (e) {
        ctx.reply('❌ Liste çekilemedi.');
    }
});
bot.command('cipsil', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    const mesajParcalari = ctx.message.text.split(' ');
    if (mesajParcalari.length !== 3)
        return ctx.reply('❌ Doğrusu: /cipsil 123456789 500');
    try {
        const targetUser = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [mesajParcalari[1]]);
        if (targetUser.rows.length === 0)
            return ctx.reply('❌ Bu ID bulunamadı.');
        const silinecekMiktar = parseInt(mesajParcalari[2]);
        await db.query(`UPDATE chip_wallets SET available_balance = GREATEST(available_balance - $1, 0) WHERE user_id = $2`, [silinecekMiktar, targetUser.rows[0].id]);
        ctx.reply(`🗑️ Başarılı! \`${mesajParcalari[1]}\` ID'li hesaptan ${silinecekMiktar} Çip silindi.`, { parse_mode: 'Markdown' });
        bot.telegram.sendMessage(mesajParcalari[1], `💸 Ödeme Bildirimi: Yönetici ödemenizi gerçekleştirdi ve cüzdanınızdan ${silinecekMiktar} Çip düşüldü.`).catch(() => { });
    }
    catch (error) { }
});
bot.command('ban', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    const parts = ctx.message.text.split(' ');
    if (parts.length !== 2)
        return ctx.reply('❌ Kullanım: /ban 123456789');
    try {
        await db.query('UPDATE users SET is_banned = true WHERE telegram_user_id = $1', [parts[1]]);
        ctx.reply(`🔨 ${parts[1]} SİSTEMDEN BANLANDI!`);
    }
    catch (e) { }
});
bot.command('cipekle', async (ctx) => {
    if (ctx.from.id.toString() !== PATRON_ID)
        return;
    const mesajParcalari = ctx.message.text.split(' ');
    if (mesajParcalari.length !== 3)
        return ctx.reply('❌ Doğrusu: /cipekle 123456789 50');
    try {
        const targetUser = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [mesajParcalari[1]]);
        if (targetUser.rows.length === 0)
            return ctx.reply('❌ Bu ID bulunamadı.');
        await db.query('UPDATE chip_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [parseInt(mesajParcalari[2]), targetUser.rows[0].id]);
        ctx.reply(`✅ Başarılı! Çip eklendi.`);
        bot.telegram.sendMessage(mesajParcalari[1], `🎁 MÜJDE! Hesabınıza ${mesajParcalari[2]} Çip eklendi!`).catch(() => { });
    }
    catch (error) { }
});
bot.hears(['🎁 Günlük Ödül', 'Günlük Ödül'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0)
            return ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        const userId = userCheck.rows[0].id;
        const wallet = await db.query('SELECT available_balance, last_reward_date, reward_week_start, reward_weekly_count FROM chip_wallets WHERE user_id = $1', [userId]);
        const balance = wallet.rows[0].available_balance;
        const lastDate = wallet.rows[0].last_reward_date;
        let weekStart = wallet.rows[0].reward_week_start;
        let weeklyCount = wallet.rows[0].reward_weekly_count || 0;
        const bugun = new Date().toISOString().split('T')[0];
        const currentTime = new Date().getTime();
        if (weekStart) {
            const weekStartTime = new Date(weekStart).getTime();
            if ((currentTime - weekStartTime) / (1000 * 3600 * 24) >= 7) {
                weekStart = bugun;
                weeklyCount = 0;
            }
        }
        else {
            weekStart = bugun;
            weeklyCount = 0;
        }
        if (weeklyCount >= 5)
            return ctx.reply('⚠️ **Haftalık Bedava Sınırı Doldu!**', anaMenu);
        if (lastDate === bugun)
            return ctx.reply('⏳ **Bugünkü ödül hakkınızı kullandınız!**', anaMenu);
        const odul = Math.floor(Math.random() * 3) + 2;
        weeklyCount += 1;
        await db.query('UPDATE chip_wallets SET available_balance = available_balance + $1, last_reward_date = $2, reward_week_start = $3, reward_weekly_count = $4 WHERE user_id = $5', [odul, bugun, weekStart, weeklyCount, userId]);
        ctx.reply(`🎁 **TEBRİKLER!** ${odul} Çip kazandın!\n🪙 Yeni Bakiyen: ${balance + odul} Çip`, anaMenu);
    }
    catch (e) { }
});
bot.hears(['💰 Bakiyem', 'Bakiyem'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length > 0) {
            const walletCheck = await db.query('SELECT available_balance FROM chip_wallets WHERE user_id = $1', [userCheck.rows[0].id]);
            const bakiye = walletCheck.rows[0].available_balance;
            await ctx.reply(`🪙 Güncel Bakiyen: *${bakiye} Çip*\n\n🆔 Telegram ID'n: \`${ctx.from.id}\``, {
                parse_mode: 'Markdown',
                ...telegraf_1.Markup.inlineKeyboard([
                    telegraf_1.Markup.button.callback('🏦 Havale/EFT ile Çip Satın Al', 'cip_satin_al')
                ])
            });
        }
        else {
            ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        }
    }
    catch (error) { }
});
bot.action('cip_satin_al', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.reply(`Lütfen aşağıdaki banka hesabına ödemenizi yapınız.\n\n⚠️ Ödeme yaparken açıklamaya **Telegram ID** numaranızı yazınız:`, { parse_mode: 'Markdown' });
        await ctx.reply(`🏦 Banka IBAN:`, { parse_mode: 'Markdown' });
        await ctx.reply(`\`${PATRON_IBAN}\``, { parse_mode: 'Markdown' });
        await ctx.reply(`👤 Alıcı Ad Soyad:`, { parse_mode: 'Markdown' });
        await ctx.reply(`\`${PATRON_AD_SOYAD}\``, { parse_mode: 'Markdown' });
        await ctx.reply(`✍️ Açıklamaya Yazılacak ID:`, { parse_mode: 'Markdown' });
        await ctx.reply(`\`${ctx.from.id}\``, { parse_mode: 'Markdown' });
    }
    catch (error) { }
});
// ℹ️ YARDIM BUTONU (YENİLENEN TALİMAT VE /START HATIRLATMASI İLE)
bot.hears(['ℹ️ Yardım', 'Yardım'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    await ctx.reply(`🤖 **Pazar Yeri Bilgilendirme ve Yardım**\n\n` +
        `• Görsel satışlarından %10, Özel Mesaj erişimlerinden ise %85 komisyon kesilir.\n` +
        `• Sohbet geçmişini sildiğinizde veya menü kaybolduğunda dilediğiniz an **/start** yazarak menüyü ve kullanım kılavuzunu tekrar ekrana getirebilirsiniz.\n\n` +
        `Sorun yaşarsanız menüden işlemlerinizi güvenle yönetebilirsiniz.`, { parse_mode: 'Markdown', ...anaMenu });
});
bot.hears(['🏪 İlan Ver', 'İlan Ver'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    try {
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        if (userCheck.rows.length === 0)
            return ctx.reply('⚠️ Önce /start yazarak kayıt ol!', anaMenu);
        const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userCheck.rows[0].id]);
        if (sellerCheck.rows.length > 0) {
            sohbetHafizasi[ctx.from.id] = 'URUN_ISMI_BEKLENIYOR';
            geciciVeri[ctx.from.id] = {};
            ctx.reply('Lütfen ürünün Başlığını yaz:', telegraf_1.Markup.removeKeyboard());
        }
        else {
            sohbetHafizasi[ctx.from.id] = 'MAGAZA_ISMI_BEKLENIYOR';
            ctx.reply('İlan verebilmek için önce bir Mağaza Adı yazıp gönder:', telegraf_1.Markup.removeKeyboard());
        }
    }
    catch (error) { }
});
bot.hears(/(ödeme|havale|eft|dekont|yatırdım|gönderdim|attım|kontrol eder)/i, async (ctx) => {
    if (sohbetHafizasi[ctx.from.id])
        return;
    await ctx.reply(`💳 **Ödeme Bildirimi Algılandı**\n\nDekontunuzu doğrudan yöneticiye ileterek çiplerinizi yükletebilirsiniz:`, {
        parse_mode: 'Markdown',
        ...telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.url('💬 Admin\'e Dekont Gönder', `tg://user?id=${PATRON_ID}`)
        ])
    });
});
bot.action(/urunu_ac_(\d+)_(\d+)/, async (ctx) => {
    try {
        const productId = ctx.match[1];
        const cost = parseInt(ctx.match[2]);
        const telegramId = ctx.from.id;
        const buyerCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        if (buyerCheck.rows.length === 0)
            return ctx.answerCbQuery('❌ Önce /start yaz.', { show_alert: true });
        const buyerId = buyerCheck.rows[0].id;
        const urunSorgu = await db.query(`
            SELECT p.seller_id, s.user_id AS seller_user_id, u.telegram_user_id AS seller_telegram_id 
            FROM products p 
            JOIN seller_profiles s ON p.seller_id = s.id 
            JOIN users u ON s.user_id = u.id 
            WHERE p.id = $1
        `, [productId]);
        if (urunSorgu.rows.length === 0)
            return ctx.answerCbQuery('❌ Ürün bulunamadı.', { show_alert: true });
        const sellerInfo = urunSorgu.rows[0];
        if (telegramId.toString() === sellerInfo.seller_telegram_id.toString()) {
            return ctx.answerCbQuery('⚠️ Kendi ilanına çip harcayamazsın!', { show_alert: true });
        }
        const buyerWallet = await db.query('SELECT available_balance FROM chip_wallets WHERE user_id = $1', [buyerId]);
        const currentBalance = buyerWallet.rows[0].available_balance;
        if (currentBalance < cost)
            return ctx.answerCbQuery(`❌ Yetersiz Bakiye!`, { show_alert: true });
        const komisyon = Math.floor(cost * 0.10);
        const saticiKazanci = cost - komisyon;
        const newBalance = currentBalance - cost;
        await db.query('UPDATE chip_wallets SET available_balance = $1 WHERE user_id = $2', [newBalance, buyerId]);
        await db.query('UPDATE chip_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [saticiKazanci, sellerInfo.seller_user_id]);
        await db.query('UPDATE system_vault SET total_profit = total_profit + $1 WHERE id = 1', [komisyon]).catch(() => { });
        const photoCheck = await db.query('SELECT original_storage_key FROM product_images WHERE product_id = $1', [productId]);
        const ozelMesajBedeli = Math.ceil(cost * 1.5);
        ctx.answerCbQuery(`✅ Başarılı! ${cost} Çip harcandı.`, { show_alert: false });
        await ctx.replyWithPhoto(photoCheck.rows[0].original_storage_key, {
            caption: `🔓 İŞTE GİZLİ GÖRSEL!\n\n💸 Bedel: ${cost} Çip\n🪙 Kalan Bakiyen: ${newBalance} Çip`,
            reply_markup: { inline_keyboard: [[telegraf_1.Markup.button.callback(`✉️ Satıcıyla Özel Mesajlaş ( ${ozelMesajBedeli} Çip )`, `ozel_mesaj_${productId}_${ozelMesajBedeli}`)]] }
        });
        bot.telegram.sendMessage(sellerInfo.seller_telegram_id, `💸 MÜJDE! Bir müşteri görselinizi açtı!\n💰 Net Kazancınız: ${saticiKazanci} Çip eklendi!`).catch(() => { });
    }
    catch (error) { }
});
bot.action(/ozel_mesaj_(\d+)_(\d+)/, async (ctx) => {
    try {
        const productId = ctx.match[1];
        const pmCost = parseInt(ctx.match[2]);
        const telegramId = ctx.from.id;
        const buyerCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [telegramId]);
        const buyerWallet = await db.query('SELECT available_balance FROM chip_wallets WHERE user_id = $1', [buyerCheck.rows[0].id]);
        const currentBalance = buyerWallet.rows[0].available_balance;
        if (currentBalance < pmCost)
            return ctx.answerCbQuery(`❌ Yetersiz Bakiye!`, { show_alert: true });
        const urunSorgu = await db.query(`SELECT p.seller_id, s.user_id AS seller_user_id, u.telegram_user_id AS seller_telegram_id FROM products p JOIN seller_profiles s ON p.seller_id = s.id JOIN users u ON s.user_id = u.id WHERE p.id = $1`, [productId]);
        const sellerInfo = urunSorgu.rows[0];
        if (telegramId.toString() === sellerInfo.seller_telegram_id.toString()) {
            return ctx.answerCbQuery('⚠️ Kendi ilanınız için özel mesaj açamazsınız!', { show_alert: true });
        }
        const saticiKazanci = Math.floor(pmCost * 0.15);
        const komisyon = pmCost - saticiKazanci;
        const newBalance = currentBalance - pmCost;
        await db.query('UPDATE chip_wallets SET available_balance = $1 WHERE user_id = $2', [newBalance, buyerCheck.rows[0].id]);
        await db.query('UPDATE chip_wallets SET available_balance = available_balance + $1 WHERE user_id = $2', [saticiKazanci, sellerInfo.seller_user_id]);
        await db.query('UPDATE system_vault SET total_profit = total_profit + $1 WHERE id = 1', [komisyon]).catch(() => { });
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
        await ctx.reply(`✅ **Ödeme Başarılı!**\n\n👉 [Satıcıya Özel Mesaj Gönder](tg://user?id=${sellerInfo.seller_telegram_id})\n\n🪙 Kalan: ${newBalance} Çip`, { parse_mode: 'Markdown' });
        bot.telegram.sendMessage(sellerInfo.seller_telegram_id, `✉️ **YENİ ÖZEL MESAJ TALEBİ!**\n💰 Net Kazancınız: ${saticiKazanci} Çip eklendi!\n👉 [Müşterinin Profiline Git](tg://user?id=${telegramId})`, { parse_mode: 'Markdown' }).catch(() => { });
    }
    catch (error) { }
});
bot.on('text', async (ctx) => {
    const asama = sohbetHafizasi[ctx.from.id];
    const mesaj = ctx.message.text;
    const butonlar = ['🏪 İlan Ver', '💰 Bakiyem', '🎁 Günlük Ödül', 'ℹ️ Yardım', 'İlan Ver', 'Bakiyem', 'Günlük Ödül', 'Yardım'];
    if (butonlar.includes(mesaj))
        return;
    if (asama === 'MAGAZA_ISMI_BEKLENIYOR') {
        geciciVeri[ctx.from.id] = { isim: mesaj };
        sohbetHafizasi[ctx.from.id] = 'MAGAZA_ACIKLAMASI_BEKLENIYOR';
        ctx.reply('Açıklama yaz:');
    }
    else if (asama === 'MAGAZA_ACIKLAMASI_BEKLENIYOR') {
        try {
            const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
            await db.query('INSERT INTO seller_profiles (user_id, store_name, description) VALUES ($1, $2, $3)', [userCheck.rows[0].id, geciciVeri[ctx.from.id].isim, mesaj]);
            delete sohbetHafizasi[ctx.from.id];
            ctx.reply(`🎉 Mağazanız oluşturuldu. Yeni ilan verebilirsiniz!`, anaMenu);
        }
        catch (error) {
            ctx.reply('❌ Mağaza oluşturulamadı.', anaMenu);
        }
    }
    else if (asama === 'URUN_ISMI_BEKLENIYOR') {
        geciciVeri[ctx.from.id].baslik = mesaj;
        sohbetHafizasi[ctx.from.id] = 'URUN_FIYATI_BEKLENIYOR';
        ctx.reply('✅ Başlık alındı.\n\nŞimdi bu ürünün açılması için Kaç Çip gerektiğini yaz:');
    }
    else if (asama === 'URUN_FIYATI_BEKLENIYOR') {
        const fiyat = parseInt(mesaj);
        if (isNaN(fiyat) || fiyat <= 0)
            return ctx.reply('❌ Lütfen sadece rakam yazın:');
        geciciVeri[ctx.from.id].fiyat = fiyat;
        sohbetHafizasi[ctx.from.id] = 'URUN_FOTOGRAFI_BEKLENIYOR';
        ctx.reply(`✅ Fiyat ${fiyat} Çip olarak belirlendi.\n\nŞimdi buraya anlık fotoğraf gönderin:`);
    }
    else {
        if (asama === 'URUN_FOTOGRAFI_BEKLENIYOR') {
            delete sohbetHafizasi[ctx.from.id];
            await ctx.reply('⚠️ Bu görseli sadece siz görebilirsiniz. İlana aykırı görsel paylaşımı veya metin girişi olduğu için işlem iptal edilmiştir.', anaMenu);
            return;
        }
        const username = ctx.from.username || ctx.from.first_name || 'Kullanıcı';
        await sendWelcomeOrHelp(ctx, username);
    }
});
bot.on('photo', async (ctx) => {
    const asama = sohbetHafizasi[ctx.from.id];
    if (asama !== 'URUN_FOTOGRAFI_BEKLENIYOR') {
        await ctx.reply('⚠️ Bu görseli sadece siz görebilirsiniz. İlana aykırı görsel paylaşımı olduğu için işlem gerçekleştirilmedi.', anaMenu);
        return;
    }
    try {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const baslik = geciciVeri[ctx.from.id].baslik;
        const fiyat = geciciVeri[ctx.from.id].fiyat;
        const sellerTelegramId = ctx.from.id.toString();
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const buffer = await new Promise((resolve, reject) => {
            https_1.default.get(fileLink.href, (res) => {
                if (res.statusCode !== 200)
                    return reject(new Error('Dosya çekilemedi!'));
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            }).on('error', (err) => reject(err));
        });
        const blurredBuffer = await (0, sharp_1.default)(buffer)
            .rotate()
            .jpeg({ quality: 80 })
            .blur(30)
            .toBuffer();
        const previewMsg = await ctx.replyWithPhoto({ source: blurredBuffer }, { caption: `⏳ İşleniyor...` });
        const blurredFileId = previewMsg.photo[previewMsg.photo.length - 1].file_id;
        await ctx.telegram.deleteMessage(ctx.chat.id, previewMsg.message_id).catch(() => { });
        const userCheck = await db.query('SELECT id FROM users WHERE telegram_user_id = $1', [ctx.from.id]);
        const sellerCheck = await db.query('SELECT * FROM seller_profiles WHERE user_id = $1', [userCheck.rows[0].id]);
        const satici = sellerCheck.rows[0];
        const insertUrun = await db.query('INSERT INTO products (seller_id, title, unlock_cost_chips) VALUES ($1, $2, $3) RETURNING id', [satici.id, baslik, fiyat]);
        const urunId = insertUrun.rows[0].id;
        await db.query('INSERT INTO product_images (product_id, original_storage_key, preview_storage_key) VALUES ($1, $2, $3)', [urunId, fileId, blurredFileId]);
        delete sohbetHafizasi[ctx.from.id];
        const captionText = `🚨 YENİ GİZLİ ÜRÜN EKLENDİ!\n\n🏪 Mağaza: ${satici.store_name}\n📦 Ürün: ${baslik}\n🔒 Durum: GİZLİ\n🪙 Bedel: ${fiyat} Çip`;
        const butonlar = telegraf_1.Markup.inlineKeyboard([telegraf_1.Markup.button.callback(`🔓 ${fiyat} Çipe Aç`, `urunu_ac_${urunId}_${fiyat}`)]);
        ilanKuyrugu.push({ sellerTelegramId, blurredFileId, captionText, butonlar });
        ilanKuyrugunuIsle();
        await ctx.reply(`🎉 MÜTHİŞ! Ürünün sıraya eklendi.`, anaMenu);
    }
    catch (error) {
        console.error("FOTOĞRAF HATASI:", error);
        ctx.reply(`❌ İşlem yapılamadı. Tekrar deneyin.`, anaMenu);
    }
});
bot.on(['document', 'video', 'audio', 'sticker'], async (ctx) => {
    delete sohbetHafizasi[ctx.from.id];
    await ctx.reply('⚠️ Bu görseli sadece siz görebilirsiniz. İlana aykırı uygunsuz dosya paylaşımı olduğu için işlem iptal edilmiştir.', anaMenu);
});
bot.launch().then(() => console.log('🤖 Bot tam sürümle aktif!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Sunucu çalışıyor.'));
process.once('SIGINT', () => { bot.stop('SIGINT'); db.end(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); db.end(); });
