/*******************************************************************************************
 *
 *                               NEBUVERSE MASTER BOT
 *
 *                              VERSION: 4.0 (Corrected)
 *
 *      A comprehensive, single-file Discord bot built with discord.js v14.
 *      This version uses a direct, prefix-based command structure as requested,
 *      eliminating previous complex handlers for simplicity and reliability.
 *
 *******************************************************************************************
 *
 * CORE FEATURES:
 *
 * - DIRECT PREFIX COMMANDS ($):
 *   - All commands are triggered by the '$' prefix for intuitive use in chat.
 *
 * - INTERACTIVE HELP MENU (NUMBER-BASED):
 *   - `$help` command prompts the user to type a number to select a category.
 *
 * - COMPLETE FEATURE SUITE:
 *   - Economy System: `$balance`, `$daily`, `$work`, `$gamble`.
 *   - Interactive Games: `$tictactoe`, `$connect4`, `$truth`, `$dare`.
 *   - Lenient Counting: Corrects wrong numbers without deleting messages. Admin: `$countingreset`.
 *   - Passphrase Verification: Uses "w" or a button to grant the newbie role.
 *   - Leveling System: XP, levels, and automated role rewards.
 *   - Invite Tracking: Monitors who invites new members.
 *   - Custom Announcements: `$announce` includes a non-pinging role mention.
 *
 * - AUTOMATED SERVER MANAGEMENT:
 *   - Precise Server Stats VC: `🔒 Humans`, `🌐 DOB`, and `🎯 Member Goal` update automatically.
 *   - Automated welcome messages (Public + DM).
 *
 * - PERSISTENT STORAGE:
 *   - Uses SQLite3 for all user data, server configuration, and economy state.
 *
 *******************************************************************************************
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. DISCORD DEVELOPER PORTAL:
 *    - Go to your bot's application page -> "Bot" tab.
 *    - Under "Privileged Gateway Intents", ensure `MESSAGE CONTENT INTENT` is ENABLED.
 *
 * 2. DEPENDENCIES:
 *    - Open PowerShell and run: `npm install discord.js@14 dotenv sqlite3`
 *
 * 3. CONFIGURATION:
 *    - Create a `.env` file with your bot token: `TOKEN=YOUR_BOT_TOKEN`
 *    - Confirm all IDs in the `CONSTANTS / CONFIG` section below.
 *
 * 4. EXECUTION:
 *    - Run the bot from PowerShell with: `node .`
 *
 *******************************************************************************************/

/* ======================================================================================= */
/*                                      IMPORTS                                            */
/* ======================================================================================= */

require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    PermissionsBitField,
    ChannelType,
    Collection,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

/* ======================================================================================= */
/*                                  CONSTANTS / CONFIG                                     */
/* ======================================================================================= */

// Core bot settings
const PREFIX = "$";
const GUILD_ID = "1406978202613584033"; // Your Server ID

// Channel IDs
const CHANNEL_ANNOUNCEMENTS = "1406978202957643779";
const CHANNEL_VERIFY = "1406978202626162818";
const CHANNEL_WELCOME = "1406978202957643776";

// Role IDs
const ROLE_NEWBIE = "1406978202613584037"; // Given after verification
const ROLE_PING_ANNOUNCE = "1406978202613584035"; // The "@📢ping" role ID

// Leveling role rewards (Level -> Role ID)
const levelRoles = {
    10: "1406978202613584038", // pro
    25: "1406978202613584039", // epic
    50: "1406978202613584040", // legendary
    100: "1406978202613584041", // godly
    200: "1406978202613584042", // MYTHICAL
};

// Verification passphrase
const VERIFICATION_PASSPHRASE = "w";

// Server Stats Voice Channel configuration (as requested)
const VC_STATS_CONFIG = {
    HUMANS: { name: (count) => `🔒 Humans: ${count}`, enabled: true },
    DOB: { name: (dob) => `🌐 DOB: ${dob}`, enabled: true, defaultValue: "18/08/2025" },
    GOAL: { name: (goal) => `🎯 Member Goal: ${goal}`, enabled: true, defaultValue: 30 },
};

// Economy configuration
const ECONOMY_CONFIG = {
    DAILY_COOLDOWN: 24 * 60 * 60 * 1000, // 22 hours
    DAILY_MIN: 200, DAILY_MAX: 500,
    WORK_COOLDOWN: 2 * 60 * 60 * 1000,   // 2 hours
    WORK_MIN: 50, WORK_MAX: 200,
    WORK_MESSAGES: [
        "You moonlighted as a bug bounty hunter and earned",
        "You streamed on Twitch and your viewers donated",
        "You sold some rare items on the galactic market for",
        "You tutored a youngling in the ways of the Force and received",
        "You sold feet pics of yourself and received",
        "You delivered mail and received",
        "You advertised nebuverse and received",
    ],
};

/* ======================================================================================= */
/*                                     CLIENT SETUP                                        */
/* ======================================================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // REQUIRED for prefix commands
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Collections for commands and active games
const Commands = new Collection();
const activeGames = new Map();

/* ======================================================================================= */
/*                                   DATABASE SETUP                                        */
/* ======================================================================================= */

const db = new sqlite3.Database("./nebuverse-master.sqlite", (err) => {
    if (err) console.error("❌ Database connection error:", err.message);
    else console.log("✅ Database connected successfully.");
});

db.serialize(() => {
    // Guild-specific configuration for stats, counting, etc.
    db.run(`CREATE TABLE IF NOT EXISTS config (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT DEFAULT '${PREFIX}',
        counting_channel_id TEXT,
        vc_humans_id TEXT,
        vc_dob_id TEXT,
        vc_goal_id TEXT,
        dob_text TEXT DEFAULT '${VC_STATS_CONFIG.DOB.defaultValue}',
        goal_value INTEGER DEFAULT ${VC_STATS_CONFIG.GOAL.defaultValue}
    )`);

    // User data for leveling and invites
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        invites INTEGER DEFAULT 0
    )`);

    // State of the counting channel
    db.run(`CREATE TABLE IF NOT EXISTS counting (
        guild_id TEXT PRIMARY KEY,
        number INTEGER DEFAULT 1,
        last_user_id TEXT
    )`);

    // Cache for tracking invite uses
    db.run(`CREATE TABLE IF NOT EXISTS invites_cache (
        guild_id TEXT,
        code TEXT,
        uses INTEGER,
        PRIMARY KEY (guild_id, code)
    )`);

    // User data for the economy system
    db.run(`CREATE TABLE IF NOT EXISTS economy (
        user_id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        last_daily INTEGER DEFAULT 0,
        last_work INTEGER DEFAULT 0
    )`);
});

/* ======================================================================================= */
/*                                   UTILITY FUNCTIONS                                     */
/* ======================================================================================= */

/**
 * Ensures a configuration row exists for a given guild in the database.
 * If a row doesn't exist, it creates one with default values.
 * @param {string} guildId The ID of the guild.
 * @returns {Promise<object>} The guild's configuration object.
 */
function ensureConfig(guildId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM config WHERE guild_id = ?", [guildId], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row);
            // If no row exists, insert one and then return it
            db.run("INSERT INTO config (guild_id) VALUES (?)", [guildId], (err2) => {
                if (err2) return reject(err2);
                db.get("SELECT * FROM config WHERE guild_id = ?", [guildId], (err3, newRow) => {
                    if (err3) return reject(err3);
                    resolve(newRow);
                });
            });
        });
    });
}

/**
 * Ensures a user row exists in the economy table.
 * If a user is not in the table, they are added with a starting balance of 0.
 * @param {string} userId The ID of the user.
 * @returns {Promise<void>}
 */
function ensureUserInEconomy(userId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT 1 FROM economy WHERE user_id = ?", [userId], (err, row) => {
            if (err) return reject(err);
            if (!row) {
                db.run("INSERT INTO economy (user_id, balance) VALUES (?, ?)", [userId, 0], (err2) => {
                    if (err2) return reject(err2);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });
}

/**
 * Checks if a guild member has administrative permissions (Manage Guild or Administrator).
 * @param {import('discord.js').GuildMember} member The member object.
 * @returns {boolean} True if the member is an admin, false otherwise.
 */
function isAdmin(member) {
    if (!member) return false;
    return member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
           member.permissions.has(PermissionsBitField.Flags.Administrator);
}

/**
 * Calculates the experience points needed to reach the next level based on an exponential curve.
 * @param {number} level The current level.
 * @returns {number} The total XP required to advance to the next level.
 */
function xpNeeded(level) {
    return 5 * (level ** 2) + 50 * level + 100;
}

/**
 * Adds a specified amount of XP to a user and handles level-ups.
 * If the user levels up, the onLevelUp callback is executed.
 * @param {string} userId The user's ID.
 * @param {number} amount The amount of XP to add.
 * @param {(newLevel: number) => void} onLevelUp Callback function executed on level up.
 */
function addXP(userId, amount, onLevelUp) {
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
        if (err) return console.error("DB Error on addXP:", err);
        const userData = row || { xp: 0, level: 0, invites: 0 };
        
        let newXp = userData.xp + amount;
        let newLevel = userData.level;
        let needed = xpNeeded(newLevel);
        let leveledUp = false;

        // Loop in case of multiple level-ups from a large XP gain
        while (newXp >= needed) {
            newXp -= needed;
            newLevel++;
            needed = xpNeeded(newLevel);
            leveledUp = true;
        }
        
        const query = row
            ? "UPDATE users SET xp = ?, level = ? WHERE user_id = ?"
            : "INSERT INTO users (xp, level, user_id) VALUES (?, ?, ?)";
        
        db.run(query, [newXp, newLevel, userId], (dbErr) => {
            if (dbErr) return console.error("DB Error saving XP:", dbErr);
            if (leveledUp && typeof onLevelUp === "function") {
                onLevelUp(newLevel);
            }
        });
    });
}

/* ======================================================================================= */
/*                                COMMAND DEFINITIONS                                      */
/* ======================================================================================= */

const commandCategories = {
    '1': { name: '🎲 Fun & Games', description: 'Engaging games and fun commands.', commands: ['8ball', 'coinflip', 'dice', 'joke', 'meme', 'tictactoe', 'connect4', 'truth', 'dare'] },
    '2': { name: '💰 Economy', description: 'Earn and gamble your virtual currency.', commands: ['balance', 'daily', 'work', 'gamble'] },
    '3': { name: '🛠️ Utility', description: 'Helpful tools and server information.', commands: ['ping', 'userinfo', 'serverinfo', 'invites', 'embed'] },
    '4': { name: '📈 Leveling & Stats', description: 'Check your progress and rankings.', commands: ['stats', 'leaderboard'] },
    '5': { name: '🔑 Core Systems', description: 'Info on Verification and Counting.', commands: ['verificationinfo', 'countinginfo'] },
};

// ----------------- HELP COMMAND (NUMBER-BASED) -----------------
Commands.set('help', {
    description: 'Shows this interactive, number-based help menu.',
    async run(message) {
        const mainEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('😏 Nebuverse Bot Help Menu')
            .setDescription('enter the number of the category you  want to explore 🫂.')
            .setFooter({ text: 'This menu will expire in 30 seconds.' })
            .setTimestamp();

        for (const key in commandCategories) {
            const category = commandCategories[key];
            mainEmbed.addFields({ name: `${key}. ${category.name}`, value: category.description });
        }

        const helpMessage = await message.channel.send({ embeds: [mainEmbed] });

        const filter = m => m.author.id === message.author.id && commandCategories[m.content.trim()];
        const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async m => {
            const categoryKey = m.content.trim();
            if (m.deletable) await m.delete().catch(() => {});

            const category = commandCategories[categoryKey];
            const categoryEmbed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(`Help Category: ${category.name}`)
                .setTimestamp();

            const commandList = category.commands.map(cmdName => {
                const cmd = Commands.get(cmdName);
                return `➥ **${PREFIX}${cmdName}**: ${cmd?.description || 'No description available.'}`;
            }).join('\n\n');
            
            categoryEmbed.setDescription(commandList || 'No commands found in this category.');
            await helpMessage.edit({ embeds: [categoryEmbed] });
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && helpMessage.editable) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('Help Menu Timed Out')
                    .setDescription(`The help menu has expired. Type \`${PREFIX}help\` again to restart.`);
                helpMessage.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    }
});

// ----------------- FUN & GAMES (Category 1) -----------------
Commands.set('8ball', {
    description: 'Ask the magic 8-ball a question.',
    run(message, args) {
        if (!args.length) return message.reply("🎱 Please ask a question!");
        const responses = ["Yes.", "No.", "Maybe.", "Definitely!", "Ask again later.", "Without a doubt.", "Don’t count on it.", "My sources say no.", "Wtf is that question", "Ew Gross"];
        message.reply(`🎱 ${responses[Math.floor(Math.random() * responses.length)]}`);
    }
});
Commands.set('coinflip', {
    description: 'Flips a coin.',
    run: (message) => message.reply(`🪙 You flipped **${Math.random() < 0.5 ? "Heads" : "Tails"}**`)
});
Commands.set('dice', {
    description: 'Rolls a six-sided die.',
    run: (message) => message.reply(`🎲 You rolled a **${Math.floor(Math.random() * 6) + 1}**`)
});
Commands.set('joke', {
    description: 'Tells a random joke.',
    run: (message) => {
        const jokes = ["Why don’t skeletons fight each other? They don’t have the guts.", "Parallel lines have so much in common. It’s a shame they’ll never meet.", "I'm reading a book on anti-gravity. It's impossible to put down!"];
        message.reply(`😂 ${jokes[Math.floor(Math.random() * jokes.length)]}`);
    }
});
Commands.set('meme', {
    description: 'Sends a random meme.',
    run: (message) => {
        const memes = ["https://i.imgur.com/w3duR07.png", "https://i.imgur.com/2WZtOD6.jpeg", "https://i.imgur.com/CzXTtJV.jpeg"];
        message.reply({ files: [memes[Math.floor(Math.random() * memes.length)]] });
    }
});
Commands.set('truth', {
    description: 'Gives you a random truth question.',
    run: (message) => {
        const truths = ["What's the most embarrassing thing you've ever done?", "What's a secret you've never told anyone?", "Who is your secret crush?", "What's your biggest fear?", "What is your age?", "When was the last time you lied?", "What's your biggest fear?", "What's the biggest mistake you've ever made?", "What's your worst habit?", "What's the biggest misconception about you?", "What was the most inappropriate time you farted?", "What TV/Movie/Anime character do you relate to the most?", "What's the weirdest lie you've ever told?", "What’s the weirdest habit you have when you’re alone?"];
        message.reply(`🤔 **Truth**: ${truths[Math.floor(Math.random() * truths.length)]}`);
    }
});
Commands.set('dare', {
    description: 'Gives you a random dare.',
    run: (message) => {
        const dares = ["Send a screenshot of your home screen.", "Talk in rhymes for the next 5 minutes.", "Send the 5th picture from your gallery.", "Use only emojis to talk for the next 10 minutes.", "Text your best friend and ask, 'u up?'"];
        message.reply(`😈 **Dare**: ${dares[Math.floor(Math.random() * dares.length)]}`);
    }
});
Commands.set('tictactoe', {
    description: 'Play Tic Tac Toe with a friend. Usage: `$tictactoe @user`',
    async run(message) { startGame(message, TicTacToe); }
});
Commands.set('connect4', {
    description: 'Play Connect 4 with a friend. Usage: `$connect4 @user`',
    async run(message) { startGame(message, Connect4); }
});

// ----------------- ECONOMY (Category 2) -----------------
Commands.set('balance', {
    description: 'Check your or another user\'s coin balance.',
    async run(message) {
        const user = message.mentions.users.first() || message.author;
        await ensureUserInEconomy(user.id);
        db.get("SELECT balance FROM economy WHERE user_id = ?", [user.id], (err, row) => {
            if (err) return message.reply("Could not fetch balance.");
            const balance = row?.balance ?? 0;
            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle(`${user.username}'s Wallet`)
                .setDescription(`They have **${balance}** coins.`);
            message.channel.send({ embeds: [embed] });
        });
    }
});
Commands.set('daily', {
    description: 'Claim your daily coin reward.',
    async run(message) {
        await ensureUserInEconomy(message.author.id);
        db.get("SELECT last_daily FROM economy WHERE user_id = ?", [message.author.id], (err, row) => {
            const lastDaily = row?.last_daily ?? 0;
            if (Date.now() - lastDaily < ECONOMY_CONFIG.DAILY_COOLDOWN) {
                const remaining = new Date(ECONOMY_CONFIG.DAILY_COOLDOWN - (Date.now() - lastDaily)).toISOString().substr(11, 8);
                return message.reply(`You've already claimed your daily reward. Come back in **${remaining}**.`);
            }
            const amount = Math.floor(Math.random() * (ECONOMY_CONFIG.DAILY_MAX - ECONOMY_CONFIG.DAILY_MIN + 1)) + ECONOMY_CONFIG.DAILY_MIN;
            db.run("UPDATE economy SET balance = balance + ?, last_daily = ? WHERE user_id = ?", [amount, Date.now(), message.author.id], (dbErr) => {
                if (dbErr) return message.reply("Failed to claim daily reward.");
                message.reply(`🎉 You claimed your daily reward and received **${amount}** coins!`);
            });
        });
    }
});
Commands.set('work', {
    description: 'Work to earn some extra coins.',
    async run(message) {
        await ensureUserInEconomy(message.author.id);
        db.get("SELECT last_work FROM economy WHERE user_id = ?", [message.author.id], (err, row) => {
            const lastWork = row?.last_work ?? 0;
            if (Date.now() - lastWork < ECONOMY_CONFIG.WORK_COOLDOWN) {
                const remaining = new Date(ECONOMY_CONFIG.WORK_COOLDOWN - (Date.now() - lastWork)).toISOString().substr(11, 8);
                return message.reply(`You're tired from working. Take a break for **${remaining}**.`);
            }
            const amount = Math.floor(Math.random() * (ECONOMY_CONFIG.WORK_MAX - ECONOMY_CONFIG.WORK_MIN + 1)) + ECONOMY_CONFIG.WORK_MIN;
            const workMessage = ECONOMY_CONFIG.WORK_MESSAGES[Math.floor(Math.random() * ECONOMY_CONFIG.WORK_MESSAGES.length)];
            db.run("UPDATE economy SET balance = balance + ?, last_work = ? WHERE user_id = ?", [amount, Date.now(), message.author.id], (dbErr) => {
                if (dbErr) return message.reply("Failed to work.");
                message.reply(`💼 ${workMessage} **${amount}** coins!`);
            });
        });
    }
});
Commands.set('gamble', {
    description: 'Gamble your coins. Usage: `$gamble <amount>`',
    async run(message, args) {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) return message.reply("Please provide a valid, positive amount to gamble.");
        await ensureUserInEconomy(message.author.id);
        db.get("SELECT balance FROM economy WHERE user_id = ?", [message.author.id], (err, row) => {
            if (err) return message.reply("Could not retrieve your balance.");
            const balance = row?.balance ?? 0;
            if (amount > balance) return message.reply("You don't have enough coins to gamble that much.");
            
            const win = Math.random() < 0.48; // Slightly less than 50% for the house edge
            const newBalance = win ? balance + amount : balance - amount;
            
            db.run("UPDATE economy SET balance = ? WHERE user_id = ?", [newBalance, message.author.id], (dbErr) => {
                if (dbErr) return message.reply("An error occurred while gambling.");
                message.reply(win ? `🎉 **You won!** You gained ${amount} coins and now have **${newBalance}**.` : `💔 **You lost!** You lost ${amount} coins and now have **${newBalance}**.`);
            });
        });
    }
});

// ----------------- UTILITY (Category 3) -----------------
Commands.set('ping', {
    description: 'Checks the bot\'s latency to the Discord API.',
    run: (message) => message.reply(`🏓 Pong! Latency is ${Date.now() - message.createdTimestamp}ms. API Latency is ${Math.round(client.ws.ping)}ms.`)
});
Commands.set('userinfo', {
    description: 'Displays information about you or a mentioned user.',
    run: (message) => {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        const embed = new EmbedBuilder().setTitle(`👤 User Info: ${user.username}`).setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: "Tag", value: user.tag, inline: true },
                { name: "ID", value: user.id, inline: true },
                { name: "Joined Server", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
            ).setColor(0x57F287);
        message.reply({ embeds: [embed] });
    }
});
Commands.set('serverinfo', {
    description: 'Displays information about the server.',
    async run(message) {
        const { guild } = message;
        try { await guild.members.fetch(); } catch {}
        const embed = new EmbedBuilder().setTitle(`📊 Server Info: ${guild.name}`)
            .addFields(
                { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
                { name: "Members", value: `${guild.memberCount}`, inline: true },
                { name: "Humans", value: `${guild.members.cache.filter(m => !m.user.bot).size}`, inline: true },
                { name: "Created On", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
            ).setColor(0x5865F2);
        message.reply({ embeds: [embed] });
    }
});
Commands.set('invites', {
    description: 'Shows how many people you have successfully invited.',
    run: (message) => {
        db.get("SELECT invites FROM users WHERE user_id = ?", [message.author.id], (err, row) => {
            message.reply(`You have **${row?.invites ?? 0}** successful invite(s).`);
        });
    }
});
Commands.set('embed', {
    description: 'Create a simple embed. Usage: `$embed Title | Description`',
    run: (message, args) => {
        const content = args.join(" ");
        const [title, desc] = content.split("|").map(s => s.trim());
        if (!title && !desc) return message.reply("You must provide a title and/or description.");
        const embed = new EmbedBuilder().setTitle(title || null).setDescription(desc || null).setColor(0x3498db);
        message.channel.send({ embeds: [embed] });
        if (message.deletable) message.delete().catch(() => {});
    }
});

// ----------------- LEVELING & STATS (Category 4) -----------------
Commands.set('stats', {
    description: 'Shows your current level, XP, and invites.',
    run: (message) => {
        const user = message.mentions.users.first() || message.author;
        db.get("SELECT * FROM users WHERE user_id = ?", [user.id], (err, row) => {
            const { xp = 0, level = 0, invites = 0 } = row || {};
            const needed = xpNeeded(level);
            const embed = new EmbedBuilder().setTitle(`${user.username}'s Stats`)
                .addFields(
                    { name: "Level", value: String(level), inline: true },
                    { name: "XP", value: `${xp} / ${needed}`, inline: true },
                    { name: "Invites", value: String(invites), inline: true },
                ).setColor(0x9b59b6);
            message.channel.send({ embeds: [embed] });
        });
    }
});
Commands.set('leaderboard', {
    description: 'Displays the top 10 users by level.',
    run: (message) => {
        db.all("SELECT user_id, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10", [], (err, rows) => {
            if (err || !rows || rows.length === 0) return message.reply("No leaderboard data yet.");
            const lines = rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — Level ${r.level} (${r.xp} XP)`);
            const embed = new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(lines.join("\n")).setColor(0xf1c40f);
            message.channel.send({ embeds: [embed] });
        });
    }
});

// ----------------- CORE SYSTEMS (Category 5) -----------------
Commands.set('verificationinfo', {
    description: 'Explains how the verification system works.',
    run: (message) => {
        const embed = new EmbedBuilder().setTitle("✅ Verification System")
            .setDescription(`To get verified, go to <#${CHANNEL_VERIFY}> and either click the "Verify" button or type the passphrase: \`${VERIFICATION_PASSPHRASE}\``).setColor(0x2ecc71);
        message.channel.send({ embeds: [embed] });
    }
});
Commands.set('countinginfo', {
    description: 'Explains how the counting channel works.',
    run: (message) => {
        const embed = new EmbedBuilder().setTitle("🔢 Counting System")
            .setDescription("In the counting channel, the bot will react with ✅ if you type the correct next number and it's not your turn. If you make a mistake, the bot will reply with the correct number. Your message will not be deleted.").setColor(0x3498db);
        message.channel.send({ embeds: [embed] });
    }
});

// ----------------- ADMIN COMMANDS (Not in help menu) -----------------
Commands.set('announce', {
    description: 'Sends a server announcement.',
    run: (message, args) => {
        if (!isAdmin(message.member)) return;
        const text = args.join(" ").trim();
        if (!text) return message.reply("You need to provide a message to announce.");
        const announceChannel = message.guild.channels.cache.get(CHANNEL_ANNOUNCEMENTS);
        if (!announceChannel) return message.reply("Announcements channel not found.");
        
        const embed = new EmbedBuilder().setTitle("📢 Announcement").setDescription(text).setColor(0x2ecc71).setTimestamp();
        
        // This is the literal text that will appear in the message content
        const announcementRoleText = "@📢ping";
        
        announceChannel.send({
            content: announcementRoleText,
            embeds: [embed],
            // This ensures no role or user is actually pinged
            allowedMentions: { roles: [], users: [] }
        });
        
        message.react("✅").catch(() => {});
    }
});
Commands.set('countingreset', {
    description: 'Resets the counting channel number to 1.',
    run: (message) => {
        if (!isAdmin(message.member)) return;
        db.run("UPDATE counting SET number = 1, last_user_id = NULL WHERE guild_id = ?", [message.guild.id], (err) => {
            if (err) return message.reply("Failed to reset counting.");
            message.reply("✅ Counting has been successfully reset to 1.");
        });
    }
});
Commands.set('setcounting', {
    description: 'Sets the channel for counting.',
    async run(message) {
        if (!isAdmin(message.member)) return;
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Please mention a channel, e.g., `$setcounting #counting`");
        
        await ensureConfig(message.guild.id);
        db.run("UPDATE config SET counting_channel_id = ? WHERE guild_id = ?", [channel.id, message.guild.id]);
        db.run("INSERT OR REPLACE INTO counting (guild_id, number, last_user_id) VALUES (?, ?, ?)", [message.guild.id, 1, null]);
        
        message.reply(`✅ Counting channel has been set to ${channel}.`);
    }
});


/* ======================================================================================= */
/*                                      EVENT HANDLERS                                     */
/* ======================================================================================= */

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('Nebuverse', { type: 'WATCHING' });

    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        console.log(`Attaching to guild: ${guild.name}`);
        await ensureConfig(guild.id);
        await cacheInvitesForGuild(guild);
        scheduleStatsVC(guild);
        await ensureVerifyMessage();
    } else {
        console.error("❌ Could not find the specified guild. Please check GUILD_ID.");
    }
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    // --- Core Systems Handling (run on every message) ---
    await handleLeveling(message);
    await handleVerificationPassphrase(message);
    await handleCounting(message);

    // --- Command Parser & Executor ---
    if (!message.content.toLowerCase().startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = Commands.get(commandName);

    if (command) {
        try {
            await command.run(message, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            message.reply("An error occurred while executing that command.");
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    // Verification Button Click
    if (interaction.isButton() && interaction.customId === "verify_button") {
        try {
            if (interaction.member.roles.cache.has(ROLE_NEWBIE)) {
                return interaction.reply({ content: "✅ You’re already verified!", ephemeral: true });
            }
            await interaction.member.roles.add(ROLE_NEWBIE);
            await interaction.reply({ content: "🎉 You’ve been verified!", ephemeral: true });
        } catch {
            await interaction.reply({ content: "Couldn’t verify you right now. I might be missing permissions.", ephemeral: true }).catch(() => {});
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    if (member.guild.id !== GUILD_ID) return;

    // Public welcome
    const welcomeChannel = member.guild.channels.cache.get(CHANNEL_WELCOME);
    if (welcomeChannel) welcomeChannel.send(`👋 Welcome to the server, ${member}!`).catch(() => {});

    // DM welcome
    member.send(`Welcome to **${member.guild.name}**! Please head to <#${CHANNEL_VERIFY}> to get verified.`).catch(() => {});

    // Invite tracking
    const usedInvite = await findUsedInvite(member);
    if (usedInvite && usedInvite.inviter) {
        db.get("SELECT 1 FROM users WHERE user_id = ?", [usedInvite.inviter.id], (err, row) => {
            if (!row) db.run("INSERT INTO users (user_id, invites) VALUES (?, ?)", [usedInvite.inviter.id, 1]);
            else db.run("UPDATE users SET invites = invites + 1 WHERE user_id = ?", [usedInvite.inviter.id]);
        });
    }

    // Update stats
    refreshStatsVC(member.guild);
});

client.on('guildMemberRemove', (member) => {
    if (member.guild.id !== GUILD_ID) return;
    refreshStatsVC(member.guild);
});

/* ======================================================================================= */
/*                              CORE SYSTEM IMPLEMENTATIONS                                */
/* ======================================================================================= */

/**
 * Handles granting XP and processing level-ups for users.
 * @param {import('discord.js').Message} message The message that triggered the event.
 */
async function handleLeveling(message) {
    // Award 15 XP per message
    addXP(message.author.id, 15, async (newLevel) => {
        try {
            const levelUpEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setDescription(`🎉 Congratulations <@${message.author.id}>, you have advanced to **Level ${newLevel}**!`);
                
            const sentMessage = await message.channel.send({ embeds: [levelUpEmbed] });

            // Check for a role reward at the new level
            const rewardRoleId = levelRoles[newLevel];
            if (rewardRoleId) {
                const role = message.guild.roles.cache.get(rewardRoleId);
                if (role) {
                    await message.member.roles.add(role);
                    await message.channel.send(`As a reward, you've unlocked the **${role.name}** role! 🚀`);
                }
            }
        } catch (err) {
            console.error("Level-up announcement failed:", err);
        }
    });
}

/**
 * Checks for the verification passphrase in the verification channel.
 * @param {import('discord.js').Message} message The message that triggered the event.
 */
async function handleVerificationPassphrase(message) {
    if (message.channel.id !== CHANNEL_VERIFY) return;
    if (message.content.trim().toLowerCase() === VERIFICATION_PASSPHRASE) {
        try {
            if (message.member.roles.cache.has(ROLE_NEWBIE)) return;
            await message.member.roles.add(ROLE_NEWBIE);
            await message.react("✅");
            const reply = await message.reply("You have been verified! ✅");
            setTimeout(() => {
                reply.delete().catch(() => {});
                message.delete().catch(() => {});
            }, 5000);
        } catch(err) {
            console.error("Failed to assign verification role:", err);
        }
    }
}

/**
 * Manages the counting logic in the designated counting channel.
 * @param {import('discord.js').Message} message The message that triggered the event.
 */
async function handleCounting(message) {
    const config = await ensureConfig(message.guild.id);
    if (message.channel.id !== config.counting_channel_id) return;
    if (!/^\d+$/.test(message.content.trim())) return; // Ignore non-numeric messages

    const num = parseInt(message.content.trim(), 10);
    db.get("SELECT number, last_user_id FROM counting WHERE guild_id = ?", [message.guild.id], async (err, row) => {
        if (err) return;
        const expected = row?.number ?? 1;
        const lastId = row?.last_user_id ?? null;

        if (message.author.id !== lastId && num === expected) {
            await message.react("✅").catch(()=>{});
            db.run("UPDATE counting SET number = ?, last_user_id = ? WHERE guild_id = ?", [expected + 1, message.author.id, message.guild.id]);
        } else {
            const reason = (message.author.id === lastId) ? "You can’t count twice in a row." : `The next number should be **${expected}**.`;
            const reply = await message.reply(`❌ Oops! ${reason}`);
            setTimeout(() => reply.delete().catch(() => {}), 8000);
        }
    });
}

/**
 * Ensures the verification embed with a button is present in the verify channel.
 */
async function ensureVerifyMessage() {
    try {
        const channel = client.channels.cache.get(CHANNEL_VERIFY);
        if (!channel) return;
        const messages = await channel.messages.fetch({ limit: 20 });
        if (messages.some(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === "verify_button")) return;

        const embed = new EmbedBuilder().setTitle("✅ Server Verification").setDescription(`Welcome! To gain access, please click the **Verify** button below or type the passphrase: \`${VERIFICATION_PASSPHRASE}\``).setColor(0x57F287);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_button").setLabel("Verify").setStyle(ButtonStyle.Success));
        await channel.send({ embeds: [embed], components: [row] });
    } catch (e) { console.error("Failed to post verification message:", e); }
}

/**
 * Creates or updates the server stat voice channels.
 * @param {import('discord.js').Guild} guild The guild to update stats for.
 */
async function refreshStatsVC(guild) {
    const config = await ensureConfig(guild.id);
    try { await guild.members.fetch(); } catch {}
    const humans = guild.members.cache.filter(m => !m.user.bot).size;
    const dob = config.dob_text || VC_STATS_CONFIG.DOB.defaultValue;
    const goal = Number(config.goal_value || VC_STATS_CONFIG.GOAL.defaultValue);

    const ensureVC = async (existingId, desiredName) => {
        if (existingId) {
            const channel = guild.channels.cache.get(existingId);
            if (channel) {
                if (channel.name !== desiredName) await channel.setName(desiredName).catch(() => {});
                return channel.id;
            }
        }
        const created = await guild.channels.create({ name: desiredName, type: ChannelType.GuildVoice, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect] }] }).catch(() => null);
        return created?.id || null;
    };
    
    const idHumans = VC_STATS_CONFIG.HUMANS.enabled ? await ensureVC(config.vc_humans_id, VC_STATS_CONFIG.HUMANS.name(humans)) : null;
    const idDOB = VC_STATS_CONFIG.DOB.enabled ? await ensureVC(config.vc_dob_id, VC_STATS_CONFIG.DOB.name(dob)) : null;
    const idGoal = VC_STATS_CONFIG.GOAL.enabled ? await ensureVC(config.vc_goal_id, VC_STATS_CONFIG.GOAL.name(goal)) : null;
    
    db.run(`UPDATE config SET vc_humans_id=?, vc_dob_id=?, vc_goal_id=? WHERE guild_id=?`, [idHumans, idDOB, idGoal, guild.id]);
}

/**
 * Schedules the regular refresh of the server stat voice channels.
 * @param {import('discord.js').Guild} guild The guild to schedule updates for.
 */
function scheduleStatsVC(guild) {
    refreshStatsVC(guild);
    setInterval(() => refreshStatsVC(guild), 5 * 60 * 1000); // 5 minutes
}

/**
 * Caches all current server invites to the database for later comparison.
 * @param {import('discord.js').Guild} guild The guild whose invites to cache.
 */
async function cacheInvitesForGuild(guild) {
    try {
        const currentInvites = await guild.invites.fetch();
        db.serialize(() => {
            const stmt = db.prepare(`REPLACE INTO invites_cache (guild_id, code, uses) VALUES (?,?,?)`);
            currentInvites.forEach(inv => stmt.run(guild.id, inv.code, inv.uses ?? 0));
            stmt.finalize();
        });
    } catch (e) {
        console.warn(`Could not cache invites for ${guild.name} (missing permissions?).`);
    }
}

/**
 * Compares new invites with cached ones to find which invite a new member used.
 * @param {import('discord.js').GuildMember} member The member who just joined.
 * @returns {Promise<import('discord.js').Invite | null>} The invite that was used, or null.
 */
async function findUsedInvite(member) {
    try {
        const newInvites = await member.guild.invites.fetch();
        let usedInvite = null;
        for (const [code, invite] of newInvites) {
            const cachedUses = await new Promise(resolve => db.get("SELECT uses FROM invites_cache WHERE guild_id = ? AND code = ?", [member.guild.id, code], (e, r) => resolve(r?.uses ?? 0)));
            if ((invite.uses ?? 0) > cachedUses) {
                usedInvite = invite;
                break;
            }
        }
        await cacheInvitesForGuild(member.guild);
        return usedInvite;
    } catch { return null; }
}

/* ======================================================================================= */
/*                                      GAME LOGIC                                         */
/* ======================================================================================= */

/**
 * Initiates a game challenge, waiting for the opponent to accept or decline.
 * @param {import('discord.js').Message} message The message that triggered the game.
 * @param {typeof Game} GameClass The class of the game to start (e.g., TicTacToe).
 */
async function startGame(message, GameClass) {
    if (activeGames.has(message.channel.id)) {
        return message.reply("There's already a game in progress in this channel!");
    }
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
        return message.reply(`You need to mention a valid user to play against! Usage: \`$${GameClass.name.toLowerCase()} @user\``);
    }
    
    const confirmationMsg = await message.channel.send({
        content: `${opponent}, you have been challenged to **${GameClass.name}** by ${message.author}. Do you accept?`,
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept_game').setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('decline_game').setLabel('Decline').setStyle(ButtonStyle.Danger)
            )
        ]
    });
    
    const filter = i => i.user.id === opponent.id && (i.customId === 'accept_game' || i.customId === 'decline_game');
    try {
        const confirmation = await confirmationMsg.awaitMessageComponent({ filter, time: 30000, componentType: ComponentType.Button });
        if (confirmation.customId === 'accept_game') {
            await confirmation.update({ content: 'Challenge accepted! Starting game...', components: [] });
            const game = new GameClass(message.channel, message.author, opponent);
            activeGames.set(message.channel.id, game);
            await game.start();
        } else {
            await confirmation.update({ content: 'Challenge declined.', components: [] });
        }
    } catch (err) {
        await confirmationMsg.edit({ content: 'Challenge expired due to inactivity.', components: [] });
    }
}

class Game {
    constructor(channel, player1, player2) {
        this.channel = channel;
        this.players = [player1, player2];
        this.turn = 0;
        this.message = null;
        this.collector = null;
    }
    get currentPlayer() { return this.players[this.turn]; }
    switchTurn() { this.turn = 1 - this.turn; }
    stop(reason = "Game ended.") {
        if (this.collector && !this.collector.ended) this.collector.stop(reason);
        activeGames.delete(this.channel.id);
    }
}

class TicTacToe extends Game {
    constructor(channel, player1, player2) {
        super(channel, player1, player2);
        this.board = Array(9).fill(null);
        this.symbols = ['❌', '⭕'];
    }
    async start() {
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle('Tic Tac Toe').setDescription(`It's ${this.currentPlayer.username}'s turn! (${this.symbols[this.turn]})`);
        this.message = await this.channel.send({ embeds: [embed], components: this.generateComponents() });
        this.createCollector();
    }
    generateComponents(disabled = false) {
        return [0, 1, 2].map(r => new ActionRowBuilder().addComponents([0, 1, 2].map(c => {
            const i = r * 3 + c;
            return new ButtonBuilder().setCustomId(`ttt_${i}`).setLabel(this.board[i] || ' ').setStyle(this.board[i] ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(disabled || this.board[i] !== null);
        })));
    }
    async handleInteraction(interaction) {
        const index = parseInt(interaction.customId.split('_')[1]);
        if (this.board[index] !== null) return interaction.reply({ content: "This spot is already taken!", ephemeral: true });
        this.board[index] = this.symbols[this.turn];
        
        const winnerSymbol = this.checkWinner();
        if (winnerSymbol) {
            await interaction.update({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('Game Over!').setDescription(`${this.currentPlayer.username} (${winnerSymbol}) wins!`)], components: this.generateComponents(true) });
            return this.stop('win');
        }
        if (this.board.every(cell => cell !== null)) {
            await interaction.update({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('Game Over!').setDescription("It's a draw!")], components: this.generateComponents(true) });
            return this.stop('draw');
        }
        this.switchTurn();
        await interaction.update({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('Tic Tac Toe').setDescription(`It's ${this.currentPlayer.username}'s turn! (${this.symbols[this.turn]})`)], components: this.generateComponents() });
    }
    checkWinner() {
        const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
        for (const line of lines) {
            const [a, b, c] = line;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) return this.board[a];
        }
        return null;
    }
    createCollector() {
        this.collector = this.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3 * 60 * 1000 });
        this.collector.on('collect', async i => {
             if (i.user.id !== this.currentPlayer.id) {
                await i.reply({ content: "It's not your turn!", ephemeral: true });
                return;
            }
            this.handleInteraction(i);
        });
        this.collector.on('end', (c, reason) => {
            if (reason === 'time' && this.message.editable) this.message.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('Game Over').setDescription('Game timed out due to inactivity.')], components: [] }).catch(() => {});
            activeGames.delete(this.channel.id);
        });
    }
}

class Connect4 extends Game {
    constructor(channel, player1, player2) {
        super(channel, player1, player2);
        this.cols = 7; this.rows = 6;
        this.board = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        this.symbols = ['🔴', '🟡'];
    }
    async start() { this.message = await this.channel.send(this.render()); this.createCollector(); }
    render(gameOver = false) {
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle('Connect 4').setDescription(this.board.map(r => r.map(c => c || '⚫').join(' ')).join('\n')).addFields({ name: 'Turn', value: `It's ${this.currentPlayer.username}'s turn! (${this.symbols[this.turn]})` });
        if (gameOver) embed.setColor(gameOver.color).spliceFields(0, 1, { name: 'Game Over!', value: gameOver.text });
        const row = new ActionRowBuilder().addComponents([...Array(this.cols).keys()].map(i => new ButtonBuilder().setCustomId(`c4_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Secondary).setDisabled(gameOver || this.board[0][i] !== null)));
        return { embeds: [embed], components: gameOver ? [] : [row] };
    }
    async handleInteraction(interaction) {
        const col = parseInt(interaction.customId.split('_')[1]);
        let row = -1;
        for (let i = this.rows - 1; i >= 0; i--) if (this.board[i][col] === null) { this.board[i][col] = this.symbols[this.turn]; row = i; break; }
        if (row === -1) return;
        if (this.checkWinner(row, col)) { await interaction.update(this.render({ color: 0x2ecc71, text: `${this.currentPlayer.username} (${this.symbols[this.turn]}) wins!` })); return this.stop('win'); }
        if (this.board[0].every(cell => cell !== null)) { await interaction.update(this.render({ color: 0x95a5a6, text: "It's a draw!" })); return this.stop('draw'); }
        this.switchTurn();
        await interaction.update(this.render());
    }
    checkWinner(r, c) {
        const sym = this.symbols[this.turn];
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (const [dr, dc] of dirs) {
            let count = 1;
            for (let i = 1; i < 4; i++) { const nr = r + i * dr, nc = c + i * dc; if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols || this.board[nr][nc] !== sym) break; count++; }
            for (let i = 1; i < 4; i++) { const nr = r - i * dr, nc = c - i * dc; if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols || this.board[nr][nc] !== sym) break; count++; }
            if (count >= 4) return true;
        }
        return false;
    }
    createCollector() {
        this.collector = this.message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60 * 1000 });
        this.collector.on('collect', async i => {
            if (i.user.id !== this.currentPlayer.id) {
                await i.reply({ content: "It's not your turn!", ephemeral: true });
                return;
            }
            this.handleInteraction(i);
        });
        this.collector.on('end', (c, reason) => {
            if (reason === 'time' && this.message.editable) this.message.edit(this.render({ color: 0xe74c3c, text: 'Game timed out due to inactivity.' })).catch(() => {});
            activeGames.delete(this.channel.id);
        });
    }
}

/* ======================================================================================= */
/*                                     BOT LOGIN                                           */
/* ======================================================================================= */

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
    console.error("❌ TOKEN not found! Create a .env file with TOKEN=YOUR_BOT_TOKEN");
    process.exit(1);
}

client.login(TOKEN).catch(error => {
    console.error("❌ Failed to log in:", error.message);
    console.error("This might be due to an invalid token or missing internet connection.");
});

















