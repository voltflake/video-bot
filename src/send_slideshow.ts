import { type Bot, type FileContent, type Message, MessageFlags } from "discordeno";
import { writeFile } from "node:fs/promises";

import { type Item } from "./util.ts";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.ts";
import { createSlideshowVideo } from "./slideshow_video.ts";

export async function sendSlideshow(items: Array<Item>, bot: Bot, status_message: Message) {
  await bot.helpers.editMessage(status_message.channelId, status_message.id, {
    content: `⏳ Processing slideshow slideshow...`,
    allowedMentions: { repliedUser: false }
  });
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
    filecontent_arr.push({ blob: blob, name: `SPOILER_image${i + 1}.png` })
  }

  await bot.helpers.editMessage(status_message.channelId, status_message.id, {
    content: `⏳ Generating slideshow video...`,
    files: filecontent_arr,
    allowedMentions: { repliedUser: false }
  });

  const voice_message = await sendVoiceMessage(status_message.channelId, ogg_filename, waveform, duration);

  if (!status_message.referencedMessage) throw new Error("unreachable");

  try {
    await bot.helpers.editMessage(status_message.channelId, status_message.referencedMessage.id, {
      flags: MessageFlags.SuppressEmbeds
    })
  } catch { }
  
  let content;
  try {
    content = await createSlideshowVideo(items);
  } catch (error) {
    await bot.helpers.editMessage(status_message.channelId, status_message.id, {
      content: `⚠️ Error: failed to create slideshow video.`,
      files: filecontent_arr,
      allowedMentions: { repliedUser: false }
    });
    throw error;
  }

  await bot.helpers.editMessage(status_message.channelId, status_message.id, {
    content: "✅ Success",
    files: [{ blob: content, name: "slideshow.mp4" }],
    allowedMentions: { repliedUser: false }
  });

  await bot.helpers.deleteMessage(status_message.channelId, voice_message.id);
}
