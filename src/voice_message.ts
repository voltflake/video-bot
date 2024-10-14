import type { Message } from "discordeno";
import { execFilePromisified, log } from "./util.ts";
import { readFile, unlink } from "node:fs/promises";
import { Buffer } from "node:buffer";

export async function convertToProperCodec(path_to_audio_file: string): Promise<string | undefined> {
  try {
    await execFilePromisified("ffmpeg", ["-i", path_to_audio_file, "-c:a", "libopus", "-vn", `${path_to_audio_file}.ogg`], { encoding: "utf-8", shell: true });
  } catch {
    log("CRITICAL", "ffmpeg execFile failed when converting audio file to OPUS codec.");
    return undefined;
  }
  return `${path_to_audio_file}.ogg`;
}

export async function getAudioData(path_to_audio_file: string): Promise<{ duration: number; waveform: Uint8Array } | undefined> {
  try {
    await execFilePromisified("ffmpeg", ["-i", path_to_audio_file, "-f", "u8", "-ac", "1", "-ar", "1000", `${path_to_audio_file}.raw`], { encoding: "utf-8", shell: true });
  } catch {
    log("CRITICAL", "ffmpeg execFile failed when converting .ogg audio file to raw data.");
    return undefined;
  }

  const data = Array.from(await readFile(`${path_to_audio_file}.raw`));
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

  await unlink(`${path_to_audio_file}.raw`);

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
  const data = await readFile(path_to_audio_file);
  const form = new FormData();
  form.append("files[0]", new Blob([data], { type: "audio/ogg" }), "song.ogg");

  const payloadJson = {
    attachments: [
      {
        id: "0",
        filename: "song.ogg",
        duration_secs: duration,
        waveform: Buffer.from(waveform).toString("base64"),
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
