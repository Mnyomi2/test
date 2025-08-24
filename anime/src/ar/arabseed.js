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
        const url = `${this.getBaseUrl()}/movies/page/${page}/`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);
        
        const list = doc.select("div.MovieBlock").map(element => {
            const title = element.selectFirst("h4")?.text || element.selectFirst("img")?.attr("alt") || "";
            const link = element.selectFirst("a")?.getHref;
            const imageUrl = element.selectFirst("div.Poster img")?.attr("data-src") ||
                             element.selectFirst("div.Poster img")?.getSrc || "";
            if (!title || !link) return null;
            return { name: title.trim(), link, imageUrl };
        }).filter(it => it != null);
        
        const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/series/page/${page}/`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);

        const list = doc.select("div.MovieBlock").map(element => {
            const title = element.selectFirst("h4")?.text || element.selectFirst("img")?.attr("alt") || "";
            const link = element.selectFirst("a")?.getHref;
            
            // FIX: Use regex to get the clean, full-size image URL for the 'Latest' section.
            let imageUrl = element.selectFirst("div.Poster img")?.getSrc || "";
            const match = imageUrl.match(/(.*?)_V1_.*\.jpg$/);
            if (match && match[1]) {
                imageUrl = match[1] + ".jpg";
            }

            if (!title || !link) return null;
            return { name: title.trim(), link, imageUrl };
        }).filter(it => it != null);

        const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        if (query) {
            if (page > 1) return { list: [], hasNextPage: false };
            
            const searchUrl = `${this.getBaseUrl()}/wp-content/themes/Elshaikh2021/Ajaxat/SearchingTwo.php`;
            const headers = { "Referer": this.getBaseUrl() };
            
            const [seriesRes, moviesRes] = await Promise.all([
                this.client.post(searchUrl, headers, { search: query, type: 'series' }),
                this.client.post(searchUrl, headers, { search: query, type: 'movies' })
            ]);

            const parseSearchItem = (element) => {
                const title = element.selectFirst("h4")?.text || element.selectFirst("img")?.attr("alt") || "";
                const link = element.selectFirst("a")?.getHref;
                const imageUrl = element.selectFirst("div.Poster img")?.attr("data-src") || element.selectFirst("div.Poster img")?.getSrc || "";
                if (!title || !link) return null;
                return { name: title.trim(), link, imageUrl };
            };

            const seriesList = new Document(seriesRes.body).select("ul.Blocks-UL > div").map(parseSearchItem).filter(Boolean);
            const moviesList = new Document(moviesRes.body).select("ul.Blocks-UL > div").map(parseSearchItem).filter(Boolean);
            
            return { list: [...moviesList, ...seriesList], hasNextPage: false };
        } else {
            const categoryFilter = filters.find(f => f.name === "القسم");
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            
            if (!selectedCategory) return this.getPopular(page);
            
            const url = `${this.getBaseUrl()}${selectedCategory}page/${page}/`;
            const res = await this.client.get(url);
            const doc = new Document(res.body);
            
            const list = doc.select("div.MovieBlock").map(element => {
                const title = element.selectFirst("h4")?.text || element.selectFirst("img")?.attr("alt") || "";
                const link = element.selectFirst("a")?.getHref;
                const imageUrl = element.selectFirst("div.Poster img")?.attr("data-src") ||
                                 element.selectFirst("div.Poster img")?.getSrc || "";
                if (!title || !link) return null;
                return { name: title.trim(), link, imageUrl };
            }).filter(it => it != null);
            
            const hasNextPage = doc.selectFirst("div.pagination a.next") != null;
            return { list, hasNextPage };
        }
    }

    // --- DETAILS ---
    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.Title")?.text || doc.selectFirst("div.Title")?.text || "";
        const isMovie = name.includes("فيلم");

        const posterElement = doc.selectFirst("div.Poster > img");
        const imageUrl = posterElement?.attr("data-src") || posterElement?.attr("src") || "";

        const description = doc.select("p.descrip").last?.text || "";
        const genre = doc.select("li:contains(النوع) > a, li:contains(التصنيف) > a").map(it => it.text.trim());
        
        const chapters = [];
        if (isMovie) {
            chapters.push({ name: name, url });
        } else {
            const seasonElements = doc.select("div.SeasonsListHolder ul > li");
            if (seasonElements.length > 0) {
                const episodesUrl = `${this.getBaseUrl()}/wp-content/themes/Elshaikh2021/Ajaxat/Single/Episodes.php`;
                const episodePromises = seasonElements.map(async (seasonEl) => {
                    const season = seasonEl.attr("data-season");
                    const postId = seasonEl.attr("data-id");
                    const seasonNum = this.getIntFromText(seasonEl.text) || 1;

                    try {
                        const res = await this.client.post(episodesUrl, {}, { season, post_id: postId });
                        const epsDoc = new Document(res.body);
                        return epsDoc.select("a").map(epEl => ({
                            name: `الموسم ${seasonNum} - ${epEl.text}`,
                            url: epEl.getHref,
                            season: seasonNum,
                            episode: this.getIntFromText(epEl.text),
                        }));
                    } catch { return []; }
                });
                const allEpisodes = (await Promise.all(episodePromises)).flat();
                chapters.push(...allEpisodes);
            } else {
                doc.select("div.ContainerEpisodesList > a").forEach(epEl => {
                    chapters.push({
                        name: epEl.text,
                        url: epEl.getHref,
                        season: 1, 
                        episode: this.getIntFromText(epEl.text),
                    });
                });
            }
        }
        
        chapters.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
        return { name, imageUrl, description, genre, chapters };
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
        let currentQuality = "Auto";

        for (const element of watchDoc.select("ul > li[data-link], ul > h3")) {
            if (element.tagName === "h3") {
                currentQuality = element.text;
            } else {
                const iframeUrl = element.attr("data-link");
                const serverName = element.text;

                if (serverName.includes("عرب سيد")) {
                    try {
                        const iframeRes = await this.client.get(iframeUrl);
                        const iframeDoc = new Document(iframeRes.body);
                        const sourceElement = iframeDoc.selectFirst("source");
                        if (sourceElement) {
                            videos.push({
                                url: sourceElement.attr("src"),
                                quality: `${serverName} - ${currentQuality}`,
                                originalUrl: sourceElement.attr("src"),
                                headers: { "Referer": iframeUrl }
                            });
                        }
                    } catch (e) {
                        console.log(`Failed to extract from ${iframeUrl}: ${e}`);
                    }
                }
            }
        }
        
        if (videos.length === 0) throw new Error("No direct 'ArabSeed' servers found.");
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
