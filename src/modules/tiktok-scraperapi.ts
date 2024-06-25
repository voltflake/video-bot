import type { Item } from "../types.js";

export async function scraperapi(tiktokUrl: string): Promise<Array<Item>> {
  const key = process.env["RAPIDAPI_KEY"];
  if (key == null) {
    throw new Error("RapidAPI key is not provided. Check bot configuration.");
  }

  const urlParams = {
    url: tiktokUrl,
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

  if (json.data.images == null) {
    // default video
    return [{url: json.data.play, size: json.data.size, type: "Video"}];
  }

  if (json.data.images.length > 0) {
    // it's a slideshow
    
    // discord supports up to 10 attachments per message
    // (9 images + sound) max
    if (json.data.images.length > 9) {
      throw new Error("Too many images in slideshow.");
    }

    const result = [];
    for (const image of json.data.images) {
      const item: Item = {url: image, type: "Image"}
      result.push(item);
    }
    const item: Item = {url: json.data.music, type: "Audio"}
    result.push(item);
    return result;
  }

  throw new Error("Unreachable code reached. Bug in scraperapi module.");
}
