// constants
const bot_token = "";

// dependencies
const tiktok = require("tiktok-scraper-without-watermark");
const axios = require("axios");
const URI = require("urijs");
const { Client, Intents } = require("discord.js");

// driver code
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.login(bot_token);

// event handlers
client.on('messageCreate', async msg => {
    if (!msg.content) return;
    console.log("recieved message")
    URI.withinString(msg.content, async (url) => {
        if (!url.includes("tiktok.com")) return;
        try {
            msg.channel.sendTyping();
            // get links to video file
            let links = await tiktok.tiktokdownload(url);
            // donwload video with no-watermark link
            let response = await axios.get(links.nowm, {responseType: "arraybuffer"});
            // send discord reply with video
            await msg.reply({files: [{attachment: response.data, name: "video.mp4"}], allowedMentions: {repliedUser: false}})
        } catch (err) {
            console.log(err, url);
            try {
                await msg.reply({content: `errorwhen downloading tiktok: ${err}`});
            } catch (err) {}
        }
    });
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
});