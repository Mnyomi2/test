// --- METADATA ---
const mangayomiSources = [{
    "name": "FreePornVideos",
    "id": 8739103845,
    "lang": "en",
    "baseUrl": "https://www.freepornvideos.xxx",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=freepornvideos.xxx",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "isNsfw": true,
    "pkgPath": "anime/src/en/freepornvideos.js"
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

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders() {
        return {
            "Referer": this.getBaseUrl() + "/",
        };
    }

    // --- HELPERS ---
    parseItem(element) {
        const title = element.selectFirst("strong.title").text;
        const link = element.selectFirst("a").getHref;
        let imageUrl = element.selectFirst("img.thumb").attr("data-src");
        if (!imageUrl || imageUrl.length == 0) {
            imageUrl = element.selectFirst("img.thumb").attr("src");
        }
        return { name: title, link, imageUrl };
    }

    // --- CORE METHODS ---
    async getPopular(page) {
        const url = `${this.getBaseUrl()}/most-popular/week/${page}/`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select("#list_videos_common_videos_list_items > div.item");
        const list = items.map(item => this.parseItem(item));
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const path = page > 1 ? `/videos/${page}/` : '/';
        const url = `${this.getBaseUrl()}${path}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select("#list_videos_common_videos_list_items > div.item");
        const list = items.map(item => this.parseItem(item));
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        const slug = query.trim().replace(/\s+/g, '-').toLowerCase();
        const url = `${this.getBaseUrl()}/search/${slug}/${page}/`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select("#custom_list_videos_videos_list_search_result_items > div.item");
        const list = items.map(item => this.parseItem(item));
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const fullTitle = doc.selectFirst("div.headline > h1")?.text?.trim() ?? "";
        const lastIndex = fullTitle.lastIndexOf(" - ");
        const name = (lastIndex !== -1 ? fullTitle.substring(0, lastIndex) : fullTitle).trim();
        
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content") ?? "";
        
        let description = "";
        const genre = [];
        doc.select("div.info-video > div").forEach(div => {
            const text = div.text;
            if (text.startsWith("Description:")) {
                description = div.selectFirst("em")?.text?.trim() ?? "";
            } else if (text.startsWith("Categories:")) {
                div.select("a").forEach(a => genre.push(a.text));
            }
        });

        if (description.length === 0) {
            description = "No description available.";
        }
        
        const chapters = [{
            name: "Movie",
            url: url
        }];

        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        
        const videos = [];
        const sources = doc.select("video source");

        for (const source of sources) {
            videos.push({
                url: source.attr("src"),
                originalUrl: source.attr("src"),
                quality: source.attr("label"),
                headers: { "Referer": url }
            });
        }
        
        if (videos.length === 0) {
            throw new Error("No video sources found.");
        }

        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality) || 0;
            const qualityB = parseInt(b.quality) || 0;
            return qualityB - qualityA;
        });

        return videos;
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary changes...",
                value: this.source.baseUrl,
                dialogTitle: "Override Base URL",
                dialogMessage: `Default: ${this.source.baseUrl}`,
            }
        }];
    }
}