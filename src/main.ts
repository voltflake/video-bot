import { Client, GatewayIntents, type Message } from "disgroove";
import { Job } from "./job.js";
import type { Item } from "./util.js";

console.info("Feedback and bug reports: https://github.com/voltflake/video-bot/issues/new");

const bot_token = process.env["DISCORD_TOKEN"];
if (!bot_token) {
    console.error("Discord bot token does not exist. Exiting...");
    process.exit(1);
}

const client = new Client(bot_token, {
    gateway: { intents: GatewayIntents.Guilds | GatewayIntents.MessageContent | GatewayIntents.GuildMessages }
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.info("Shutting down, please wait...");
    client.disconnect();
    process.exit(0);
});

client.on("ready", () => {
    console.info(`Logged in as ${client.user?.username}`);
});

// Where all messages are handled
client.on("messageCreate", async (message: Message) => {
    if (message.author.id === client.user?.id) return;
    if (!message.content) return;

    // Check for supported links
    let url: URL;
    try {
        url = extractURL(message.content);
    } catch {
        return;
    }

    // Create job
    const job = new Job(url, message);
    await job.set_status(`Downloading content from ${url.hostname}, please wait...`);
    if (!job.response_message) return;

    // Start extraction
    let extracted_content: Item[] | undefined;
    for (const [i, extractor] of job.extractors.entries()) {
        try {
            extracted_content = await extractor(url);
            break;
        } catch {
            if (i + 1 < job.extractors.length) {
                await job.set_status(`Trying method (${i + 2}/${job.extractors.length}) to download content from ${url.hostname}, please wait...`);
            } else {
                await job.set_status(`All downloading methods failed for ${url.hostname}`);
                return;
            }
        }
    }
    if (!extracted_content) return;

    // Send Results
    try {
        await job.tryToSendContent(extracted_content);
    } catch {
        await job.set_status("Something went wrong while trying to send content.");
    }
});

function extractURL(text: string): URL {
    // Improved regex to match more URL formats (optional schemes, handles common cases)
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = text.match(urlRegex);
    if (!matches) throw new Error("No links were found in message");
    for (const match of matches) {
        const url = new URL(match);
        if (url.hostname.endsWith("tiktok.com")) return url;
        if (url.hostname.endsWith("instagram.com")) return url;
        if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtu.be")) {
            if (url.pathname.includes("/shorts/")) return url;
        }
    }
    throw new Error("No supported URLs found");
}

// Actually start bot
client.connect();
export { client };
