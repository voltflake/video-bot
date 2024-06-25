import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Client, GatewayIntentBits, type AttachmentPayload, type Message } from "discord.js";
import { rocketapi } from "./modules/instagram-rocketapi.js";
import { scraperapi } from "./modules/tiktok-scraperapi.js";
import { ytdlp } from "./modules/youtube-ytdlp.js";
import type { Task, Item } from "./types.js";
import { validateAndGetContentLength } from "./helper_functions.js";
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

bot.on("ready", () => {
  console.info(`Logged in as ${bot.user?.tag}!`);
});

bot.on("messageCreate", handleMessage);

if (process.env["DISCORD_TOKEN"] == null) {
  console.error("Discord token is not provided. Exiting...");
  process.exit(1);
}

bot.login(process.env["DISCORD_TOKEN"]);

async function handleMessage(msg: Message) {
  if (msg.author.id === bot.user?.id) {
    return;
  }

  const task = SearchForTask(msg.content);
  if (task === null) {
    return;
  }

  const statusMessage = msg.reply({
    content: `⏳ Processing ${task.type} link...`,
    allowedMentions: { repliedUser: false }
  });

  msg.suppressEmbeds().catch(() => {
    console.warn(`Bot has no rights to edit message flags in server "${msg.guild?.name}"`);
  });

  const items = await getContent(task);

  const replyMessage = await statusMessage;

  await finishTask(replyMessage, items);
}

async function finishTask(messageToEdit: Message, itemsToInclude: Item[]) {
  const attachments: AttachmentPayload[] = [];
  for (const item of itemsToInclude) {
    if (item.size == null) {
      for (let i = 0; i < 3; i++) {
        try {
          item.size = await validateAndGetContentLength(item.url);
        } catch {
          // empty
        }
      }
    }

    if (item.size == null) {
      throw new Error("Unable to get item size.");
    }

    if (item.size >= 100 * 1024 * 1024) {
      await messageToEdit.edit({
        content: "⛔ One of items is too big to process.",
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (item.type !== "Video" && item.size > 25 * 1024 * 1024) {
      await messageToEdit.edit({
        content: "⛔ One of items is too big to process.",
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (item.type === "Video" && item.size > 25 * 1024 * 1024) {
      const video = await downloadFile(item.url);
      try {
        const compressedVideo = await compressVideo(video);
        if (compressedVideo.byteLength <= 25 * 1024 * 1024) {
          attachments.push({ attachment: compressedVideo, name: "video.mp4" });
          continue;
        }
        throw new Error("Compressed video is too big.");
      } catch {
        await messageToEdit.edit({
          content: "⛔ Video compression failed.",
          allowedMentions: { repliedUser: false }
        });
        return;
      }
    }

    // TODO: find a way to detect a proper filetype
    const file = await downloadFile(item.url);
    switch (item.type) {
      case "Video": {
        attachments.push({ attachment: Buffer.from(file), name: "video.mp4" });
        break;
      }
      case "Image": {
        attachments.push({ attachment: Buffer.from(file), name: "image.png" });
        break;
      }
      case "Audio": {
        attachments.push({ attachment: Buffer.from(file), name: "music.mp3" });
        break;
      }
    }
  }
  await messageToEdit.edit({
    content: "",
    files: attachments,
    allowedMentions: { repliedUser: false }
  });
}

async function downloadFile(url: string) {
  const response = await fetch(url);
  return await response.arrayBuffer();
}

async function getContent(task: Task) {
  // TODO add redundant (backup) modules in case first one fails
  switch (task.type) {
    case "YouTube": {
      return await ytdlp(task.href);
    }
    case "Instagram": {
      return await rocketapi(task.href);
    }
    case "TikTok": {
      return await scraperapi(task.href);
    }
  }
}

function SearchForTask(text: string): Task | null {
  const hrefs = text.match(/(?:https:\/\/|http:\/\/)\S+/gm);
  if (hrefs == null) {
    return null;
  }

  const urls = new Array<URL>();
  for (const element of hrefs) {
    urls.push(new URL(element));
  }

  for (const url of urls) {
    if (url.hostname.endsWith("tiktok.com")) {
      return { href: url.href, type: "TikTok" };
    }
    if (url.hostname.endsWith("instagram.com")) {
      return { href: url.href, type: "Instagram" };
    }
    if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtu.be")) {
      return { href: url.href, type: "YouTube" };
    }
  }

  return null;
}
