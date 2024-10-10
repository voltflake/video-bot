import type { Bot, Message } from "discordeno";
import { errorLog, type Item } from "./util.ts";
import { compressVideo } from "./video_compression.ts";

export async function sendSingleVideo(item: Item, bot: Bot, status_message: Message) {
  if (item.type !== "video" || !item.variants[0]) {
    throw new Error("unreachable");
  }

  const use_embeds = true;
  let success = false;
  for (const variant of item.variants) {
    // temp experiment
    if (use_embeds) {
      await bot.helpers.editMessage(status_message.channelId, status_message.id, {
        content: `[\`](${variant.href})`,
        allowedMentions: { repliedUser: false }
      });
      success = true;
      break;
    }

    // variant is too large
    if (variant.content_length >= 100 * 1024 * 1024) {
      continue;
    }

    // try to compress
    if (variant.content_length > 25 * 1024 * 1024) {
      const video = await (await fetch(variant.href)).blob();
      try {
        const compressedVideo = await compressVideo(video);
        if (compressedVideo.size > 25 * 1024 * 1024) {
          errorLog("Failed to compress video enough to fit into discord limits.");
          continue;
        }
        try {
          await bot.helpers.editMessage(status_message.channelId, status_message.id, {
            content: "✅ Success",
            files: [{ blob: compressedVideo, name: "video.mp4" }],
            allowedMentions: { repliedUser: false }
          });
          success = true;
          break;
        } catch {
          errorLog("Failed to upload message to Discord, file upload limits probably changed.");
          continue;
        }
      } catch {
        errorLog("Error occured during video compression.");
        continue;
      }
    }

    // No need for compression
    const video = await (await fetch(variant.href)).blob();
    try {
      await bot.helpers.editMessage(status_message.channelId, status_message.id, {
        content: "✅ Success",
        files: [{ blob: video, name: "video.mp4" }],
        allowedMentions: { repliedUser: false }
      });
      success = true;
      break;
    } catch {
      errorLog("Failed to upload message to Discord, file upload limits probably changed.");
    }
  }
  if (!success) {
    errorLog("Failed to download & upload a single video to Discord. All variants failed.");
  }
}
