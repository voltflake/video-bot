import { MessageFlags, type Bot } from "npm:discordeno";
import { log, type Task, type Item } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(task: Task, item: Item, bot: Bot): Promise<void> {
  // biome-ignore lint/style/useExplicitLengthCheck: checking if value exists, not it's value.
  if (!item.size) {
    log("CRITICAL", "Video item has no size provided with it.");
    return undefined;
  }

  // Video is too large.
  if (item.size >= 100 * 1024 * 1024) {
    log("CRITICAL", "Video is too big to be sent to Discord and to be compressed");
    return undefined;
  }

  // Video is in range of 25-100 MB. Try to compress to less than 25MB.
  if (item.size > 25 * 1024 * 1024) {
    let video = await downloadVideo(item.url);
    if (!video) {
      return undefined;
    }

    video = await compressVideo(video);
    if (!video) {
      log("CRITICAL", "Error during video compression.");
      return undefined;
    }

    if (video.size > 25 * 1024 * 1024) {
      log("CRITICAL", "Failed to compress video enough to fit into discord limits.");
      return undefined;
    }

    try {
      await bot.helpers.sendMessage(task.message.channelId, {
        files: [{ blob: video, name: "video.mp4" }],
        messageReference: { messageId: task.message.id, failIfNotExists: true },
        allowedMentions: { repliedUser: false }
      });
    } catch {
      log("CRITICAL", "Failed to upload message to Discord, file upload limits probably changed.");
      return undefined;
    }
    if (task.type !== "YouTube") {
      try {
        await bot.helpers.editMessage(task.message.channelId, task.message.id, {
          flags: MessageFlags.SuppressEmbeds
        });
      } catch {
        log("FAULT", "Failed to remove embeds from original message");
      }
    }
  }

  // No need for compression video is less than 25MB
  const video = await downloadVideo(item.url);
  if (!video) {
    return undefined;
  }

  try {
    await bot.helpers.sendMessage(task.message.channelId, {
      files: [{ blob: video, name: "video.mp4" }],
      messageReference: { messageId: task.message.id, failIfNotExists: true },
      allowedMentions: { repliedUser: false }
    });
  } catch {
    log("CRITICAL", "Failed to upload message to Discord, file upload limits probably changed.");
    return undefined;
  }

  if (task.type !== "YouTube") {
    try {
      await bot.helpers.editMessage(task.message.channelId, task.message.id, {
        flags: MessageFlags.SuppressEmbeds
      });
    } catch {
      log("FAULT", "Failed to remove embeds from original message");
    }
  }
}

async function downloadVideo(url: string): Promise<Blob | undefined> {
  try {
    return await (await fetch(url)).blob();
  } catch {
    log("CRITICAL", "Failed to download video from url.");
  }
  return undefined;
}
