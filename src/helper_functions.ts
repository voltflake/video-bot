export async function validateAndGetContentLength(url: string) {
  for (let i = 3; i >= 1 ; i--) {
    
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok || i === 1) {
      throw new Error("bad response to HEAD request");
    }

    let contentLength = response.headers.get("content-length");
    if (contentLength != null) {
      return Number.parseInt(contentLength);
    }
    contentLength = response.headers.get("Content-Length");
    if (contentLength != null) {
      return Number.parseInt(contentLength);
    }
    await Bun.sleep(100);
  }
  throw new Error("No content length provided.");
}
