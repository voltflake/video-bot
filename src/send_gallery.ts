import { type Client, type Message, MessageFlags, type FileData } from "disgroove";
import type { Content } from "./util.ts";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.ts";
import { createSlideshowVideo } from "./generate_video.ts";

// TODO: refactor to threat posts with videos differently from slideshows
export async function sendGallery(content: Content, client: Client, message: Message): Promise<void> {
    const audio_item = content.items.find((item) => item.type === "audio");
    if (!audio_item) return undefined;
    const ogg_filename = await convertToProperCodec(audio_item.filepath);
    const audio_info = await getAudioData(ogg_filename);

    let items_processed = 0;
    const filecontent_arr: FileData[] = [];
    for (const [i, item] of content.items.entries()) {
        // TODO: Handle more images.
        if (items_processed === 10) {
            break;
        }
        if (item.type !== "image") {
            continue;
        }
        const image_data = await Bun.file(item.filepath).arrayBuffer();
        filecontent_arr.push({ contents: new Blob([image_data], { type: "image/png" }), name: `SPOILER_image${i + 1}.png` });
    }

    const status_message = await client.editMessage(message.channelID, message.id, {
        content: "Generating slideshow video...",
        files: filecontent_arr,
        allowedMentions: { repliedUser: false },
    });

    // Send voice message with audio
    const voice_message = await sendVoiceMessage(message.channelID, ogg_filename, audio_info.waveform, audio_info.duration);

    // suppress embeds in original message
    await client.editMessage(message.channelID, message.referencedMessage?.id!, {
        flags: MessageFlags.SuppressEmbeds,
    });

    const created_video_path = await createSlideshowVideo(content.items);
    const created_video = await Bun.file(created_video_path).arrayBuffer();

    if (created_video.byteLength > 10 * 1_000_000) {
        await client.editMessage(message.channelID, message.id, {
            content: `❌ Generated video is too large to be sent to Discord (~${created_video.byteLength/1_000_000}MB)`,
            allowedMentions: { repliedUser: false },
        });
    }

    await client.editMessage(message.channelID, message.id, {
        content: "",
        files: [{ contents: new Blob([created_video]), name: "slideshow.mp4" }],
        allowedMentions: { repliedUser: false },
    });

    if (voice_message) {
        try {
            client.deleteMessage(status_message.channelID, voice_message.id);
        } catch {}
    }
}
