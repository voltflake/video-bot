// Scrapes video directly from tiktok.com page
// Feel free to submit pull requests if you want to improve/fix this backend

import axios from "axios";

// main function
export async function getVideoLink(url: string) {
	const html = await getTiktokWebpage(url);
	return extractVideoLink(html);
}

async function getTiktokWebpage(url: string) {
	const pattern = /https:\/\/[^\/]*/
	const hostname = url.match(pattern)![0].slice(7);
	try {
		const response = await axios(url, {
			method: 'get',
			responseType: 'text',
			'headers': {
				"hostname": hostname,
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0',
			}
		});
		return response.data;
	} catch (error) {
		console.error(error);
		return null;
	}
}

function extractVideoLink(html_text: string) {
	const pattern = /https.+?(?=")/g;
	const unicode_codepoint = /\\u(.{4})/g
	const unparsed_links = html_text.match(pattern);
    if (unparsed_links == undefined) return null;
	for (let i = 0; i < unparsed_links.length; i += 1) {
		const unparsed_link = unparsed_links[i];
		// convert unicode codepoints like \u07AF to characters
		const parsed_link = unparsed_link.replace(unicode_codepoint, (codepoint) => {
			let result = 0;
			result += parseInt(codepoint[2], 16) * 0x1000;
			result += parseInt(codepoint[3], 16) * 0x0100;
			result += parseInt(codepoint[4], 16) * 0x0010;
			result += parseInt(codepoint[5], 16) * 0x0001;
			return String.fromCodePoint(result);
		})
		if (/&btag=80000/g.test(parsed_link)) return parsed_link;
	}
	return null;
}