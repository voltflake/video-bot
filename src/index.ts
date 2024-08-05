import { createInterface } from "node:readline/promises";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createBot, FileContent, Intents, MessageFlags, type Message } from "discordeno";
import { compressVideo } from "./video_compression.js";
import type { Task, Item } from "./util.js";
import { extractInstagramContent } from "./instagram.js";
import { extractTiktokContent } from "./tiktok.js";
import { extractYoutubeContent } from "./youtube.js";
import { convertToProperCodec, getAudioData } from "./voice_message.js";
import { createSlideshowVideo } from "./slideshow.js";
import 'dotenv/config'

const tiktok_slideshows_use_video = true;

const rl = createInterface({ input: process.stdin, output: process.stdout });

if (process.env["DISCORD_TOKEN"] == null) {
  console.error("Discord token is not provided. Exiting...");
  process.exit(1);
}

const bot = createBot({
  intents: Intents.Guilds | Intents.MessageContent | Intents.GuildMessages,
  token: process.env["DISCORD_TOKEN"],
  desiredProperties: {
    message: { author: true, channelId: true, attachments: true, id: true, guildId: true, content: true },
    user: { id: true, username: true, discriminator: true },
    attachment: { url: true, proxyUrl: true, id: true, filename: true, size: true, waveform: true, duration_secs: true }
  }
});

// Listen for SIGINT on windows hosts
if (process.platform === "win32") {
  rl.on("SIGINT", () => process.emit("SIGINT"));
}

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

  if (task.type === "TikTok" && items.length > 1) {
    await updateStatus(`⏳ Processing TikTok slideshow...`);
    if (!tiktok_slideshows_use_video) {
      const audio_item = items.find((item) => {
        return item.type === "audio";
      })
      if (!audio_item) throw new Error("unreachable");
      if (!audio_item.variants[0]) throw new Error("unreachable");
      const audio = await (await fetch(audio_item.variants[0].href)).arrayBuffer();
      const timestamp = Date.now()
      await writeFile(`videos/${timestamp}-tiktokaudio.mp4`, Buffer.from(audio))
      const ogg_filename = await convertToProperCodec(`videos/${timestamp}-tiktokaudio.mp4`);
      const { duration, waveform } = await getAudioData(ogg_filename);
      let image_count = 0;
      const image_blobs = [];
      for (const item of items) {
        if (image_count === 10) break;
        if (item.type !== "image") continue;
        if (!item.variants[0]) throw new Error("unreachable");
        const image = await (await fetch(item.variants[0].href)).blob();
        image_blobs.push(image);
        image_count += 1;
      }
      const filecontent_arr: FileContent[] = [];
      for (const [i, blob] of image_blobs.entries()) {
        filecontent_arr.push({ blob: blob, name: `image${i + 1}.png` })
      }
      await bot.helpers.editMessage(status_message.channelId, status_message.id, {
        content: "✅ Success",
        files: filecontent_arr,
        allowedMentions: { repliedUser: false }
      });
      await sendVoiceMessage(status_message.channelId, ogg_filename, waveform, duration);
    } else {
      const content = await createSlideshowVideo(items);
      await updateStatus(`⏳ Uploading video to Discord...`);
      await bot.helpers.editMessage(status_message.channelId, status_message.id, {
        content: "✅ Success",
        files: [{ blob: content, name: "slideshow.mp4" }],
        allowedMentions: { repliedUser: false }
      });
  
  
    }
    try {
      await bot.helpers.editMessage(original_message.channelId, original_message.id, {
        flags: MessageFlags.SuppressEmbeds
      })
    } catch { }

    return;
  }

  await updateStatus(`⏳ Processing content...`);

  const files: Array<FileContent> = [];
  for (const item of items) {
    if (item.variants[0] == null) throw new Error("unreachable");

    if (item.variants[0]?.content_length >= 100 * 1024 * 1024) {
      if (task.type === "YouTube") {
        await bot.helpers.deleteMessage(status_message.channelId, status_message.id, "Task canceled.");
        return;
      }
      await updateStatus("⚠️ Error: File size is too big.");
      return;
    }

    if (item.type !== "video" && item.variants[0]?.content_length > 25 * 1024 * 1024) {
      await updateStatus("⚠️ Error: An image or a song exceeds Discord upload limits.");
      return;
    }

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
    }

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
  await updateStatus(`⏳ Uploading content to Discord...`);

  await bot.helpers.editMessage(status_message.channelId, status_message.id, {
    content: "✅ Success",
    files: files,
    allowedMentions: { repliedUser: false }
  });

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

// NOTE: temporary workaround until discordeno properly supports voice messages
async function sendVoiceMessage(channel_id: bigint, path_to_audio_file: string, waveform: Uint8Array, duration: number) {
  const data = await readFile(path_to_audio_file)
  const form = new FormData();
  form.append("files[0]", new Blob([data], { type: "audio/ogg" }), "song.ogg");

  const payloadJson = {
    attachments: [
      {
        id: "0",
        filename: "song.ogg",
        duration_secs: duration,
        waveform: Buffer.from(waveform).toString("base64")
      },
    ],
    flags: 1 << 13, // IS_VOICE_MESSAGE
  };

  form.append("payload_json", JSON.stringify(payloadJson));

  try {
    // Send voice message
    const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${process.env["DISCORD_TOKEN"]}`
      },
      body: form,
    });
    if (!response.ok) throw new Error("failed to send voice message");
  } catch (error: any) {
    console.error(
      "Error sending voice message:",
      error.response ? error.response.data : error.message
    );
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
