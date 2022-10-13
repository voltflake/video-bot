// Scrapes video directly from tiktok.com page
// Feel free to submit pull requests if you want to improve/fix this backend

import axios from "axios";

// main function
export default async function getVideoLink(url: URL): Promise<string> {
	try {
		const html = await getHTML(url);
		return extractVideoLink(html);
	} catch (err) {
		console.error(err);
		throw "direct backend failed";
	}
}

async function getHTML(url: URL) {
	return new Promise<string>(async (resolve, reject) => {
		try {
			const response = await axios(url.toString(), {
				method: 'get',
				responseType: 'text',
				'headers': {
					"hostname": url.hostname,
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0',
				}
			});
			resolve(response.data);
		} catch (error) {
			reject(error);
		}
	});
}

function extractVideoLink(html_text: string) {
	const link_pattern = /https.+?(?=")/g;
	const codepoint_pattern = /\\u(.{4})/g;

	const unparsed_links = html_text.match(link_pattern);

	if (unparsed_links == undefined) throw "couldn't find correct link from tiktok html";

	for (let i = 0; i < unparsed_links.length; i += 1) {
		// convert unicode codepoints like "\u07AF" to characters
		const parsed_link = unparsed_links[i].replace(codepoint_pattern, codepointToCharacter)

		// if link contains "btag=80000" it's video link
		if (/&btag=80000/g.test(parsed_link)) return parsed_link;
	}
	throw "couldn't find correct link from tiktok html";
}

function codepointToCharacter(src: string): string {
	let result = 0;
	result += parseInt(src[2], 16) * 0x1000;
	result += parseInt(src[3], 16) * 0x0100;
	result += parseInt(src[4], 16) * 0x0010;
	result += parseInt(src[5], 16) * 0x0001;
	return String.fromCodePoint(result);
}