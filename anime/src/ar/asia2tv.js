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
    
    _getVideoHeaders(refererUrl) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/536.36",
            "Referer": refererUrl
        };
    }
    
    _formatQuality(baseQuality, url) {
        const showUrl = this.getPreference("show_video_url_in_quality");
        if (showUrl) {
            return `${baseQuality} - ${url}`;
        }
        return baseQuality;
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
            const sectionFilter = filters.find(f => f.name === "القسم");
            const countryFilter = filters.find(f => f.name === "الدولة");
            const genreFilter = filters.find(f => f.name === "النوع");
            const statusFilter = filters.find(f => f.name === "الحالة");

            const useSection = sectionFilter && sectionFilter.state > 0;
            const useCountry = countryFilter && countryFilter.state > 0;
            const useGenre = genreFilter && genreFilter.state > 0;
            const useStatus = statusFilter && statusFilter.state > 0;

            const activeFilterGroups = [useSection, (useCountry || useGenre), useStatus].filter(Boolean).length;
            if (activeFilterGroups > 1) {
                throw new Error("يرجى استخدام مجموعة فلاتر واحدة فقط في كل مرة (إما القسم أو الدولة/النوع أو الحالة)");
            }
            
            if (useSection) {
                const path = sectionFilter.values[sectionFilter.state].value;
                url = `${this.source.baseUrl}/${path}/page/${page}/`;
            } else if (useCountry) {
                const countrySlug = countryFilter.values[countryFilter.state].value;
                let path = `/country/${countrySlug}/page/${page}/`;
                if (useGenre) {
                    path += `?genre=${encodeURIComponent(genreFilter.values[genreFilter.state].value)}`;
                }
                url = `${this.source.baseUrl}${path}`;
            } else if (useGenre) { // This case handles genre filter alone
                 const genreSlug = genreFilter.values[genreFilter.state].value;
                 url = `${this.source.baseUrl}/genre/${encodeURIComponent(genreSlug)}/page/${page}/`;
            } else if (useStatus) {
                const path = statusFilter.values[statusFilter.state].value;
                url = `${this.source.baseUrl}/${path}/page/${page}/`;
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
                const genericVideo = { url: embedUrl, quality: this._formatQuality(serverName, embedUrl), headers: this._getVideoHeaders(embedUrl) };

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
                    extractedVideos = await this._okruExtractor(embedUrl, `Okru`);
                } else if (embedUrl.includes("streamtape") && hosterSelection.includes("streamtape")) {
                    extractedVideos = await this._streamtapeExtractor(embedUrl, `StreamTape`);
                } else if (streamwish_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamwish")) {
                    extractedVideos = await this._streamwishExtractor(embedUrl, `StreamWish: ${serverName}`);
                } else if (embedUrl.includes("uqload") && hosterSelection.includes("uqload")) {
                    extractedVideos = await this._uqloadExtractor(embedUrl, `Uqload`);
                } else if (vidbom_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vidbom")) {
                    extractedVideos = await this._vidbomExtractor(embedUrl);
                } else if ((embedUrl.includes("youdbox") || embedUrl.includes("yodbox")) && hosterSelection.includes("yodbox")) {
                    extractedVideos = await this._yodboxExtractor(embedUrl);
                } else if (embedUrl.includes("vidmoly") && hosterSelection.includes("vidmoly")) {
                    extractedVideos = await this._vidmolyExtractor(embedUrl, `Vidmoly`);
                } else if (embedUrl.includes("filemoon") && hosterSelection.includes("filemoon")) {
                    extractedVideos = await this._filemoonExtractor(embedUrl, `Filemoon`);
                } else if (lulu_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("lulustream")) {
                    extractedVideos = await this._lulustreamExtractor(embedUrl, `Lulustream`);
                } else if (vk_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("vk")) {
                    extractedVideos = await this._vkExtractor(embedUrl, `VK`);
                } else if (mixdrop_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("mixdrop")) {
                    extractedVideos = await this._mixdropExtractor(embedUrl, `MixDrop`);
                } else if (ruby_domains.some(d => embedUrl.includes(d)) && hosterSelection.includes("streamruby")) {
                    extractedVideos = await this._streamrubyExtractor(embedUrl, `StreamRuby`);
                } else if (embedUrl.includes("upstream.to") && hosterSelection.includes("upstream")) {
                    extractedVideos = await this._upstreamExtractor(embedUrl, `Upstream`);
                } else if (hosterSelection.includes("generic")) {
                    extractedVideos.push(genericVideo);
                }
                
                videos.push(...extractedVideos);
            } catch (e) { /* Ignore errors from a single extractor */ }
        }

        if (videos.length === 0) throw new Error("No videos found from any of your enabled servers.");
        return videos;
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

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        
        const videoHeaders = this._getVideoHeaders("https://ok.ru/");
        videoHeaders["Origin"] = "https://ok.ru";

        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            
            const videos = [];
            const getQualityName = (name) => {
                switch (name) {
                    case "full": return "1080p";
                    case "hd": return "720p";
                    case "sd": return "480p";
                    case "low": return "360p";
                    case "lowest": return "240p";
                    case "mobile": return "144p";
                    default: return name;
                }
            };
            
            if (metadata.videos) {
                videos.push(...metadata.videos.map(video => {
                    const quality = getQualityName(video.name);
                    return {
                        url: video.url,
                        originalUrl: video.url,
                        quality: this._formatQuality(`${prefix} ${quality}`, video.url),
                        headers: videoHeaders
                    };
                }));
            }

            if (metadata.hlsManifestUrl) {
                videos.unshift({
                    url: metadata.hlsManifestUrl,
                    originalUrl: metadata.hlsManifestUrl,
                    quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl),
                    headers: videoHeaders
                });
            }

            if (videos.length > 1) {
                const autoOption = videos.shift();
                videos.reverse();
                videos.unshift(autoOption);
            }
            return videos;
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
            const doc = new Document(res.body);
            const videoUrl = doc.selectFirst("source")?.getSrc;
            if (videoUrl) {
                return [{ url: videoUrl, quality: this._formatQuality("Yodbox", videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }];
            }
        } catch (e) { /* Do nothing */ }
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
        
        const playerScript = res.body.substringAfter('jwplayer.key=');
        const jsEval = playerScript.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
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

    // --- FILTERS & PREFERENCES ---

    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        
        const sections = [
            f("اختر قسم", ""),
            f("الحلقات الجديدة", "category/new-episodes"),
            f("الدراما الآسيوية (الكل)", "category/asian-drama"),
            f(" - الدراما الكورية", "category/asian-drama/korean"),
            f(" - الدراما اليابانية", "category/asian-drama/japanese"),
            f(" - الصينية والتايوانية", "category/asian-drama/chinese-taiwanese"),
            f(" - الدراما التايلاندية", "category/asian-drama/thai"),
            f(" - برامج الترفيه", "category/asian-drama/kshow"),
        ];

        const countries = [
            f("الكل", ""), f("كوريا الجنوبية", "korean"), f("الصين", "chinese"), f("اليابان", "japanese"),
            f("التايلاند", "thai"), f("تايوان", "taiwanese"), f("الفلبين", "philippines"), f("هونغ كونغ", "hong-kong"),
        ];

        const genres = [
            f("الكل", ""), f("رومانسي", "رومانسي"), f("كوميدي", "كوميدي"), f("درامي", "درامي"),
            f("غموض", "غموض"), f("إثارة", "إثارة"), f("خيالي", "خيالي"), f("شبابي", "شبابي"),
            f("ميلودراما", "ميلودراما"), f("تاريخي", "تاريخي"), f("أكشن", "أكشن"), f("جريمة", "جريمة"),
            f("مدرسي", "مدرسي"), f("حياة", "حياة"), f("عائلي", "عائلي"), f("تشويق", "تشويق"),
            f("فانتازيا", "فانتازيا"), f("تحقيق", "تحقيق"), f("صداقة", "صداقة"), f("أعمال", "أعمال"),
            f("قانوني", "قانوني"), f("طبي", "طبي"), f("موسيقي", "موسيقي"), f("رعب", "رعب"),
            f("سياسي", "سياسي"), f("نفسي", "نفسي"), f("رياضي", "رياضي"), f("خيال علمي", "خيال علمي"),
            f("خارق", "خارق"), f("مغامرات", "مغامرات"), f("مانجا", "مانجا"), f("حربي", "حربي"),
            f("سفر عبر الزمن", "سفر عبر الزمن"), f("انتقام", "انتقام"), f("ويب دراما", "ويب دراما"),
            f("طعام", "طعام"), f("واقعي", "واقعي"), f("طبخ", "طبخ"),
        ];

        const statuses = [
            f("اختر حالة", ""), f("يبث حاليا", "status/ongoing-drama"),
            f("الدراما المكتملة", "completed-dramas"), f("الدراما القادمة", "status/upcoming-drama")
        ];

        return [
            { type_name: "HeaderFilter", name: "لا تعمل الفلاتر عند استخدام البحث النصي" },
            { type_name: "HeaderFilter", name: "هام: اختر فلاتر من مجموعة واحدة فقط في كل مرة" },
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "المجموعة 1: الأقسام الرئيسية" },
            { type_name: "SelectFilter", name: "القسم", state: 0, values: sections },
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "المجموعة 2: الدولة والنوع" },
            { type_name: "SelectFilter", name: "الدولة", state: 0, values: countries },
            { type_name: "SelectFilter", name: "النوع", state: 0, values: genres },
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "المجموعة 3: حالة العرض" },
            { type_name: "SelectFilter", name: "الحالة", state: 0, values: statuses }
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
                    summary: "عند تفعيله، سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة",
                    value: true, 
                }
            },
            {
                key: "show_video_url_in_quality",
                switchPreferenceCompat: {
                    title: "إظهار رابط الفيديو",
                    summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة",
                    value: false,
                }
            }
        ];
    }
}
