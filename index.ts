// Dependencies
// node.js packages
import * as fs from "fs";
const execSync = require("child_process").execSync;
// networking
import axios, { Axios } from "axios";
import { Client, GatewayIntentBits, Message } from "discord.js";
// ffmpeg packages
const ffprobe_portable = require('@ffprobe-installer/ffprobe').path;
const ffprobe = require('ffprobe');
const ffmpeg_portable = require('ffmpeg-static');
// backends
import backend_musicaldown from './backends/musicaldown';
import backend_direct from './backends/direct';
let backends = new Array<{ (data: string): Promise<string> }>;
backends.push(backend_musicaldown);
backends.push(backend_direct);

// Driver code
const bot = new Client({ intents: [GatewayIntentBits.GuildMessages | GatewayIntentBits.MessageContent | GatewayIntentBits.Guilds] });
const config_json = fs.readFileSync("./config.json", { encoding: "utf8" })
const config: BotConfig = JSON.parse(config_json);
bot.login(config.bot_token);

// Event handlers
bot.on("messageCreate", async (msg) => {
    if (msg.content == undefined) return;
    if (msg.author.id === bot.user?.id) return;
    const pattern = /(https:\/\/|http:\/\/)(vm\.|www\.)tiktok\.com\/\S+/gmi;
    const links = msg.content.match(pattern);
    if (links == undefined) return;
    console.log(`Recieved ${links.length} tiktok links!`);

    // Remove embeds from original message for cleaner look
    try {
        await msg.suppressEmbeds()
    } catch {
        console.log("bot has no permission to remove embeds, silently skipping...");
    }

    let status = await new Status(msg, links.length).ready();
    // Process tiktok links
    for (let i = 0; i < links.length; i++) {
        const tiktok_url = links[i];

        // Get raw video URL from tiktok URL
        await status.update(i, "Extracting video URL...");
        let video_url: string = "";
        try {
            video_url = await getVideoUrl(tiktok_url);
        } catch (error) {
            console.error(error);
            await status.update(i, "Error: Failed to extract video URL.");
            continue;
        }

        // Reply with link if FastMode is enabled
        if (config.fast_mode == true) {
            await msg.reply({ content: video_url, allowedMentions: { repliedUser: false } });
            await status.update(i, "Done.");
            continue
        }

        // Check if video is bigger than 8MB to skip download when compression disabled
        if (config.use_fast_mode_instead_of_compression == true) {
            await status.update(i, "Checking video size...");
            try {
                const response = await axios.head(video_url);
                const size = parseInt(response.headers["content-length"]);
                if (size > 8_388_608) {
                    await msg.reply({ content: video_url, allowedMentions: { repliedUser: false } });
                    await status.update(i, "Done.");
                    continue;
                }
            } catch (error) {
                console.error("failed to get video size prior to downloading, downloading anyway...")
            }
        }

        // Download mp4 video
        await status.update(i, "Downloading video...");
        let video: Buffer;
        try {
            video = await downloadVideo(video_url);
        } catch (error) {
            console.error(error);
            await status.update(i, "Error: Failed to download video from extracted URL.");
            continue;
        }

        // upload video to discord
        if (video.byteLength <= 8_388_608) {
            await status.update(i, "Uploading video to Discord...");
            await msg.reply({ files: [{ attachment: video, name: "tiktok.mp4" }], allowedMentions: { repliedUser: false } });
            await status.update(i, "Done.");
            continue;
        }

        await status.update(i, "Compressing video...");
        fs.writeFileSync("temp.mp4", video, { flag: "w+" });
        const ffprobe_path: string = config.use_ffmpeg_from_PATH ? "ffprobe" : ffprobe_portable;
        let info = await ffprobe('temp.mp4', { path: ffprobe_path });
        const duration: number = info.streams[0].duration;
        const audio_bitrate: number = info.streams[1].bit_rate;
        const video_bitrate: number = Math.floor((67_108_864 - duration * audio_bitrate - 16_777_216) / duration);
        const ffmpeg_path = config.use_ffmpeg_from_PATH ? "ffmpeg" : ffmpeg_portable;
        execSync(ffmpeg_path + " -i temp.mp4 -y -b:v " + video_bitrate + " -vcodec libx264 -profile:v baseline out.mp4");
        video = Buffer.from(fs.readFileSync("out.mp4").buffer);
        await status.update(i, "Uploading video to Discord...");
        await msg.reply({ files: [{ attachment: video, name: "tiktok.mp4" }], allowedMentions: { repliedUser: false } });
        await status.update(i, "Done.");
        fs.unlinkSync('./temp.mp4');
        fs.unlinkSync('./out.mp4');
        continue;
        // TODO: implement better compression calculations for level 2 & 3 servers.
    }
    status.destroy();
});

async function getVideoUrl(tiktok_url: string): Promise<string> {
    const retries_per_backend = 3;
    return new Promise(async (resolve, reject) => {
        for (let i = 0; i < backends.length; i++) {
            const extractVideoURL = backends[i];
            for (let j = 0; j < retries_per_backend; j++) {
                try {
                    let video_url = await extractVideoURL(tiktok_url);
                    if (await checkLink(video_url))
                        return resolve(video_url);
                } catch (error) { }
                continue;
            }
        }
        return reject();
    })
}

async function checkLink(url: string): Promise<boolean> {
    const response = await fetch(url);
    return response.ok;
}

bot.on("ready", async () => {
    console.log(`Logged in as ${bot.user?.tag}!`);
});

// Do not crash on unhandled errors
process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection:", error);
});

// Graceful shutdown
process.on("SIGINT", function () {
    bot.destroy()
    process.exit(0);
});

// Hack to use graceful shutdown on windows hosts
if (process.platform === "win32") {
    let rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

// Custom types
type BotConfig = {
    bot_token: string,
    fast_mode: boolean,
    use_ffmpeg_from_PATH: boolean,
    use_fast_mode_instead_of_compression: boolean
}

// Downloads best available video 
async function downloadVideo(url: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios.get(url, { responseType: "arraybuffer" });
            return resolve(response.data);
        } catch (error) {
            console.error(error);
            return reject();
        }
    });
}

class Status {
    raw_text: string = "";
    status_message!: Message;
    #promiseReady;

    constructor(msg: Message, count: number) {
        this.#promiseReady = this.#init(msg, count);
    }

    async #init(msg: Message, count: number) {
        this.raw_text = "";
        for (let i = 0; i < count; i += 1) {
            this.raw_text = this.raw_text + "Link " + (i + 1) + " - Scheduled...\n";
        }
        this.status_message = await msg.reply({ content: this.raw_text, allowedMentions: { repliedUser: false } });

        return this;
    }

    async update(index: number, new_status: string) {
        let lines = this.raw_text.split('\n');
        lines[index] = lines[index].slice(0, lines[index].indexOf(" - ") + 3);
        lines[index] = lines[index] + new_status;
        this.raw_text = lines.join('\n');
        await this.status_message.edit({ content: this.raw_text, allowedMentions: { repliedUser: false } });
    }

    // deletes status message if no errors occured
    async destroy() {
        if (/Error/.test(this.raw_text)) return;
        await this.status_message.delete();
    }

    ready() {
        return this.#promiseReady;
    }
}