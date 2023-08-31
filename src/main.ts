import { createInterface } from "node:readline/promises";
import { AttachmentPayload, Client, GatewayIntentBits, Message } from "discord.js";

import { Settings, BackendContext } from "./types.js";
import { getSettings } from "./settings.js";
import gallerydl from "./backends/instagram/gallerydl.js";
import ytdlp from "./backends/youtube/ytdlp.js";
import musicaldown from "./backends/tiktok/musicaldown.js";
import { compressVideo } from "./video_compression.js";

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

bot.on("ready", () => {
    console.log(`Logged in as ${bot.user?.tag}!`);
});

bot.on("messageCreate", handleMessage);

let settings: Settings;
getSettings(rl).then((config: Settings) => {
    settings = config;
    bot.login(settings.token);
});

async function handleMessage(msg: Message) {
    if (msg.content == "") return;
    if (msg.author.id == bot.user?.id) return;
    let backend_contexts: Array<BackendContext> = [];

    const tiktok_links = msg.content.match(/(https:\/\/|http:\/\/)([^\.]*.|)tiktok\.com\/\S+/gm);
    if (tiktok_links !== null) {
        for (const link of tiktok_links) {
            backend_contexts.push({
                message: msg,
                url: link,
                always_embed_attachments: false,
                try_compressing_videos: true,
                backend: musicaldown,
                allowed_tries: 10
            });
        }
    }

    const instagram_links = msg.content.match(/(?:https:\/\/|http:\/\/)(?:www\.|)instagram\.com\/\S+/gm);
    if (instagram_links !== null) {
        for (const link of instagram_links) {
            backend_contexts.push({
                message: msg,
                url: link,
                always_embed_attachments: false,
                try_compressing_videos: true,
                backend: gallerydl,
                allowed_tries: 3
            });
        }
    }

    const shorts_links = msg.content.match(/(https:\/\/|http:\/\/)([^\.]*|).(youtube\.com)\/shorts\S+/gm);
    if (shorts_links !== null) {
        for (const link of shorts_links) {
            backend_contexts.push({
                message: msg,
                url: link,
                always_embed_attachments: false,
                try_compressing_videos: true,
                backend: ytdlp,
                allowed_tries: 3
            });
        }
    }

    const youtube_links = msg.content.match(/(https:\/\/|http:\/\/)([^\.]*.|)youtube\.com\/watch\S+/gm);
    if (youtube_links !== null) {
        for (const link of youtube_links) {
            backend_contexts.push({
                message: msg,
                url: link,
                always_embed_attachments: false,
                try_compressing_videos: false,
                backend: ytdlp,
                allowed_tries: 3
            });
        }
    }

    if (backend_contexts.length == 0) return;

    msg.channel.sendTyping();
    const typingInterval = setInterval(() => {
        msg.channel.sendTyping();
    }, 5000)

    msg.suppressEmbeds(true);

    const running_jobs = [];
    for (const context of backend_contexts) {
        running_jobs.push(completeOrFailJob(context));
    }

    await Promise.allSettled(running_jobs);
    clearInterval(typingInterval);
}

async function completeOrFailJob(context: BackendContext) {
    for (let i = 0; i < context.allowed_tries; i++) {
        try {
            context.backend_response = await context.backend(context.url);
            break;
        } catch (error) {
            if (i == context.allowed_tries - 1) {
                console.error(error);
                await context.message.reply(
                    {
                        content: `Skipping ${context.url}\nThere was an error in ${context.backend.name} backend`,
                        allowedMentions: { repliedUser: false }
                    });
                return;
            }
        }
    }

    // typescript checking is too weak for this case
    if (context.backend_response == undefined) return;

    // Check if everything can fit into 1 message
    // Discord allows up to 5 embeded videos and up to 10 attachments
    // TODO: properly handle multiple items
    if (context.backend_response.videos.length + context.backend_response.images.length > 10) return;

    const message_content = {
        text: [] as string[],
        attachments: [] as AttachmentPayload[],
        embeds: [] as string[]
    }

    // handle embeds only
    if (context.always_embed_attachments) {
        if (context.backend_response.videos.length + context.backend_response.images.length > 5) {
            await context.message.reply({
                content: `Skipping ${context.url}\nThere were too many embeds for one message.\nTry unchecking embeded_mode in bot settings.`,
                allowedMentions: { repliedUser: false }
            });
            return;
        }
        for (let i = 0; i < context.backend_response.videos.length; i++) {
            const video = context.backend_response.videos[i];
            if (video.size > 50 * 1024 * 1024) {
                message_content.text.push(`Skipping video attachment #${i + 1}\nCause: video size is too big for Discord.`);
                continue;
            } else {
                message_content.embeds.push(`${video.url}`);
            }
        }
        for (let i = 0; i < context.backend_response.images.length; i++) {
            const image = context.backend_response.images[i];
            if (image.size > 50 * 1024 * 1024) {
                message_content.text.push(`Skipping image attachment #${i + 1}\nCause: image size is too big for Discord.`);
                continue;
            } else {
                message_content.embeds.push(`${image.url}`);
            }
        }
        await context.message.reply({
            content: message_content.text.join("\n\n") + message_content.embeds.join("\n"),
            allowedMentions: { repliedUser: false }
        });
        return;
    }

    // Try downloading content if file size is lower than 25MB
    if (context.try_compressing_videos == false) {
        for (let i = 0; i < context.backend_response.videos.length; i++) {
            const video = context.backend_response.videos[i];
            if (video.size <= 25 * 1024 * 1024) {
                try {
                    const response = await fetch(video.url);
                    message_content.attachments.push({ attachment: Buffer.from(await response.arrayBuffer()), name: `video${i + 1}.mp4` });
                } catch (error) {
                    message_content.text.push(`Skipping video attachment #${i + 1}\nCause: failed to download video from extracted url.`);
                    continue;
                }
            } else {
                if (video.size > 50 * 1024 * 1024) {
                    message_content.text.push(`Skipping video attachment #${i + 1}\nCause: video size is too big for Discord.`);
                    continue;

                } else {
                    message_content.embeds.push(`${video.url}`);
                }
            }
        }
        for (let i = 0; i < context.backend_response.images.length; i++) {
            const image = context.backend_response.images[i];
            if (image.size <= 25 * 1024 * 1024) {
                try {
                    const response = await fetch(image.url);
                    message_content.attachments.push({ attachment: Buffer.from(await response.arrayBuffer()), name: `image${i + 1}.png` });
                } catch (error) {
                    message_content.text.push(`Skipping image attachment #${i + 1}\nCause: failed to download image from extracted url.`);
                    continue;
                }
            } else {
                if (image.size > 50 * 1024 * 1024) {
                    message_content.text.push(`Skipping image attachment #${i + 1}\nCause: image size is too big for Discord.`);
                    continue;
                } else {
                    message_content.embeds.push(`${image.url}`);
                }
            }
        }
        await context.message.reply({
            content: message_content.text.join("\n\n") + message_content.embeds.join("\n"),
            files: message_content.attachments,
            allowedMentions: { repliedUser: false }
        });
        return;
    }

    // Try compressing if >25MB, download and send as attachment in less or equal
    // In case compression failed to make file less than 25MB try sending embeded link
    // If original file is bigger than 50MB and compression failed skip embeded link too.
    for (let i = 0; i < context.backend_response.videos.length; i++) {
        const video = context.backend_response.videos[i];
        let original_video;
        try {
            const response = await fetch(video.url);
            original_video = await response.arrayBuffer();
        } catch (error) {
            message_content.text.push(`Skipping video attachment #${i + 1}\nCause: failed to download video from extracted url.`);
            continue;
        }
        if (video.size <= 25 * 1024 * 1024) {
            message_content.attachments.push({ attachment: Buffer.from(original_video), name: `video${i + 1}.mp4` })
        } else {
            try {
                const compressed = await compressVideo(original_video);
                if (compressed.byteLength <= 25 * 1024 * 1024) {
                    message_content.attachments.push({ attachment: Buffer.from(compressed), name: `compressed_video${i + 1}.mp4` })
                    continue;
                }
            } catch (error) {
                console.error(error);
                message_content.text.push(`Video attachment #${i + 1} failed to compress\nCause: _logged to console_.`);
            }
            if (video.size > 50 * 1024 * 1024) {
                message_content.text.push(`Skipping video attachment #${i + 1}\nCause: video size is too big for Discord.`);
                continue;
            } else {
                message_content.embeds.push(`${video.url}`);
            }
        }
    }
    for (let i = 0; i < context.backend_response.images.length; i++) {
        const image = context.backend_response.images[i];
        if (image.size <= 25 * 1024 * 1024) {
            try {
                const response = await fetch(image.url);
                message_content.attachments.push({ attachment: Buffer.from(await response.arrayBuffer()), name: `image${i + 1}.png` });
            } catch (error) {
                message_content.text.push(`Skipping image attachment #${i + 1}\nCause: failed to download image from extracted url.`);
                continue;
            }
        } else {
            if (image.size > 50 * 1024 * 1024) {
                message_content.text.push(`Skipping image attachment #${i + 1}\nCause: image size is too big for Discord.`);
                continue;
            } else {
                message_content.embeds.push(`${image.url}`);
            }
        }
    }
    await context.message.reply({
        content: message_content.text.join("\n\n") + message_content.embeds.join("\n"),
        files: message_content.attachments,
        allowedMentions: { repliedUser: false }
    });
    return;
}