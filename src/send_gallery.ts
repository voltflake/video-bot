import { type Client, type Message, MessageFlags, type FileData } from "disgroove";
import type { Content } from "./util.ts";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.ts";
import { createSlideshowVideo } from "./generate_video.ts";
import { readFile } from "node:fs/promises";

// TODO: refactor to threat posts with videos differently from slideshows
export async function sendGallery(content: Content, client: Client, message: Message): Promise<void> {
    let items_processed = 0;
    const filecontent_arr: FileData[] = [];
    for (const [i, item] of content.items.entries()) {
        // TODO: Handle more images.
        if (items_processed === 10) {
            break;
        }
        const file_data = await readFile(item.filepath);
        if (item.type === "video") {
            filecontent_arr.push({ contents: new Uint8Array(file_data), name: `SPOILER_video${i + 1}.mp4` });
            items_processed += 1;
            continue;
        }
        if (item.type === "image") {
            filecontent_arr.push({ contents: new Uint8Array(file_data), name: `SPOILER_image${i + 1}.png` });
            items_processed += 1;
            continue;
        }
    }

    await client.editMessage(message.channelId, message.id, {
        content: "",
        files: filecontent_arr,
        allowedMentions: { repliedUser: false },
    });

    // suppress embeds in original message
    await client.editMessage(message.channelId, message.referencedMessage?.id!, {
        flags: MessageFlags.SuppressEmbeds,
    });

    // Send voice message with audio if it exists
    const audio_item = content.items.find((item) => item.type === "audio");
    if (!audio_item) return undefined;
    const ogg_filename = await convertToProperCodec(audio_item.filepath);
    const audio_info = await getAudioData(ogg_filename);
    const voice_message = await sendVoiceMessage(message.channelId, ogg_filename, audio_info.waveform, audio_info.duration);

    await client.editMessage(message.channelId, message.id, {
        content: "Generating slideshow video...",
        files: filecontent_arr,
        allowedMentions: { repliedUser: false },
    });

    // Generate slideshow video if gallery consists of images and audio only
    const created_video_path = await createSlideshowVideo(content.items);
    const created_video = await readFile(created_video_path);

    if (created_video.byteLength > 10 * 1_000_000) {
        await client.editMessage(message.channelId, message.id, {
            content: `❌ Generated video is too large to be sent to Discord (~${created_video.byteLength/1_000_000}MB)`,
            allowedMentions: { repliedUser: false },
        });
    }

    await client.editMessage(message.channelId, message.id, {
        content: "",
        files: [{ contents: new Blob([new Uint8Array(created_video)]), name: "slideshow.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    if (voice_message) {
        try {
            client.deleteMessage(message.channelId, voice_message.id);
        } catch {}
    }
}
