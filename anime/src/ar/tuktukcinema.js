const mangayomiSources = [{
    "name": "Tuktukcinema",
    "id": 645839201,
    "baseUrl": "https://tuk.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://tuk.cam",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/tuktukcinema.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // Trim base URL to avoid issues with trailing spaces.
        this.source.baseUrl = this.source.baseUrl.trim();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, { headers });
        return new Document(res.body);
    }

    async request(url, headers = {}) {
        const res = await this.client.get(url, { headers });
        return res;
    }

    _titleEdit(title, isDetails = false) {
        // Updated regex to be more general for movie names (e.g., "فيلم اسم الفيلم 2023 نوع")
        const movieRegex = /^(?:فيلم|عرض)\s(.+?)(?:\s\d{4})?\s*(?:\((.+?)\))?\s*$/;
        // Series regex is good for titles like "مسلسل اسم المسلسل الحلقة 1"
        const seriesRegex = /^(?:مسلسل|برنامج|انمي)\s(.+)\sالحلقة\s(\d+)/;

        let match = title.match(movieRegex);
        if (match) {
            const movieName = match[1].trim(); // Trim movie name
            const type = match[2] ? `(${match[2].trim()})` : ''; // Optional type
            return isDetails ? `${movieName} ${type}`.trim() : movieName;
        }

        match = title.match(seriesRegex);
        if (match) {
            const seriesName = match[1].trim();
            const epNum = match[2];
            if (isDetails) {
                return `${seriesName} (ep:${epNum})`;
            }
            // If it's a series, return just the series name without "الموسم" part for catalogue display
            return seriesName.includes("الموسم") ? seriesName.split("الموسم")[0].trim() : seriesName;
        }
        return title.trim();
    }

    async _parseCataloguePage(doc, isSearch = false) {
        const list = [];
        // Selects both Block--Item and Small--Box for broader coverage
        const items = doc.select("div.Block--Item, div.Small--Box");
        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            if (!linkElement) return;

            // Use the _titleEdit helper to clean up names for catalogue display
            const name = this._titleEdit(linkElement.attr("title"), false); // Use isDetails=false for catalogue
            let imageUrlAttr = isSearch ? "src" : "data-src";
            const imageUrl = item.selectFirst("img")?.attr(imageUrlAttr);
            
            // Append "watch/" to all item links to ensure direct access to video page
            const link = linkElement.getHref + "watch/";

            list.push({ name, imageUrl, link });
        });

        // Check for next page pagination link
        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        // Assuming popular are movies
        const doc = await this.requestDoc(`/category/movies/?page=${page}`);
        return await this._parseCataloguePage(doc);
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        return await this._parseCataloguePage(doc);
    }

    async search(query, page, filters) {
        let path;
        if (query) {
            path = `/?s=${encodeURIComponent(query)}&page=${page}`;
        } else {
            const categoryFilter = filters[0];
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (selectedCategory) {
                // If a category filter is selected, use it
                path = `/${selectedCategory}?page=${page}/`;
            } else {
                // If no query and no category, default to popular movies
                return this.getPopular(page);
            }
        }
        const doc = await this.requestDoc(path);
        return await this._parseCataloguePage(doc, !!query);
    }

    async getDetail(url) {
        // Fetch the document for the given URL
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));

        // Extract basic details
        const nameElement = doc.selectFirst("h1.post-title");
        const name = this._titleEdit(nameElement?.text || "Unknown Title", true); // Pass true for isDetails
        const imageUrl = doc.selectFirst("div.left div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const status = 1; // Assuming 'Completed' for simplicity, as specific status isn't always clear from markup.

        const chapters = [];
        // Check for episode links within the `section.allepcont div.row` block
        const episodeElements = doc.select("section.allepcont div.row a");

        if (episodeElements.length > 0) {
            // This is a series page for a specific season, listing its episodes.
            let seasonNumText = "الحلقات"; // Default label for episodes

            // Attempt to extract season number from the main title (h1.post-title)
            const fullTitleText = nameElement?.text || "";
            const seasonMatchTitle = fullTitleText.match(/الموسم\s+\S+/); // e.g., "الموسم الثاني"
            if (seasonMatchTitle) {
                seasonNumText = seasonMatchTitle[0].trim();
            } else {
                // Fallback to extract from URL if not in title (e.g., /الموسم-الثاني/, /season-1/)
                // Covers Arabic numerals 1-10 or common Arabic words for 1-10.
                const urlPath = url.replace(this.source.baseUrl, '');
                const urlSeasonMatch = urlPath.match(/(?:الموسم)(?:-|\s)(\d+|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/i);
                if (urlSeasonMatch) {
                    // If it's a number, use "الموسم {number}", otherwise use the Arabic word directly
                    if (!isNaN(parseInt(urlSeasonMatch[1]))) {
                        seasonNumText = `الموسم ${urlSeasonMatch[1]}`;
                    } else {
                        seasonNumText = `الموسم ${urlSeasonMatch[1]}`; // e.g., "الموسم الاول"
                    }
                }
            }
            
            // Sort episodes numerically based on the extracted episode number
            // The HTML provides episodes in descending order, we want ascending.
            const sortedEpisodes = [...episodeElements].sort((a, b) => {
                const numA = parseInt(a.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                const numB = parseInt(b.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                return numA - numB;
            });

            sortedEpisodes.forEach(ep => {
                const epUrl = ep.getHref + "watch/"; // Append "watch/" to get to the video player page
                const epNum = ep.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim(); // Extract episode number, remove non-digits
                
                if (epNum) { // Only add if episode number is found
                    const epName = `${seasonNumText} : الحلقة ${epNum}`;
                    chapters.push({ name: epName, url: epUrl });
                }
            });
        } else {
            // If no episode elements found in "section.allepcont", assume it's a movie or a standalone show
            // The URL passed to getDetail already includes "watch/" if it came from catalogue.
            chapters.push({ name: "مشاهدة", url: url });
        }

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const serverElements = doc.select("div.watch--servers--list ul li.server--item");

        let videos = [];
        for (const element of serverElements) {
            const extracted = await this._extractVideos(element);
            if (extracted && extracted.length > 0) videos.push(...extracted);
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0; // Keep original order among same-preference videos
        });

        return videos;
    }

    async _extractVideos(element) {
        const serverUrl = element.attr("data-link");
        const serverName = element.text;
        const urlHost = new URL(serverUrl).hostname;

        // Use a common User-Agent for all external resolvers
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };

        if (urlHost.includes("cybervynx.com") || urlHost.includes("smoothpre.com")) {
            return await this._resolveCybervynxSmoothpre(serverUrl, serverName, defaultHeaders);
        }
        if (urlHost.includes("doodstream.com") || urlHost.includes("dood.to") || urlHost.includes("dood.so") || urlHost.includes("dood.cx") || urlHost.includes("dood.la") || urlHost.includes("dood.ws") || urlHost.includes("dood.sh") || urlHost.includes("doodstream.co") || urlHost.includes("dood.pm") || urlHost.includes("dood.wf") || urlHost.includes("dood.re") || urlHost.includes("dood.yt") || urlHost.includes("dooood.com") || urlHost.includes("dood.stream") || urlHost.includes("ds2play.com") || urlHost.includes("doods.pro") || urlHost.includes("ds2video.com") || urlHost.includes("d0o0d.com") || urlHost.includes("do0od.com") || urlHost.includes("d0000d.com") || urlHost.includes("d000d.com") || urlHost.includes("dood.li") || urlHost.includes("dood.work") || urlHost.includes("dooodster.com") || urlHost.includes("vidply.com")) {
            return await this._resolveDoodStream(serverUrl, defaultHeaders);
        }
        if (urlHost.includes("mixdrop.ps") || urlHost.includes("mixdrop.co") || urlHost.includes("mixdrop.to") || urlHost.includes("mixdrop.sx") || urlHost.includes("mixdrop.bz") || urlHost.includes("mixdrop.ch") || urlHost.includes("mixdrp.co") || urlHost.includes("mixdrp.to") || urlHost.includes("mixdrop.gl") || urlHost.includes("mixdrop.club") || urlHost.includes("mixdroop.bz") || urlHost.includes("mixdroop.co") || urlHost.includes("mixdrop.vc") || urlHost.includes("mixdrop.ag") || urlHost.includes("mdy48tn97.com") || urlHost.includes("md3b0j6hj.com") || urlHost.includes("mdbekjwqa.pw") || urlHost.includes("mdfx9dc8n.net") || urlHost.includes("mixdropjmk.pw") || urlHost.includes("mixdrop21.net") || urlHost.includes("mixdrop.is") || urlHost.includes("mixdrop.si") || urlHost.includes("mixdrop23.net") || urlHost.includes("mixdrop.nu") || urlHost.includes("mixdrop.ms") || urlHost.includes("mdzsmutpcvykb.net") || urlHost.includes("mxdrop.to")) {
            return await this._resolveMixDrop(serverUrl, defaultHeaders);
        }
        // If no specific resolver found, return empty
        return [];
    }

    async _jsUnpack(packedJS) {
        try {
            // This regex specifically targets the p,a,c,k,e,d parameters in the eval function
            const p_match = packedJS.match(/eval\(function\(p,a,c,k,e,d\){.*?}\('([^']+)',(\d+),(\d+),'([^']+)'\.split\('\|'\),0,{}\)\)/s);
            if (!p_match) {
                console.warn("JS Unpack: No p,a,c,k,e,d pattern found for unpacking.");
                return null;
            }

            let p = p_match[1];
            let a = parseInt(p_match[2]);
            let c = parseInt(p_match[3]);
            let k = p_match[4].split('|');

            // The 'e' function converts an integer (index) back to its packed (base36) string representation.
            // This representation is used as a placeholder in the 'p' string that needs to be replaced by 'k' values.
            let e = function(val) {
                return (val < a ? "" : e(parseInt(val / a))) + ((val = val % a) > 35 ? String.fromCharCode(val + 29) : val.toString(36));
            };

            let unpacked = p; // Start with the packed string 'p'
            let i = c; // 'c' is the count/length of the 'k' array

            // Loop backward through the 'k' array and replace the packed placeholders with actual values
            while (i--) {
                if (k[i]) { // Only replace if there's a corresponding value in k
                    // Create a RegExp to find the packed token (e.g., '\b0\b', '\b1\b', etc.)
                    // and replace it with its corresponding value from the 'k' array.
                    unpacked = unpacked.replace(new RegExp('\\b' + e(i) + '\\b', 'g'), k[i]);
                }
            }
            return unpacked;
        } catch (error) {
            console.error("Error during JS Unpack:", error);
            return null;
        }
    }

    async _parseM3U8(m3u8Content, baseUrl, prefix) {
        const videos = [];
        const lines = m3u8Content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                const quality = resolutionMatch ? resolutionMatch[1] : 'Unknown';
                const videoUrl = new URL(lines[i + 1], baseUrl).href;
                videos.push({
                    url: videoUrl,
                    originalUrl: videoUrl, // Use the direct M3U8 for playback referer
                    quality: `${prefix} - ${quality}`,
                });
            }
        }
        if (videos.length === 0 && m3u8Content.includes('.m3u8')) {
             // If there's an M3U8 link in the content but no specific qualities, treat the base as auto.
             videos.push({
                 url: baseUrl,
                 originalUrl: baseUrl,
                 quality: `${prefix} - Auto`,
             });
        }
        return videos;
    }

    async _resolveCybervynxSmoothpre(url, prefix, headers) {
        try {
            const res = await this.request(url, headers);
            const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];

            if (!scriptData) {
                // If no packed JS, check for direct MP4 or M3U8 links in the HTML
                const directMp4Match = res.body.match(/src="([^"]+\.mp4)"/)?.[1];
                if (directMp4Match) {
                     return [{ url: directMp4Match, originalUrl: url, quality: `${prefix} - SD` }];
                }
                const directM3u8Match = res.body.match(/(https?:\/\/[^"]+\.m3u8)/)?.[1];
                if (directM3u8Match) {
                    const m3u8Res = await this.request(directM3u8Match, { "Referer": url });
                    return this._parseM3U8(m3u8Res.body, directM3u8Match, prefix);
                }
                return []; // No video found
            }

            const unpacked = await this._jsUnpack(scriptData);
            if (!unpacked) return [];

            // Try to find a direct MP4 link first in the unpacked content
            const mp4Match = unpacked.match(/file:"([^"]+\.mp4)"/)?.[1];
            if (mp4Match) {
                return [{ url: mp4Match, originalUrl: url, quality: `${prefix} - SD` }];
            }

            // Then try to find an M3U8 master link in the unpacked content
            const masterUrl = unpacked.match(/file:"([^"]+\.m3u8)"/)?.[1];
            if (masterUrl) {
                const m3u8Res = await this.request(masterUrl, { "Referer": url });
                return this._parseM3U8(m3u8Res.body, masterUrl, prefix);
            }
            return [];
        } catch (error) {
            console.error(`Error resolving ${prefix} (${url}):`, error);
            return [];
        }
    }

    async _resolveDoodStream(url, headers) {
        try {
            let currentHost = new URL(url).hostname;
            // Adjust host based on common DoodStream aliases (from Python resolver)
            if (currentHost.includes("dood.cx") || currentHost.includes("dood.wf")) {
                currentHost = "dood.so";
            }
            if (currentHost.includes("dood.la") || currentHost.includes("dood.yt")) {
                currentHost = "doodstream.com";
            }

            // Ensure the URL is in the /e/ format
            let embedId = url.split('/').pop();
            // Refine embedId extraction in case URL format differs (e.g., /d/ instead of /e/)
            if (!embedId || embedId.length < 5) {
                 const matchId = url.match(/(?:\/d\/|\/e\/)([0-9a-zA-Z]+)/);
                 if (matchId) embedId = matchId[1];
            }
            if (!embedId) {
                console.warn("DoodStream: Could not extract embed ID from URL:", url);
                return [];
            }
            const embedUrl = `https://${currentHost}/e/${embedId}`;

            // Initial request headers for the embed page
            let doodHeaders = { ...headers, "Referer": `https://${currentHost}/` };

            let res = await this.client.get(embedUrl, { headers: doodHeaders });
            let html = res.body;

            // Extract the play token and URL parts
            const match = html.match(/dsplayer\.hotkeys[^']+'([^']+).+?function\s*makePlay.+?return[^?]+([^"]+)/s);
            if (match) {
                const urlPart1 = match[1]; // e.g., /pass_md.php
                const tokenPart2 = match[2]; // e.g., /token/
                
                const playUrl = new URL(urlPart1, embedUrl).href; // Construct absolute URL for the play request
                doodHeaders.Referer = embedUrl; // Referer for this request must be the embed page

                const playRes = await this.client.get(playUrl, { headers: doodHeaders });
                const playHtml = playRes.body;

                let vidSrc;
                if (playHtml.includes("cloudflarestorage.")) {
                    vidSrc = playHtml.trim(); // Direct cloudflare URL
                } else {
                    // Recreate the random string generation from Python's dood_decode
                    const charSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let randomString = '';
                    for (let i = 0; i < 10; i++) {
                        randomString += charSet.charAt(Math.floor(Math.random() * charSet.length));
                    }
                    vidSrc = playHtml.trim() + tokenPart2 + Date.now() + randomString;
                }

                return [{
                    url: vidSrc,
                    originalUrl: embedUrl, // Important: This sets the Referer for the video player
                    quality: `Doodstream`
                }];
            }
            return []; // No video link found
        } catch (error) {
            console.error(`Error resolving DoodStream (${url}):`, error);
            return [];
        }
    }

    async _resolveMixDrop(url, headers) {
        try {
            let currentHost = new URL(url).hostname;
            // Python resolver specific rule for mixdrop.club
            if (currentHost.includes(".club")) {
                currentHost = currentHost.replace(".club", ".co");
            }
            
            // Ensure the URL is in the /e/ format
            const embedId = url.split('/').pop();
            let embedUrl = `https://${currentHost}/e/${embedId}`;

            let mixdropHeaders = { ...headers, "Origin": `https://${currentHost}`, "Referer": `https://${currentHost}/` };

            let res = await this.client.get(embedUrl, { headers: mixdropHeaders });
            let html = res.body;

            // Handle location redirect (if any) as seen in Python resolver
            const redirectMatch = html.match(/location\s*=\s*["']([^'"]+)/);
            if (redirectMatch) {
                const newPath = redirectMatch[1];
                mixdropHeaders.Referer = embedUrl; // Update Referer to the initial embed URL for the redirect
                // The new URL could be relative or absolute, handle both
                const redirectedEmbedUrl = new URL(newPath, embedUrl).href;
                res = await this.client.get(redirectedEmbedUrl, { headers: mixdropHeaders });
                html = res.body;
                // Important: Update embedUrl to the final one after redirect for correct Referer
                embedUrl = redirectedEmbedUrl;
            }

            // Unpack if necessary (MixDrop also uses p.a.c.k.e.d obfuscation)
            if (html.includes('(p,a,c,k,e,d)')) {
                const scriptData = html.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
                if (scriptData) {
                    html = await this._jsUnpack(scriptData) || html; // Use original html if unpack fails
                }
            }

            // Extract the final video source URL
            const surlMatch = html.match(/(?:vsr|wurl|surl)[^=]*=\s*"([^"]+)/);
            if (surlMatch) {
                let surl = surlMatch[1];
                if (surl.startsWith('//')) {
                    surl = 'https:' + surl; // Prepend https if relative protocol
                }
                
                return [{
                    url: surl,
                    originalUrl: embedUrl, // Important: Sets Referer for the video player to the embed page
                    quality: `MixDrop`
                }];
            }
            return []; // No video link found
        } catch (error) {
            console.error(`Error resolving MixDrop (${url}):`, error);
            return [];
        }
    }

    getFilterList() {
        const categories = [{
            "name": "اختر",
            "query": ""
        }, {
            "name": "كل الافلام",
            "query": "category/movies-33/"
        }, {
            "name": "افلام اجنبى",
            "query": "category/movies-33/افلام-اجنبي/"
        }, {
            "name": "افلام انمى",
            "query": "category/anime-6/افلام-انمي/"
        }, {
            "name": "افلام تركيه",
            "query": "category/movies-33/افلام-تركي/"
        }, {
            "name": "افلام اسيويه",
            "query": "category/movies-33/افلام-اسيوي/"
        }, {
            "name": "افلام هنديه",
            "query": "category/movies-33/افلام-هندى/"
        }, {
            "name": "كل المسسلسلات",
            "query": "category/series-9/"
        }, {
            "name": "مسلسلات اجنبى",
            "query": "category/series-9/مسلسلات-اجنبي/"
        }, {
            "name": "مسلسلات انمى",
            "query": "category/anime-6/انمي-مترجم/"
        }, {
            "name": "مسلسلات تركى",
            "query": "category/series-9/مسلسلات-تركي/"
        }, {
            "name": "مسلسلات اسيوى",
            "query": "category/series-9/مسلسلات-أسيوي/"
        }, {
            "name": "مسلسلات هندى",
            "query": "category/series-9/مسلسلات-هندي/"
        }, ];

        return [{
            type_name: "SelectFilter",
            name: "الأقسام",
            state: 0,
            values: categories.map(c => ({
                type_name: "SelectOption",
                name: c.name,
                value: c.query
            }))
        }];
    }

    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة المفضلة لديك",
                valueIndex: 0,
                entries: ["720p", "480p", "360p", "Auto"],
                entryValues: ["720", "480", "360", "Auto"],
            }
        }];
    }
}
