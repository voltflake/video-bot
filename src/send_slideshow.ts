import { type Client, type Message, MessageFlags, type FileData } from "disgroove";

import type { Item, Task } from "./util.ts";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.ts";
import { createSlideshowVideo } from "./slideshow_video.ts";

export async function sendSlideshow(task: Task, items: Item[], client: Client): Promise<void> {
    const audio_item = items.find((item) => item.type === "audio");
    if (!audio_item) {
        throw new Error("Cannot generate slideshow video without audio provided");
    }
    const audio_response = await fetch(audio_item.url);
    const audio_data = await audio_response.bytes();
    const audio_filename = await Deno.makeTempFile({ suffix: ".mp3" });
    await Deno.writeFile(audio_filename, audio_data);
    const ogg_filename = await convertToProperCodec(audio_filename);
    const audio_info = await getAudioData(ogg_filename);

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
        const image_request = await fetch(item.url);
        const image_data = await image_request.bytes();
        images.push(image_data);
        image_count += 1;
    }
    const filecontent_arr: FileData[] = [];
    for (const [i, data] of images.entries()) {
        filecontent_arr.push({ contents: new Blob([new Uint8Array(data)], { type: "image/png" }), name: `SPOILER_image${i + 1}.png` });
    }

    const status_message = await client.createMessage(task.message.channelID, {
        content: "\u{23f3} Generating slideshow video...",
        files: filecontent_arr,
        messageReference: { messageID: task.message.id, failIfNotExists: true },
        allowedMentions: { repliedUser: false },
    });

    let voice_message: Message | undefined;
    try {
        voice_message = await sendVoiceMessage(task.message.channelID, ogg_filename, audio_info.waveform, audio_info.duration);
    } catch {
        console.error("sendSlideshow(): Failed to send voice message");
    }

    try {
        await client.editMessage(task.message.channelID, task.message.id, {
            flags: MessageFlags.SuppressEmbeds,
        });
    } catch {
        console.error("sendSlideshow(): Failed to remove embeds from original message");
    }

    const created_video = await createSlideshowVideo(items);

    if (created_video.byteLength > 25 * 1_000_000) {
        throw new Error("Generated slideshow does not fit into Discord file size limits");
    }

    try {
        await client.editMessage(task.message.channelID, status_message.id, {
            content: "",
            files: [{ contents: new Blob([new Uint8Array(created_video)]), name: "slideshow.mp4" }],
            allowedMentions: { repliedUser: false },
        });
    } catch {
        throw new Error("Failed to upload message to Discord, file upload limits probably changed.");
    }

    if (voice_message) {
        try {
            await client.deleteMessage(status_message.channelID, voice_message.id);
        } catch {
            console.error("sendSlideshow(): Failed to remove voice message. It was probably deleted by someone.")
        }
    }
}
