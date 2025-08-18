const mangayomiSources = [{
    "name": "Tuktukcinema",
    "id": 843294759,
    "lang": "ar",
    "baseUrl": "https://tuktukcinema.lat",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=tuktukcinema.lat",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/tuktukcinema.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES & HELPERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Referer": this.getBaseUrl() + "/",
        };
    }

    // Custom decoding function based on the provided Python script
    decode(str) {
        try {
            if (!str || typeof str !== 'string') return str;
            const part1 = str.split("0REL0Y&")[0];
            const reversedPart1 = part1.split('').reverse().join('');
            return atob(reversedPart1); // atob is the JS equivalent for Base64 decoding
        } catch (e) {
            return str;
        }
    }

    cleanTitle(title) {
        return title.replace(/مشاهدة|فيلم|مسلسل|مترجم|اون لاين|الموسم \d+/g, '').trim();
    }

    async parseCatalogue(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.Block--Item");

        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            if (!linkElement) return;

            const name = this.cleanTitle(linkElement.attr("title"));
            const link = linkElement.getHref.replace(this.getBaseUrl(), '');
            const imageUrl = item.selectFirst("img")?.getSrc || '';
            if (link) {
                list.push({ name, link, imageUrl });
            }
        });

        const hasNextPage = !!doc.selectFirst("a.next.page-numbers");
        return { list, hasNextPage };
    }


    // --- CATALOGUE ---

    async getPopular(page) {
        // No specific popular page, using a category as a substitute
        const url = `${this.getBaseUrl()}/category/movies-2/افلام-اجنبي/page/${page}/`;
        return this.parseCatalogue(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/page/${page}/`;
        return this.parseCatalogue(url);
    }

    async search(query, page, filters) {
        let url;
        const categoryFilter = filters.find(f => f.name === "القسم");
        
        if (query) {
            url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query)}`;
        } else if (categoryFilter && categoryFilter.state > 0) {
            const path = categoryFilter.values[categoryFilter.state].value;
            url = `${this.getBaseUrl()}${path}page/${page}/`;
        } else {
            // Default to latest if no query or filter
            return this.getLatestUpdates(page);
        }
        return this.parseCatalogue(url);
    }

    // --- DETAILS ---

    async getDetail(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders());
        const doc = new Document(res.body);

        const name = this.cleanTitle(doc.selectFirst("h1.title").text);
        const imageUrl = doc.selectFirst("div.Single--Content--Image img").getSrc;
        const description = doc.selectFirst("div.story").text.trim();
        const genre = doc.select("div.meta-links:contains(التصنيف) a").map(e => e.text);
        const status = 1; // Assuming most are completed

        const chapters = [];
        if (url.startsWith('/series/')) {
            // It's a series, parse episodes
            const episodeElements = doc.select("div.all-episodes-list div.ep-item a");
            episodeElements.forEach(element => {
                chapters.push({
                    name: `الحلقة ${element.selectFirst('span.ep-num').text.trim()}`,
                    url: element.getHref.replace(this.getBaseUrl(), '')
                });
            });
            chapters.reverse();
        } else {
            // It's a movie
            chapters.push({ name: "فيلم", url: url });
        }

        return { name, imageUrl, description, genre, status, link: url, chapters };
    }

    // --- VIDEO ---

    async megamaxExtractor(url, referer) {
        const res = await this.client.get(url, { "Referer": referer });
        try {
            const unpackedJs = unpackJs(res.body);
            if (unpackedJs) {
                const m3u8Match = unpackedJs.match(/file:"(.*?m3u8.*?)"/);
                if (m3u8Match) {
                    return [{
                        url: m3u8Match[1],
                        originalUrl: m3u8Match[1],
                        quality: "TukTuk VIP",
                        headers: { "Referer": url }
                    }];
                }
            }
        } catch (e) {}
        return [];
    }

    async getVideoList(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders());
        const doc = new Document(res.body);

        const watchLinkElement = doc.selectFirst("div.TPlayer--Btn-Watch a");
        if (!watchLinkElement) throw new Error("Watch link not found.");

        const watchPageUrl = watchLinkElement.getHref;
        const watchRes = await this.client.get(watchPageUrl, this.getHeaders());
        const watchDoc = new Document(watchRes.body);

        const videos = [];
        const serverElements = watchDoc.select("div.serversListHolder li.server--item");
        
        for (const element of serverElements) {
            try {
                const encodedUrl = element.attr("data-link");
                const serverName = element.selectFirst("span").text.trim();
                const decodedUrl = this.decode(encodedUrl);

                if (serverName.toLowerCase().includes("tuktuk vip")) {
                    const extracted = await this.megamaxExtractor(decodedUrl, watchPageUrl);
                    videos.push(...extracted);
                } else {
                    videos.push({
                        url: decodedUrl,
                        originalUrl: decodedUrl,
                        quality: serverName,
                        headers: { "Referer": watchPageUrl }
                    });
                }
            } catch (e) {
                // Ignore errors from single server
            }
        }

        if (videos.length === 0) throw new Error("No videos found.");
        return videos;
    }

    // --- FILTERS & PREFERENCES ---

    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        return [{
            type_name: "SelectFilter",
            name: "القسم",
            state: 0,
            values: [
                f("الكل", ""),
                f("أفلام أجنبية", "/category/movies-2/افلام-اجنبي/"),
                f("أفلام أسيوية", "/category/movies-2/افلام-اسيوي/"),
                f("أفلام تركية", "/category/movies-2/افلام-تركي/"),
                f("أفلام هندية", "/category/movies-2/افلام-هندى/"),
                f("أفلام كرتون", "/category/anime-6/افلام-انمي/"),
                f("أفلام وثائقية", "/genre/وثائقي/?filter=movies"),
                f("مسلسلات أجنبية", "/category/series-1/مسلسلات-اجنبي/"),
                f("مسلسلات أسيوية", "/category/series-1/مسلسلات-أسيوي/"),
                f("مسلسلات تركية", "/category/series-1/مسلسلات-تركي/"),
                f("مسلسلات انمي", "/category/anime-6/انمي-مترجم/"),
                f("مسلسلات هندية", "/category/series-1/مسلسلات-هندي/"),
                f("مسلسلات وثائقية", "/genre/وثائقي/?filter=serie"),
            ]
        }];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "تجاوز عنوان URL الأساسي",
                summary: "للتغييرات المؤقتة..",
                value: this.source.baseUrl,
                dialogTitle: "تجاوز عنوان URL الأساسي",
                dialogMessage: `الافتراضي: ${this.source.baseUrl}`,
            }
        }];
    }
}