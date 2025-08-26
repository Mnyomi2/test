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
        return {
            "Referer": url,
            "Origin": this.getBaseUrl(),
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
            const seasonNumMatch = seasonNameFromTitle?.match(/(\d+)/);
            const seasonNum = seasonNumMatch ? parseInt(seasonNumMatch[1]) : 1;
            
            const episodeElements = doc.select("ul.episodes-lists li");
            for (const ep of episodeElements) {
                const epLinkElement = ep.selectFirst("a.title");
                if (!epLinkElement) continue;

                const epName = ep.selectFirst("a.image")?.attr("title")?.trim();
                const epNum = parseInt(ep.attr("data-number"));
                const epUrl = epLinkElement.attr("href");

                if (epName && !isNaN(epNum) && epUrl) {
                    const scanlator = parseFloat(`${seasonNum}.${String(epNum).padStart(3, '0')}`);
                    chapters.push({
                        name: epName,
                        url: epUrl.replace(this.getBaseUrl(), ""),
                        scanlator: String(scanlator)
                    });
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
        const downloadRows = doc.select("div#download table tbody tr");
        
        const promises = downloadRows.map(async (row) => {
            try {
                const linkElement = row.selectFirst("a");
                if (!linkElement) return [];
                const intermediateUrl = linkElement.attr("href");

                // Get server name from favicon domain
                const favicon = row.selectFirst("div.favicon")?.attr("data-src") || "";
                const serverNameMatch = favicon.match(/domain=([^&]+)/);
                const serverName = serverNameMatch ? serverNameMatch[1] : "Unknown";

                const quality = row.selectFirst("strong.badge")?.text || "SD";

                // Go to intermediate page and get the base64 URL
                const intermediateRes = await this.client.get(intermediateUrl, this.getHeaders(fullUrl));
                const intermediateDoc = new Document(intermediateRes.body);
                const encodedUrl = intermediateDoc.selectFirst("a#link")?.attr("data-url");
                if (!encodedUrl) return [];

                const embedUrl = atob(encodedUrl);

                // Now use extractors on the real URL
                let extractedVideos = [];
                const streamwish_domains = ["streamwish", "megamax.me", "filelions", "iplayerhls", "mivalyo", "vidhidepro", "playerwish", "sfastwish", "hglink.to"];
                const dood_domains = ["dood", "ds2play", "dooodster", "d000d", "d-s.io"];
                
                if (dood_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("dood")) {
                    extractedVideos.push({ url: embedUrl, quality: this._formatQuality(`${serverName} - ${quality}`, embedUrl), headers: this._getVideoHeaders(embedUrl) });
                } else if ((embedUrl.includes("ok.ru") || embedUrl.includes("odnoklassniki")) && hosterSelection.includes("okru")) {
                    extractedVideos = await this._okruExtractor(embedUrl, `${serverName} - ${quality}`);
                } else if (embedUrl.includes("streamtape") && hosterSelection.includes("streamtape")) {
                    extractedVideos = await this._streamtapeExtractor(embedUrl, `${serverName} - ${quality}`);
                } else if (streamwish_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamwish")) {
                    extractedVideos = await this._streamwishExtractor(embedUrl, `${serverName} - ${quality}`);
                } else if (embedUrl.includes("mp4upload") && hosterSelection.includes("mp4upload")) {
                    extractedVideos = await this._mp4uploadExtractor(embedUrl, `${serverName} - ${quality}`);
                }
                
                return extractedVideos;
            } catch (e) {
                return [];
            }
        });

        const results = await Promise.all(promises);
        const videos = results.flat();

        if (videos.length === 0) {
            throw new Error("No videos found. Check your selected servers in settings.");
        }
        return videos;
    }

    getFilterList() { return []; }

    _formatQuality(baseQuality, url) {
        return this.getPreference("show_video_url_in_quality") ? `${baseQuality} - ${url}` : baseQuality;
    }

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers });

        if (!this.getPreference("extract_qualities")) return videos;

        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const lines = playlistContent.split('\n');
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                    let quality = resolutionMatch ? `${resolutionMatch[1].split('x')[1]}p` : "Unknown";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix} ${quality}`, videoUrl), headers });
                }
            }
        } catch(e) {}
        return videos;
    }

    // --- EXTRACTORS ---
    async _mp4uploadExtractor(url, prefix = "Mp4upload") {
        const videoId = url.substringAfterLast('/');
        const embedUrl = `https://www.mp4upload.com/embed-${videoId}.html`;
        const res = await this.client.get(embedUrl, this.getHeaders(url));
        const videoUrl = res.body.match(/player\.src\({[^}]*src:\s*"([^"]+)"/)?.[1];
        if (videoUrl) {
            return [{
                url: videoUrl,
                originalUrl: videoUrl,
                quality: this._formatQuality(prefix, videoUrl),
                headers: this._getVideoHeaders(embedUrl)
            }];
        }
        return [];
    }

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            return metadata.videos.map(video => {
                const quality = video.name === "full" ? "1080p" : video.name === "hd" ? "720p" : video.name === "sd" ? "480p" : video.name;
                return { url: video.url, quality: this._formatQuality(`${prefix} ${quality}`, video.url), headers: this._getVideoHeaders("https://ok.ru/") };
            }).reverse();
        } catch (e) { return []; }
    }

    async _streamtapeExtractor(url, quality = "Streamtape") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];
        const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), headers: this._getVideoHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix = "StreamWish") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    // --- PREFERENCES ---
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary uses.",
                value: "https://tv.animerco.org",
                dialogTitle: "Override Base URL",
                dialogMessage: "Default: https://tv.animerco.org",
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "Select Servers",
                summary: "These are taken from the download links section",
                entries: ["DoodStream", "Okru", "StreamTape", "StreamWish/MegaMax/HgLink", "Mp4upload"],
                entryValues: ["dood", "okru", "streamtape", "streamwish", "mp4upload"],
                values: ["okru", "streamwish", "mp4upload"],
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: {
                title: "Extract multiple qualities (HLS)",
                summary: "Extract all available qualities from supported servers",
                value: true, 
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "Show video URL",
                summary: "Show the final video URL next to the quality name",
                value: false,
            }
        }];
    }
}
