import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Client, GatewayIntentBits, Message } from "discord.js";
import { VideoData, Settings } from "./types.js";
import { getVideoURL } from "./backends/musicaldown.js";
import { createInterface } from "readline";

const bot = new Client({
    intents: [
        GatewayIntentBits.GuildMessages |
        GatewayIntentBits.MessageContent |
        GatewayIntentBits.Guilds
    ]
});

const settings = getSettings();
bot.login(settings.token);

bot.on("messageCreate", async (message) => {
    if (message.content == "") return;
    if (message.author.id == bot.user?.id) return;
    const tiktok_link_regex = /(https:\/\/|http:\/\/)(vm\.|www\.)tiktok\.com\/\S+/gim;
    const tiktok_links = message.content.match(tiktok_link_regex);
    const instagram_link_regex = /(?:https:\/\/|http:\/\/)(?:www\.|)instagram\.com\/(?:p|reel)\/[^\/]+/gim;
    const instagram_links = message.content.match(instagram_link_regex);
    if (tiktok_links == undefined && instagram_links == undefined) return;

    // Remove embeds from original message for cleaner look
    try {
        await message.suppressEmbeds(true);
    } catch {
        console.warn("No permission to remove embeds, skipping...");
    }

    // Process any tiktok links
    if (tiktok_links != undefined) {
        console.log(`Recieved ${tiktok_links.length} tiktok links!`);
        for (let i = 0; i < tiktok_links.length; i++) {
            const video_data_promise = extractTiktokData(tiktok_links[i], 5);
            processVideoRequst(video_data_promise, message);
        }
    }

    // Process any instagram links
    if (instagram_links != undefined) {
        console.log(`Recieved ${instagram_links.length} instagram links!`);
        for (let i = 0; i < instagram_links.length; i++) {
            const video_data_promise = extractInstagramData(instagram_links[i], 3);
            processVideoRequst(video_data_promise, message);
        }
    }
});

bot.on("ready", () => console.log(`Logged in as ${bot.user?.tag}!`));

// Do not crash on unhandled errors
process.on("unhandledRejection", (error) => console.error("Unhandled promise rejection:", error));

// Graceful shutdown
process.on("SIGINT", () => {
    bot.destroy();
    process.exit(0);
});

// Hack to use graceful shutdown on windows hosts
if (process.platform === "win32") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on("SIGINT", () => process.emit("SIGINT"));
}

async function extractInstagramData(instagram_url: string, max_tries: number) {
    let tries = 0;
    const errors: string[] = [];
    while (true) {
        tries++;
        try {
            const gallety_dl = spawnSyncWrapper(`${settings.gallery_dl_path} --get-urls --cookies cookies.txt ${instagram_url}`);
            if (gallety_dl.status != 0) throw new Error("extracting raw video failed: gallery-dl error, check cookies");
            const links = new TextDecoder("utf-8").decode(gallety_dl.stdout).split("\n");
            if (links == undefined) throw new Error("gallery-dl couldn't find any links");
            // TODO implement more than first video from post
            const video_size = await validateAndGetContentLength(links[0]);
            return { url: links[0], size: video_size };
        } catch (error: any) {
            errors.push(`Error #${tries}: ${error.message}`);
            if (tries == max_tries) {
                throw new Error(`Can't extract video from instagram url after ${tries} tries:\n${errors.join("\n")}`);
            }
            continue;
        }
    }
}

async function extractTiktokData(tiktok_url: string, max_tries: number) {
    const errors: string[] = [];
    let tries = 0;
    while (true) {
        tries++;
        try {
            const video_url = await getVideoURL(tiktok_url);
            const video_size = await validateAndGetContentLength(video_url);
            return { url: video_url, size: video_size };
        } catch (error: any) {
            errors.push(`Error #${tries}: ${error.message}`);
            if (tries == max_tries) {
                throw new Error(`Can't extract video from instagram url after ${tries} tries:\n${errors.join("\n")}`);
            }
            continue;
        }
    }
}

async function validateAndGetContentLength(url: string): Promise<number> {
    const response = await fetch(url, { method: "HEAD" });
    if (response.status !== 200) throw new Error(`Unable to validate url: ${response.status} ${response.statusText}`);
    const content_length = response.headers.get("content-length");
    if (content_length == undefined) throw new Error("Unable to get content-length, header is missing");
    return parseInt(content_length);
}

function guideAndCreateSettings() {
    const header = `settings.json is missing... Starting configuration wizard.
 _____  _  _    ___       _    _      
|_   _|(_)| |__| _ ) ___ | |_ (_)__ __
  | |  | || / /| _ \\/ _ \\|  _|| |\\ \\ /
  |_|  |_||_\\_\\|___/\\___/ \\__||_|/_\\_\\\n`;
    console.clear();
    console.log(header);
    alert("continue");
    console.clear();
    console.log(header);
    const token = prompt("Please paste your Discord bot token:") || "";
    console.clear();
    console.log(header);
    const enable_compression = confirm("Enable compression for videos bigger than 8MB?\nYou must have ffmpeg and ffprobe in your PATH.\nWithout compression videos will be sent as embbeded link");
    console.clear();
    console.log(header);
    const embeded_mode = confirm("Send all videos as embeded links?\nThose links may look ugly in chat.\nUse this only feature if your internet is super-slow");
    console.clear();
    console.log(header);
    const ffmpeg_path = prompt("Please write where ffmpeg executable is located (skip if it's in PATH):", "ffmpeg") || "";
    console.clear();
    console.log(header);
    const ffprobe_path = prompt("Please write where ffprobe executable is located (skip if it's in PATH):", "ffprobe") || "";
    console.clear();
    console.log(header);
    const gallery_dl_path = prompt("Please write where gallery-dl executable is located (skip if it's in PATH):", "gallery-dl") || "";

    const data = {
        token: token,
        enable_compression: enable_compression,
        codec_to_use: "h264",
        embeded_mode: embeded_mode,
        ffmpeg_path: ffmpeg_path,
        ffprobe_path: ffprobe_path,
        gallery_dl_path: gallery_dl_path
    };
    const string_data = JSON.stringify(data);
    writeFileSync("settings.json", string_data);
    alert("Config file saved.");
}

// TODO Add json validator
function getSettings() {
    if (!existsSync("./settings.json")) {
        guideAndCreateSettings();
    }
    const data = readFileSync("./settings.json", { encoding: "utf-8" });
    const settings: Settings = JSON.parse(data);
    return settings;
}

async function processVideoRequst(video_data_promise: Promise<VideoData>, reply_to: Message) {
    try {
        let start_time = Date.now();
        const video_data = await video_data_promise;
        console.debug(`profiling: video extraction ${Date.now() - start_time}ms`);

        if (settings.embeded_mode || video_data.size >= 8_388_608 && !settings.enable_compression) {
            await reply_to.reply({ content: video_data.url, allowedMentions: { repliedUser: false } });
            return;
        }

        start_time = Date.now();
        const response = await fetch(video_data.url);
        const original_video = await response.arrayBuffer();
        if (original_video == undefined) throw new Error("Error when downloading/reading video");
        console.debug(`profiling: video download ${Date.now() - start_time}ms`);

        if (video_data.size < 8_388_608) {
            start_time = Date.now();
            await reply_to.reply({
                files: [{ attachment: Buffer.from(original_video), name: "video.mp4" }],
                allowedMentions: { repliedUser: false }
            });
            console.debug(`profiling: upload to discord ${Date.now() - start_time}ms`);
            return;
        }

        start_time = Date.now();
        await writeFile("original.mp4", Buffer.from(original_video));
        console.debug(`profiling: saved video to disk ${Date.now() - start_time}ms`);

        start_time = Date.now();
        const ffprobe = spawnSyncWrapper(`${settings.ffprobe_path} -v quiet -print_format json -show_streams original.mp4`);
        if (ffprobe.status != 0) throw new Error("Compression failed: ffprobe error");
        console.debug(`profiling: ffprobe ${Date.now() - start_time}ms`);

        const ffprobe_json_text = new TextDecoder("utf-8").decode(ffprobe.stdout);
        const media_info = JSON.parse(ffprobe_json_text);
        const duration = parseFloat(media_info.streams[0].duration);
        const audio_bitrate = parseInt(media_info.streams[1].bit_rate);
        const video_bitrate = Math.floor((67_108_864 - duration * audio_bitrate - 16_777_216) / duration);

        start_time = Date.now();
        const ffmpeg = spawnSyncWrapper(`${settings.ffmpeg_path} -i original.mp4 -y -b:v ${video_bitrate.toString()} -vcodec ${settings.codec_to_use} compressed.mp4`);
        if (ffmpeg.status != 0) throw new Error("Compression failed: ffmpeg error");
        console.debug(`profiling: ffmpeg ${Date.now() - start_time}ms`);

        start_time = Date.now();
        const video_blob = (await readFile("compressed.mp4")).buffer;
        console.debug(`profiling: read video from disk ${Date.now() - start_time}ms`);
        if (video_blob.byteLength > 8_388_608) throw new Error("Compression failed: compressed video is too big");

        start_time = Date.now();
        await reply_to.reply({ files: [{ attachment: Buffer.from(video_blob), name: "video.mp4" }], allowedMentions: { repliedUser: false } });
        console.debug(`profiling: upload to discord ${Date.now() - start_time}ms`);

        await unlink("original.mp4");
        await unlink("compressed.mp4");
    } catch (error: any) {
        await reply_to.reply({ content: `Error when getting video data: ${error.message}`, allowedMentions: { repliedUser: false } });
    }
}

function spawnSyncWrapper(command: string) {
    const argument_tokens = command.split(" ");
    const application = argument_tokens.shift();
    if (application == undefined) throw new Error("Bad command passed to spawnSyncWrapper()");
    return spawnSync(application, argument_tokens);
}
