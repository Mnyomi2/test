// --- METADATA ---
const mangayomiSources = [{
    "name": "ArabSeed",
    "id": 6219374582,
    "lang": "ar",
    "baseUrl": "https://a.asd.homes",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=asd.homes",
    "typeSource": "multi",
    "itemType": 1,
    "version": "1.3.8",
    "pkgPath": "anime/src/ar/arabseed.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES ---
    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    // --- HELPERS ---
    getIntFromText(text) {
        if (!text) return null;
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }

    // --- CATALOGUE & SEARCH ---
    async getPopular(page) {
        const url = page === 1 ? `${this.getBaseUrl()}/movies/` : `${this.getBaseUrl()}/movies/?offset=${page}`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);
        
        const list = doc.select("div.item__contents").map(element => {
            const anchor = element.selectFirst("a");
            const title = anchor?.attr("title")?.trim() || "";
            const link = anchor?.getHref;
            const imageUrl = element.selectFirst("img")?.getSrc || "";
            if (!title || !link) return null;
            return { name: title, link, imageUrl };
        }).filter(it => it != null);
        
        const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = page === 1 ? `${this.getBaseUrl()}/recently/` : `${this.getBaseUrl()}/recently/?offset=${page}`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);
    
        const list = doc.select("div.item__contents").map(element => {
            const anchor = element.selectFirst("a");
            const title = anchor?.attr("title")?.trim() || "";
            const link = anchor?.getHref;
            const imageUrl = element.selectFirst("img")?.getSrc || "";
            if (!title || !link) return null;
            return { name: title, link, imageUrl };
        }).filter(it => it != null);
    
        const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        let url;
        if (query) {
            url = page === 1 ? `${this.getBaseUrl()}/find/?find=${encodeURIComponent(query)}` : `${this.getBaseUrl()}/find/?find=${encodeURIComponent(query)}&offset=${page}`;
        } else {
            const categoryFilter = filters.find(f => f.name === "القسم");
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (!selectedCategory) return this.getPopular(page);
            url = page === 1 ? `${this.getBaseUrl()}${selectedCategory}` : `${this.getBaseUrl()}${selectedCategory}?offset=${page}`;
        }
        
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        
        const list = doc.select("div.item__contents").map(element => {
            const anchor = element.selectFirst("a");
            const title = anchor?.attr("title")?.trim() || "";
            const link = anchor?.getHref;
            const imageUrl = element.selectFirst("img")?.getSrc || "";
            if (!title || !link) return null;
            return { name: title, link, imageUrl };
        }).filter(it => it != null);
        
        const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
        return { list, hasNextPage };
    }

    // --- DETAILS ---
    async getDetail(url) {
        const initialUrl = url;
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        
        const name = (doc.selectFirst("div.BreadCrumbs ol li:last-child a span")?.text || doc.selectFirst("h1.Title")?.text || "")
            .replace(/مترجم|فيلم|مسلسل/g, "").trim();

        const posterElement = doc.selectFirst("div.Poster > img");
        const imageUrl = posterElement?.attr("data-src") || posterElement?.attr("data-lazy-src") || posterElement?.getSrc || "";
        
        const description = doc.selectFirst("meta[name='keywords']")?.attr("content")?.trim() ||
                            doc.selectFirst("p.descrip:nth-of-type(2)")?.text?.trim() ||
                            doc.selectFirst("p.descrip")?.text?.trim() ||
                            "لا يوجد وصف متاح لهذا العرض.";

        const metaTerms = doc.select("div.MetaTermsInfo > li");
        const metaMap = {};

        for (const li of metaTerms) {
            const label = li.selectFirst("span")?.text?.trim();
            if (!label) continue;

            const key = label.replace(/:$/, "").trim();
            const links = li.select("a");

            if (links.length > 0) {
                metaMap[key] = links.map(a => a.text.trim());
            } else {
                const text = li.text.replace(label, "").replace(/\n/g, "").trim();
                if (text) metaMap[key] = [text];
            }
        }

        const genre = metaMap["النوع"] || [];
        const year = metaMap["السنه"]?.[0] || "";
        const language = metaMap["اللغة"] || [];
        const quality = metaMap["الجودة"]?.[0] || "";
        const country = metaMap["الدولة"]?.[0] || "";
        const releaseDate = metaMap["اليوم"]?.[0] || "";

        const chapters = [];
        const episodeElements = doc.select("div.ContainerEpisodesList a");

        if (episodeElements.length > 0) {
            episodeElements.forEach(epEl => {
                const epNumStr = epEl.selectFirst("em")?.text?.trim();
                if (epNumStr) {
                    chapters.push({
                        name: `الحلقة ${epNumStr}`,
                        url: epEl.getHref,
                        episode: parseFloat(epNumStr),
                    });
                }
            });
        } else {
            chapters.push({ name: "مشاهدة", url: initialUrl });
        }

        return {
            name,
            imageUrl,
            description,
            genre,
            extraInfo: {
                year,
                language: language.join(", "),
                quality,
                country,
                releaseDate
            },
            chapters
        };
    }

    // --- VIDEO ---
    async getVideoList(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const watchUrl = doc.selectFirst("a.watchBTn")?.getHref;
        if (!watchUrl) throw new Error("Watch button not found.");

        const watchRes = await this.client.get(watchUrl, { "Referer": this.getBaseUrl() });
        const watchDoc = new Document(watchRes.body);

        const videos = [];
        
        for (const element of watchDoc.select("div.containerServers ul li")) {
            const quality = element.text;
            const iframeUrl = element.attr("data-link");

            if (iframeUrl.includes("reviewtech") || iframeUrl.includes("reviewrate")) {
                try {
                    const iframeRes = await this.client.get(iframeUrl);
                    const iframeDoc = new Document(iframeRes.body);
                    const sourceUrl = iframeDoc.selectFirst("source")?.attr("src");
                    if (sourceUrl) {
                        videos.push({
                            url: sourceUrl,
                            quality: quality,
                            originalUrl: sourceUrl,
                            headers: { "Referer": iframeUrl }
                        });
                    }
                } catch (e) {
                    console.log(`Failed to extract from ${iframeUrl}: ${e}`);
                }
            }
        }
        
        if (videos.length === 0) throw new Error("No compatible servers found.");
        return videos;
    }
    
    // --- FILTERS & PREFERENCES ---
    getFilterList() {
        const categories = [
            { name: 'الكل', value: '' },
            { name: 'افلام Netfilx', value: '/category/netfilx/افلام-netfilx/' },
            { name: 'افلام اجنبي', value: '/category/foreign-movies/' },
            { name: 'افلام عربي', value: '/category/arabic-movies-5/' },
            { name: 'افلام اسيوية', value: '/category/asian-movies/' },
            { name: 'افلام تركية', value: '/category/turkish-movies/' },
            { name: 'افلام هندى', value: '/category/indian-movies/' },
            { name: 'افلام انيميشن', value: '/category/افلام-انيميشن/' },
            { name: 'مسلسلات عربي', value: '/category/arabic-series/' },
            { name: 'مسلسلات اجنبي', value: '/category/foreign-series/' },
            { name: 'مسلسلات تركيه', value: '/category/turkish-series-1/' },
            { name: 'مسلسلات كرتون', value: '/category/cartoon-series/' },
            { name: 'مسلسلات رمضان 2025', value: '/category/مسلسلات-رمضان/ramadan-series-2025/' },
            { name: 'مصارعه', value: '/category/wwe-shows/' }
        ];

        return [{
            type_name: "SelectFilter",
            name: "القسم",
            state: 0,
            values: categories.map(c => ({ type_name: "SelectOption", name: c.name, value: c.value }))
        }];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary changes to the domain.",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: "Default: " + this.source.baseUrl,
            }
        }];
    }
}