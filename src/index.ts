import { createInterface } from "node:readline/promises";
import { Client, type Message, MessageFlags, type File } from "oceanic.js";
import { rocketapi } from "./modules/instagram-rocketapi.js";
import { scraperapi } from "./modules/tiktok-scraperapi.js";
import { ytdlp } from "./modules/youtube-ytdlp.js";
import type { Task, Item } from "./types.js";
import { validateAndGetContentLength } from "./helper_functions.js";
import { compressVideo } from "./video_compression.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

if (process.env["DISCORD_TOKEN"] == null) {
  console.error("Discord token is not provided. Exiting...");
  process.exit(1);
}
const client = new Client({
  auth: `Bot ${process.env["DISCORD_TOKEN"]}`,
  gateway: { intents: ["MESSAGE_CONTENT", "GUILDS", "GUILD_MESSAGES"] }
});

// Listen for SIGINT on windows hosts
if (process.platform === "win32") {
  rl.on("SIGINT", () => process.emit("SIGINT"));
}

// Graceful shutdown
process.on("SIGINT", () => {
  client.disconnect(false);
  process.exit(0);
});

client.on("ready", () => {
  console.info(`Logged in as ${client.user?.tag}!`);
});

client.on("messageCreate", handleMessage);

// Connect to Discord
client.connect();

async function handleMessage(msg: Message) {
  if (msg.author.id === client.user?.id) {
    return;
  }

  const task = SearchForTask(msg.content);
  if (task === null) {
    return;
  }

  if (msg.channel == null) return;

  const statusMessage = msg.channel.createMessage({
    content: `⏳ Processing ${task.type} link...`,
    messageReference: { messageID: msg.id },
    allowedMentions: { repliedUser: false }
  })

  await msg.channel.editMessage(msg.id, { flags: MessageFlags.SUPPRESS_EMBEDS }).catch(() => {
    console.warn(`Bot has no rights to edit message flags in server "${msg.guild?.name}"`);
  })

  const items = await getContent(task);

  const replyMessage = await statusMessage;

  await finishTask(replyMessage, items);
}

async function finishTask(messageToEdit: Message, itemsToInclude: Item[]) {
  const attachments: File[] = [];
  for (const item of itemsToInclude) {
    if (item.size == null) {
      item.size = await validateAndGetContentLength(item.url);
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
          attachments.push({ contents: compressedVideo, name: "video.mp4" });
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
        attachments.push({ contents: Buffer.from(file), name: "video.mp4" });
        break;
      }
      case "Image": {
        attachments.push({ contents: Buffer.from(file), name: "image.png" });
        break;
      }
      case "Audio": {
        attachments.push({ contents: Buffer.from(file), name: "music.mp3" });
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
