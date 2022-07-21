// Place your bot token here
const bot_token = "";

// Dependencies
const axios = require("axios");
const scraper = require('tiktok-scraper-without-watermark')
const URI = require("urijs");
const { Client, Intents } = require("discord.js");
const fs = require('fs').promises;
const execSync = require("child_process").execSync;
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const pathToFfmpeg = require('ffmpeg-static');

// Driver code
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.login(bot_token);

// Event handlers
client.on('messageCreate', async msg => {
    if (!msg.content) return;
    if (msg.author.id === client.user.id) return;
    URI.withinString(msg.content, async (url) => {
        if (!url.includes("tiktok.com")) return;
        try {
            msg.suppressEmbeds()
        } catch (err) {
            console.log("bot has no permission to remove embeds, silently skipping...");
        }
        msg.channel.sendTyping();
        let status_message = await msg.reply({ content: "Getting video link...", allowedMentions: { repliedUser: false } });
        try {
            msg.channel.sendTyping();
            // Get links to videos by tiktok url
            let links = await scraper.tiktokdownload(url);
            // Download video using no-watermark link
            status_message.edit({ content: "Downloading video...", allowedMentions: { repliedUser: false } });
            let response = await axios.get(links.nowm, { responseType: "arraybuffer" });
            let video = response.data;
            if (video.length > 8_388_608) {
                status_message.edit({ content: "Video is too large, compressing...", allowedMentions: { repliedUser: false } });
                await fs.writeFile("temp.mp4", video);
                let info = await ffprobe('temp.mp4', { path: ffprobeStatic.path });
                const duration = info.streams[0].duration;
                const audio_bitrate = info.streams[1].bit_rate;
                const video_bitrate = Math.floor((67108864 - duration * audio_bitrate - 0.3 * 1024 * 1024 * 8) / duration);
                execSync(pathToFfmpeg + " -i temp.mp4 -y -b:v " + video_bitrate + " -vcodec libx264 -profile:v baseline out.mp4");
                video = (await fs.readFile("out.mp4")).buffer;
                video = Buffer.from(video);
            }
            // Send discord reply with video
            status_message.edit({ content: "Uploading video to discord...", allowedMentions: { repliedUser: false } });
            await msg.reply({ files: [{ attachment: video, name: "video.mp4" }], allowedMentions: { repliedUser: false } });
            status_message.delete()
        } catch (err) {
            console.log(err);
            status_message.edit({ content: "Error occured. Log saved.", allowedMentions: { repliedUser: false } });
        }
    });
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
});