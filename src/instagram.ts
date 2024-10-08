import { validateAndGetContentLength, type Item } from "./util.ts";

export async function extractInstagramContent(url: string) {
  return rocketapi(url);
}

async function rocketapi(url: string): Promise<Array<Item>> {
  const key = process.env["RAPIDAPI_KEY"];
  if (key == null) {
    throw new Error("RapidAPI key is not provided. Check bot configuration.");
  }

  const regexResult = url.match(/(?<=instagram.com\/(p|reel)\/)[^/]+/gm);
  if (regexResult == null) {
    throw new Error("Parsing instagram link failed");
  }

  const rocketapiUrl = "https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info_by_shortcode";

  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "rocketapi-for-instagram.p.rapidapi.com"
    },
    body: JSON.stringify({
      shortcode: regexResult[0]
    })
  };

  const response = await fetch(rocketapiUrl, options).catch(() => {
    throw new Error("RocketAPI request failed.");
  });

  const responseText = await response.text().catch(() => {
    throw new Error("Failed to parse text from RocketAPI response.");
  });

  const json = JSON.parse(responseText);

  const info = json.response.body.items[0];
  switch (info.product_type) {
    case "carousel_container": {
      const result: Array<Item> = [];
      for (const item of info.carousel_media) {
        switch (item.media_type) {
          case 1: {
            const image_url = item.image_versions2.candidates[0].url;
            const image_info = await validateAndGetContentLength(image_url);
            result.push({ type: "image", variants: [{href: image_url, content_length: image_info.content_length }]});
            continue;
          }
          case 2: {
            const video_url = item.video_versions[0].url;
            const video_info = await validateAndGetContentLength(video_url);
            result.push({ type: "video", variants: [{href: video_url, content_length: video_info.content_length }]});
            continue;
          }
          default: {
            console.error(`Unknown media type in IG carousel: ${item.media_type}, shortcode is: ${info.code}`);
            continue;
          }
        }
      }
      if (info.music_metadata.music_info) {
        const audio_url = info.music_metadata.music_info.music_asset_info.progressive_download_url
        const audio_info = await validateAndGetContentLength(audio_url);
        result.push({ type: "audio", variants: [{href: audio_url, content_length: audio_info.content_length }]});
      }
      return result;
    }
    case "feed": {
      const result: Array<Item> = [];
      const image_url = info.image_versions2.candidates[0].url;
      const image_info = await validateAndGetContentLength(image_url);
      result.push({ type: "image", variants: [{href: image_url, content_length: image_info.content_length }]});
      if (info.music_metadata.music_info) {
        const audio_url = info.music_metadata.music_info.music_asset_info.progressive_download_url
        const audio_info = await validateAndGetContentLength(audio_url);
        result.push({ type: "audio", variants: [{href: audio_url, content_length: audio_info.content_length }]});
      }
      return result;
    }
    case "clips": {
      const video_url = info.video_versions[0].url;
      const video_info = await validateAndGetContentLength(video_url);
      return [{ type: "video", variants: [{href: video_url, content_length: video_info.content_length }]}];
    }
    default: {
      throw new Error("Unknown product type in Instagram link.");
    }
  }
}
