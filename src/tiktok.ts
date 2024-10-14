import { getContentLength, log, type Item } from "./util.ts";

export async function extractTiktokContent(url: string): Promise<Item[] | undefined> {
  const result = await tiktokscraper7(url);
  if (result) {
    return result;
  }
  log("CRITICAL", "tiktokscraper7 failed.");
  return undefined;
}

// https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7
async function tiktokscraper7(url: string): Promise<Item[] | undefined> {
  const key = Deno.env.get("RAPIDAPI_KEY");
  if (key == null) {
    log("CRITICAL", "tiktokscraper7: RapidAPI key is not provided. Check bot configuration.");
    return undefined;
  }

  const urlParams = {
    url: url,
    hd: "0"
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

  let json: { msg: string; data: { play: string; wmplay: string; images: string[] } };
  try {
    const response = await fetch(apiUrl, options);
    json = await response.json();
  } catch {
    log("CRITICAL", "tiktokscraper7: API fetch() request failed.");
    return undefined;
  }

  // Probably a live video or a bad link
  if (json.msg !== "success") {
    log("CRITICAL", `tiktokscraper7: API returned an error: ${json.msg}. URL: ${url}`);
    return undefined;
  }

  // Default video
  if (!json.data.images) {
    let size = await getContentLength(json.data.play);
    if (size) {
      return [{ type: "video", url: json.data.play, size: size }];
    }

    log("FAULT", `tiktokscraper7: default "play" format failed. URL: ${json.data.play}`);
    log("INFO", `tiktokscraper7: Trying "wmplay". URL: ${json.data.wmplay}`);

    size = await getContentLength(json.data.wmplay);
    if (size) {
      return [{ type: "video", url: json.data.wmplay, size: size }];
    }

    log("CRITICAL", `tiktokscraper7: both "play" and "wmplay" formats failed.`);
    return undefined;
  }

  // Slideshow post
  if (json.data.images) {
    const result: Item[] = [];
    const size = await getContentLength(json.data.play);
    if (!size) {
      log("CRITICAL", "tiktokscraper7: failed to validate audio item from slideshow post.");
      return undefined;
    }
    result.push({ type: "audio", url: json.data.play, size: size });
    for (const image_url of json.data.images) {
      const size = await getContentLength(json.data.wmplay);
      if (!size) {
        log("CRITICAL", "tiktokscraper7: failed to validate one of images from slideshow post.");
        return undefined;
      }
      result.push({ type: "image", url: image_url, size: size  });
    }
    return result;
  }

  log("CRITICAL", "tiktokscraper7: provided URL is not a video nor a slideshow post.");
  return undefined;
}
