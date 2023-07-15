import { createInterface } from "node:readline/promises";
import { Client, GatewayIntentBits } from "discord.js";

import { getSettings, Settings } from "./settings.js";
import { processVideoRequest } from "./video.js";
import galleryDL from "./backends/instagram-gallerydl.js";
import youtubeDL from "./backends/youtube-ytdlp.js";
import musicaldown from "./backends/tiktok-musicaldown.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const bot = new Client({
    intents: [
        GatewayIntentBits.GuildMessageTyping |
        GatewayIntentBits.MessageContent |
        GatewayIntentBits.GuildMessages |
        GatewayIntentBits.Guilds
    ]
});

// Listen for SIGINT on windows hosts
if (process.platform === "win32") {
    rl.on("SIGINT", () => process.emit("SIGINT"));
}

// Graceful shutdown
process.on("SIGINT", () => {
    bot.destroy();
    process.exit(0);
});

// Do not crash on unhandled errors
process.on("unhandledRejection", (error) => console.log("Unhandled promise rejection: ", error));

let settings: Settings;
getSettings(rl).then((config: Settings) => {
    settings = config;
    bot.login(settings.token);
});

bot.on("ready", () => {
    console.log(`Logged in as ${bot.user?.tag}!`);
});

bot.on("messageCreate", async (message) => {
    if (message.content == "") return;
    if (message.author.id == bot.user?.id) return;

    const instagram_links = selectEverythingWithPattern(/(?:https:\/\/|http:\/\/)(?:www\.|)instagram\.com\/(?:p|reel)\/[^\/]+/gim);
    const youtube_default = selectEverythingWithPattern(/(https:\/\/|http:\/\/)([^\.]*.|)youtube\.com\S+/gim);
    const tiktok_links = selectEverythingWithPattern(/(https:\/\/|http:\/\/)([^\.]*.|)tiktok\.com\/\S+/gim);

    for (let i = 0; i < tiktok_links.length; i++) {
        await processVideoRequest({
            message: message,
            url: tiktok_links[i],
            backend_to_use: musicaldown,
            tries: 7,
            skip_compression: false,
        }, settings);
    }

    for (let i = 0; i < instagram_links.length; i++) {
        await processVideoRequest({
            message: message,
            url: instagram_links[i],
            backend_to_use: galleryDL,
            tries: 3,
            skip_compression: false,
        }, settings);
    }

    for (let i = 0; i < youtube_default.length; i++) {
        await processVideoRequest({
            message: message,
            url: youtube_default[i],
            backend_to_use: youtubeDL,
            tries: 3,
            skip_compression: true,
        }, settings);
    }

    function selectEverythingWithPattern (pattern: RegExp ): Array<string> {
        const matches = message.content.match(pattern);
        if (matches == undefined) return [];
        return matches;
    }
});
