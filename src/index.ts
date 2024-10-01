import { access, mkdir, unlink} from "node:fs/promises";
import { createBot, type FileContent, Intents, MessageFlags, type Message } from "@discordeno/bot";

import { compressVideo } from "./video_compression.ts";
import type { Task, Item } from "./util.ts";
import { extractInstagramContent } from "./instagram.ts";
import { extractTiktokContent } from "./tiktok.ts";
import { extractYoutubeContent } from "./youtube.ts";
import { sendSingleVideo } from "./send_single_video.ts";
import { sendSlideshow } from "./send_slideshow.ts";

if (process.env["DISCORD_TOKEN"] == null) {
  console.error("Discord token is not provided. Exiting...");
  process.exit(1);
}

const bot = createBot({
  intents: Intents.Guilds | Intents.MessageContent | Intents.GuildMessages,
  token: process.env["DISCORD_TOKEN"],
  desiredProperties: {
    message: { author: true, channelId: true, attachments: true, id: true, guildId: true, content: true, referencedMessage: true },
    user: { id: true, username: true, discriminator: true },
    attachment: { url: true, proxyUrl: true, id: true, filename: true, size: true, waveform: true, duration_secs: true }
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await bot.shutdown();
  process.exit(0);
});

bot.events.ready = async (payload) => {
  console.info(`Logged in as ${payload.user.tag}`);
};

bot.events.messageCreate = handleMessage;

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
} catch { }

// Connect to Discord
bot.start();

async function handleMessage(original_message: Message) {
  if (original_message.author.id === bot.id) {
    return;
  }

  if (!original_message.content) {
    return;
  }

  const task = SearchForTask(original_message.content);
  if (task === null) {
    return;
  }

  const status_message = await bot.helpers.sendMessage(original_message.channelId, {
    content: `⏳ Extracting content from ${task.type}...`,
    messageReference: { messageId: original_message.id, failIfNotExists: true },
    allowedMentions: { repliedUser: false }
  })

  let items: Array<Item>;
  try {
    items = await getContent(task);
  } catch (error: any) {
    await updateStatus(`⚠️ Error: Unable to retrieve the required data from the provided URL.\n${error.message}`);
    return;
  }

  if (!items[0]) throw new Error("unreachable");

  if (items.find((item)=>item.type === "audio")) {
    // slideshow
    await sendSlideshow(items, bot, status_message);
  } else if (items.length === 1 && items[0].type === "video") {
    // single video case
    await sendSingleVideo(items[0], bot, status_message);
  } else {
    // multiple audio/image/video files
    await updateStatus(`⏳ Processing content...`);
    const files: Array<FileContent> = [];
    for (const item of items) {
      if (item.variants[0] == null) throw new Error("unreachable");

      if (item.type === "video" && item.variants[0]?.content_length > 25 * 1024 * 1024) {
        const video = await (await fetch(item.variants[0].href)).blob();
        await updateStatus(`⏳ Compressing video...`);
        try {
          const compressedVideo = await compressVideo(video);
          if (compressedVideo.size <= 25 * 1024 * 1024) {
            files.push({ blob: compressedVideo, name: "video.mp4" });
            continue;
          }
          await updateStatus("⚠️ Error: Video file exceeds Discord upload limits, even after compression.");
        } catch {
          await updateStatus("⚠️ Error: Video compression failed.");
        }
        return;
      } else if (item.variants[0]?.content_length > 25 * 1024 * 1024) {
        await updateStatus("⚠️ Error: An item exceeds Discord upload limits.");
        return;
      } else {
        // TODO: find a way to detect a proper filetype
        const file = await (await fetch(item.variants[0].href)).blob();
        switch (item.type) {
          case "video": {
            files.push({ blob: file, name: "video.mp4" });
            break;
          }
          case "image": {
            files.push({ blob: file, name: "image.png" });
            break;
          }
          case "audio": {
            files.push({ blob: file, name: "music.mp3" });
            break;
          }
        }
      }
    }
    await updateStatus(`⏳ Uploading content to Discord...`);

    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: "✅ Success",
      files: files,
      allowedMentions: { repliedUser: false }
    });
  }

  if (task.type !== "YouTube") {
    try {
      await bot.helpers.editMessage(original_message.channelId, original_message.id, {
        flags: MessageFlags.SuppressEmbeds
      })
    } catch { }
  }

  return;
  async function updateStatus(text: string) {
    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: text,
      allowedMentions: { repliedUser: false }
    });
  }
}

async function getContent(task: Task) {
  switch (task.type) {
    case "YouTube Short":
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
        return { href: url.href, type: "YouTube Short" }
      }
      return { href: url.href, type: "YouTube" };
    }
  }

  return null;
}
