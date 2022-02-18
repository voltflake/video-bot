// Place your bot token here
const bot_token = "";

// Dependencies
const tiktok = require("tiktok-scraper-without-watermark");
const axios = require("axios");
const URI = require("urijs");
const { Client, Intents } = require("discord.js");

// Driver code
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.login(bot_token);

// Event handlers
client.on('messageCreate', async msg => {
    if (!msg.content) return;
    URI.withinString(msg.content, async (url) => {
        if (!url.includes("tiktok.com")) return;
        console.log("Recieved tiktok link!");
        try {
            msg.channel.sendTyping();
            // Get links to videos by tiktok url
            let links = await tiktok.tiktokdownload(url);
            // Download video using no-watermark link
            let response = await axios.get(links.nowm, {responseType: "arraybuffer"});
            // Send discord reply with video
            await msg.reply({files: [{attachment: response.data, name: "video.mp4"}], allowedMentions: {repliedUser: false}});
        } catch (err) {
            try {
                await msg.reply({content: `error when downloading tiktok: ${err}`, allowedMentions: {repliedUser: false}});
            } catch (err) {
                console.log("Something Went Horribly Wrong!");
            }
        }
    });
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
});
