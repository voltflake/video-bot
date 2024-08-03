import { validateAndGetContentLength, type Item } from "./util.js";

export async function extractTiktokContent(url: string) {
  return scraperapi(url);
}

async function scraperapi(url: string): Promise<Array<Item>> {
  const key = process.env["RAPIDAPI_KEY"];
  if (key == null) {
    throw new Error("RapidAPI key is not provided. Check bot configuration.");
  }

  const urlParams = {
    url: url,
    hd: "1"
  };
  const urlParamsStr = new URLSearchParams(urlParams).toString();
  const apiUrl = `https://tiktok-scraper7.p.rapidapi.com/?${urlParamsStr}`;
  const options = {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "tiktok-scraper7.p.rapidapi.com"
    }
  };

  const response = await fetch(apiUrl, options).catch(() => {
    throw new Error("ScraperAPI request failed.");
  });

  const responseText = await response.text().catch(() => {
    throw new Error("Failed to parse text from ScraperAPI response.");
  });

  const json = JSON.parse(responseText);

  if (json.code !== 0) {
    // probably a live video
    throw new Error(`API returned an error. Bad link or a live video was provided. ${json.code}`);
  }

  // default video
  if (json.data.images == null) {
    const variants = [];
    try {
      const video_info = await validateAndGetContentLength(json.data.play);
      variants.push({
        href: json.data.play,
        content_length: video_info.content_length,
        file_extention: video_info.file_extention
      });
    } catch { }

    try {
      const video_info = await validateAndGetContentLength(json.data.wmplay);
      variants.push({
        href: json.data.wmplay,
        content_length: video_info.content_length,
        file_extention: video_info.file_extention
      });
    } catch { }

    try {
      const video_info = await validateAndGetContentLength(json.data.hdplay);
      variants.push({
        href: json.data.hdplay,
        content_length: video_info.content_length,
        file_extention: video_info.file_extention
      });
    } catch { }

    return [{ type: "video", variants: variants }];
  }

  // it's a slideshow
  if (json.data.images.length > 0) {
    // discord supports up to 10 attachments per message
    // (9 images + sound) max
    if (json.data.images.length > 9) {
      throw new Error("Too many images in slideshow.");
    }

    const result = [];
    for (const url of json.data.images) {
      const image_info = await validateAndGetContentLength(url);
      const item: Item = {
        type: "image",
        variants: [{
          href: url,
          content_length: image_info.content_length,
          file_extention: image_info.file_extention,
          width: image_info.image_width,
          height: image_info.image_height
        }]
      }
      result.push(item);
    }
    const audio_info = await validateAndGetContentLength(json.data.music);
    const item: Item = { type: "audio", variants: [{ href: json.data.music, content_length: audio_info.content_length, file_extention: audio_info.file_extention }], }
    result.push(item);
    return result;
  }

  throw new Error("Unreachable code reached. Bug in scraperapi module.");
}
