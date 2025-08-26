// --- METADATA ---
const mangayomiSources = [{
    "name": "Asia2TV",
    "id": 8374928475,
    "lang": "ar",
    "baseUrl": "https://ww1.asia2tv.pw",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ww1.asia2tv.pw",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/asia2tv.js"
}];


// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders(url) {
        return {
            "Referer": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/536.36"
        };
    }

    // --- POPULAR ---

    async getPopular(page) {
        const url = `${this.source.baseUrl}/category/asian-drama/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.postmovie-photo");
        for (const item of items) {
            const linkElement = item.selectFirst("a[title]");
            if (!linkElement) continue;

            const link = linkElement.getHref.replace(this.source.baseUrl, "");
            const name = linkElement.attr("title");
            const imageUrl = item.selectFirst("div.image img")?.getSrc;

            list.push({ name, link, imageUrl });
        }

        const hasNextPage = doc.selectFirst("div.nav-links a.next") != null;
        return { list, hasNextPage };
    }

    // --- LATEST ---

    get supportsLatest() {
        return false;
    }

    async getLatestUpdates(page) {
        throw new Error("Not supported");
    }

    // --- SEARCH & FILTERS ---

    async search(query, page, filters) {
        let url;
        if (query) {
            url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        } else {
            const typeFilter = filters.find(f => f.name === "نوع الدراما");
            const statusFilter = filters.find(f => f.name === "حالة الدراما");
            
            let filterPath = "";
            if (typeFilter && typeFilter.state > 0) {
                filterPath = `/category/asian-drama/${typeFilter.values[typeFilter.state].value}/page/${page}/`;
            } else if (statusFilter && statusFilter.state > 0) {
                filterPath = `/${statusFilter.values[statusFilter.state].value}/page/${page}/`;
            }

            if (filterPath) {
                url = `${this.source.baseUrl}${filterPath}`;
            } else {
                throw new Error("اختر فلترًا عند البحث بدون نص");
            }
        }

        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const list = [];
        const items = doc.select("div.postmovie-photo");
        for (const item of items) {
            const linkElement = item.selectFirst("a[title]");
            if (!linkElement) continue;

            const link = linkElement.getHref.replace(this.source.baseUrl, "");
            const name = linkElement.attr("title");
            const imageUrl = item.selectFirst("div.image img")?.getSrc;
            
            list.push({ name, link, imageUrl });
        }
        
        const hasNextPage = doc.selectFirst("div.nav-links a.next") != null;
        return { list, hasNextPage };
    }

    // --- DETAILS ---

    async getDetail(url) {
        const res = await this.client.get(this.source.baseUrl + url, this.getHeaders(this.source.baseUrl + url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("h1 span.title").text;
        const imageUrl = doc.selectFirst("div.single-thumb-bg > img").getSrc;
        const description = doc.selectFirst("div.getcontent p").text;
        const genre = doc.select("div.box-tags a, li:contains(البلد) a").map(e => e.text);
        
        const chapters = [];
        const episodeElements = doc.select("div.loop-episode a");
        for (const element of episodeElements) {
            const epUrl = element.getHref.replace(this.source.baseUrl, "");
            const epNum = epUrl.substringAfterLast("-").substringBeforeLast("/");
            chapters.push({
                name: `الحلقة : ${epNum}`,
                url: epUrl
            });
        }
        chapters.reverse();

        return { name, imageUrl, description, genre, chapters, link: url };
    }

    // --- VIDEO LIST & EXTRACTORS ---

    async getVideoList(url) {
        const initialRes = await this.client.get(this.source.baseUrl + url, this.getHeaders(this.source.baseUrl + url));
        const initialDoc = new Document(initialRes.body);
        const serverPageUrl = initialDoc.selectFirst("div.loop-episode a.current")?.getHref;

        if (!serverPageUrl) {
            throw new Error("Could not find the server page link. The site structure may have changed.");
        }
        
        const finalRes = await this.client.get(serverPageUrl, this.getHeaders(serverPageUrl));
        const doc = new Document(finalRes.body);
        let videos = [];
        
        const hosterSelection = this.getPreference("hoster_selection") || [];

        const serverElements = doc.select("ul.server-list-menu li");
        for (const element of serverElements) {
            try {
                const embedUrl = element.attr("data-server");
                const serverName = element.text.trim();
                let extractedVideos = [];
                const genericVideo = { url: embedUrl, quality: serverName, headers: this.getHeaders(embedUrl) };

                const streamwish_domains = ["streamwish", "filelions", "iplayerhls", "dhtpre", "mivalyo", "hglink", "haxloppd", "vidhidepro", "vidhideplus", "do7go", "playerwish", "sfastwish"];
                const dood_domains = ["dood", "ds2play", "dooodster", "d000d", "d-s.io"];
                const vidbom_domains = ["vidbom", "vidbam", "vdbtm", "1vid1shar"];
                const mixdrop_domains = ["mixdrop", "mxdrop"];
                const lulu_domains = ["luluvid", "luluvdoo"];
                const vk_domains = ["vk.com", "vkvideo.ru"];
                const ruby_domains = ["streamruby", "rubyvid"];

                if (dood_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("dood")) {
                    extractedVideos.push(genericVideo);
                } else if ((embedUrl.includes("ok.ru") || embedUrl.includes("odnoklassniki")) && hosterSelection.includes("okru")) {
                    extractedVideos = await this._okruExtractor(embedUrl, `Okru: ${serverName}`);
                } else if (embedUrl.includes("streamtape") && hosterSelection.includes("streamtape")) {
                    extractedVideos = await this._streamtapeExtractor(embedUrl, `StreamTape: ${serverName}`);
                } else if (streamwish_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamwish")) {
                    extractedVideos = await this._streamwishExtractor(embedUrl, `StreamWish: ${serverName}`);
                } else if (embedUrl.includes("uqload") && hosterSelection.includes("uqload")) {
                    extractedVideos = await this._uqloadExtractor(embedUrl, `Uqload: ${serverName}`);
                } else if (vidbom_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vidbom")) {
                    extractedVideos = await this._vidbomExtractor(embedUrl);
                } else if ((embedUrl.includes("youdbox") || embedUrl.includes("yodbox")) && hosterSelection.includes("yodbox")) {
                    extractedVideos = await this._yodboxExtractor(embedUrl);
                } else if (embedUrl.includes("vidmoly") && hosterSelection.includes("vidmoly")) {
                    extractedVideos = await this._vidmolyExtractor(embedUrl, `Vidmoly: ${serverName}`);
                } else if (embedUrl.includes("filemoon") && hosterSelection.includes("filemoon")) {
                    extractedVideos = await this._filemoonExtractor(embedUrl, `Filemoon: ${serverName}`);
                } else if (lulu_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("lulustream")) {
                    extractedVideos = await this._lulustreamExtractor(embedUrl, `Lulustream: ${serverName}`);
                } else if (vk_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vk")) {
                    extractedVideos = await this._vkExtractor(embedUrl, `VK: ${serverName}`);
                } else if (mixdrop_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("mixdrop")) {
                    extractedVideos = await this._mixdropExtractor(embedUrl, `MixDrop: ${serverName}`);
                } else if (ruby_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamruby")) {
                    extractedVideos = await this._streamrubyExtractor(embedUrl, `StreamRuby: ${serverName}`);
                } else if (embedUrl.includes("upstream.to") && hosterSelection.includes("upstream")) {
                    extractedVideos = await this._upstreamExtractor(embedUrl, `Upstream: ${serverName}`);
                } else if (hosterSelection.includes("generic")) {
                    extractedVideos.push(genericVideo);
                }
                
                videos.push(...extractedVideos);
            } catch (e) { /* Ignore errors from a single extractor */ }
        }

        if (videos.length === 0) throw new Error("No videos found from any of your enabled servers.");

        // --- START OF MODIFICATION FOR TESTING ---
        console.log("--- Extracted Video Links for Testing ---");
        videos.forEach((video, index) => {
            console.log(`[${index + 1}] Quality: ${video.quality}`);
            console.log(`    URL: ${video.url}`);
            console.log(`    Headers: ${JSON.stringify(video.headers || {})}`);
        });
        console.log("-----------------------------------------");
        // --- END OF MODIFICATION FOR TESTING ---

        return videos;
    }
    
    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        // Add the master playlist URL as an "Auto" option.
        videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: `${prefix} Auto (HLS)`, headers });

        // If user has disabled quality extraction, return only the "Auto" link.
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
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                    let quality = "Unknown";
                    if (resolutionMatch) {
                        quality = resolutionMatch[1].split('x')[1] + "p";
                    } else if (bandwidthMatch) {
                        quality = `${Math.round(parseInt(bandwidthMatch[1]) / 1000)}kbps`;
                    }
                    
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) {
                        videoUrl = baseUrl + videoUrl;
                    }
                    if(videoUrl) {
                        videos.push({ url: videoUrl, originalUrl: videoUrl, quality: `${prefix} ${quality}`, headers });
                    }
                }
            }
            return videos;
        } catch(e) {
            // If parsing fails, return the Auto link as a fallback.
            return videos;
        }
    }

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];

        const videoHeaders = {
            "Referer": "https://ok.ru/",
            "Origin": "https://ok.ru",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/536.36"
        };

        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            
            if (metadata.hlsManifestUrl) {
                return this._parseM3U8(metadata.hlsManifestUrl, prefix, videoHeaders);
            }
            
            return metadata.videos.map(video => ({
                url: video.url,
                originalUrl: video.url,
                quality: `${prefix} ${video.name}`,
                headers: videoHeaders
            })).reverse();
        } catch (e) { 
            return []; 
        }
    }

    async _streamtapeExtractor(url, quality = "Streamtape") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];

        const videoUrlPart1 = script.substringAfter("innerHTML = '").substringBefore("'");
        const videoUrlPart2 = script.substringAfter("+ ('xcd").substringBefore("'");
        const finalUrl = "https:" + videoUrlPart1 + videoUrlPart2;
        
        return [{ url: finalUrl, quality: quality, originalUrl: finalUrl, headers: this.getHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix = "StreamWish") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        script = "eval(function(p,a,c,k,e,d)" + script;
        const masterUrl = unpackJs(script).match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];
        
        return this._parseM3U8(masterUrl, prefix, this.getHeaders(url));
    }
    
    async _uqloadExtractor(url, prefix = "Uqload") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const videoUrl = script.replace(/"/g, '');
        if (!videoUrl.startsWith("http")) return [];

        return [{ 
            url: videoUrl, 
            quality: prefix, 
            originalUrl: videoUrl, 
            headers: { "Referer": "https://uqload.to/" } 
        }];
    }

    async _vidbomExtractor(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const sources = script.split('{file:"').slice(1);
        
        return sources.map(source => {
            const src = source.substringBefore('"');
            const quality = "Vidbom/VidShare: " + source.substringAfter('label:"').substringBefore('"');
            return { url: src, quality: quality, originalUrl: src, headers: this.getHeaders(url) };
        });
    }

    async _yodboxExtractor(url) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const doc = new Document(res.body);
            const videoUrl = doc.selectFirst("source")?.getSrc;
            if (videoUrl) {
                return [{ url: videoUrl, quality: "Yodbox", originalUrl: videoUrl }];
            }
        } catch (e) { /* Do nothing */ }
        return [];
    }

    async _vidmolyExtractor(url, prefix = "Vidmoly") {
        const vidmolyHeaders = { ...this.getHeaders(url), "Referer": "https://vidmoly.to/" };
        const res = await this.client.get(url, vidmolyHeaders);
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        
        let allVideos = [];
        for (const hlsUrl of urls) {
            if (hlsUrl.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(hlsUrl, prefix, vidmolyHeaders));
            }
        }
        return allVideos;
    }

    async _filemoonExtractor(url, prefix = "Filemoon") {
        const filemoonHeaders = { ...this.getHeaders(url), "Origin": `https://${new URL(url).hostname}`, "Referer": url };
        const res = await this.client.get(url, filemoonHeaders);
        const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!jsEval) return [];

        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval);
        const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, filemoonHeaders);
    }
    
    async _lulustreamExtractor(url, prefix = "Lulustream") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});');
        if (!script) return [];

        const masterUrl = script.match(/file:"([^"]+)"/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, this.getHeaders(url));
    }

    async _vkExtractor(url, prefix = "VK") {
        const vkHeaders = { "Origin": "https://vk.com", "Referer": "https://vk.com/", ...this.getHeaders(url) };
        const res = await this.client.get(url, vkHeaders);
        const body = res.body;

        const regex = /"url(\d+)":"(.*?)"/g;
        const matches = [...body.matchAll(regex)];
        
        return matches.map(match => {
            const quality = match[1] + "p";
            const videoUrl = match[2].replace(/\\/g, '');
            return { url: videoUrl, originalUrl: videoUrl, quality: `${prefix} ${quality}`, headers: vkHeaders };
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
        return [{ url: videoUrl, quality: prefix, originalUrl: videoUrl, headers: { "Referer": url } }];
    }

    async _streamrubyExtractor(url, prefix = "StreamRuby") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];

        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        
        let allVideos = [];
        for (const hlsUrl of urls) {
            if (hlsUrl.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(hlsUrl, prefix, this.getHeaders(url)));
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

        return this._parseM3U8(masterUrl, prefix, this.getHeaders(url));
    }

    // --- FILTERS & PREFERENCES ---

    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        const types = [f("اختر", ""), f("الدراما الكورية", "korean"), f("الدراما اليابانية", "japanese"), f("الدراما الصينية والتايوانية", "chinese-taiwanese"), f("الدراما التايلاندية", "thai"), f("برامج الترفيه", "kshow")];
        const statuses = [f("أختر", ""), f("يبث حاليا", "status/ongoing-drama"), f("الدراما المكتملة", "completed-dramas"), f("الدراما القادمة", "status/upcoming-drama")];
        return [
            { type_name: "HeaderFilter", name: "لا تعمل الفلاتر عند استخدام البحث النصي." },
            { type_name: "SelectFilter", name: "نوع الدراما", state: 0, values: types },
            { type_name: "SelectFilter", name: "حالة الدراما", state: 0, values: statuses }
        ];
    }
    
    getSourcePreferences() {
        return [
            {
                key: "hoster_selection",
                multiSelectListPreference: {
                    title: "اختر السيرفرات",
                    summary: "اختر السيرفرات التي تريد ان تظهر",
                    entries: ["DoodStream & Variants", "Okru", "StreamTape", "StreamWish & Variants (Server X, Lion)", "Uqload", "VidBom/VidShare", "Vidmoly", "Filemoon", "Lulustream", "VK", "MixDrop", "StreamRuby", "Upstream", "Generic/WebView (Fallback)"],
                    entryValues: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidbom", "vidmoly", "filemoon", "lulustream", "vk", "mixdrop", "streamruby", "upstream", "generic"],
                    values: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidbom", "vidmoly", "filemoon", "lulustream", "vk", "mixdrop", "streamruby", "upstream", "generic"],
                }
            },
            {
                key: "extract_qualities",
                switchPreferenceCompat: {
                    title: "استخراج الجودات المتعددة (HLS)",
                    summary: "عند تفعيله، سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة. قد لا يعمل مع جميع السيرفرات.",
                    value: true, 
                }
            }
        ];
    }
}
