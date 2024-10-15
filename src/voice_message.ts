import type { Message } from "npm:discordeno";
import { log } from "./util.ts";
import { encodeBase64 } from "jsr:@std/encoding/base64";

export async function convertToProperCodec(path_to_audio_file: string): Promise<string | undefined> {
    try {
        const command = new Deno.Command("ffmpeg", { args: ["-i", path_to_audio_file, "-c:a", "libopus", "-vn", `${path_to_audio_file}.ogg`] });
        const { code } = await command.output();
        if (code !== 0) {
            log("CRITICAL", '"ffmpeg" exited with non 0 code when creating OPUS audio file.');
            return undefined;
        }
    } catch {
        log("CRITICAL", 'Spawning "ffmpeg" process failed.');
        return undefined;
    }
    return `${path_to_audio_file}.ogg`;
}

export async function getAudioData(path_to_audio_file: string): Promise<{ duration: number; waveform: Uint8Array } | undefined> {
    try {
        const command = new Deno.Command("ffmpeg", { args: ["-i", path_to_audio_file, "-f", "u8", "-ac", "1", "-ar", "1000", `${path_to_audio_file}.raw`] });
        const { code } = await command.output();
        if (code !== 0) {
            log("CRITICAL", '"ffmpeg" exited with non 0 code when creating raw audio file.');
            return undefined;
        }
    } catch {
        log("CRITICAL", 'Spawning "ffmpeg" process failed.');
        return undefined;
    }

    const data = Array.from(await Deno.readFile(`${path_to_audio_file}.raw`));
    const duration = data.length / 1000;
    let waveform_samples = 1 + Math.floor(data.length / 100);
    if (waveform_samples > 256) {
        waveform_samples = 256;
    }

    // TODO handle case where (samples == 1)
    const sample_length = Math.floor(data.length / (waveform_samples - 1));
    const waveform = new Uint8Array(waveform_samples);
    for (let i = 0; i < waveform_samples; i++) {
        const element = data[i * sample_length];
        if (!element) {
            log("CRITICAL", "Error when parsing raw waveform.");
            return undefined;
        }
        waveform[i] = volume(element);
    }

    await Deno.remove(`${path_to_audio_file}.raw`);

    return { duration: duration, waveform: waveform };
}

function volume(byte: number): number {
    if (byte >= 0x80) {
        return (byte - 0x80) * 2;
    }
    return (0x80 - byte) * 2;
}

// NOTE: temporary workaround until discordeno properly supports voice messages
export async function sendVoiceMessage(channel_id: bigint, path_to_audio_file: string, waveform: Uint8Array, duration: number): Promise<Message | undefined> {
    const data = await Deno.readFile(path_to_audio_file);
    const form = new FormData();
    form.append("files[0]", new Blob([data], { type: "audio/ogg" }), "song.ogg");

    const payloadJson = {
        attachments: [
            {
                id: "0",
                filename: "song.ogg",
                duration_secs: duration,
                waveform: encodeBase64(waveform),
            },
        ],
        flags: 1 << 13, // IS_VOICE_MESSAGE
    };

    form.append("payload_json", JSON.stringify(payloadJson));

    const bot_key = Deno.env.get("DISCORD_TOKEN");
    if (!bot_key) {
        log("CRITICAL", "DISCORD_TOKEN is not in enviroment.");
        return undefined;
    }

    // Send voice message
    const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bot ${bot_key}`,
        },
        body: form,
    });

    if (response.status !== 200) {
        log("CRITICAL", "Failed to send voice message to discord.");
        return undefined;
    }
    return (await response.json()) as Message;
}
