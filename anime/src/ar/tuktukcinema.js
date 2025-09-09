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
        this.source.baseUrl = this.source.baseUrl.trim();
    }

    // --- PREFERENCES AND HEADERS ---
    getPreference(key) {
        return new SharedPreferences().get(key);
    }
    getBaseUrl() {
        return this.source.baseUrl;
    }
    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"
        };
    }
    _getVideoHeaders(refererUrl) {
        const headers = this.getHeaders(refererUrl);
        headers["Referer"] = refererUrl;
        try {
            const url = new URL(refererUrl);
            headers["Origin"] = url.origin;
        } catch (e) {
            headers["Origin"] = this.getBaseUrl();
        }
        return headers;
    }

    // --- TITLE NORMALIZATION ---
    _titleEdit(title) {
        let e = title ? title.trim() : "";
        if (!e) return e;
        const t = { "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5", "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10", "الحادي عشر": "11", "الثاني عشر": "12" };
        e = e.replace(/[\u2013\u2014\u2015\u2212]/g, "-");
        e = e.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*\[.*?\]\s*/g, " ");
        let r = "";
        e = e.replace(/\b(\d{4})\b/, ((e, t) => (r = t, "")));
        e = e.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, "");
        Object.keys(t).forEach((r => {
            const i = new RegExp(`الموسم\\s*(?:ال)*${r}\\b`, "gi");
            e = e.replace(i, `الموسم ${t[r]}`)
        }));
        e = e.replace(/الموسم\s*(\d+)/gi, "s$1").replace(/الحلقة\s*(\d+)/gi, "E$1");
        e = e.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi, "");
        e = e.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, "");
        e = e.replace(/\s+/g, " ");
        if (r) { e += ` (${r})`; }
        return e.trim();
    }
    
    // --- BROWSE/SEARCH METHODS ---
    async requestDoc(path) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, this.getHeaders(url));
        return new Document(res.body);
    }
    
    async _parseCataloguePage(doc, isSearch = false) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            if (!linkElement) return;

            const name = this._titleEdit(linkElement.attr("title"));
            let imageUrlAttr = isSearch ? "src" : "data-src";
            const imageUrl = item.selectFirst("img")?.attr(imageUrlAttr);
            const link = linkElement.getHref;

            list.push({ name, imageUrl, link });
        });
        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async getPopular(page) {
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
                path = `/${selectedCategory}?page=${page}/`;
            } else {
                return this.getPopular(page);
            }
        }
        const doc = await this.requestDoc(path);
        return await this._parseCataloguePage(doc, !!query);
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const name = this._titleEdit(doc.selectFirst("h1.post-title")?.text || "Unknown Title");
        const imageUrl = doc.selectFirst("div.left div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        
        const chapters = [];
        const episodeElements = doc.select("section.allepcont div.row a");

        if (episodeElements.length > 0) {
            const sortedEpisodes = [...episodeElements].sort((a, b) => {
                const numA = parseInt(a.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                const numB = parseInt(b.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                return numA - numB;
            });
            sortedEpisodes.forEach(ep => {
                chapters.push({ name: this._titleEdit(ep.attr("title")), url: ep.getHref });
            });
        } else {
            chapters.push({ name: "مشاهدة", url: url });
        }
        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }

    // --- VIDEO EXTRACTION CONTROLLER ---
    async getVideoList(url) {
        const allStreams = [];
        const fetchMode = this.getPreference("link_fetch_mode") || "both";

        if (fetchMode === "watch" || fetchMode === "both") {
            allStreams.push(...await this._getWatchLinks(url));
        }
        if (fetchMode === "download" || fetchMode === "both") {
            allStreams.push(...await this._getDownloadLinks(url));
        }

        const uniqueStreams = Array.from(new Map(allStreams.map(item => [item.url, item])).values());
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        uniqueStreams.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0;
        });
        
        return uniqueStreams;
    }

    // --- LINK GATHERING ---
    async _getWatchLinks(url) {
        const videos = [];
        const watchUrl = url.endsWith('/') ? `${url}watch/` : `${url}/watch/`;
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            for (const serverEl of doc.select("div.watch--servers--list ul li.server--item")) {
                await this._processLink(videos, serverEl.attr("data-link"), serverEl.text.trim());
            }
        } catch (e) { console.error("Failed to get watch links:", e); }
        return videos;
    }

    async _getDownloadLinks(url) {
        const videos = [];
        const watchUrl = url.endsWith('/') ? `${url}watch/` : `${url}/watch/`;
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            for (const downloadEl of doc.select("div.downloads a.download--item")) {
                await this._processLink(videos, downloadEl.getHref, `[DL] ${downloadEl.selectFirst("span")?.text.trim()}`);
            }
        } catch (e) { console.error("Failed to get download links:", e); }
        return videos;
    }

    // --- UNIVERSAL LINK PROCESSING ---
    async _processLink(videoList, url, prefix) {
        if (!url) return;
        const hosterSelection = this.getPreference("hoster_selection") || [];
        try {
            let foundVideos = false;
            const extractor = this.extractorMap.find(ext => hosterSelection.includes(ext.key) && ext.domains.some(d => url.includes(d)));
            
            if (extractor) {
                const extracted = await extractor.func.call(this, url, prefix);
                if (extracted.length > 0) {
                    videoList.push(...extracted);
                    foundVideos = true;
                }
            }

            if (!foundVideos && this.getPreference("use_fallback_extractor")) {
                const fallbackVideos = await this._allinoneExtractor(url, `[Fallback] ${prefix}`);
                if (fallbackVideos.length > 0) {
                    videoList.push(...fallbackVideos);
                    foundVideos = true;
                }
            }

            if (!foundVideos && hosterSelection.includes('other') && !prefix.startsWith('[DL]')) {
                let quality = `[Embed] ${prefix}`;
                if (this.getPreference("show_embed_url_in_quality")) {
                    quality += ` [${url}]`;
                }
                videoList.push({ url: url, originalUrl: url, quality: quality });
            }
        } catch (e) {
             if (this.getPreference("show_embed_url_in_quality")) {
                videoList.push({ url: "", originalUrl: url, quality: `[Debug Fail] ${prefix} [${url}]` });
            }
        }
    }

    // --- EXTRACTORS ---
    extractorMap = [
        { key: 'cybervynx', domains: ['cybervynx.com', 'smoothpre.com'], func: this._cybervynxExtractor },
        { key: 'dood', domains: ["doodstream.com", "dood.to", "dood.so", "dood.cx", "dood.la", "dood.ws", "dood.sh", "doodstream.co", "dood.pm", "dood.wf", "dood.re", "dood.yt", "dooood.com", "dood.stream", "ds2play.com", "doods.pro", "ds2video.com", "d0o0d.com", "do0od.com", "d0000d.com", "d000d.com", "dood.li", "dood.work", "dooodster.com", "vidply.com"], func: this._doodstreamExtractor },
        { key: 'mixdrop', domains: ["mixdrop.ps", "mixdrop.co", "mixdrop.to", "mixdrop.sx", "mixdrop.bz", "mixdrop.ch", "mixdrp.co", "mixdrp.to", "mixdrop.gl", "mixdrop.club", "mixdroop.bz", "mixdroop.co", "mixdrop.vc", "mixdrop.ag", "mdy48tn97.com", "md3b0j6hj.com", "mdbekjwqa.pw", "mdfx9dc8n.net", "mixdropjmk.pw", "mixdrop21.net", "mixdrop.is", "mixdrop.si", "mixdrop23.net", "mixdrop.nu", "mixdrop.ms", "mdzsmutpcvykb.net", "mxdrop.to"], func: this._mixdropExtractor },
    ];
    
    _formatQuality(prefix, url, qualitySuffix = "") {
        let quality = `${prefix} ${qualitySuffix}`.trim();
        if (this.getPreference("show_video_url_in_quality")) {
            quality += ` - ${url}`;
        }
        return quality;
    }

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        try {
            const m3u8Content = (await this.client.get(playlistUrl, { headers })).body;
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            const lines = m3u8Content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
                    const quality = resolution ? resolution.split('x')[1] + "p" : "Auto";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) { videoUrl = baseUrl + videoUrl; }
                    if (videoUrl) {
                        videos.push({ url: videoUrl, originalUrl: playlistUrl, quality: this._formatQuality(prefix, videoUrl, quality), headers });
                    }
                }
            }
        } catch (e) { console.error("M3U8 Parse Error:", e); }
        if (videos.length === 0) {
            videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(prefix, playlistUrl, "Auto HLS"), headers });
        }
        return videos;
    }

    async _cybervynxExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
            if (!scriptData) return [];
            const unpacked = unpackJs(scriptData);
            if (!unpacked) return [];
            const masterUrl = unpacked.match(/file:"([^"]+\.m3u8)"/)?.[1];
            return masterUrl ? await this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
        } catch (error) {
            console.error(`Error resolving ${prefix} (${url}):`, error);
            return [];
        }
    }

    async _doodstreamExtractor(url, prefix) {
        try {
            const embedId = url.match(/(?:\/d\/|\/e\/)([0-9a-zA-Z]+)/)?.[1];
            if (!embedId) return [];
            const embedUrl = `https://${new URL(url).hostname}/e/${embedId}`;
            const res = await this.client.get(embedUrl, this._getVideoHeaders(url));
            const passMd5Path = res.body.substringAfter("'/pass_md5/").substringBefore("'");
            if (!passMd5Path) return [];
            const passMd5Url = new URL(embedUrl).origin + "/pass_md5/" + passMd5Path;
            const doodToken = Math.random().toString(36).substring(7);
            const videoUrlRes = await this.client.get(passMd5Url, { headers: { "Referer": embedUrl } });
            const videoUrl = videoUrlRes.body + "z" + doodToken + "?token=" + doodToken;
            return [{ url: videoUrl, originalUrl: embedUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(embedUrl) }];
        } catch (error) {
            console.error(`Error resolving DoodStream (${url}):`, error);
            return [];
        }
    }

    async _mixdropExtractor(url, prefix) {
        try {
            let embedUrl = url.includes("/e/") ? url : `https://${new URL(url).hostname}/e/${url.split('/').pop()}`;
            const res = await this.client.get(embedUrl, this._getVideoHeaders(embedUrl));
            let html = res.body;
            if (html.includes('(p,a,c,k,e,d)')) {
                html = unpackJs(html.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0] || "") || html;
            }
            const surlMatch = html.match(/(?:vsr|wurl|surl)[^=]*=\s*"([^"]+)/);
            if (surlMatch) {
                let surl = surlMatch[1].startsWith('//') ? 'https:' + surlMatch[1] : surlMatch[1];
                return [{ url: surl, originalUrl: embedUrl, quality: this._formatQuality(prefix, surl), headers: this._getVideoHeaders(embedUrl) }];
            }
            return [];
        } catch (error) {
            console.error(`Error resolving MixDrop (${url}):`, error);
            return [];
        }
    }

    async _allinoneExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const body = res.body;
            const doc = new Document(body);
            const videoHeaders = this._getVideoHeaders(url);
            let sources = [];
            const directVideoSrc = doc.selectFirst("source[src]")?.getSrc || doc.selectFirst("video[src]")?.getSrc;
            if (directVideoSrc) { sources.push(directVideoSrc); }
            let potentialScripts = body;
            const packedScriptMatch = body.match(/eval\(function\(p,a,c,k,e,d\)\s?{.*}\)/);
            if (packedScriptMatch) {
                try { potentialScripts += "\n" + unpackJs(packedScriptMatch[0]); } catch (e) {}
            }
            const urlRegex = /(https?:\/\/[^"' \s]+\.(?:m3u8|mp4|webm|mkv|mov|flv|avi))[^"' \s]*/ig;
            let match;
            while ((match = urlRegex.exec(potentialScripts)) !== null) { sources.push(match[0]); }
            const uniqueSources = [...new Set(sources.filter(s => s && s.startsWith("http")))];
            const allVideos = [];
            for (const sourceUrl of uniqueSources) {
                if (sourceUrl.includes(".m3u8")) {
                    allVideos.push(...await this._parseM3U8(sourceUrl, prefix, videoHeaders));
                } else {
                    allVideos.push({ url: sourceUrl, originalUrl: sourceUrl, quality: this._formatQuality(prefix, sourceUrl, "Direct"), headers: videoHeaders });
                }
            }
            return allVideos;
        } catch (e) {
            return [];
        }
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        const categories = [{"name": "اختر","query": ""}, {"name": "كل الافلام","query": "category/movies-33/"}, {"name": "افلام اجنبى","query": "category/movies-33/افلام-اجنبي/"}, {"name": "افلام انمى","query": "category/anime-6/افلام-انمي/"}, {"name": "افلام تركيه","query": "category/movies-33/افلام-تركي/"}, {"name": "افلام اسيويه","query": "category/movies-33/افلام-اسيوي/"}, {"name": "افلام هنديه","query": "category/movies-33/افلام-هندى/"}, {"name": "كل المسسلسلات","query": "category/series-9/"}, {"name": "مسلسلات اجنبى","query": "category/series-9/مسلسلات-اجنبي/"}, {"name": "مسلسلات انمى","query": "category/anime-6/انمي-مترجم/"}, {"name": "مسلسلات تركى","query": "category/series-9/مسلسلات-تركي/"}, {"name": "مسلسلات اسيوى","query": "category/series-9/مسلسلات-أسيوي/"}, {"name": "مسلسلات هندى","query": "category/series-9/مسلسلات-هندي/"}];
        return [{ type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({ type_name: "SelectOption", name: c.name, value: c.query })) }];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة", summary: "اختر الجودة التي سيتم اختيارها تلقائيا", valueIndex: 1,
                entries: ["1080p", "720p", "480p", "360p", "Auto"], entryValues: ["1080", "720", "480", "360", "Auto"],
            }
        }, {
            key: "link_fetch_mode",
            listPreference: {
                title: "طريقة جلب الروابط", summary: "اختر من أي صفحة تريد جلب الروابط", valueIndex: 0,
                entries: ["مشاهدة وتحميل معاً", "صفحة المشاهدة فقط", "صفحة التحميل فقط"], entryValues: ["both", "watch", "download"]
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات", summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["Cybervynx/Smoothpre", "Doodstream", "Mixdrop", "Other Embeds"],
                entryValues: ["cybervynx", "dood", "mixdrop", "other"],
                values: ["cybervynx", "dood", "mixdrop"],
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط الفيديو (للتصحيح)", summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة", value: false,
            }
        }, {
            key: "show_embed_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط التضمين (للتصحيح)", summary: "عرض رابط التضمين الأولي بجانب اسم الجودة", value: false,
            }
        }, {
            key: "use_fallback_extractor",
            switchPreferenceCompat: {
                title: "استخدام مستخرج احتياطي (تجريبي)", summary: "عندما يفشل مستخرج الفيديو الأساسي، حاول استخدام مستخرج عام", value: false,
            }
        }];
    }
}

function unpackJs(packedJS) {
    function unq(s) {
        s = s || "";
        if ((s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) { s = s.slice(1, -1); }
        s = s.replace(/\\x([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
        return s;
    }
    function itob(n, b) {
        if (n === 0) return "0";
        var d = "0123456789abcdefghijklmnopqrstuvwxyz", o = "";
        while (n) { o = d[n % b] + o; n = Math.floor(n / b); }
        return o;
    }
    try {
        const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/i;
        let match = packedJS.match(re);
        if (!match) return packedJS;
        let p = unq(match[1] + match[2] + match[1]), a = +match[3], c = +match[4], k = unq("'" + match[6] + "'").split("|");
        if (k.length < c) { for (var i = k.length; i < c; i++) k[i] = ""; }
        for (i = c - 1; i >= 0; i--) { let t = itob(i, a), r = k[i] || t; p = p.replace(new RegExp('\\b' + t + '\\b', 'g'), r); }
        return p;
    } catch (e) { return packedJS; }
}
