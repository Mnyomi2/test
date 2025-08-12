const mangayomiSources = [{
    "name": "سيما ليك",
    "id": 5798993892749847,
    "lang": "ar",
    "baseUrl": "https://cimalek.art",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cimalek.art",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/cimaleek.js"
}];

// Centralized constants for selectors and paths for easier maintenance
const C = {
    SELECTORS: {
        CATALOGUE: {
            item: "div.film_list-wrap div.item",
            link: "div.film-poster a",
            name: "div.data .title",
            image: "div.film-poster img.film-poster-img",
            nextPage: "div.pagination div.pagination-num i#nextpagination",
        },
        DETAIL: {
            name: "h2.film-name.dynamic-name",
            imageUrl: "div.anisc-poster img.film-poster-img",
            description: "div.film-description div.text",
            genre: "div.item-list a",
            author: "div.anisc-more-info div.item:contains(البلد) span:last-child",
            seasons: "div.season-a ul.seas-list li.sealist a",
            episodes: "div.season-a ul.episodios li.episodesList a",
            episodeNum: "span.serie",
        },
        VIDEO: {
            script: "script:contains(dtAjax)",
            servers: "div#servers-content div.server-item div",
            downloads: "div.downlo a.ssl-item.ep-item",
            downloadQuality: "em",
        }
    },
    PATHS: {
        trending: "/trending/page/",
        latest: "/recent-89541/page/",
        search: "/page/",
        category: "/category/",
        genre: "/genre/",
        watchSuffix: "watch/",
        api: "/wp-json/lalaplayer/v2/"
    }
};

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // FIX: Enhanced getHeaders to include Origin for better hotlink protection.
    getHeaders(url) {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        };
        if (url) {
            headers["Referer"] = url;
            try {
                headers["Origin"] = new URL(url).origin;
            } catch (e) {
                // In case of an invalid URL, we can't get origin.
            }
        } else {
            headers["Referer"] = this.getBaseUrl() + "/";
        }
        return headers;
    }

    getBaseUrl() {
        return this.source.baseUrl;
    }

    // --- HELPER METHODS ---

    _createFallbackVideo(url, quality) {
        return { url, originalUrl: url, quality, headers: this.getHeaders(url) };
    }
    
    _getPathFromUrl(fullUrl) {
        try {
            return new URL(fullUrl).pathname;
        } catch (e) {
            return fullUrl.replace(/^(https?:\/\/)?[^\/]+/, '');
        }
    }

    async parseCataloguePage(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select(C.SELECTORS.CATALOGUE.item);

        for (const item of items) {
            const linkElement = item.selectFirst(C.SELECTORS.CATALOGUE.link);
            const name = item.selectFirst(C.SELECTORS.CATALOGUE.name)?.text?.trim();
            const imageUrl = item.selectFirst(C.SELECTORS.CATALOGUE.image)?.attr("data-src");

            if (linkElement && name && imageUrl) {
                const link = this._getPathFromUrl(linkElement.getHref);
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst(C.SELECTORS.CATALOGUE.nextPage) != null;
        return { list, hasNextPage };
    }

    generateRandomString(length) {
        const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters[Math.floor(Math.random() * characters.length)];
        }
        return result;
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}${C.PATHS.trending}${page}/`;
        return await this.parseCataloguePage(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}${C.PATHS.latest}${page}/`;
        return await this.parseCataloguePage(url);
    }

    async search(query, page, filters) {
        if (query) {
            const url = `${this.getBaseUrl()}${C.PATHS.search}${page}?s=${encodeURIComponent(query)}`;
            return this.parseCataloguePage(url);
        }

        const sectionFilter = filters.find(f => f.name === "اقسام الموقع");
        if (sectionFilter?.state !== 0) {
            const value = sectionFilter.values[sectionFilter.state].value;
            const url = `${this.getBaseUrl()}${C.PATHS.category}${value}/page/${page}/`;
            return this.parseCataloguePage(url);
        }
        
        const categoryFilter = filters.find(f => f.name === "النوع");
        const genreFilter = filters.find(f => f.name === "التصنيف");
        if (categoryFilter?.state !== 0) {
            const catValue = categoryFilter.values[categoryFilter.state].value;
            const genreValue = genreFilter.values[genreFilter.state].value.toLowerCase();
            const url = `${this.getBaseUrl()}${C.PATHS.genre}${genreValue}/page/${page}/?type=${catValue}`;
            return this.parseCataloguePage(url);
        }
        
        return this.getPopular(page);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst(C.SELECTORS.DETAIL.name)?.text?.trim() ?? "";
        const imageUrl = doc.selectFirst(C.SELECTORS.DETAIL.imageUrl)?.attr("src") ?? "";
        const description = doc.selectFirst(C.SELECTORS.DETAIL.description)?.text?.trim() ?? "";
        const genre = doc.select(C.SELECTORS.DETAIL.genre).map(e => e.text.trim());
        const author = doc.selectFirst(C.SELECTORS.DETAIL.author)?.text?.trim() ?? "";
        const status = url.includes("/movies/") ? 1 : 5;

        let chapters = [];
        const isMovie = url.includes("/movies/");

        if (isMovie) {
            chapters.push({ name: "مشاهدة", url: `${url}${C.PATHS.watchSuffix}` });
        } else {
            const seasonElements = doc.select(C.SELECTORS.DETAIL.seasons);
            const seasonPromises = seasonElements.map(async (seasonElement) => {
                const seasonName = seasonElement.selectFirst("span.se-a").text;
                const seasonUrl = seasonElement.getHref;
                const seasonRes = await this.client.get(seasonUrl, this.getHeaders());
                const seasonDoc = new Document(seasonRes.body);
                const episodes = [];

                const episodeElements = seasonDoc.select(C.SELECTORS.DETAIL.episodes);
                for (const episodeElement of episodeElements) {
                    const episodeNumText = episodeElement.selectFirst(C.SELECTORS.DETAIL.episodeNum)?.text ?? "";
                    const episodeNum = episodeNumText.substringAfter("(").substringBefore(")");
                    const episodePath = this._getPathFromUrl(episodeElement.getHref);
                    episodes.push({
                        name: `الموسم ${seasonName} الحلقة ${episodeNum}`,
                        url: `${episodePath}${C.PATHS.watchSuffix}`
                    });
                }
                return episodes;
            });

            const episodesBySeason = await Promise.all(seasonPromises);
            chapters = episodesBySeason.flat().reverse();
        }

        return { name, imageUrl, description, author, link: url, status, genre, chapters };
    }
    
    // --- VIDEO EXTRACTION ---
    
    async _getEmbedUrlForServer(element, version) {
        const params = new URLSearchParams({
            p: element.attr("data-post"),
            t: element.attr("data-type"),
            n: element.attr("data-nume"),
            ver: version,
            rand: this.generateRandomString(16)
        });
        const apiUrl = `${this.getBaseUrl()}${C.PATHS.api}?${params.toString()}`;
        const frameRes = await this.client.get(apiUrl, this.getHeaders());
        let embedUrl = JSON.parse(frameRes.body).embed_url;
        if (embedUrl && embedUrl.startsWith("//")) {
            embedUrl = "https:" + embedUrl;
        }
        return embedUrl;
    }
    
    async extractVideos(url, qualityPrefix) {
        const handlers = {
            "mp4upload.com": this.mp4uploadExtractor,
            "dood": this.doodstreamExtractor,
            "voe.sx": this.voeExtractor,
            "upbaam.com": this.upbomExtractor,
            "cdnupbom.com": this.upbomExtractor,
            "uupbom.com": this.upbomExtractor,
            "upgobom.space": this.upbomExtractor,
            "tgb4.top15top.shop": this.upbomExtractor,
            "updown.cam": this.upbomExtractor, // FIX: Added new domain.
        };
        for (const [domain, handler] of Object.entries(handlers)) {
            if (url.includes(domain)) {
                return handler.call(this, url, qualityPrefix);
            }
        }
        return [this._createFallbackVideo(url, qualityPrefix)];
    }

    async mp4uploadExtractor(url, qualityPrefix) {
        try {
            const fileId = url.split('/').pop();
            if (!fileId) { throw new Error("Could not extract file ID."); }
            const embedUrl = `https://www.mp4upload.com/embed-${fileId}.html`;
            const res = await this.client.get(embedUrl, this.getHeaders(url));
            const sourceMatch = res.body.match(/player\.src\({[\s\S]*?src:\s*["']([^"']+)["']/);
            if (sourceMatch?.[1]) {
                const finalVideoUrl = sourceMatch[1];
                return [{ url: finalVideoUrl, originalUrl: url, quality: `${qualityPrefix} - ${finalVideoUrl}`, headers: this.getHeaders(embedUrl) }];
            } else { throw new Error("Could not find final video source."); }
        } catch (e) {
            console.error(`[Mp4Upload Error] ${url}`, e.message);
            return [this._createFallbackVideo(url, qualityPrefix)];
        }
    }
    
    async doodstreamExtractor(url, qualityPrefix) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const md5 = res.body.match(/\/pass_md5\/([^']*)'/);
            if (md5?.[1]) {
                const passMd5Url = `https://dood.yt/${md5[1]}`;
                const passRes = await this.client.get(passMd5Url, this.getHeaders(url));
                const randomString = (Math.random() + 1).toString(36).substring(7);
                const videoUrl = `${passRes.body}${randomString}?token=${md5[1]}&expiry=${Date.now()}`;
                return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - ${videoUrl}`, headers: this.getHeaders(url) }];
            }
        } catch (e) {
            console.error(`[Doodstream Error] ${url}`, e.message);
            return [this._createFallbackVideo(url, qualityPrefix)];
        }
        return [this._createFallbackVideo(url, qualityPrefix)];
    }
    
    async upbomExtractor(url, qualityPrefix) {
        try {
            const headers = this.getHeaders(url);
            
            const initialRes = await this.client.get(url, headers);
            const initialHtml = initialRes.body;
            const doc = new Document(initialHtml);

            const inputs = doc.select('form[name="F1"] input[type="hidden"]');
            if (inputs.length > 0) {
                const formData = {};
                inputs.forEach(i => { formData[i.attr("name")] = i.attr("value"); });
                formData['method_free'] = 'Free Download >>';

                const postRes1 = await this.client.post(url, headers, formData);
                let m = postRes1.body.match(/direct_link[^>]+>\s*<a\s*href="([^"]+)"/i);
                if (m && m[1]) {
                    const videoUrl = m[1].replace(/\s/g, '%20');
                    return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - ${videoUrl}`, headers: this.getHeaders(url) }];
                }
            }

            const id = url.split('/').filter(Boolean).pop() || '';
            const formData2 = { op: 'download2', id2: id, rand: '', referer: url };
            const postRes2 = await this.client.post(url, headers, formData2);
            let m2 = postRes2.body.match(/direct_link[^>]+>\s*<a\s*href="([^"]+)"/i);
            if (m2 && m2[1]) {
                const videoUrl = m2[1].replace(/\s/g, '%20');
                return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - ${videoUrl}`, headers: this.getHeaders(url) }];
            }

            const regex = /https?:\/\/[^\s"'<>]{30,}/g;
            const matches = [...initialHtml.matchAll(regex)];
            for (const match of matches) {
                const candidate = match[0].replace(/\s/g, '%20');
                if (/\/d\//i.test(candidate)) {
                    return [{ url: candidate, originalUrl: url, quality: `${qualityPrefix} - ${candidate} (Regex Fallback)`, headers: this.getHeaders(url) }];
                }
            }

            throw new Error("All upbom extraction methods failed.");
        } catch (e) {
            console.error(`[UpbomExtractor Error] ${url}`, e.message);
            return [this._createFallbackVideo(url, qualityPrefix)];
        }
    }

    async voeExtractor(url, qualityPrefix) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const hlsUrlMatch = res.body.match(/'hls':\s*'([^']+)'/);
            if (hlsUrlMatch?.[1]) {
                const videoUrl = hlsUrlMatch[1];
                return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - ${videoUrl} (HLS)`, headers: this.getHeaders(url) }];
            }
        } catch (e) {
            console.error(`[Voe Error] ${url}`, e.message);
            return [this._createFallbackVideo(url, qualityPrefix)];
        }
        return [this._createFallbackVideo(url, qualityPrefix)];
    }

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);
        const videos = [];

        // --- Process Streaming Servers ---
        const script = doc.selectFirst(C.SELECTORS.VIDEO.script)?.data;
        if (script) {
            const version = script.substringAfter("ver\":\"").substringBefore("\"");
            const serverElements = doc.select(C.SELECTORS.VIDEO.servers);
            const serverPromises = serverElements.map(async (serverElement) => {
                const serverName = serverElement.text.trim();
                try {
                    const embedUrl = await this._getEmbedUrlForServer(serverElement, version);
                    if (embedUrl) {
                        return await this.extractVideos(embedUrl, serverName);
                    }
                } catch (e) {
                    console.error(`[Server Extraction Error] ${serverName}`, e.message);
                }
                return [];
            });
            const extractedServerVideos = await Promise.all(serverPromises);
            videos.push(...extractedServerVideos.flat());
        }

        // --- Process Download Links ---
        const downloadElements = doc.select(C.SELECTORS.VIDEO.downloads);
        
        for (const element of downloadElements) {
            const downloadUrl = element.getHref;
            const qualityInfo = element.selectFirst(C.SELECTORS.VIDEO.downloadQuality)?.text ?? "Download";
            const qualityPrefix = `Download ${qualityInfo} (${downloadUrl})`;
            
            const extractedDownloadVideos = await this.extractVideos(downloadUrl, qualityPrefix);
            videos.push(...extractedDownloadVideos);
        }

        // --- Sort and Finalize ---
        const preferredQuality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const aIsPreferred = a.quality.includes(preferredQuality);
            const bIsPreferred = b.quality.includes(preferredQuality);
            if (aIsPreferred !== bIsPreferred) return aIsPreferred ? -1 : 1;

            const qualityA = parseInt(a.quality.match(/(\d+)p?/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p?/)?.[1] || 0);
            return qualityB - qualityA;
        });

        return videos;
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        return [{
            type_name: "HeaderFilter",
            name: "هذا القسم يعمل لو كان البحث فارغاً"
        }, {
            type_name: "SelectFilter",
            name: "اقسام الموقع",
            state: 0,
            values: [
                { name: "اختر", value: "none" },
                { name: "افلام اجنبي", value: "aflam-online" },
                { name: "افلام نتفليكس", value: "netflix-movies" },
                { name: "افلام هندي", value: "indian-movies" },
                { name: "افلام اسيوي", value: "asian-aflam" },
                { name: "افلام كرتون", value: "cartoon-movies" },
                { name: "افلام انمي", value: "anime-movies" },
                { name: "مسلسلات اجنبي", value: "english-series" },
                { name: "مسلسلات نتفليكس", value: "netflix-series" },
                { name: "مسلسلات اسيوي", value: "asian-series" },
                { name: "مسلسلات كرتون", value: "anime-series" },
                { name: "مسلسلات انمي", value: "netflix-anime" },
            ].map(v => ({...v, type_name: "SelectOption"}))
        }, {
            type_name: "SeparatorFilter"
        }, {
            type_name: "HeaderFilter",
            name: "الفلترة تعمل فقط لو كان قسم الموقع على 'اختر'"
        }, {
            type_name: "SelectFilter",
            name: "النوع",
            state: 0,
            values: [
                { name: "اختر", value: "none" },
                { name: "افلام", value: "movies" },
                { name: "مسلسلات", value: "series" },
            ].map(v => ({...v, type_name: "SelectOption"}))
        }, {
            type_name: "SelectFilter",
            name: "التصنيف",
            state: 0,
            values: [
                "Action", "Adventure", "Animation", "Western", "Documentary", "Fantasy", 
                "Science-fiction", "Romance", "Comedy", "Family", "Drama", "Thriller", 
                "Crime", "Horror"
            ].sort().map(g => ({ type_name: "SelectOption", name: g, value: g }))
        }];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي تفضلها",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}
