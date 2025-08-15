const mangayomiSources = [{
    "name": "Cimalek",
    "id": 5798993892749847,
    "lang": "ar",
    "baseUrl": "https://cimalek.art",
    "iconUrl": "https://raw.githubusercontent.com/Mnyomi2/Mnyomi2/refs/heads/main/Mnyomi2/icon/cimalek.png",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.4.1",
    "pkgPath": "anime/src/ar/cimalek.js"
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
        trending: "/trending/",
        latest: "/recent-89541/",
        search: "/",
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

    getHeaders(url) {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/5.37.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        };
        if (url) {
            headers["Referer"] = url;
            try {
                headers["Origin"] = new URL(url).origin;
            } catch (e) {}
        } else {
            headers["Referer"] = this.getBaseUrl() + "/";
        }
        return headers;
    }

    getBaseUrl() {
        return (this.getPreference("override_base_url") || this.source.baseUrl).trim();
    }

    // --- HELPER METHODS ---

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    _getPathFromUrl(fullUrl) {
        try {
            return new URL(fullUrl).pathname;
        } catch (e) {
            return fullUrl.replace(/^(https?:\/\/)?[^\/]+/, '');
        }
    }

    _getQualityFromString(text) {
        const t = text.toLowerCase();
        if (t.includes("fhd") || t.includes("1080")) return { label: "FHD", numeric: "1080" };
        if (t.includes("hd") || t.includes("720")) return { label: "HD", numeric: "720" };
        if (t.includes("sd") || t.includes("480")) return { label: "SD", numeric: "480" };
        if (t.includes("low") || t.includes("360")) return { label: "LOW", numeric: "360" };
        return { label: "UNK", numeric: "0" };
    }

    async parseCataloguePage(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select(C.SELECTORS.CATALOGUE.item);

        for (const item of items) {
            const linkElement = item.selectFirst(C.SELECTORS.CATALOGUE.link);
            let name = item.selectFirst(C.SELECTORS.CATALOGUE.name)?.text?.trim();
            const imageUrl = item.selectFirst(C.SELECTORS.CATALOGUE.image)?.attr("data-src");

            if (linkElement && name && imageUrl) {
                // --- NEW Rich Title Logic ---
                name = name.replace(/^مسلسل|^فيلم|^انمي/g, "").trim();

                const descElements = item.select(".data .desc");
                let extraInfo = "";
                if (descElements.length > 0) {
                    extraInfo = descElements.map(e => e.text.trim()).join(" ");
                }
                
                let finalName = name;
                if (extraInfo) {
                    if (/^\d{4}$/.test(extraInfo)) {
                        finalName = `${name} (${extraInfo})`;
                    } else {
                        finalName = `${name} ${extraInfo}`;
                    }
                }
                // --- End of Rich Title Logic ---

                const link = this._getPathFromUrl(linkElement.getHref);
                list.push({ name: finalName, imageUrl, link });
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
        const url = `${this.getBaseUrl()}${C.PATHS.trending}page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}${C.PATHS.latest}page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async search(query, page, filters) {
        if (query) {
            const url = `${this.getBaseUrl()}${C.PATHS.search}page/${page}?s=${encodeURIComponent(query)}`;
            return this.parseCataloguePage(url);
        }

        const sectionFilter = filters.find(f => f.name === "القسم");
        const sectionValue = sectionFilter.values[sectionFilter.state].value;

        if (sectionValue !== "none") {
            let path;
            switch (sectionValue) {
                case "popular":
                    path = C.PATHS.trending;
                    break;
                case "latest":
                    path = C.PATHS.latest;
                    break;
                case "latest-movies":
                    path = "/recent-89541/movies/";
                    break;
                case "latest-series":
                    path = "/recent-89541/series/";
                    break;
                case "latest-animes":
                    path = "/recent-89541/animes/";
                    break;
                case "latest-episodes":
                    path = "/recent-89541/episodes/";
                    break;
                case "latest-anime-episodes":
                    path = "/recent-89541/anime-episodes/";
                    break;
                case "movies":
                    path = "/movies/";
                    break;
                case "series":
                    path = "/series/";
                    break;
                case "seasons":
                    path = "/seasons/";
                    break;
                case "episodes":
                    path = "/episodes/";
                    break;
                default:
                    path = `/${sectionValue}/`;
                    break;
            }
            const url = `${this.getBaseUrl()}${path}page/${page}/`;
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
        const author = doc.selectFirst(C.SELECTORS.DETAIL.author)?.text?.trim() ?? "";
        const genre = doc.select(C.SELECTORS.DETAIL.genre).map(e => e.text.trim());
        const status = url.includes("/movies/") ? 1 : 5;

        const originalDescription = doc.selectFirst(C.SELECTORS.DETAIL.description)?.text?.trim() ?? "";

        const keyMap = {
            "الاسم الاصلي": "originalName", "عنوان الحلقة": "episodeTitle", "البلد المنشئ": "country",
            "الموسم": "seasons", "عد المواسم": "seasons", "الموسم الحالي": "currentSeason",
            "الحلقة": "episodes", "عدد الحلقات": "episodes", "عرض في": "startDate", "انتهى في": "endDate",
            "التصنيف العمري": "ageRating", "مدة كل حلقة": "episodeDuration", "اللغة": "language",
            "تاريخ العرض": "releaseDate", "تاريخ عرض الحلقة": "episodeReleaseDate",
            "تاريخ عرض الموسم": "seasonReleaseDate", "المدة": "duration"
        };

        const ordinalMap = {
            "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5",
            "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10"
        };
        
        const processValue = (value) => {
            const trimmedValue = value.trim();
            if (ordinalMap[trimmedValue]) {
                return ordinalMap[trimmedValue];
            }
            if (trimmedValue.includes("دقيقة")) {
                return trimmedValue.replace("دقيقة", "minutes").trim();
            }
            return trimmedValue;
        };

        const camelCaseToTitle = (s) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
        
        const moreInfo = [];
        const infoItems = doc.select("div.anisc-more-info div.item");

        for (const item of infoItems) {
            const arabicHeadRaw = item.selectFirst(".item-head")?.text?.trim();
            const rawValue = item.selectFirst("span:last-child")?.text?.trim();

            if (arabicHeadRaw && rawValue) {
                const processedValue = processValue(rawValue);
                const arabicHead = arabicHeadRaw.replace(":", "").trim();
                const englishKey = keyMap[arabicHead];

                if (englishKey) {
                    const englishLabel = camelCaseToTitle(englishKey);
                    moreInfo.push(`${englishLabel}: ${processedValue}`);
                } else {
                    moreInfo.push(`${arabicHeadRaw} ${processedValue}`);
                }
            }
        }

        let finalDescription = originalDescription;
        if (moreInfo.length > 0) {
            finalDescription += `\n\n────────────────────\n\n${moreInfo.join("\n")}`;
        }
        
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

        return { name, imageUrl, description: finalDescription, author, link: url, status, genre, chapters };
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
    
    async extractVideos(url, hostKey, qualityLabel, qualityNumeric) {
        const handlers = {
            "Mp4upload": this.mp4uploadExtractor,
            "Dood": this.doodstreamExtractor,
            "Voe": this.voeExtractor,
            "Upbom": this.upbomExtractor,
        };

        const extractor = handlers[hostKey];
        if (extractor) {
            return extractor.call(this, url, hostKey, qualityLabel, qualityNumeric);
        }
        return [];
    }

    async mp4uploadExtractor(url, hostKey, qualityLabel, qualityNumeric) {
        try {
            const fileId = url.split('/').pop()?.trim();
            if (!fileId) throw new Error("Could not extract file ID.");
            
            const embedUrl = `https://www.mp4upload.com/embed-${fileId}.html`;
            const res = await this.client.get(embedUrl, this.getHeaders(url));
            
            const sourceMatch = res.body.match(/sources:\s*\[\s*\{\s*src:\s*["']([^"']+)["']/);
            if (sourceMatch?.[1]) {
                const finalVideoUrl = sourceMatch[1].trim();
                return [{ url: finalVideoUrl, originalUrl: url, quality: `${hostKey} - ${qualityLabel} ${qualityNumeric}p`, headers: this.getHeaders(embedUrl) }];
            } else { 
                throw new Error("Could not find final video source."); 
            }
        } catch (e) {
            console.error(`[Mp4Upload Error] ${url}`, e.message);
            return [];
        }
    }
    
    async doodstreamExtractor(url, hostKey, qualityLabel, qualityNumeric) {
        try {
            for (let i = 0; i < 3; i++) {
                const res = await this.client.get(url, this.getHeaders(url));
                const md5Match = res.body.match(/\/pass_md5\/([^']*)'/);
    
                if (md5Match?.[1]) {
                    const passMd5Url = `https://dood.yt${md5Match[1]}`;
                    const passRes = await this.client.get(passMd5Url, this.getHeaders(url));
    
                    if (!passRes.body) {
                        await this._sleep(800);
                        continue;
                    }
    
                    const videoPart = passRes.body;
                    const randomString = this.generateRandomString(10);
                    const finalToken = md5Match[1].split('/').pop(); 
                    const videoUrl = `${videoPart}${randomString}?token=${finalToken}&expiry=${Date.now()}`;
                    return [{ url: videoUrl, originalUrl: url, quality: `${hostKey} - ${qualityLabel} ${qualityNumeric}p`, headers: this.getHeaders(url) }];
                }
            }
            throw new Error("Failed to extract Doodstream link after retries.");
        } catch (e) {
            console.error(`[Doodstream Error] ${url}`, e.message);
            return [];
        }
    }
    
    async upbomExtractor(url, hostKey, qualityLabel, qualityNumeric) {
        try {
            const headers = this.getHeaders(url);
            const initialRes = await this.client.get(url, headers);
            const doc = new Document(initialRes.body);

            const inputs = doc.select('form[name="F1"] input[type="hidden"]');
            if (inputs.length > 0) {
                const formData = {};
                inputs.forEach(i => { formData[i.attr("name")] = i.attr("value"); });
                formData['method_free'] = 'Free Download >>';
                const postRes = await this.client.post(url, headers, formData);
                let m = postRes.body.match(/direct_link[^>]+>\s*<a\s*href="([^"]+)"/i);
                if (m && m[1]) {
                    const videoUrl = m[1].replace(/\s/g, '%20').trim();
                    return [{ url: videoUrl, originalUrl: url, quality: `${hostKey} - ${qualityLabel} ${qualityNumeric}p`, headers: this.getHeaders(url) }];
                }
            }

            const id = url.split('/').filter(Boolean).pop() || '';
            const formData2 = { op: 'download2', id2: id, rand: '', referer: url };
            const postRes2 = await this.client.post(url, headers, formData2);
            let m2 = postRes2.body.match(/direct_link[^>]+>\s*<a\s*href="([^"]+)"/i);
            if (m2 && m2[1]) {
                const videoUrl = m2[1].replace(/\s/g, '%20').trim();
                return [{ url: videoUrl, originalUrl: url, quality: `${hostKey} - ${qualityLabel} ${qualityNumeric}p`, headers: this.getHeaders(url) }];
            }

            throw new Error("All Upbom extraction methods failed.");
        } catch (e) {
            console.error(`[UpbomExtractor Error] ${url}`, e.message);
            return [];
        }
    }

    async voeExtractor(url, hostKey, qualityLabel, qualityNumeric) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const hlsUrlMatch = res.body.match(/'hls':\s*'([^']+)'/);
            if (hlsUrlMatch?.[1]) {
                const videoUrl = hlsUrlMatch[1].trim();
                return [{ url: videoUrl, originalUrl: url, quality: `${hostKey} - ${qualityLabel} ${qualityNumeric}p (HLS)`, headers: this.getHeaders(url) }];
            }
            throw new Error("Could not find HLS URL in Voe page.");
        } catch (e) {
            console.error(`[Voe Error] ${url}`, e.message);
            return [];
        }
    }

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);
        let videos = [];
        
        const handlers = {
            "Mp4upload": { domains: ["mp4upload.com"] },
            "Dood":      { domains: ["dood"] },
            "Voe":       { domains: ["voe.sx"] },
            "Upbom":     { domains: ["upbaam.com", "cdnupbom.com", "uupbom.com", "upgobom.space", "tgb4.top15top.shop", "megamax.me"] },
        };
        const hosterSelection = this.getPreference("hoster_selection") || Object.keys(handlers);
        
        const linksToProcess = [];
        const processedUrls = new Set();
        
        const script = doc.selectFirst(C.SELECTORS.VIDEO.script)?.data;
        if (script) {
            const version = script.substringAfter("ver\":\"").substringBefore("\"");
            const serverElements = doc.select(C.SELECTORS.VIDEO.servers);
            for (const element of serverElements) {
                try {
                    const embedUrl = await this._getEmbedUrlForServer(element, version);
                    if (embedUrl && !processedUrls.has(embedUrl)) {
                        linksToProcess.push({ url: embedUrl, qualityText: element.text.trim() });
                        processedUrls.add(embedUrl);
                    }
                } catch(e) {}
            }
        }

        const downloadElements = doc.select(C.SELECTORS.VIDEO.downloads);
        for (const element of downloadElements) {
            const downloadUrl = element.getHref;
            if (downloadUrl && !processedUrls.has(downloadUrl)) {
                linksToProcess.push({ url: downloadUrl, qualityText: element.selectFirst("em")?.text ?? "Download" });
                processedUrls.add(downloadUrl);
            }
        }

        const videoPromises = linksToProcess.map(async (link) => {
            for (const hostKey of hosterSelection) {
                const handlerInfo = handlers[hostKey];
                if (handlerInfo && handlerInfo.domains.some(domain => link.url.includes(domain))) {
                    const quality = this._getQualityFromString(link.qualityText);
                    return await this.extractVideos(link.url, hostKey, quality.label, quality.numeric);
                }
            }
            return [];
        });
        
        const extractedVideos = await Promise.all(videoPromises);
        videos.push(...extractedVideos.flat());

        const preferredQuality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const aIsPreferred = a.quality.includes(preferredQuality);
            const bIsPreferred = b.quality.includes(preferredQuality);
            if (aIsPreferred !== bIsPreferred) return aIsPreferred ? -1 : 1;

            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            return qualityB - qualityA;
        });

        return videos;
    }

    getFilterList() {
        return [{
            type_name: "SelectFilter",
            name: "القسم",
            state: 0,
            values: [
                { name: "اختر القسم...", value: "none", type_name: "SelectOption" },
                { name: "--- عام ---", value: "header", type_name: "HeaderFilter" },
                { name: "الاكثر مشاهدة (Popular)", value: "popular", type_name: "SelectOption" },
                { name: "المضاف حديثا (Latest All)", value: "latest", type_name: "SelectOption" },
                { name: "--- تفصيل المضاف حديثا ---", value: "header", type_name: "HeaderFilter" },
                { name: "اخر الافلام", value: "latest-movies", type_name: "SelectOption" },
                { name: "اخر المسلسلات", value: "latest-series", type_name: "SelectOption" },
                { name: "اخر الانمي", value: "latest-animes", type_name: "SelectOption" },
                { name: "اخر حلقات المسلسلات", value: "latest-episodes", type_name: "SelectOption" },
                { name: "اخر حلقات الانمي", value: "latest-anime-episodes", type_name: "SelectOption" },
                { name: "--- قوائم الافلام ---", value: "header", type_name: "HeaderFilter" },
                { name: "قائمة كل الافلام", value: "movies", type_name: "SelectOption" },
                { name: "افلام اجنبية", value: "category/aflam-online-1", type_name: "SelectOption" },
                { name: "افلام اجنبية عائلية", value: "category/aflam-online-1/aflam-family", type_name: "SelectOption" },
                { name: "افلام نتفليكس", value: "category/netflix-movies-1", type_name: "SelectOption" },
                { name: "افلام اسيوية", value: "category/asian-aflam", type_name: "SelectOption" },
                { name: "افلام كرتون", value: "category/cartoon-movies", type_name: "SelectOption" },
                { name: "افلام انمي", value: "category/anime-movies", type_name: "SelectOption" },
                { name: "--- قوائم المسلسلات ---", value: "header", type_name: "HeaderFilter" },
                { name: "قائمة كل المسلسلات", value: "series", type_name: "SelectOption" },
                { name: "مسلسلات اجنبية", value: "category/english-series-1", type_name: "SelectOption" },
                { name: "مسلسلات اجنبية عائلية", value: "category/english-series-1/english-family-series", type_name: "SelectOption" },
                { name: "مسلسلات نتفليكس", value: "category/netflix-series", type_name: "SelectOption" },
                { name: "مسلسلات اسيوية", value: "category/asian-series", type_name: "SelectOption" },
                { name: "مسلسلات انمي", value: "category/anime-series", type_name: "SelectOption" },
                { name: "انميات نتفليكس", value: "category/netflix-anime", type_name: "SelectOption" },
                { name: "--- قوائم اخرى ---", value: "header", type_name: "HeaderFilter" },
                { name: "قائمة المواسم", value: "seasons", type_name: "SelectOption" },
                { name: "قائمة الحلقات", value: "episodes", type_name: "SelectOption" },
            ]
        }, {
            type_name: "SeparatorFilter"
        }, {
            type_name: "HeaderFilter",
            name: "الفلترة بالنوع والتصنيف تعمل فقط لو كان القسم 'اختر'"
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
                "Crime", "Horror", "History", "Kids", "Music", "Mystery", "Reality", "Sci-Fi-Fantasy",
                "TV-Movie", "War", "thriller"
            ].sort().map(g => ({ type_name: "SelectOption", name: g, value: g }))
        }];
    }
    
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Use a different mirror/domain for the source",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: "",
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي تفضلها",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p"],
                entryValues: ["1080", "720", "480", "360"],
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر الخوادم",
                summary: "اختر الخوادم التي تريد ان تظهر",
                entries: ["Mp4upload", "Dood", "Voe", "Upbom Family"],
                entryValues: ["Mp4upload", "Dood", "Voe", "Upbom"],
                values: ["Mp4upload", "Dood", "Voe", "Upbom"],
            }
        }];
    }
}
