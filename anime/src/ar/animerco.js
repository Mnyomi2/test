// --- METADATA ---
const mangayomiSources = [{
    "name": "Animerco",
    "id": 645698215,
    "lang": "ar",
    "baseUrl": "https://vip.animerco.org",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=animerco.org",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/animerco.js"
}];


class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        // Standard headers for fetching HTML pages
        return {
            "Referer": this.getBaseUrl() + "/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        };
    }

    _getVideoHeaders(refererUrl) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/536.36",
            "Referer": refererUrl
        };
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/seasons/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);
        const list = [];
        for (const item of doc.select("div.box-5x1.media-block")) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");
            if (name && link && imageUrl) list.push({ name, imageUrl, link });
        }
        return { list, hasNextPage: doc.selectFirst("a.next.page-numbers") != null };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/episodes/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);
        const list = [];
        for (const item of doc.select("div.media-block, div.pinned-card")) {
            const name = item.selectFirst("div.info h3")?.text.trim();
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");
            const seasonText = item.selectFirst("a.extra h4, span.anime-type")?.text;
            const episodeUrl = item.selectFirst("div.info a")?.attr("href");
            if (name && imageUrl && seasonText && episodeUrl) {
                const slugMatch = episodeUrl.match(/\/episodes\/(.+?)-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-\d+/);
                if (!slugMatch) continue;
                const baseSlug = slugMatch[1].replace(/-season-\d+$/, '');
                const seasonMatch = seasonText.match(/(\d+)/);
                if (!seasonMatch) continue;
                const link = `/seasons/${baseSlug}-season-${seasonMatch[1]}/`;
                list.push({ name, imageUrl, link });
            }
        }
        return { list, hasNextPage: doc.selectFirst("nav.pagination-page a:last-child svg") != null };
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query)}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);
        const list = [];
        for (const item of doc.select("div.box-5x1.media-block")) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");
            if (name && link && imageUrl) list.push({ name, imageUrl, link });
        }
        return { list, hasNextPage: doc.selectFirst("a.next.page-numbers") != null };
    }

    async getDetail(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body, res.url);

        let name = doc.selectFirst("div.media-title > h1")?.text?.replace(/\s+(season|الموسم)\s+\d+\s*$/i, '').trim();
        const imageUrl = doc.selectFirst("div.anime-card.player a.image")?.attr("data-src");
        let description = doc.selectFirst("div.media-story div.content p")?.text ?? "";
        const altTitle = doc.selectFirst("div.media-title h3")?.text;
        if (altTitle) description += `\n\nAlternative title: ${altTitle?.trim() ?? ''}`;
        
        let status = 5;
        const statusText = doc.selectFirst("div.status > a")?.text;
        if (statusText) {
            if (statusText.includes("يعرض الأن")) status = 0;
            else if (statusText.includes("مكتمل")) status = 1;
        }

        const genre = doc.select("div.genres a").map(e => e.text);
        const chapters = [];
        
        if (doc.location?.includes("/movies/")) {
            chapters.push({ name: "Movie", url: url, scanlator: "1" });
        } else {
            const seasonNumMatch = doc.selectFirst("div.media-title h1")?.text?.match(/(\d+)/);
            const seasonNum = seasonNumMatch ? parseInt(seasonNumMatch[1]) : 1;
            for (const ep of doc.select("ul.episodes-lists li")) {
                const epLinkElement = ep.selectFirst("a.title");
                if (!epLinkElement) continue;
                const epName = ep.selectFirst("a.image")?.attr("title")?.trim();
                const epNum = parseInt(ep.attr("data-number"));
                const epUrl = epLinkElement.attr("href");
                if (epName && !isNaN(epNum) && epUrl) {
                    const scanlator = parseFloat(`${seasonNum}.${String(epNum).padStart(3, '0')}`);
                    chapters.push({ name: epName, url: epUrl.replace(this.getBaseUrl(), ""), scanlator: String(scanlator) });
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
        
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const downloadLinks = doc.select("div#download tbody tr");
        
        if (downloadLinks.length === 0) {
            throw new Error("No download links section found on the page.");
        }

        const promises = downloadLinks.map(async (row) => {
            try {
                const linkUrl = row.selectFirst("a")?.attr("href");
                if (!linkUrl) return [];

                const linkPageRes = await this.client.get(linkUrl, this.getHeaders(linkUrl));
                const encodedUrl = new Document(linkPageRes.body).selectFirst("a#link[data-url]")?.attr("data-url");
                if (!encodedUrl) return [];

                const decodedUrl = new MBuffer(encodedUrl, "base64").toString();
                const serverDomain = row.selectFirst("div.favicon")?.attr("data-src")?.match(/domain=([^&]+)/)?.[1] || "Download";
                const quality = row.selectFirst("strong.badge")?.text?.trim() || serverDomain;
                
                return this._extractVideosFromUrl(decodedUrl, quality, hosterSelection);
            } catch (e) {
                return [];
            }
        });

        const results = await Promise.all(promises);
        const videos = results.flat();

        if (videos.length === 0) {
            throw new Error("Failed to extract any videos from the download links.");
        }
        return videos;
    }

    async _extractVideosFromUrl(url, serverName, hosterSelection) {
        const genericVideo = { url: url, quality: this._formatQuality(serverName, url), headers: this._getVideoHeaders(url) };
        let extractedVideos = [];

        const streamwish_domains = ["streamwish", "megamax.me", "filelions", "mivalyo", "vidhidepro", "playerwish", "sfastwish", "hglink.to"];
        const dood_domains = ["dood", "ds2play", "dooodster", "d000d", "d-s.io"];
        const vidbom_domains = ["vidbom", "vidbam", "vdbtm", "vidshar"];
        const mixdrop_domains = ["mixdrop", "mxdrop"];
        const vk_domains = ["vk.com", "vkvideo.ru"];

        try {
            if (dood_domains.some(d => url.includes(d)) && hosterSelection.includes("dood")) extractedVideos.push(genericVideo);
            else if ((url.includes("ok.ru") || url.includes("odnoklassniki")) && hosterSelection.includes("okru")) extractedVideos = await this._okruExtractor(url, serverName);
            else if (url.includes("streamtape") && hosterSelection.includes("streamtape")) extractedVideos = await this._streamtapeExtractor(url, serverName);
            else if (streamwish_domains.some(d => url.includes(d)) && hosterSelection.includes("streamwish")) extractedVideos = await this._streamwishExtractor(url, serverName);
            else if (vidbom_domains.some(d => url.includes(d)) && hosterSelection.includes("vidbom")) extractedVideos = await this._vidbomExtractor(url);
            else if (url.includes("filemoon") && hosterSelection.includes("filemoon")) extractedVideos = await this._filemoonExtractor(url, serverName);
            else if (vk_domains.some(d => url.includes(d)) && hosterSelection.includes("vk")) extractedVideos = await this._vkExtractor(url, serverName);
            else if (mixdrop_domains.some(d => url.includes(d)) && hosterSelection.includes("mixdrop")) extractedVideos = await this._mixdropExtractor(url, serverName);
            else if (url.includes("mp4upload.com") && hosterSelection.includes("mp4upload")) extractedVideos = await this._mp4uploadExtractor(url);
        } catch (e) { console.error(`Extractor failed for ${url}: ${e}`); }
        
        if (extractedVideos.length === 0) {
            extractedVideos.push(genericVideo);
        }
        return extractedVideos;
    }

    // --- HELPERS & EXTRACTORS ---
    _formatQuality(baseQuality, url) { return this.getPreference("show_video_url_in_quality") ? `${baseQuality} - ${url}` : baseQuality; }

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [{ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers }];
        if (!this.getPreference("extract_qualities")) return videos;
        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            const lines = playlistContent.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1].split('x')[1] + "p" || "Unknown";
                    let videoUrl = lines[i + 1];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix} ${resolution}`, videoUrl), headers });
                }
            }
        } catch(e) {}
        return videos;
    }

    async _mp4uploadExtractor(url) {
        const id = url.split('/').pop();
        const embedUrl = `https://www.mp4upload.com/embed-${id}.html`;
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const videoUrl = res.body.substringAfter('player.src({').substringBefore('});').match(/src:\s*"([^"]+)"/)?.[1];
        return videoUrl ? [{ url: videoUrl, quality: "Mp4upload", originalUrl: videoUrl, headers: this._getVideoHeaders(embedUrl) }] : [];
    }

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        try {
            const metadata = JSON.parse(JSON.parse(dataOptions.replace(/&quot;/g, '"')).flashvars.metadata);
            return metadata.videos.map(v => ({ url: v.url, originalUrl: v.url, quality: this._formatQuality(`${prefix} ${v.name}`, v.url), headers: this._getVideoHeaders("https://ok.ru/")})).reverse();
        } catch (e) { return []; }
    }

    async _streamtapeExtractor(url, quality = "Streamtape") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];
        const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix = "StreamWish") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const masterUrl = unpackJs("eval(function(p,a,c,k,e,d)" + script).match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    
    async _vidbomExtractor(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        let allVideos = [];
        for (const source of script.split('{file:"').slice(1)) {
            const src = source.substringBefore('"');
            if (src.includes(".m3u8")) allVideos.push(...await this._parseM3U8(src, "VidShare", this._getVideoHeaders(url)));
            else allVideos.push({ url: src, originalUrl: src, quality: this._formatQuality("VidShare: " + source.substringAfter('label:"').substringBefore('"'), src), headers: this._getVideoHeaders(url) });
        }
        return allVideos;
    }

    async _filemoonExtractor(url, prefix = "Filemoon") {
        const res = await this.client.get(url, this.getHeaders(url));
        const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!jsEval) return [];
        const masterUrl = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval).match(/file:"([^"]+)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, { ...this._getVideoHeaders(url), "Origin": `https://${new URL(url).hostname}` }) : [];
    }

    async _vkExtractor(url, prefix = "VK") {
        const res = await this.client.get(url, this.getHeaders(url));
        return [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)].map(m => ({ url: m[2].replace(/\\/g, ''), originalUrl: m[2], quality: this._formatQuality(`${prefix} ${m[1]}p`, m[2]), headers: { ...this._getVideoHeaders("https://vk.com/"), "Origin": "https://vk.com" } }));
    }

    async _mixdropExtractor(url, prefix = "MixDrop") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const videoUrl = "https:" + unpackJs("eval(function(p,a,c,k,e,d)" + script).match(/MDCore\.wurl="([^"]+)"/)?.[1];
        return videoUrl ? [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }] : [];
    }

    // --- PREFERENCES ---
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: { title: "Override Base URL", summary: "For temporary uses. Update the extension for permanent changes.", value: "https://tv.animerco.org", dialogTitle: "Override Base URL", dialogMessage: "Default: https://tv.animerco.org" }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "Enable Specific Extractors",
                summary: "Enable advanced extractors for these servers. A basic link will always be shown as a fallback.",
                entries: ["DoodStream", "Okru", "StreamTape", "StreamWish/MegaMax", "VidBom/VidShare", "Filemoon", "VK", "MixDrop", "Mp4upload"],
                entryValues: ["dood", "okru", "streamtape", "streamwish", "vidbom", "filemoon", "vk", "mixdrop", "mp4upload"],
                values: ["okru", "streamwish", "vidbom", "filemoon", "vk", "mp4upload"],
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: { title: "Extract multiple qualities (HLS)", summary: "When enabled, will attempt to extract all available qualities from supported servers", value: true }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: { title: "Show video URL", summary: "Show the final video URL next to the quality name", value: false }
        }];
    }
}
