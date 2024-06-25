import type { Item } from "../types.js";

export async function rocketapi(instagramUrl: string): Promise<Array<Item>> {
  const key = process.env["RAPIDAPI_KEY"];
  if (key == null) {
    throw new Error("RapidAPI key is not provided. Check bot configuration.");
  }

  const regexResult = instagramUrl.match(/(?<=instagram.com\/(p|reel)\/)[^/]+/gm);
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
      const result = [];
      for (const item of info.carousel_media) {
        switch (item.media_type) {
          case 1: {
            const image: Item = {type: "Image", url: item.image_versions2.candidates[0].url}
            result.push(image);
            continue;
          }
          case 2: {
            const video: Item = {type: "Video", url: item.video_versions[0].url}
            result.push(video);
            continue;
          }
          default: {
            console.error(`Unknown media type in IG carousel: ${item.media_type}, shortcode is: ${info.code}`);
            continue;
          }
        }
      }
      return result;
    }
    case "feed": {
      return [{type: "Image", url: info.image_versions2.candidates[0].url}];
    }
    case "clips":{
      return [{type: "Video", url: info.video_versions[0].url}];
    }
    default: {
      throw new Error("Unknown product type in Instagram link.");
    }
  }
}
