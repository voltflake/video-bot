import { errorLog, validateAndGetContentLength, type Item } from "./util.ts";

export function extractYoutubeContent(url: string) {
  return ytjar_ytapi(url);
}

// https://rapidapi.com/ytjar/api/yt-api
async function ytjar_ytapi(url: string): Promise<Item[]> {
  const key = process.env["RAPIDAPI_KEY"];
  if (key == null) {
    throw new Error("RapidAPI key is not provided. Check bot configuration.");
  }

  const target_id = url.match(/[a-zA-Z0-9]{11}/);
  if (!target_id) {
    throw new Error("failed to extract video ID from url");
  }

  const urlParams = {
    id: target_id[0]
  };
  const urlParamsStr = new URLSearchParams(urlParams).toString();
  const apiUrl = `https://yt-api.p.rapidapi.com/dl?${urlParamsStr}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": key,
      "x-rapidapi-host": "yt-api.p.rapidapi.com"
    }
  };

  const response = await fetch(apiUrl, options)
  .catch(() => {
    throw new Error("ytjar_ytapi request failed.");
  });

  const json = await response.json()
  .catch(() => {
    throw new Error("Failed to parse json from ytjar_ytapi response.");
  });

  if (json.status !== "OK") {
    throw new Error(`ytjar_ytapi returned an error: ${json.status}`);
  }

  // default video
  const variants: Item["variants"] = [];
  for (const format of json.formats) {
    try {
      const video_info = await validateAndGetContentLength(format.url);
      variants.push({
        href: format.url,
        content_length: video_info.content_length,
        file_extention: video_info.file_extention
      });
    } catch {
      errorLog("Failed to validate format that ytjar_ytapi returned");
    }
  }

  return [{ type: "video", variants: variants }];
}
