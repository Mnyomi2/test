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
        // Use the preference value, or fall back to the source's default baseUrl
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    // --- HELPERS ---

    // Extracts the first number from a string.
    getIntFromText(text) {
        if (!text) return null;
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }

    // Parses a single item from a catalogue or search result page.
    parseCatalogueItem(element) {
        const title = element.selectFirst("h4").text;
        const link = element.selectFirst("a").getHref;
        const imageUrl = element.selectFirst("img.imgOptimzer")?.attr("data-image") ||
                         element.selectFirst("div.Poster img")?.attr("data-src") || "";
        
        return { name: title, link, imageUrl };
    }

    // --- CATALOGUE ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/movies/?offset=${page}`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);
        
        const list = doc.select("ul.Blocks-UL > div").map(el => this.parseCatalogueItem(el));
        
        // ArabSeed uses infinite scroll, so we assume there's always a next page
        // until an empty list is returned.
        const hasNextPage = list.length > 0;
        
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/series/?offset=${page}`;
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);

        const list = doc.select("ul.Blocks-UL > div").map(el => this.parseCatalogueItem(el));
        const hasNextPage = list.length > 0;

        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        // The site's search is not paginated, so we only run it for the first page.
        if (page > 1) {
            return { list: [], hasNextPage: false };
        }
        
        const searchUrl = `${this.getBaseUrl()}/wp-content/themes/Elshaikh2021/Ajaxat/SearchingTwo.php`;
        const headers = { "Referer": this.getBaseUrl() };
        
        const seriesPromise = this.client.post(searchUrl, headers, { search: query, type: 'series' });
        const moviesPromise = this.client.post(searchUrl, headers, { search: query, type: 'movies' });

        const [seriesRes, moviesRes] = await Promise.all([seriesPromise, moviesPromise]);

        const seriesDoc = new Document(seriesRes.body);
        const moviesDoc = new Document(moviesRes.body);

        const seriesList = seriesDoc.select("ul.Blocks-UL > div").map(el => this.parseCatalogueItem(el));
        const moviesList = moviesDoc.select("ul.Blocks-UL > div").map(el => this.parseCatalogueItem(el));

        const combinedList = [...seriesList, ...moviesList];

        return { list: combinedList, hasNextPage: false };
    }

    // --- DETAILS AND EPISODES ---

    async getDetail(url) {
        const res = await this.client.get(url, {}, { timeout: 120000 });
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.Title")?.text || doc.selectFirst("div.Title")?.text || "";
        const isMovie = name.includes("فيلم");

        const posterElement = doc.selectFirst("div.Poster > img");
        const imageUrl = posterElement?.attr("data-src") || posterElement?.attr("src") || "";

        const description = doc.select("p.descrip").last?.text || "";
        const year = this.getIntFromText(doc.selectFirst("li:contains(السنه) a")?.text);
        const genre = doc.select("li:contains(النوع) > a, li:contains(التصنيف) > a").map(it => it.text);
        
        const chapters = [];

        if (isMovie) {
            chapters.push({ name: "Movie", url: url });
        } else {
            const seasonElements = doc.select("div.SeasonsListHolder ul > li");
            if (seasonElements.length > 0) {
                const episodesUrl = `${this.getBaseUrl()}/wp-content/themes/Elshaikh2021/Ajaxat/Single/Episodes.php`;
                
                const episodePromises = seasonElements.map(async (seasonEl) => {
                    const season = seasonEl.attr("data-season");
                    const postId = seasonEl.attr("data-id");
                    const seasonNum = this.getIntFromText(season);

                    const res = await this.client.post(episodesUrl, {}, { season, post_id: postId });
                    const epsDoc = new Document(res.body);

                    return epsDoc.select("a").map(epEl => ({
                        name: epEl.text,
                        url: epEl.getHref,
                        season: seasonNum,
                        episode: this.getIntFromText(epEl.text),
                    }));
                });

                const allEpisodes = (await Promise.all(episodePromises)).flat();
                chapters.push(...allEpisodes);

            } else {
                doc.select("div.ContainerEpisodesList > a").forEach(epEl => {
                    chapters.push({
                        name: epEl.text,
                        url: epEl.getHref,
                        season: 1, // Assume season 1 if not specified
                        episode: this.getIntFromText(epEl.text),
                    });
                });
            }
        }
        
        // Sort chapters correctly
        chapters.sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.episode - b.episode;
        });

        return {
            name,
            imageUrl,
            description,
            genre,
            year,
            chapters
        };
    }

    // --- VIDEO EXTRACTION ---

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
                if (iframeUrl.includes("arabseed")) {
                    try {
                        const iframeRes = await this.client.get(iframeUrl);
                        const iframeDoc = new Document(iframeRes.body);
                        const sourceElement = iframeDoc.selectFirst("source");
                        if (sourceElement) {
                            videos.push({
                                url: sourceElement.attr("src"),
                                quality: currentQuality,
                                originalUrl: sourceElement.attr("src"),
                                headers: { "Referer": iframeUrl }
                            });
                        }
                    } catch (e) {
                        // Ignore errors for individual servers
                        console.log(`Failed to extract from ${iframeUrl}: ${e}`);
                    }
                }
            }
        }
        
        return videos;
    }
    
    // --- PREFERENCES ---

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Use a different mirror/domain for the source",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: "Default: " + this.source.baseUrl,
            }
        }];
    }
}