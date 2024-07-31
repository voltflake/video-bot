export async function validateAndGetContentLength(url: string) {
  for (let i = 3; i >= 1 ; i--) {
    
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok || i === 1) {
      throw new Error("recieved bad response to HEAD request.");
    }

    let contentLength = response.headers.get("content-length");
    if (contentLength != null) {
      return Number.parseInt(contentLength);
    }
    contentLength = response.headers.get("Content-Length");
    if (contentLength != null) {
      return Number.parseInt(contentLength);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("No content length header was found in HEAD response.");
}