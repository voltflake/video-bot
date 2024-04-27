import { createInterface } from "node:readline/promises";
import { Client, GatewayIntentBits, type Message } from "discord.js";

import rocketapi from "./modules/instagram-rocketapi.js";
import scraperapi from "./modules/tiktok-scraperapi.js";
import ytdlp from "./modules/youtube-ytdlp.js";
import { getSettings } from "./settings.js";
import type { Job, Settings } from "./types.js";

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

bot.on("ready", () => {
    console.info(`Logged in as ${bot.user?.tag}!`);
});

bot.on("messageCreate", handleMessage);

let settings: Settings;
getSettings(rl).then((config: Settings) => {
    settings = config;
    bot.login(settings.token);
});

async function handleMessage(msg: Message) {
    if (msg.content === "") return;
    if (msg.author.id === bot.user?.id) return;
    const jobs = searchJobs(msg);
    if (jobs.length === 0) return;

    msg.suppressEmbeds(true).catch(() => {
        console.warn(`Bot has no rights to edit messages in server named "${msg.guild?.name}"`);
    });

    msg.channel.sendTyping();
    const typingInterval = setInterval(() => {
        msg.channel.sendTyping();
    }, 5000);

    const running_jobs = [];
    for (const job of jobs) {
        running_jobs.push(completeOrFailJob(job));
    }

    await Promise.allSettled(running_jobs);
    clearInterval(typingInterval);
}

async function completeOrFailJob(job: Job) {
    // TODO add redundant (backup) modules in case first one fails
    switch (job.type) {
        case "YouTube": {
            await ytdlp(job);
            break;
        }
        case "Instagram": {
            await rocketapi(job);
            break;
        }
        case "TikTok": {
            await scraperapi(job);
            break;
        }
    }
}

function searchJobs(message: Message) {
    const jobs = new Array<Job>();

    const hrefs = message.content.match(/(?:https:\/\/|http:\/\/)\S+/gm);
    if (hrefs == null) {
        return [];
    }
    const urls = new Array<URL>();
    for (const element of hrefs) {
        urls.push(new URL(element));
    }

    for (const url of urls) {
        if (!url.hostname.endsWith("tiktok.com")) {
            continue;
        }
        jobs.push({
            mode: settings.mode,
            type: "TikTok",
            discord_message: message,
            href: url.href,
            rapidapi_key: settings.rapidapi_key
        });
    }

    for (const url of urls) {
        if (!url.hostname.endsWith("instagram.com")) continue;
        jobs.push({
            mode: settings.mode,
            type: "Instagram",
            discord_message: message,
            href: url.href,
            rapidapi_key: settings.rapidapi_key
        });
    }

    for (const url of urls) {
        if (!url.hostname.endsWith("youtube.com") && !url.hostname.endsWith("youtu.be")) continue;
        jobs.push({
            mode: settings.mode,
            type: "YouTube",
            discord_message: message,
            href: url.href,
            rapidapi_key: settings.rapidapi_key
        });
    }

    return jobs;
}
