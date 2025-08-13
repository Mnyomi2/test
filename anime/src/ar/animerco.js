// --- METADATA ---
const mangayomiSources = [{
    "name": "Animerco",
    "id": 645698215,
    "lang": "ar",
    "baseUrl": "https://vip.animerco.org",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=animerco.org",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/animerco.js"
}];



class DoodExtractor {
    constructor(client) {
        this.client = client;
    }

    async videoFromUrl(url) {
        try {
            const response = await this.client.get(url, { "Referer": url });
            const content = response.body;
            if (!content.includes("'/pass_md5/")) return null;

            const doodHost = new URL(url).origin;
            const md5 = doodHost + content.match(/\/pass_md5\/[^']*/)[0];
            const token = md5.split('/').pop();
            const randomString = Array(10).fill(0).map(() => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 62))).join('');
            const expiry = Date.now();
            const videoUrlStart = await this.client.get(md5, { "Referer": url }).body;
            const videoUrl = `${videoUrlStart}${randomString}?token=${token}&expiry=${expiry}`;

            return [{
                url: videoUrl,
                quality: "Doodstream",
                headers: { "Referer": doodHost }
            }];
        } catch (e) {
            return null;
        }
    }
}

class StreamTapeExtractor {
    constructor(client) {
        this.client = client;
    }

    async videoFromUrl(url) {
        try {
            const response = await this.client.get(url);
            const doc = new Document(response.body, response.url);
            const script = doc.selectFirst("script:containsData(document.getElementById('robotlink'))")?.text;
            if (!script) return null;

            const videoUrlPart1 = script.substringAfter("document.getElementById('robotlink').innerHTML = '").substringBefore("'");
            const videoUrlPart2 = script.substringAfter("+ ('xcd").substringBefore("'");
            if (!videoUrlPart1 || !videoUrlPart2) return null;

            const videoUrl = "https:" + videoUrlPart1 + videoUrlPart2;
            return [{
                url: videoUrl,
                quality: "StreamTape"
            }];
        } catch (e) {
            return null;
        }
    }
}

class VidBomExtractor {
    constructor(client) {
        this.client = client;
    }

    async videosFromUrl(url) {
        try {
            const doc = new Document(await this.client.get(url).body, url);
            const script = doc.selectFirst("script:containsData(sources)")?.text;
            if (!script) return [];

            const data = script.substringAfter("sources: [").substringBefore("],");
            return data.split('file:"').slice(1).map(source => {
                const src = source.substringBefore('"');
                let quality = "Vidbom: " + source.substringAfter('label:"').substringBefore('"');
                if (quality.length > 15) quality = "Vidshare: 480p"; // Heuristic from ref
                return { url: src, quality };
            });
        } catch (e) {
            return [];
        }
    }
}

class Mp4uploadExtractor {
    constructor(client) {
        this.client = client;
    }
    async videosFromUrl(url, headers) {
        const newHeaders = { ...headers, "Referer": "https://mp4upload.com/" };
        try {
            const doc = new Document(await this.client.get(url, newHeaders).body, url);
            let script = doc.selectFirst("script:containsData(player.src)")?.text;
            if (script && script.includes("eval(function(p,a,c,k,e,d)")) {
                script = MUtils.unpack(script);
            }
            if (!script) return [];

            const videoUrl = script.substringAfter("player.src(").substringAfter("src:").substringAfter('"').substringBefore('"');
            const resolution = script.match(/HEIGHT=(\d+)/)?.[1] || "HD";
            return [{ url: videoUrl, quality: `Mp4Upload - ${resolution}p`, headers: newHeaders }];
        } catch (e) {
            return [];
        }
    }
}

class OkruExtractor {
    constructor(client) {
        this.client = client;
    }
    async videosFromUrl(url) {
        try {
            const doc = new Document(await this.client.get(url).body, url);
            const dataOptions = doc.selectFirst("div[data-options]")?.attr("data-options");
            if (!dataOptions) return [];

            const videoJson = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const videos = videoJson.flashvars.metadataJson.videos;

            return videos.map(video => ({
                url: video.url,
                quality: `Okru - ${video.name}`
            })).sort((a,b) => parseInt(b.quality.match(/\d+/)) - parseInt(a.quality.match(/\d+/)));
        } catch (e) {
            // HLS fallback for newer players
            try {
                const pageText = await this.client.get(url).body;
                const m3u8Url = pageText.match(/"(https:.*?\.m3u8.*?)"/)?.[1];
                if(m3u8Url) return MUtils.playlist(m3u8Url, {Referer: url}, "Okru");
            } catch(e) {}
        }
        return [];
    }
}

class StreamWishExtractor {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
    }

    async videosFromUrl(url) {
        try {
            const embedUrl = url.includes("/e/") ? url : url.replace("/f/", "/e/");
            const doc = new Document(await this.client.get(embedUrl, this.headers).body, embedUrl);
            let scriptBody = doc.selectFirst("script:containsData(m3u8)")?.text;

            if (scriptBody && scriptBody.includes("eval(function(p,a,c")) {
                scriptBody = MUtils.unpack(scriptBody);
            }
            if (!scriptBody) return [];

            const masterUrl = scriptBody.match(/file:"(.*?m3u8.*?)"/)?.[1];
            if (!masterUrl) return [];

            return MUtils.playlist(masterUrl, { Referer: "https://streamwish.to/" }, "StreamWish");
        } catch (e) {
            return [];
        }
    }
}

class YourUploadExtractor {
    constructor(client) {
        this.client = client;
    }

    async videoFromUrl(url, headers) {
        const newHeaders = { ...headers, "Referer": "https://www.yourupload.com/" };
        try {
            const doc = new Document(await this.client.get(url, newHeaders).body, url);
            const baseData = doc.selectFirst("script:containsData(jwplayerOptions)")?.text;
            if (baseData) {
                const videoUrl = baseData.substringAfter("file: '").substringBefore("',");
                return [{ url: videoUrl, quality: "YourUpload", headers: newHeaders }];
            }
        } catch (e) {}
        return [];
    }
}

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        // Instantiate extractors
        this.doodExtractor = new DoodExtractor(this.client);
        this.streamTapeExtractor = new StreamTapeExtractor(this.client);
        this.vidBomExtractor = new VidBomExtractor(this.client);
        this.mp4uploadExtractor = new Mp4uploadExtractor(this.client);
        this.okruExtractor = new OkruExtractor(this.client);
        this.streamWishExtractor = new StreamWishExtractor(this.client, this.getHeaders());
        this.yourUploadExtractor = new YourUploadExtractor(this.client);
        // List of domains for VidBom extractor
        this.VIDBOM_DOMAINS = [
            "vidbom.com", "vidbem.com", "vidbm.com", "vedpom.com",
            "vedbom.com", "vedbom.org", "vadbom.com",
            "vidbam.org", "myviid.com", "myviid.net",
            "myvid.com", "vidshare.com", "vedsharr.com",
            "vedshar.com", "vedshare.com", "vadshar.com", "vidshar.org",
        ];
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/seasons/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.box-5x1.media-block");

        for (const item of items) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/episodes/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.media-block, div.pinned-card");

        for (const item of items) {
            const name = item.selectFirst("div.info h3")?.text.trim();
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");
            const seasonText = item.selectFirst("a.extra h4, span.anime-type")?.text;
            const episodeUrl = item.selectFirst("div.info a")?.attr("href");

            if (name && imageUrl && seasonText && episodeUrl) {
                const slugMatch = episodeUrl.match(/\/episodes\/(.+?)-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-\d+/);
                if (!slugMatch) continue;
                let fullSlug = slugMatch[1];
                const baseSlug = fullSlug.replace(/-season-\d+$/, '');
                const seasonMatch = seasonText.match(/(\d+)/);
                if (!seasonMatch) continue;
                const seasonNumber = seasonMatch[1];
                const link = `/seasons/${baseSlug}-season-${seasonNumber}/`;

                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("nav.pagination-page a:last-child svg") != null;
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query)}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.box-5x1.media-block");

        for (const item of items) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body, res.url);

        let name = doc.selectFirst("div.media-title > h1")?.text;
        if (name) {
            name = name.replace(/\s+(season|الموسم)\s+\d+\s*$/i, '').trim();
        }

        const imageUrl = doc.selectFirst("div.anime-card.player a.image")?.attr("data-src");
        let description = doc.selectFirst("div.media-story div.content p")?.text ?? "";
        const altTitle = doc.selectFirst("div.media-title h3")?.text;
        if (altTitle) {
            description += `\n\nAlternative title: ${altTitle?.trim() ?? ''}`;
        }
        
        const statusText = doc.selectFirst("div.status > a")?.text;
        let status = 5;
        if (statusText) {
            if (statusText.includes("يعرض الأن")) status = 0;
            else if (statusText.includes("مكتمل")) status = 1;
        }

        const genre = doc.select("div.genres a").map(e => e.text);
        const chapters = [];
        
        if (doc.location && doc.location.includes("/movies/")) {
            chapters.push({ name: "Movie", url: url, scanlator: "1" });
        } else {
            const seasonNameFromTitle = doc.selectFirst("div.media-title h1")?.text;
            const seasonNum = parseInt(seasonNameFromTitle?.match(/(\d+)/)?.[1] || '1');
            
            const episodeElements = doc.select("ul.episodes-lists li");
            for (const ep of episodeElements) {
                const epLink = ep.selectFirst("a.title");
                if (!epLink) continue;

                const epText = epLink.selectFirst("h3")?.text;
                const epNum = parseInt(ep.attr("data-number"));
                const epUrl = epLink.attr("href");

                if (epText && !isNaN(epNum) && epUrl) {
                    const scanlator = parseFloat(`${seasonNum}.${String(epNum).padStart(3, '0')}`);
                    chapters.push({ name: epText, url: epUrl.replace(this.getBaseUrl(), ""), scanlator: String(scanlator) });
                }
            }
        }
        
        chapters.sort((a, b) => parseFloat(b.scanlator) - parseFloat(a.scanlator));

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    async getVideoList(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body, res.url);
        const players = doc.select("li.dooplay_player_option, ul.server-list > li > a");

        const videoPromises = players.map(async (player) => {
            try {
                const postData = {
                    "action": "doo_player_ajax", // For dooplay_player_option
                    "post": player.attr("data-post"),
                    "nume": player.attr("data-nume"),
                    "type": player.attr("data-type")
                };

                const playerRes = await this.client.post(`${this.getBaseUrl()}/wp-admin/admin-ajax.php`, postData, this.getHeaders(fullUrl));
                const embedUrl = JSON.parse(playerRes.body).embed_url.replace(/\\/g, "");
                const serverName = player.selectFirst("span.title, span.server")?.text.toLowerCase() ?? "unknown";

                if (!embedUrl) return [];

                // Use the appropriate extractor based on the URL or server name
                if (embedUrl.includes("ok.ru")) {
                    return this.okruExtractor.videosFromUrl(embedUrl);
                }
                if (embedUrl.includes("mp4upload")) {
                    return this.mp4uploadExtractor.videosFromUrl(embedUrl, this.getHeaders(embedUrl));
                }
                if (serverName.includes("wish") || embedUrl.includes("wish")) {
                    return this.streamWishExtractor.videosFromUrl(embedUrl);
                }
                if (embedUrl.includes("yourupload")) {
                    return this.yourUploadExtractor.videoFromUrl(embedUrl, this.getHeaders(embedUrl));
                }
                if (embedUrl.includes("dood")) {
                    return this.doodExtractor.videoFromUrl(embedUrl);
                }
                if (embedUrl.includes("streamtape")) {
                    return this.streamTapeExtractor.videoFromUrl(embedUrl);
                }
                if (this.VIDBOM_DOMAINS.some(domain => embedUrl.includes(domain))) {
                    return this.vidBomExtractor.videosFromUrl(embedUrl);
                }
                
                // Fallback for other servers not explicitly handled
                return MUtils.extract(embedUrl, serverName);

            } catch (e) {
                console.error(`Failed to process player: ${e}`);
                return [];
            }
        });

        const allVideos = (await Promise.all(videoPromises)).flat().filter(v => v);

        const quality = this.getPreference("preferred_quality") || "1080";
        allVideos.sort((a, b) => {
            const aQuality = a.quality.toLowerCase();
            const bQuality = b.quality.toLowerCase();
            if (aQuality.includes(quality.toLowerCase())) return -1;
            if (bQuality.includes(quality.toLowerCase())) return 1;
            return 0;
        });

        return allVideos;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary uses. Update the extension for permanent changes.",
                value: "https://vip.animerco.org",
                dialogTitle: "Override Base URL",
                dialogMessage: "Default: " + "https://vip.animerco.org",
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "Preferred quality",
                summary: "Preferred quality for video streaming",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "Doodstream", "StreamTape", "Mp4upload", "Okru"],
                entryValues: ["1080", "720", "480", "360", "Doodstream", "StreamTape", "Mp4upload", "Okru"],
            }
        }];
    }

}

