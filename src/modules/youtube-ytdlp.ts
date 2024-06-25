import { easySpawn, validateAndGetContentLength } from "../helper_functions.js";
import type { Item } from "../types.js";

export async function ytdlp(youtubeUrl: string): Promise<Item[]> {
  const process = await easySpawn(`yt-dlp -f mp4 --print urls ${youtubeUrl}`);
  const links = process.stdout.split("\n");
  if (links[0] == null) {
    throw new Error("yt-dlp provided unexpected output.");
  }

  const videoSize = await validateAndGetContentLength(links[0]);
  const result: Item[] = [{ url: links[0], size: videoSize, type: "Video" }];
  return result;
}
