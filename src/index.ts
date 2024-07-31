import { createInterface } from "node:readline/promises";
import { access, mkdir, unlink } from "node:fs/promises";
import { Client, type Message, MessageFlags, type File } from "oceanic.js";
import { compressVideo } from "./video_compression.js";
import type { Task, Item } from "./util.js";
import { extractInstagramContent } from "./instagram.js";
import { extractTiktokContent } from "./tiktok.js";
import { extractYoutubeContent } from "./youtube.js";

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

try {
  await access("./logs");
} catch {
  await mkdir("./logs");
}

try {
  await access("./videos");
} catch {
  await mkdir("./videos");
}

try {
  await unlink("./videos/compressing.lock");
} catch {}

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
      content: `⚠️ Error: Unable to retrieve the required data from the provided URL.\nyt-dlp: ${error.message}`,
      allowedMentions: { repliedUser: false }
    })
    return;
  }

  if (remove_embeds_promise !== undefined) {
    await remove_embeds_promise;
  }

  const attachments: Array<File> = [];
  for (const item of items) {

    if (item.size >= 100 * 1024 * 1024) {
      if (task.type === "YouTube") {
        await status_message.delete("Task canceled.");
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
      const video = await (await fetch(item.url)).arrayBuffer();
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
    const file = await (await fetch(item.url)).arrayBuffer();
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

async function getContent(task: Task) {
  // TODO add redundant (backup) modules in case first one fails
  switch (task.type) {
    case "YouTube Shorts":
    case "YouTube": {
      return await extractYoutubeContent(task.href);
    }
    case "Instagram": {
      return await extractInstagramContent(task.href);
    }
    case "TikTok": {
      return await extractTiktokContent(task.href);
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
