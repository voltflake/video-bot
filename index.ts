// Dependencies
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { Client, GatewayIntentBits, Message } from "discord.js";
const ffprobe_portable = require('@ffprobe-installer/ffprobe').path;
const execSync = require("child_process").execSync;
const ffprobe = require('ffprobe');
const ffmpeg_portable = require('ffmpeg-static');

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
    } catch (err) {
        console.log("bot has no permission to remove embeds, silently skipping...");
    }

    let status = await new Status(msg, links.length).ready();
    // Process tiktok links
    for (let i = 0; i < links.length; i++) {
        const link = links[i];

        // Get video file URLs from tiktok link
        await status.update(i, "Getting video links...");
        let video_urls: ExtractedLinks | null = null;
        try {
            video_urls = await tiktokToVideo(link);
        } catch (err) {
            await msg.reply({ content: "error getting when processing tiktok link, skipping...", allowedMentions: { repliedUser: false } });
            await status.update(i, "Error.");
            continue;
        }

        // reply to user with quick url video and continue to next link
        if (config.fast_mode == true) {
            await msg.reply({ content: video_urls.embed_ready, allowedMentions: { repliedUser: false } });
            await status.update(i, "Done.");
            continue
        }

        // download best video and upload to to discord manually
        await status.update(i, "Downloading video...");
        let video: Buffer | undefined = undefined;
        try {
            video = await downloadAvailableVideo(video_urls);
        } catch {
            await msg.reply({ content: "couldn't download video with any extracted links, skipping...", allowedMentions: { repliedUser: false } });
            await status.update(i, "Error.");
            continue;
        }

        // upload video to discord
        if (video.byteLength <= 8_388_608) {
            await status.update(i, "Uploading video to Discord...");
            await msg.reply({ files: [{ attachment: video, name: "tiktok.mp4" }], allowedMentions: { repliedUser: false } });
            await status.update(i, "Done.");
            continue;
        }

        if (config.use_fast_mode_instead_of_compression == true) {
            await msg.reply({ content: video_urls.embed_ready, allowedMentions: { repliedUser: false } });
            await status.update(i, "Done.");
            continue
        }

        await status.update(i, "Compressing video...");
        fs.writeFileSync("temp.mp4", video, { flag: "w+" });
        const ffprobe_path: string = config.use_ffmpeg_from_PATH ? "ffprobe" : ffprobe_portable;
        let info = await ffprobe('temp.mp4', { path: ffprobe_path });
        const duration: number = info.streams[0].duration;
        const audio_bitrate: number = info.streams[1].bit_rate;
        const video_bitrate: number = Math.floor((8_388_608 * 8 - duration * audio_bitrate - 2 * 1024 * 1024 * 8) / duration);
        const ffmpeg_path = config.use_ffmpeg_from_PATH ? "ffmpeg" : ffmpeg_portable;
        execSync(ffmpeg_path + " -i temp.mp4 -y -b:v " + video_bitrate + " -vcodec libx264 -profile:v baseline out.mp4");
        video = Buffer.from(fs.readFileSync("out.mp4").buffer);
        await status.update(i, "Uploading video to Discord...");
        await msg.reply({ files: [{ attachment: video, name: "tiktok.mp4" }], allowedMentions: { repliedUser: false } });
        await status.update(i, "Done.");
        continue;
        // TODO: implement better compression calculations for level 2 & 3 servers.
    }
    status.destroy();
});

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
    use_fast_mode_instead_of_copression: boolean
}

type ExtractedLinks = {
    source1?: string,
    source2?: string,
    embed_ready?: string,
    with_watermark?: string
}

// Downloads best available video 
async function downloadAvailableVideo(urls: ExtractedLinks): Promise<Buffer> {
    return new Promise(async function (resolve, reject) {
        let video_link: string | undefined = undefined;
        if (urls.with_watermark != undefined) video_link = urls.with_watermark;
        if (urls.source2 != undefined) video_link = urls.source2;
        if (urls.source1 != undefined) video_link = urls.source1;
        if (video_link == undefined) {
            reject("There is no available links to download video");
            return;
        }
        const response = await axios.get(video_link, { responseType: "arraybuffer" });
        resolve(response.data);
        return;
    });
}

// Simulates user who goes to musicaldown.com to convert tiktok link to raw video link
async function tiktokToVideo(url: string): Promise<ExtractedLinks> {
    return new Promise(async function (resolve, reject) {

        // Go to website to create needed tokens & cookies
        const init_response = await axios.get("https://musicaldown.com/id", {
            headers: {
                Accept: "*/*",
                Referer: "https://musicaldown.com",
                Origin: "https://musicaldown.com",
            }
        });

        // Collect necessary data from main page to submit POST request later based on it
        const inputs = init_response.data.match(/<input[^>]+>/g);
        const tokens = {
            link_key: inputs[0].match(/(?<=name=")[^"]+(?=")/g)[0],
            session_key: inputs[1].match(/(?<=name=")[^"]+(?=")/g)[0],
            session_value: inputs[1].match(/(?<=value=")[^"]+(?=")/g)[0],
        };

        // Make POST request
        let form_data = new FormData();
        form_data.append("verify", "1");
        form_data.append(tokens.link_key, url);
        form_data.append(tokens.session_key, tokens.session_value);
        const sessiondata_regex = init_response.headers["set-cookie"]?.toString().match(/session_data=[^;]+(?=;)/g);
        if (sessiondata_regex == undefined) {
            reject("session cookies were not granted");
            return;
        }
        const sessiondata_text = sessiondata_regex[0];
        const config = {
            method: "post",
            url: "https://musicaldown.com/download",
            headers: {
                "Origin": "https://musicaldown.com",
                "Referer": "https://musicaldown.com/id",
                "Cookie": sessiondata_text,
            },
            data: form_data
        };

        // Extract link from results page
        // TODO: extraction is too unreliable, should be using button text insted of blindly extracted links
        const result = await axios(config);
        const links_regex = result.data.match(/(?<=target="_blank"[\s|rel="noreferrer"]+href=")[^"]+/g);
        if (links_regex.length !== 5) {
            reject("found too few links, video is probably private");
            return;
        }
        const links: ExtractedLinks = {
            source1: links_regex[0],
            source2: links_regex[2],
            embed_ready: links_regex[3].match(/^[^&]+/g)[0],
            with_watermark: links_regex[4]
        };
        resolve(links);
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

    async destroy() {
        await this.status_message.delete();
    }

    ready() {
        return this.#promiseReady;
    }
}