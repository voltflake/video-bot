import { createBot, Intents, type Message, type User } from "discordeno";

import type { Item, SocialMedia, Task } from "./util.ts";
import { extractInstagramContent } from "./instagram.ts";
import { extractTiktokContent } from "./tiktok.ts";
import { extractYoutubeContent } from "./youtube.ts";
import { sendSingleVideo } from "./send_single_video.ts";
import { sendSlideshow } from "./send_slideshow.ts";

console.info("Feedback and bug reports: https://github.com/voltflake/video-bot/issues/new");

const bot_token = Deno.env.get("DISCORD_TOKEN");
if (!bot_token) {
    console.error("Discord bot token does not exist. Exiting...");
    Deno.exit(1);
}

const bot = createBot({
    intents: Intents.Guilds | Intents.MessageContent | Intents.GuildMessages,
    token: bot_token,
    defaultDesiredPropertiesValue: true,
    // desiredProperties: {
    //   message: {
    //     author: true,
    //     channelId: true,
    //     attachments: true,
    //     id: true,
    //     guildId: true,
    //     content: true,
    //     referencedMessage: true
    //   },
    //   user: { id: true, username: true, discriminator: true },
    //   attachment: { url: true, proxyUrl: true, id: true, filename: true, size: true, waveform: true, duration_secs: true }
    // }
});

// Graceful shutdown.
Deno.addSignalListener("SIGINT", async () => {
    console.info("Shutting down, please wait...");
    await bot.shutdown();
    Deno.exit();
});

// Let bot owner know it's working.
bot.events.ready = (payload: { user: User }): void => {
    console.info(`Logged in as ${payload.user.tag}`);
};

bot.events.messageCreate = handleMessage;

// Connect to Gateway and start doing stuff.
bot.start();

// Where all messages are handled.
async function handleMessage(message: Message): Promise<void> {
    if (message.author.id === bot.id) {
        return;
    }
    if (!message.content) {
        return;
    }
    const task = findTask(message);
    if (task) {
        await processTask(task);
    }
}

async function processTask(task: Task): Promise<void> {
    const items = await extractItems(task);

    // Error during content search, already logged.
    if (!items) {
        return;
    }

    // Simple case. A single video.
    if (items.length === 1 && items[0].type === "video") {
        await sendSingleVideo(task, items[0], bot);
        return;
    }

    const audio = items.find((item) => {
        return item.type === "audio";
    });

    // Complex case. Generate Slideshow and send it.
    if (items.length > 1 && audio) {
        await sendSlideshow(task, items, bot);
        return;
    }

    // Complex case. Send Photos & Videos.
    if (items.length > 1 && !audio) {
        // TODO: implement this.
        // await sendGallery(task, items, bot);
        // return;
    }

    let items_string = "";
    for (const [index, item] of items.entries()) {
        items_string += `${item.type}${index === items.length - 1 ? "" : ","}`;
    }
    console.error("unreachable code reached in when deciding how to represent content in Discord");
    console.error(`Skipping task. Items are: ${items_string}`);
}

async function extractItems(task: Task): Promise<Item[]> {
    switch (task.type) {
        case "YouTube":
        case "YouTubeShorts": {
            return await extractYoutubeContent(task.url);
        }
        case "Instagram": {
            return await extractInstagramContent(task.url);
        }
        case "TikTok": {
            return await extractTiktokContent(task.url);
        }
    }
}

function findTask(message: Message): Task | undefined {
    const urls = extractURLs(message.content);
    for (const url of urls) {
        let type: SocialMedia | undefined;
        if (url.hostname.endsWith("tiktok.com")) {
            type = "TikTok";
        } else if (url.hostname.endsWith("instagram.com")) {
            type = "Instagram";
        } else if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtu.be")) {
            if (url.href.includes("shorts")) {
                type = "YouTubeShorts";
            } else {
                type = "YouTube";
            }
        }
        if (type) {
            return { message: message, url: url.href, type: type };
        }
    }

    return undefined;

    function extractURLs(text: string): URL[] {
        const result: URL[] = [];
        const urls = text.match(/(?:https:\/\/|http:\/\/)\S+/g);
        if (!urls) {
            return result;
        }
        for (const url of urls) {
            result.push(new URL(url));
        }
        return result;
    }
}
