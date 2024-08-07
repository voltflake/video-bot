import { Bot, Message } from "discordeno";
import { Item } from "./util.js";
import { compressVideo } from "./video_compression.js";

export async function sendSingleVideo(item: Item, bot: Bot, status_message: Message) {
  await bot.helpers.editMessage(status_message.channelId, status_message.id, {
    content: `⏳ Processing content...`,
    allowedMentions: { repliedUser: false }
  });

  if (item.type !== "video") throw new Error("unreachable");
  if (!item.variants[0]) throw new Error("unreachable");
  let selected_variant = item.variants[0];
  for (const variant of item.variants) {
    if (variant.content_length > selected_variant.content_length) {
      selected_variant = variant;
    }
  }

  if (selected_variant.content_length >= 100 * 1024 * 1024) {
    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: `⚠️ Error: Video file size exceeds Discord upload limits.\nHere is an [uncompressed video](${selected_variant.href}).`,
      allowedMentions: { repliedUser: false }
    });
  } else if (selected_variant.content_length > 25 * 1024 * 1024) {

    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: `⏳ Compressing video...\nYou can use [preview](${selected_variant.href}) in a meantime.`,
      allowedMentions: { repliedUser: false }
    });

    const video = await (await fetch(selected_variant.href)).blob();
    try {
      const compressedVideo = await compressVideo(video);
      if (compressedVideo.size <= 25 * 1024 * 1024) {
        await bot.helpers.editMessage(status_message.channelId, status_message.id, {
          content: "✅ Success",
          files: [{ blob: compressedVideo, name: "video.mp4" }],
          allowedMentions: { repliedUser: false }
        });
      } else {
        await bot.helpers.editMessage(status_message.channelId, status_message.id, {
          content: `⚠️ Error: Video file size exceeds Discord upload limits, even after compression.\nHere is an [uncompressed video](${selected_variant.href}).`,
          allowedMentions: { repliedUser: false }
        });
      }
    } catch {
      await bot.helpers.editMessage(status_message.channelId, status_message.id, {
        content: `⚠️ Error: Video compression failed.\nHere is an [uncompressed video](${selected_variant.href}).`,
        allowedMentions: { repliedUser: false }
      });
    }
  } else {
    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: `⏳ Uploading content to Discord...`,
      allowedMentions: { repliedUser: false }
    });
    const video = await (await fetch(selected_variant.href)).blob();
    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: "✅ Success",
      files: [{ blob: video, name: "video.mp4" }],
      allowedMentions: { repliedUser: false }
    });
  }
}