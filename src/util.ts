export type Item = {
  type: "video" | "image" | "audio",
  variants: Array<{ href: string, content_length: number, file_extention?: string, width?: number, height?: number }>
};

export type Task = {
  type: "TikTok" | "YouTube" | "Instagram" | "YouTube Short";
  href: string;
};

export async function validateAndGetContentLength(url: string) {
  for (let i = 3; i >= 1; i--) {
    let response = await fetch(url, { method: "HEAD" });
    if (!response.ok && i === 1) {
      throw new Error("recieved bad response to HEAD request.");
    }

    let content_length = getContentLength(response.headers);

    if (response.status === 405) {
      const allows = response.headers.get("allow");
      if (allows != null) if (allows.includes("GET")) {
        content_length = undefined;
      }
    }

    if (!content_length) {
      response = await fetch(url);
      content_length = getContentLength(response.headers);
    }

    if (!content_length) throw new Error("No content length provided.");

    let file_extention;
    let header_value = response.headers.get("content-type");
    if (header_value != null) {
      if (header_value.startsWith("image/")) {
        file_extention = header_value.slice("image/".length);
      }
      if (header_value.startsWith("video/")) {
        file_extention = header_value.slice("video/".length);
      }
      if (header_value.startsWith("audio/")) {
        file_extention = header_value.slice("audio/".length);
      }
    }

    let image_width : number | undefined;
    let image_height : number | undefined;
    header_value = response.headers.get("x-imagex-extra");
    if (header_value != null) {
      image_width = JSON.parse(header_value).enc.w;
      image_height = JSON.parse(header_value).enc.h;
    }

    return {
      content_length: content_length,
      image_width: image_width,
      image_height: image_height,
      file_extention: file_extention
    }
  }
  throw new Error("No content length header was found in HEAD response.");
}

function getContentLength(headers: Headers) {
  let header_value = headers.get("content-length");
  if (header_value != null) {
    return Number.parseInt(header_value);
  }

  header_value = headers.get("Content-Length");
  if (header_value != null) {
    return Number.parseInt(header_value);
  }
  
  return undefined;
}