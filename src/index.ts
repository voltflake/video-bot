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

async function handleMessage(original_message: Message) {
  if (original_message.author.id === client.user?.id) {
    return;
  }

  const task = SearchForTask(original_message.content);
  if (task === null) {
    return;
  }

  const current_channel = original_message.channel
  if (current_channel == null) return;

  const status_message_promise = current_channel.createMessage({
    content: `⏳ Processing ${task.type} link...`,
    messageReference: { messageID: original_message.id },
    allowedMentions: { repliedUser: false }
  })

  let remove_embeds_promise = undefined;
  if (task.type !== "YouTube") {
    try {
      remove_embeds_promise = current_channel.editMessage(original_message.id, { flags: MessageFlags.SUPPRESS_EMBEDS })
    } catch (error) {
      console.warn(`Bot has no rights to edit message flags in server "${original_message.guild?.name}"`);
    }
  }

  const status_message = await status_message_promise;

  let items: Array<Item>;
  try {
    items = await getContent(task);
  } catch (error: any) {
    await current_channel.editMessage(status_message.id, {
      content: `⚠️ Error: Unable to retrieve the required data from the provided URL.`,
      allowedMentions: { repliedUser: false }
    })
    return;
  }

  if (remove_embeds_promise !== undefined) {
    await remove_embeds_promise;
  }

  await finishTask(status_message, task, items);
}

async function finishTask(status_message: Message, task: Task, itemsToInclude: Item[]) {
  if (status_message.channel == null) return;

  const attachments: Array<File> = [];
  for (const item of itemsToInclude) {
    if (item.size == null) {
      try {
        item.size = await validateAndGetContentLength(item.url);
      } catch (error: any) {
        await status_message.channel.editMessage(status_message.id, {
          content: `⚠️ Error: File size could not be obtained.`,
          allowedMentions: { repliedUser: false }
        })
        return;
      }
    }

    if (item.size >= 100 * 1024 * 1024) {
      if (task.type === "YouTube") {
        return;
      }
      await status_message.edit({
        content: "⚠️ Error: File size is too big.",
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (item.type !== "Video" && item.size > 25 * 1024 * 1024) {
      await status_message.edit({
        content: "⚠️ Error: An image or a song exceeds Discord upload limits.",
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
        await status_message.edit({
          content: "⚠️ Error: Video file exceeds Discord upload limits, even after compression.",
          allowedMentions: { repliedUser: false }
        });
        return;
      } catch {
        await status_message.edit({
          content: "⚠️ Error: Video compression failed.",
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
  await status_message.edit({
    content: "✅ Success",
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
    case "YouTube Shorts":
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
      if (url.href.includes("shorts")) {
        return { href: url.href, type: "YouTube Shorts" }
      }
      return { href: url.href, type: "YouTube" };
    }
  }

  return null;
}
