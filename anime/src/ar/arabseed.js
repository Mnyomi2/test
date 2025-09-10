// --- METADATA ---
const mangayomiSources = [{
    "name": "ArabSeed",
    "id": 6219374582,
    "lang": "ar",
    "baseUrl": "https://e.arabseed.ink",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=arabseed.ink",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/arabseed.js"
}];




class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders() {
        return {
            "Referer": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
        };
    }

    // --- Helper Methods ---

    parseCatalogue(doc) {
        const list = [];
        const items = doc.select("div.Grid--WecimaPosts div.GridItem div.Thumb--GridItem");
        for (const item of items) {
            const linkElement = item.selectFirst("a");
            const name = linkElement.attr("title");
            const link = linkElement.getHref;
            const imageUrl = item.selectFirst("a > span.BG--GridItem")
                .attr("data-lazy-style")
                .split("url(")[1].split(");")[0];
            
            list.push({ name, link, imageUrl });
        }
        const hasNextPage = doc.selectFirst("ul.page-numbers li a.next") != null;
        return { list, hasNextPage };
    }

    getNumberFromEpsString(epsStr) {
        return epsStr.replace(/[^0-9]/g, '');
    }

    // --- Catalogue Methods ---

    async getPopular(page) {
        const url = `${this.source.baseUrl}/movies/?page_no=${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        return this.parseCatalogue(doc);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/page/${page}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        return this.parseCatalogue(doc);
    }

    async search(query, page, filters) {
        let url;
        if (query) {
            const categoryValue = filters[1]?.values[filters[1].state]?.value ?? "page/";
            url = `${this.source.baseUrl}/search/${query}/${categoryValue}${page}/`;
        } else {
            const sectionValue = filters[0]?.values[filters[0].state]?.value;
            if (sectionValue) {
                url = `${this.source.baseUrl}/${sectionValue}/page/${page}/`;
            } else {
                const genreValue = filters[2]?.values[filters[2].state]?.value ?? "";
                const categoryValue = filters[1]?.values[filters[1].state]?.value ?? "page/";
                url = `${this.source.baseUrl}/genre/${genreValue}/${categoryValue}${page}/`;
            }
        }
        
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        return this.parseCatalogue(doc);
    }

    // --- Details & Episodes ---

    async getDetail(url) {
        const res = await this.client.get(this.source.baseUrl + url, this.getHeaders());
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("div.Title--Content--Single-begin > h1")?.text
                       .split(" (")[0]
                       .replace(/مشاهدة (فيلم|مسلسل|انمي|برنامج) /, "")
                       .split("مترجم")[0].trim();

        const genre = doc.select("ul.Terms--Content--Single-begin li:contains(النوع) p a").map(e => e.text).join(", ");
        let description = doc.selectFirst("div.AsideContext > div.StoryMovieContent")?.text ?? "";
        const author = doc.select("li:contains(شركات الإنتاج) > p > a").map(e => e.text).join(", ");
        
        const altNameArabic = doc.selectFirst("ul.Terms--Content--Single-begin li:contains(الإسم بالعربي) p")?.text;
        if (altNameArabic) {
            description += `\n\nالإسم بالعربي: ${altNameArabic}`;
        }
        
        const altNameKnownAs = doc.selectFirst("ul.Terms--Content--Single-begin li:contains(معروف ايضاََ بـ) p")?.text;
        if (altNameKnownAs) {
            description += `\n\nمعروف ايضاََ بـ: ${altNameKnownAs}`;
        }

        // --- Episodes Parsing ---
        const chapters = [];
        const episodeElements = doc.select("div.Episodes--Seasons--Episodes a");

        if (episodeElements.length === 0) {
            const movieSeries = doc.select("singlerelated.hasdivider:contains(سلسلة) div.Thumb--GridItem a");
            if (movieSeries.length > 0) {
                movieSeries.sort((a, b) => {
                    const yearA = parseInt(this.getNumberFromEpsString(a.selectFirst(".year")?.text ?? "0"));
                    const yearB = parseInt(this.getNumberFromEpsString(b.selectFirst(".year")?.text ?? "0"));
                    return yearB - yearA;
                });
                movieSeries.forEach(el => {
                    chapters.push({
                        name: el.text.replace("مشاهدة فيلم ", "").split("مترجم")[0],
                        url: el.getHref
                    });
                });
            } else {
                const movieElement = doc.selectFirst("div.Poster--Single-begin > a");
                if (movieElement) {
                    chapters.push({
                        name: "مشاهدة",
                        url: movieElement.getHref
                    });
                }
            }
        } else {
            const seasonElements = doc.select("div.List--Seasons--Episodes a");
            if (seasonElements.length === 0) {
                episodeElements.forEach(el => {
                    chapters.push({
                        name: `الموسم 1 : ${el.text}`,
                        url: el.getHref
                    });
                });
            } else {
                for (const season of seasonElements.reverse()) {
                    const seNum = this.getNumberFromEpsString(season.text);
                    let seasonDoc = doc;
                    if (!season.hasClass("selected")) {
                        const seasonRes = await this.client.get(season.getHref, this.getHeaders());
                        seasonDoc = new Document(seasonRes.body);
                    }
                    seasonDoc.select("div.Episodes--Seasons--Episodes a").forEach(ep => {
                        chapters.push({
                            name: `الموسم ${seNum} : ${ep.text}`,
                            url: ep.getHref
                        });
                    });
                }
            }
        }
        
        return { name, genre, description, author, chapters, link: this.source.baseUrl + url };
    }

    // --- Video Extraction ---

    async getVideoList(url) {
        const res = await this.client.get(this.source.baseUrl + url, this.getHeaders());
        const doc = new Document(res.body);
        const serverElements = doc.select("ul.WatchServersList li");
        let videos = [];
        
        for (const element of serverElements) {
            try {
                const iframeUrl = element.selectFirst("btn").attr("data-url");
                const serverText = element.text.toLowerCase();
                const refererHeader = { "Referer": this.source.baseUrl + "/" };

                if (element.hasClass("MyCimaServer") && iframeUrl.includes("/run/")) {
                    const mp4Url = iframeUrl.replace("?Key", "/?Key") + "&auto=true";
                    videos.push({
                        url: mp4Url,
                        quality: "Default (قد يستغرق وقتا)",
                        originalUrl: mp4Url,
                        headers: refererHeader
                    });
                } else if (["govid", "vidbom", "vidshare"].some(s => serverText.includes(s))) {
                    videos.push(...(await this.govidExtractor(iframeUrl, "Vid" + serverText, refererHeader)));
                } else if (serverText.includes("dood")) {
                    videos.push({ url: iframeUrl, quality: "Dood", headers: refererHeader });
                } else if (serverText.includes("ok.ru")) {
                    videos.push({ url: iframeUrl, quality: "Okru", headers: refererHeader });
                } else if (serverText.includes("uqload")) {
                    // Note: UqloadExtractor logic wasn't provided, so returning the URL.
                    videos.push({ url: iframeUrl, quality: "Uqload", headers: refererHeader });
                }
            } catch(e) {
                // Ignore errors from single server
            }
        }

        const preferredQuality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0; // Basic sort if no match, can be improved
        });

        return videos;
    }

    async govidExtractor(url, host, headers) {
        const res = await this.client.get(url, headers);
        const doc = new Document(res.body);
        const script = doc.selectFirst("script:contains(sources)");
        if (!script) return [];

        const scriptData = script.text;
        const sourcesRaw = scriptData.split("sources: [")[1]?.split("],")[0];
        if (!sourcesRaw) return [];

        const videos = [];
        const sourceParts = sourcesRaw.split('file:"').slice(1);
        for (const part of sourceParts) {
            const src = part.split('"')[0];
            let quality = part.split('label:"')[1]?.split('"')[0] ?? "480p";
            if (quality.length > 15) quality = "480p";
            
            videos.push({
                url: src,
                originalUrl: src,
                quality: `${host}: ${quality}`,
                headers: headers,
            });
        }
        return videos;
    }


    // --- Filters & Preferences ---

    getFilterList() {
        const createFilter = (displayName, pairs) => ({
            type_name: "SelectFilter",
            name: displayName,
            state: 0,
            values: pairs.map(p => ({ type_name: "SelectOption", name: p[0], value: p[1] }))
        });

        return [
            { type_name: "HeaderFilter", name: "هذا القسم يعمل لو كان البحث فارغ" },
            createFilter("اقسام الموقع", [
                ["اختر", ""], ["جميع الافلام", "movies"], ["افلام اجنبى", "category/أفلام/10-movies-english-افلام-اجنبي"],
                ["افلام عربى", "category/أفلام/افلام-عربي-arabic-movies"], ["افلام هندى", "category/أفلام/افلام-هندي-indian-movies"],
                ["افلام تركى", "category/أفلام/افلام-تركى-turkish-films"], ["افلام وثائقية", "category/أفلام/افلام-وثائقية-documentary-films"],
                ["افلام انمي", "category/افلام-كرتون"], ["سلاسل افلام", "category/أفلام/10-movies-english-افلام-اجنبي/سلاسل-الافلام-الكاملة-full-pack"],
                ["مسلسلات", "seriestv"], ["مسلسلات اجنبى", "category/مسلسلات/5-series-english-مسلسلات-اجنبي"],
                ["مسلسلات عربى", "category/مسلسلات/5-series-english-مسلسلات-اجنبي"], ["مسلسلات هندى", "category/مسلسلات/9-series-indian-مسلسلات-هندية"],
                ["مسلسلات اسيوى", "category/مسلسلات/مسلسلات-اسيوية"], ["مسلسلات تركى", "category/مسلسلات/8-مسلسلات-تركية-turkish-series"],
                ["مسلسلات وثائقية", "category/مسلسلات/مسلسلات-وثائقية-documentary-series"], ["مسلسلات انمي", "category/مسلسلات-كرتون"],
                ["NETFLIX", "production/netflix"], ["WARNER BROS", "production/warner-bros"],
                ["LIONSGATE", "production/lionsgate"], ["DISNEY", "production/walt-disney-pictures"],
                ["COLUMBIA", "production/columbia-pictures"]
            ]),
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "النوع يستخدم فى البحث و التصنيف" },
            createFilter("النوع", [
                ["فيلم", "page/"], ["مسلسل", "list/series/?page_number="],
                ["انمى", "list/anime/?page_number="], ["برنامج", "list/tv/?page_number="]
            ]),
            { type_name: "SeparatorFilter" },
            { type_name: "HeaderFilter", name: "التصنيف يعمل لو كان اقسام الموقع على 'اختر' فقط" },
            createFilter("التصنيف", [
                ["اكشن", "اكشن-action"], ["مغامرات", "مغامرات-adventure"], ["خيال علمى", "خيال-علمى-science-fiction"],
                ["فانتازيا", "فانتازيا-fantasy"], ["كوميديا", "كوميديا-comedy"], ["دراما", "دراما-drama"],
                ["جريمة", "جريمة-crime"], ["اثارة", "اثارة-thriller"], ["رعب", "رعب-horror"],
                ["سيرة ذاتية", "سيرة-ذاتية-biography"], ["كرتون", "كرتون"], ["انيميشين", "انيميشين-anime"]
            ])
        ];
    }

    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي ستظهر أولاً في قائمة السيرفرات",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p", "Vidbom", "Vidshare", "Dood", "Default"],
                entryValues: ["1080", "720", "480", "360", "240", "Vidbom", "Vidshare", "Dood", "Default"]
            }
        }];
    }
}
