import type { FileData } from "disgroove";
import type { Item } from "./util.js";
import { convertToProperCodec, getAudioData, sendVoiceMessage } from "./voice_message.js";
import { createSlideshowVideo } from "./generate_video.js";
import { readFile } from "node:fs/promises";
import { compressVideo, getVideoCodec, reencodeToH264 } from "./video_helpers.js";
import type { Job } from "./job.js";
import { client } from "./main.js";

// TODO: refactor to threat posts with videos differently from slideshows
export async function sendGallery(items: Item[], job: Job): Promise<void> {
    let items_processed = 0;
    const filecontent_arr: FileData[] = [];
    for (const [i, item] of items.entries()) {
        // TODO: Handle more images.
        if (items_processed === 10) {
            break;
        }
        let file_data = await readFile(item.filepath);
        if (item.type === "video") {
            if (file_data.byteLength >= 30 * 1024 * 1024) {
                await job.set_status(`❌ Video is too large to be sent to Discord. (${file_data.byteLength / 1_000_000}MB)`);
            } else if (file_data.byteLength > 10 * 1024 * 1024) {
                try {
                    await job.set_status(`Compressing video item... (~${file_data.byteLength / 1_000_000}MB)`);
                    const compressed_path = await compressVideo(item.filepath);
                    file_data = await readFile(compressed_path);
                    if (file_data.byteLength > 10 * 1024 * 1024) {
                        await job.set_status(`❌ Compressed video is still too large to be sent to Discord after compression (~${file_data.byteLength / 1_000_000}MB). This error should be reported.`);
                    }
                } catch {
                    await job.set_status(`❌ Error occured during compression. Unable to send video.`);
                    return;
                }
            } else {
                try {
                    const codec = await getVideoCodec(item.filepath);
                    if (codec !== "h264" || !item.filepath.endsWith(".mp4")) {
                        job.set_status(`Re-encoding video to h264 codec for Discord compatibility...`);
                        item.filepath = await reencodeToH264(item.filepath);
                    }
                } catch {
                    await job.set_status(`❌ Error occured during re-encoding. Unable to send video.`);
                    return;
                }
                file_data = await readFile(item.filepath);
            }
            if (items.length === 1) {
                filecontent_arr.push({ contents: new Blob([new Uint8Array(file_data)]), name: "video.mp4" });
            } else {
                filecontent_arr.push({ contents: new Blob([new Uint8Array(file_data)]), name: `SPOILER_video${i + 1}.mp4` });
            }
            items_processed += 1;
            continue;
        }
        if (item.type === "image") {
            filecontent_arr.push({ contents: new Uint8Array(file_data), name: `SPOILER_image${i + 1}.png` });
            items_processed += 1;
            continue;
        }
    }

    await job.submit_result(filecontent_arr);

    // suppress embeds in original message
    await job.remove_original_embeds();

    // Send voice message with audio if it exists
    const audio_item = items.find((item) => item.type === "audio");
    if (!audio_item) return undefined;
    const ogg_filename = await convertToProperCodec(audio_item.filepath);
    const audio_info = await getAudioData(ogg_filename);
    const voice_message = await sendVoiceMessage(job.message.channelId, ogg_filename, audio_info.waveform, audio_info.duration);

    await client.editMessage(job.message.channelId, job.response_message!.id, {
        content: "Generating slideshow video...",
        files: filecontent_arr,
        allowedMentions: { repliedUser: false },
    });

    // Generate slideshow video if gallery consists of images and audio only
    const created_video_path = await createSlideshowVideo(items);
    const created_video = await readFile(created_video_path);

    if (created_video.byteLength > 10 * 1_000_000) {
        await job.set_status(`❌ Generated video is too large to be sent to Discord (~${created_video.byteLength / 1_000_000}MB)`);
        return;
    }

    await job.submit_result([{ contents: new Blob([new Uint8Array(created_video)]), name: "slideshow.mp4" }]);

    if (voice_message) {
        try {
            client.deleteMessage(job.message.channelId, voice_message.id);
        } catch { }
    }
}
