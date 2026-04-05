const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    downloadContentFromMessage, 
    disconnectReason,
    delay,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chat) => {
        const m = chat.messages[0];
        if (!m.message || m.key.fromMe) return;

        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                     (type === 'imageMessage') ? m.message.imageMessage.caption : '';

        const prefix = '.';
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(" ");

        // --- Automatic Fake Voice Recording ---
        // Jab bhi koi message aayega, bot status "Recording..." show karega
        await sock.sendPresenceUpdate('recording', from);

        if (isCmd) {
            switch (command) {

                case 'menu':
                    const menu = `
🚀 *SAIF ULLAH MULTI-BOT* 🚀

🔓 *.one* - Download View Once Media
🤖 *.ai [text]* - Chat with AI
☁️ *.weather [city]* - Real-time Weather
🎨 *.flux [prompt]* - AI Image Generation
💣 *.bomb [num] [txt] [count]* - SMS Bomber
🎙️ *Fake Recording* - Automatic Active

_Example: .bomb 923xxxx Hello 10_
                    `;
                    await sock.sendMessage(from, { text: menu }, { quoted: m });
                    break;

                // 1. One View Decoder
                case 'one':
                    const q = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    const viewOnce = q?.viewOnceMessageV2 || q?.viewOnceMessage;
                    if (!viewOnce) return sock.sendMessage(from, { text: "Bhai, kisi View Once message pe reply karke .one likho!" });

                    const mType = Object.keys(viewOnce.message)[0];
                    const stream = await downloadContentFromMessage(viewOnce.message[mType], mType.replace('Message', ''));
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

                    await sock.sendMessage(from, { [mType.replace('Message', '')]: buffer, caption: "Unlocked ✅" }, { quoted: m });
                    break;

                // 2. AI Chat
                case 'ai':
                    if (!text) return sock.sendMessage(from, { text: "Sawal toh pucho!" });
                    try {
                        const res = await axios.get(`https://api.simsimi.vn/v1/simtalk?text=${encodeURIComponent(text)}&lc=ur`);
                        await sock.sendMessage(from, { text: `🤖 *AI:* ${res.data.message}` }, { quoted: m });
                    } catch { sock.sendMessage(from, { text: "AI server busy hai." }); }
                    break;

                // 3. SMS/Message Bomber
                case 'bomb':
                    if (args.length < 3) return sock.sendMessage(from, { text: "Format: .bomb 923xxxx Hello 55" });
                    const target = args[0].includes('@') ? args[0] : `${args[0]}@s.whatsapp.net`;
                    const msg = args[1];
                    const count = parseInt(args[2]);

                    if (count > 100) return sock.sendMessage(from, { text: "Limit 100 tak hai bhai!" });
                    
                    sock.sendMessage(from, { text: `🚀 Bombing ${args[0]} with ${count} messages...` });
                    for (let i = 0; i < count; i++) {
                        await sock.sendMessage(target, { text: msg });
                        await delay(300); // 0.3s gap to prevent instant ban
                    }
                    sock.sendMessage(from, { text: "✅ Bombing Finished!" });
                    break;

                // 4. Weather (Using your RapidAPI)
                case 'weather':
                    if (!text) return sock.sendMessage(from, { text: "City ka naam likho." });
                    try {
                        const res = await axios.get(`https://open-weather13.p.rapidapi.com/city/${text}/EN`, {
                            headers: {
                                'x-api-key': 'b946987aa1msh624316aa7fa139fp16fa04jsn1c2843f07791',
                                'x-api-host': 'open-weather13.p.rapidapi.com'
                            }
                        });
                        const data = res.data;
                        const weatherInfo = `☁️ *Weather: ${text}*\n\nTemp: ${data.main.temp}°F\nHumidity: ${data.main.humidity}%\nSky: ${data.weather[0].description}`;
                        await sock.sendMessage(from, { text: weatherInfo }, { quoted: m });
                    } catch { sock.sendMessage(from, { text: "Weather data nahi mila." }); }
                    break;

                // 5. Flux AI Image (Using your RapidAPI)
                case 'flux':
                    if (!text) return sock.sendMessage(from, { text: "Prompt likho!" });
                    try {
                        sock.sendMessage(from, { text: "Image ban rahi hai, thora wait karein..." });
                        const res = await axios.post('https://ai-text-to-image-generator-flux-free-api.p.rapidapi.com/generate', 
                        { prompt: text }, 
                        {
                            headers: {
                                'x-api-key': 'b946987aa1msh624316aa7fa139fp16fa04jsn1c2843f07791',
                                'x-api-host': 'ai-text-to-image-generator-flux-free-api.p.rapidapi.com'
                            }
                        });
                        await sock.sendMessage(from, { image: { url: res.data.url }, caption: `Flux: ${text}` }, { quoted: m });
                    } catch { sock.sendMessage(from, { text: "Image generation fail ho gayi." }); }
                    break;
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut) startBot();
        } else if (connection === 'open') { console.log('BOT READY! ✅'); }
    });
}

startBot();
