import { Client, GatewayIntents, type Message } from "disgroove";
import { sendSingleVideo } from "./send_video.ts";
import { sendGallery } from "./send_gallery.ts";
import { extractWithYtdlp } from "./yt-dlp.ts"
import { extractWithGallerydl } from "./gallery-dl.ts"

console.info("Feedback and bug reports: https://github.com/voltflake/video-bot/issues/new");

const bot_token = process.env["DISCORD_TOKEN"];
if (!bot_token) {
    console.error("Discord bot token does not exist. Exiting...");
    process.exit(1);
}

const client = new Client(bot_token, {gateway: { intents:
    GatewayIntents.Guilds |
    GatewayIntents.MessageContent |
    GatewayIntents.GuildMessages
}});

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
client.on("messageCreate", async (message: Message): Promise<undefined> => {
    if (message.author.id === client.user?.id) return;
    if (!message.content) return;

    // Check for supported links
    const url = extractURL(message.content);
    if (!url) return;

    // Start yt-dlp task
    let extracted_content_promise = extractWithYtdlp(url);

    // Start reporting status
    const response_message = await client.createMessage(message.channelID, {
        content: `Extracting content from ${url.hostname}, please wait...`,
        messageReference: {messageID: message.id},
        allowedMentions: {repliedUser: false}
    });

    // Finish yt-dlp task
    let extracted_content = await extracted_content_promise;
    if (extracted_content) {
        if (extracted_content.type === "video") {
            await sendSingleVideo(extracted_content, client, response_message);
        } else {
            await sendGallery(extracted_content, client, response_message);
        }
        return;
    }

    // Start gallery-dl task if yt-dlp failed
    extracted_content_promise = extractWithGallerydl(url);

    // Update status
    await client.editMessage(response_message.channelID, response_message.id, {
        content: `Trying more sophisticated methods...`,
        allowedMentions: {repliedUser: false}
    });

    // Finish gallery-dl task
    extracted_content = await extracted_content_promise;
    if (extracted_content) {
        if (extracted_content.type === "video") {
            await sendSingleVideo(extracted_content, client, response_message);
        } else {
            await sendGallery(extracted_content, client, response_message);
        }
        return;
    }

    // All methods failed
    await client.editMessage(response_message.channelID, response_message.id, {
        content: `Sorry, I couldn't extract content from this link...`,
        allowedMentions: {repliedUser: false}
    });
    return;
});

// Actually start bot
client.connect();

function extractURL(text: string): URL | undefined {
    // Improved regex to match more URL formats (optional schemes, handles common cases)
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = text.match(urlRegex);
    if (!matches) return undefined;
    for (const match of matches) {
        try {
            const url = new URL(match);
            if (url.hostname.endsWith("tiktok.com")) return url;
            if (url.hostname.endsWith("instagram.com")) return url;
            if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtu.be")) {
                if (url.pathname.includes("/shorts/")) return url;
            }
        } catch (error) {
            console.warn(`Invalid URL skipped: ${match}`, error);
        }
    }
    return undefined;
} 
