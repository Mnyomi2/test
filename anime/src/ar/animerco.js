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
            "X-Requested-With": "XMLHttpRequest"
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
        const players = doc.select("ul.server-list li a.option");
        
        const promises = players.map(async (player) => {
            try {
                const postData = {
                    "action": "player_ajax",
                    "post": player.attr("data-post"),
                    "nume": player.attr("data-nume"),
                    "type": player.attr("data-type")
                };
                const serverName = player.selectFirst("span.server")?.text.trim() || "Unknown";

                const playerRes = await this.client.post(
                    `${this.getBaseUrl()}/wp-admin/admin-ajax.php`,
                    postData,
                    this.getHeaders(fullUrl)
                );
                
                const embedUrl = JSON.parse(playerRes.body).embed_url.replace(/\\/g, "");
                if (!embedUrl) return [];

                const fallbackVideo = { url: embedUrl, quality: this._formatQuality(`${serverName} (WebView)`, embedUrl), headers: this._getVideoHeaders(embedUrl) };
                
                const streamwish_domains = ["streamwish", "megamax.me", "filelions", "iplayerhls", "mivalyo", "vidhidepro", "playerwish", "sfastwish"];
                const dood_domains = ["dood", "ds2play", "dooodster", "d000d", "d-s.io"];
                const vidbom_domains = ["vidbom", "vidbam", "vdbtm", "vidshar"];
                const mixdrop_domains = ["mixdrop", "mxdrop"];
                const lulu_domains = ["luluvid", "luluvdoo"];
                const vk_domains = ["vk.com", "vkvideo.ru"];
                const ruby_domains = ["streamruby", "rubyvid"];

                let extractedVideos = [];
                let wasExtractorAttempted = false;

                if (dood_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("dood")) {
                    wasExtractorAttempted = true;
                    extractedVideos.push(fallbackVideo);
                } else if ((embedUrl.includes("ok.ru") || embedUrl.includes("odnoklassniki")) && hosterSelection.includes("okru")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._okruExtractor(embedUrl, serverName);
                } else if (embedUrl.includes("streamtape") && hosterSelection.includes("streamtape")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._streamtapeExtractor(embedUrl, serverName);
                } else if (streamwish_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamwish")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._streamwishExtractor(embedUrl, serverName);
                } else if (embedUrl.includes("uqload") && hosterSelection.includes("uqload")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._uqloadExtractor(embedUrl, serverName);
                } else if (vidbom_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vidbom")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._vidbomExtractor(embedUrl);
                } else if ((embedUrl.includes("youdbox") || embedUrl.includes("yodbox")) && hosterSelection.includes("yodbox")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._yodboxExtractor(embedUrl);
                } else if (embedUrl.includes("vidmoly") && hosterSelection.includes("vidmoly")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._vidmolyExtractor(embedUrl, serverName);
                } else if (embedUrl.includes("filemoon") && hosterSelection.includes("filemoon")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._filemoonExtractor(embedUrl, serverName);
                } else if (lulu_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("lulustream")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._lulustreamExtractor(embedUrl, serverName);
                } else if (vk_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vk")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._vkExtractor(embedUrl, serverName);
                } else if (mixdrop_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("mixdrop")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._mixdropExtractor(embedUrl, serverName);
                } else if (ruby_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamruby")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._streamrubyExtractor(embedUrl, serverName);
                } else if (embedUrl.includes("upstream.to") && hosterSelection.includes("upstream")) {
                    wasExtractorAttempted = true;
                    extractedVideos = await this._upstreamExtractor(embedUrl, serverName);
                } else if (embedUrl.includes("mp4upload") && hosterSelection.includes("mp4upload")) {
                    wasExtractorAttempted = true;
                    extractedVideos.push(fallbackVideo);
                }
                
                if (wasExtractorAttempted) {
                    return extractedVideos.length > 0 ? extractedVideos : [fallbackVideo];
                } else if (hosterSelection.includes("generic")) {
                    return [fallbackVideo];
                }

                return [];
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


    getFilterList() {
        return [];
    }

    // --- HELPERS ---
    _formatQuality(baseQuality, url) {
        const showUrl = this.getPreference("show_video_url_in_quality");
        return showUrl ? `${baseQuality} - ${url}` : baseQuality;
    }

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers });

        if (!this.getPreference("extract_qualities")) {
            return videos;
        }

        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const lines = playlistContent.split('\n');
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith("#EXT-X-STREAM-INF")) {
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    let quality = "Unknown";
                    if (resolutionMatch) {
                        quality = resolutionMatch[1].split('x')[1] + "p";
                    }
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) {
                        videoUrl = baseUrl + videoUrl;
                    }
                    if(videoUrl) {
                        videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix} ${quality}`, videoUrl), headers });
                    }
                }
            }
            return videos;
        } catch(e) {
            return videos;
        }
    }

    // --- EXTRACTORS ---
    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            
            return metadata.videos.map(video => {
                const quality = video.name === "full" ? "1080p" : video.name === "hd" ? "720p" : video.name === "sd" ? "480p" : video.name;
                return {
                    url: video.url,
                    originalUrl: video.url,
                    quality: this._formatQuality(`${prefix} ${quality}`, video.url),
                    headers: this._getVideoHeaders("https://ok.ru/")
                };
            }).reverse();
        } catch (e) { return []; }
    }

    async _streamtapeExtractor(url, quality = "Streamtape") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];

        const videoUrlPart1 = script.substringAfter("innerHTML = '").substringBefore("'");
        const videoUrlPart2 = script.substringAfter("+ ('xcd").substringBefore("'");
        const finalUrl = "https:" + videoUrlPart1 + videoUrlPart2;
        
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix = "StreamWish") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        if (!masterUrl) return [];
        
        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
    }
    
    async _uqloadExtractor(url, prefix = "Uqload") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const videoUrl = script.replace(/"/g, '');
        if (!videoUrl.startsWith("http")) return [];
        
        return [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }];
    }

    async _vidbomExtractor(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const videoHeaders = this._getVideoHeaders(url);
        const sources = script.split('{file:"').slice(1);
        
        let allVideos = [];
        for (const source of sources) {
            const src = source.substringBefore('"');
            if (src.includes(".m3u8")) {
                const hlsVideos = await this._parseM3U8(src, "VidShare", videoHeaders);
                allVideos.push(...hlsVideos);
            } else {
                const qualityLabel = "VidShare: " + source.substringAfter('label:"').substringBefore('"');
                allVideos.push({
                    url: src,
                    originalUrl: src,
                    quality: this._formatQuality(qualityLabel, src),
                    headers: videoHeaders
                });
            }
        }
        return allVideos;
    }

    async _yodboxExtractor(url) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const videoUrl = new Document(res.body).selectFirst("source")?.getSrc;
            if (videoUrl) {
                return [{ url: videoUrl, quality: this._formatQuality("Yodbox", videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }];
            }
        } catch (e) {}
        return [];
    }

    async _vidmolyExtractor(url, prefix = "Vidmoly") {
        const videoHeaders = this._getVideoHeaders("https://vidmoly.to/");
        const res = await this.client.get(url, videoHeaders);
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        
        let allVideos = [];
        for (const hlsUrl of urls) {
            if (hlsUrl.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(hlsUrl, prefix, videoHeaders));
            }
        }
        return allVideos;
    }

    async _filemoonExtractor(url, prefix = "Filemoon") {
        const videoHeaders = { ...this._getVideoHeaders(url), "Origin": `https://${new URL(url).hostname}` };
        const res = await this.client.get(url, videoHeaders);
        
        const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!jsEval) return [];

        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval);
        const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, videoHeaders);
    }
    
    async _lulustreamExtractor(url, prefix = "Lulustream") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});');
        if (!script) return [];

        const masterUrl = script.match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
    }

    async _vkExtractor(url, prefix = "VK") {
        const videoHeaders = { ...this._getVideoHeaders("https://vk.com/"), "Origin": "https://vk.com" };
        const res = await this.client.get(url, videoHeaders);
        const matches = [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)];
        
        return matches.map(match => {
            const qualityLabel = `${prefix} ${match[1]}p`;
            const videoUrl = match[2].replace(/\\/g, '');
            return { url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(qualityLabel, videoUrl), headers: videoHeaders };
        });
    }

    async _mixdropExtractor(url, prefix = "MixDrop") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const videoUrl = "https:" + unpacked.match(/MDCore\.wurl="([^"]+)"/)?.[1];
        if (!videoUrl) return [];
        return [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }];
    }

    async _streamrubyExtractor(url, prefix = "StreamRuby") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        const videoHeaders = this._getVideoHeaders(url);
        
        let allVideos = [];
        for (const hlsUrl of urls) {
            if (hlsUrl.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(hlsUrl, prefix, videoHeaders));
            }
        }
        return allVideos;
    }

    async _upstreamExtractor(url, prefix = "Upstream") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/hls:\s*"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
    }

    // --- PREFERENCES ---
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary uses. Update the extension for permanent changes.",
                value: "https://tv.animerco.org",
                dialogTitle: "Override Base URL",
                dialogMessage: "Default: https://tv.animerco.org",
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "Select Servers",
                summary: "Select which servers to attempt to extract from",
                entries: ["DoodStream", "Okru", "StreamTape", "StreamWish/MegaMax", "Uqload", "VidBom/VidShare", "Vidmoly", "Filemoon", "Lulustream", "VK", "MixDrop", "StreamRuby", "Upstream", "Mp4upload", "Generic/WebView (Fallback)"],
                entryValues: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidbom", "vidmoly", "filemoon", "lulustream", "vk", "mixdrop", "streamruby", "upstream", "mp4upload", "generic"],
                values: ["okru", "streamwish", "vidbom", "filemoon", "vk", "mp4upload", "generic"],
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: {
                title: "Extract multiple qualities (HLS)",
                summary: "When enabled, will attempt to extract all available qualities from supported servers",
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
