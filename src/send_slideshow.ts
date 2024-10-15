import { type Bot, type FileContent, MessageFlags } from "npm:discordeno";

import { type Item, log, type Task } from "./util.ts";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.ts";
import { createSlideshowVideo } from "./slideshow_video.ts";

export async function sendSlideshow(task: Task, items: Item[], bot: Bot): Promise<void> {
    const audio_item = items.find((item) => {
        return item.type === "audio";
    });

    if (!audio_item) {
        log("CRITICAL", "Cannot generate slideshow video without audio provided.");
        return undefined;
    }

    const audio = await (await fetch(audio_item.url)).bytes();
    const timestamp = Date.now();
    await Deno.writeFile(`videos/${timestamp}-tiktokaudio.mp3`, audio);
    const ogg_filename = await convertToProperCodec(`videos/${timestamp}-tiktokaudio.mp3`);
    if (!ogg_filename) {
        log("CRITICAL", "Cannot generate slideshow video because convering audio file to OPUS codec failed.");
        return undefined;
    }
    const audio_data = await getAudioData(ogg_filename);
    if (!audio_data) {
        log("CRITICAL", "Failed to extract audio data from provided audio item.");
        return undefined;
    }

    let image_count = 0;
    const images: Uint8Array[] = [];
    for (const item of items) {
        // TODO: Handle more images.
        if (image_count === 10) {
            break;
        }
        if (item.type !== "image") {
            continue;
        }
        const image = await (await fetch(item.url)).bytes();
        images.push(image);
        image_count += 1;
    }
    const filecontent_arr: FileContent[] = [];
    for (const [i, data] of images.entries()) {
        filecontent_arr.push({ blob: new Blob([data]), name: `SPOILER_image${i + 1}.png` });
    }

    const status_message = await bot.helpers.sendMessage(task.message.channelId, {
        content: "⏳ Generating slideshow video...",
        files: filecontent_arr,
        messageReference: { messageId: task.message.id, failIfNotExists: true },
        allowedMentions: { repliedUser: false },
    });
    const voice_message = await sendVoiceMessage(task.message.channelId, ogg_filename, audio_data.waveform, audio_data.duration);

    if (!voice_message) {
        log("FAULT", "Failed to send audio preview as discord voice message.");
    }

    try {
        await bot.helpers.editMessage(task.message.channelId, task.message.id, {
            flags: MessageFlags.SuppressEmbeds,
        });
    } catch {
        log("FAULT", "Failed to remove embeds from original message");
    }

    const created_video = await createSlideshowVideo(items);
    if (!created_video) {
        log("CRITICAL", "Failed to generate slideshow video.");
        return undefined;
    }

    await bot.helpers.editMessage(task.message.channelId, status_message.id, {
        files: [{ blob: new Blob([created_video]), name: "slideshow.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    if (voice_message) {
        await bot.helpers.deleteMessage(status_message.channelId, voice_message.id);
    }
}
