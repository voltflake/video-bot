import { validateAndGetContentLength } from "../helper_functions.js";
import type { Item } from "../types.js";

export async function ytdlp(youtubeUrl: string) {
  const process = Bun.spawn(["yt-dlp", "-f", "mp4", "--print", "urls", `${youtubeUrl}`]);
  const links = (await new Response(process.stdout).text()).split("\n");
  if (links[0] == null) {
    throw new Error("yt-dlp provided unexpected output.");
  }

  const videoSize = await validateAndGetContentLength(links[0]);
  const result: Item[] = [{ url: links[0], size: videoSize, type: "Video" }];
  return result;
}
