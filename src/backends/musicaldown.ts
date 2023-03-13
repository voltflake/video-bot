// Scrapes video using musicaldown.com service
// Feel free to submit pull requests if you want to improve/fix this backend

// Downloads best available video
export async function getVideoURL(tiktok_url: string): Promise<string> {
    try {
        const html = await getHTML(tiktok_url);
        return extractURL(html);
    } catch (error: any) {
        throw new Error(`MusicalDown.com backend failed: ${error.message}`);
    }
}

// Gets html with links from service
async function getHTML(tiktok_url: string): Promise<string> {
    // Go to website to create needed tokens & cookies
    const init_response = await fetch("https://musicaldown.com/en", {
        headers: {
            Accept: "*/*",
            Referer: "https://musicaldown.com",
            Origin: "https://musicaldown.com",
        },
    });

    const init_response_data = await init_response.text();
    // Collect necessary data from main page to submit POST request later based on it
    const inputs = init_response_data.match(/<input[^>]+>/g);
    const extraction_error = new Error("error when extracting data for POST request");
    if (inputs == undefined) throw extraction_error;
    if (inputs.length < 2) throw extraction_error;

    const link_key = inputs[0].match(/(?<=name=")[^"]+(?=")/g)?.[0];
    const session_key = inputs[1].match(/(?<=name=")[^"]+(?=")/g)?.[0];
    const session_value = inputs[1].match(/(?<=value=")[^"]+(?=")/g)?.[0];
    if (link_key == undefined) throw extraction_error;
    if (session_key == undefined) throw extraction_error;
    if (session_value == undefined) throw extraction_error;

    const form_data = new FormData();
    form_data.append("verify", "1");
    form_data.append(link_key, tiktok_url);
    form_data.append(session_key, session_value);

    const sessiondata_regex = init_response.headers.get("set-cookie")?.toString().match(/session_data=[^;]+(?=;)/g);
    if (sessiondata_regex == undefined) throw new Error("session cookies were not granted");
    const sessiondata_text = sessiondata_regex[0];

    const main_request = new Request("https://musicaldown.com/download", {
        method: "POST",
        headers: {
            "Origin": "https://musicaldown.com",
            "Referer": "https://musicaldown.com/en",
            "Cookie": sessiondata_text,
        },
        body: form_data,
    });

    const results_page = await fetch(main_request);
    const html = await results_page.text();
    return html;
}

// Extract link from results page
// TODO: extraction is too unreliable, should be using button text insted of blindly extracted links
function extractURL(html: string) {
    const link_pattern = /https.+?(?=\?)/g;
    const links_regex = html.match(link_pattern);
    if (links_regex != undefined) {
        for (let i = 0; i < links_regex.length; i++) {
            const element = links_regex[i];
            if (/video/g.test(element)) return element;
        }
    }
    throw new Error("failed to extract links from html");
}
