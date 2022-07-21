// Place your bot token here
const bot_token = "";

// Dependencies
const axios = require("axios");
const ffprobe_path = require('@ffprobe-installer/ffprobe').path;
const ffmpeg_path = require('ffmpeg-static');
const scraper = require('tiktok-scraper-without-watermark');
const { Client, Intents } = require("discord.js");
const ffprobe = require('ffprobe');
const fs = require('fs').promises;
const execSync = require("child_process").execSync;

// Driver code
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.login(bot_token);

// Event handlers
client.on('messageCreate', async msg => {
    if (!msg.content) return;
    if (msg.author.id === client.user.id) return;

    let pattern = /(https:\/\/|http:\/\/)(vm\.|www\.)tiktok\.com\/\S+/gmi;
    let links = msg.content.match(pattern);
    if (links == null) return;
    console.log("Recieved " + links.length + " tiktok links!");
    try {
        await msg.suppressEmbeds()
    } catch (err) {
        console.log("bot has no permission to remove embeds, silently skipping...");
    }
    try {
        var status_message = await msg.reply({ content: "Processing...", allowedMentions: { repliedUser: false } });
    } catch (err) {
        console.log("Bot has no permision to read message history, skipping...");
        return;
    }
    let status = new Status(status_message, links.length);
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        try {
            // Get links to videos by tiktok url
            msg.channel.sendTyping();
            await status.update(i, "Getting video links...");
            let links = await scraper.tiktokdownload(link);

            // Download video using no-watermark link
            msg.channel.sendTyping();
            await status.update(i, "Downloading video...");
            let response = await axios.get(links.nowm, { responseType: "arraybuffer" });

            // Compress video if it's too big
            let video = response.data;
            if (video.length > 8_388_608) {
                msg.channel.sendTyping();
                await status.update(i, "Video is too large, compressing...");
                await fs.writeFile("temp.mp4", video);
                let info = await ffprobe('temp.mp4', { path: ffprobe_path });
                const duration = info.streams[0].duration;
                const audio_bitrate = info.streams[1].bit_rate;
                const video_bitrate = Math.floor((67108864 - duration * audio_bitrate - 1 * 1024 * 1024 * 8) / duration);
                execSync(ffmpeg_path + " -i temp.mp4 -y -b:v " + video_bitrate + " -vcodec libx264 -profile:v baseline out.mp4");
                video = (await fs.readFile("out.mp4")).buffer;
                video = Buffer.from(video);
            }

            // Send discord reply with video
            await status.update(i, "Uploading video to discord...");
            msg.channel.sendTyping();
            await msg.reply({ files: [{ attachment: video, name: "video.mp4" }], allowedMentions: { repliedUser: false } });
            await status.update(i, "Success");
        } catch (err) {
            console.log(err);
            await status.update(i, "Error occured. Log saved.");
        }
    }
    status_message.delete();
});

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}
  
process.on("SIGINT", function () {
    //graceful shutdown
    client.destroy()
    process.exit(0);
});

class Status {
    constructor(msg, count) {
        this.raw_text = "";
        for (let i = 0; i < count; i += 1) {
            this.raw_text = this.raw_text + "Link " + (i+1) + " - Scheduled...\n";
        }
        this.status_message = msg;
        this.status_message.edit({ content: this.raw_text, allowedMentions: { repliedUser: false } });
    }

    async update(index, new_status) {
        let lines = this.raw_text.split('\n');
        lines[index] = lines[index].slice(0, lines[index].indexOf(" - ") + 3);
        lines[index] = lines[index] + new_status;
        this.raw_text = lines.join('\n');
        await this.status_message.edit({ content: this.raw_text, allowedMentions: { repliedUser: false } });
    }
}