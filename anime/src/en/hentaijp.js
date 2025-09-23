// ==Mangayomi==
// @name         Hentai JP
// @version      1.0.0
// @description  Hentai JP extension
// @author       Don
// @site         https://hentai.jp
// ==/Mangayomi==

const mangayomiSources = [{
    "name": "Hentai JP",
    "id": 8172938104,
    "lang": "en",
    "baseUrl": "https://hentai.jp",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai.jp",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentaijp.js"
}];


class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        const overrideUrl = this.getPreference("override_base_url");
        return (overrideUrl || "").trim() || this.source.baseUrl.trim();
    }

    getHeaders(referer) {
        const baseUrl = this.getBaseUrl();
        return {
            "Referer": referer || baseUrl,
        };
    }

    // Parses a video item from the new <article> structure
    _parseAnimeFromElement(element) {
        const linkElement = element.selectFirst("a");
        const imgElement = element.selectFirst("img.display-img");

        const name = linkElement.attr("data-title");
        const relativeLink = linkElement.getHref.replace(this.getBaseUrl(), "");
        const imageUrl = imgElement.getSrc || imgElement.attr("data-src");

        return { name, imageUrl, link: relativeLink };
    }

    async _getAnimePage(path) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(baseUrl + path, this.getHeaders());
        const doc = new Document(res.body);
        
        const list = doc.select("article.thumb-block").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("a.nextpostslink");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        // "Popular" on this site is "Most Viewed"
        const path = page === 1 ? "/most-viewed/" : `/most-viewed/page/${page}/`;
        return this._getAnimePage(path);
    }

    async getLatestUpdates(page) {
        // The homepage is page 1 of latest.
        const path = page === 1 ? "/" : `/page/${page}/`;
        return this._getAnimePage(path);
    }

    async search(query, page, filters) {
        // This site uses a simple query parameter for search.
        const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
        return this._getAnimePage(path);
    }

    async getDetail(url) {
        const baseUrl = this.getBaseUrl();
        const pageUrl = baseUrl + url;
        const res = await this.client.get(pageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.entry-title").text.trim();
        const imageUrl = doc.selectFirst("meta[property='og:image']").attr("content");
        const description = doc.selectFirst("div.entry-content")?.text.trim() || "No description available.";
        // Tags are inside a span with links
        const genre = doc.select("span.entry-cats a").map(el => el.text.trim());
        const status = 1; // Completed

        // Each post is a single video, so we create one "chapter"
        const chapters = [{
            name: name,
            url: url
        }];

        return {
            name,
            imageUrl,
            description,
            genre,
            status,
            chapters,
            link: pageUrl
        };
    }

    async getVideoList(url) {
        const baseUrl = this.getBaseUrl();
        const pageUrl = baseUrl + url;

        // Step 1: Get the main page to find the iframe URL
        const mainRes = await this.client.get(pageUrl, this.getHeaders(baseUrl));
        const mainDoc = new Document(mainRes.body);

        // The video is in an iframe from a domain like vanfem.com
        const iframeElement = mainDoc.selectFirst('iframe[src*="vanfem.com"], iframe[src*="guccihide.com"]');
        if (!iframeElement) {
            throw new Error("Could not find the video iframe on the page.");
        }
        const iframeUrl = iframeElement.getSrc;

        // Step 2: Get the iframe page content
        const iframeRes = await this.client.get(iframeUrl, this.getHeaders(pageUrl));
        const iframeDoc = new Document(iframeRes.body);

        // Step 3: Extract the video sources from the script in the iframe page
        const scriptElement = iframeDoc.selectFirst("script:contains(jwplayer(\"player\").setup)");
        if (!scriptElement) {
            throw new Error("Could not find video player configuration script in the iframe.");
        }

        const scriptContent = scriptElement.text;
        const sourcesRegex = /sources:\s*(\[.*?\])/s;
        const match = scriptContent.match(sourcesRegex);

        if (!match || match.length < 2) {
            throw new Error("Could not extract video sources from the script.");
        }

        // The extracted string might not be perfect JSON, so we clean it up
        let sourcesJson = match[1].replace(/'/g, '"'); // Replace single quotes with double quotes
        const sourcesArray = JSON.parse(sourcesJson);

        let videos = sourcesArray.map(source => ({
            url: source.file,
            originalUrl: source.file,
            quality: source.label || "Default",
        }));

        const showPreferredOnly = this.getPreference("enable_preferred_quality_only") ?? true;

        if (showPreferredOnly) {
            const preferredQuality = this.getPreference("pref_quality") || "1080p";
            const preferredVideo = videos.find(video => video.quality === preferredQuality);
            if (preferredVideo) {
                return [preferredVideo];
            }
        }
        
        videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        return videos;
    }

    getFilterList() {
        // This site's search doesn't support filters/tags alongside keyword search.
        // It's either search by keyword OR browse by category.
        // Therefore, we return an empty list.
        return [];
    }

    getSourcePreferences() {
        return [
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source. Requires app restart.",
                    value: this.source.baseUrl.trim(),
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: `Default: ${this.source.baseUrl.trim()}`
                }
            },
            {
                key: "pref_quality",
                listPreference: {
                    title: "Preferred quality",
                    summary: "Note: Not all videos have all qualities available.",
                    valueIndex: 0,
                    entries: ["1080p", "720p", "480p", "360p", "Default"],
                    entryValues: ["1080p", "720p", "480p", "360p", "Default"]
                }
            },
            {
                key: "enable_preferred_quality_only",
                switchPreferenceCompat: {
                    title: "Show Preferred Quality Only",
                    summary: "If enabled, only shows the selected quality. If disabled, shows all available qualities.",
                    value: true,
                }
            }
        ];
    }
}
