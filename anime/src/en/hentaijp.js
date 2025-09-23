const mangayomiSources = [{
    "name": "Hentai JP",
    "id": 6902934818,
    "lang": "en",
    "baseUrl": "https://hentai-jp.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai-jp.com",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.1",
    "pkgPath": "anime/src/en/hentaijp.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getBaseUrl() {
        return this.source.baseUrl.trim();
    }

    getHeaders() {
        return {
            "Referer": this.getBaseUrl()
        };
    }

    _parseAnimeFromElement(element) {
        const a = element.selectFirst("a");
        const link = a.getHref.replace(this.getBaseUrl(), "");
        const name = a.attr("data-title");
        const img = a.selectFirst("img");
        let imageUrl = img.attr("data-src") || img.getSrc;
        
        if (imageUrl && !imageUrl.startsWith("http")) {
            if (imageUrl.startsWith("//")) {
                imageUrl = "https:" + imageUrl;
            } else {
                imageUrl = this.getBaseUrl() + imageUrl;
            }
        }
        return { name, imageUrl, link };
    }

    async _getAnimePage(path) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(baseUrl + path, this.getHeaders());
        const doc = new Document(res.body);
        const list = doc.select("article.thumb-block").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("a:contains(Next)");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const pagePath = page > 1 ? `page/${page}/` : '';
        return this._getAnimePage(`/category/engsub/${pagePath}?filter=latest`);
    }

    async getLatestUpdates(page) {
        const pagePath = page > 1 ? `page/${page}/` : '';
        return this._getAnimePage(`/category/new-releases/${pagePath}?filter=latest`);
    }

    async search(query, page, filters) {
        const pagePath = page > 1 ? `/page/${page}/` : '';
        const url = `${this.getBaseUrl()}${pagePath}?s=${encodeURIComponent(query)}`;
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = doc.select("article.thumb-block").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("a:contains(Next)");
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const baseUrl = this.getBaseUrl();
        const detailPageUrl = baseUrl + url;
        const res = await this.client.get(detailPageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("header.entry-header h1").text.trim();
        const genre = doc.select("div.video-tags a.label").map(el => el.text.trim());
        const status = 1; // Completed, as each post is a single episode.
        
        // The site lists each episode as a separate post. There are no series pages.
        // Therefore, the "chapters" list will only contain the episode itself.
        const chapters = [{ name: name, url: url }];

        return {
            name,
            genre,
            status,
            chapters,
            link: detailPageUrl,
            description: "" // No description available on the page.
        };
    }

    async getVideoList(url) {
        const baseUrl = this.getBaseUrl();
        const episodePageUrl = baseUrl + url;
        const res = await this.client.get(episodePageUrl, this.getHeaders());
        const doc = new Document(res.body);
        let videos = [];

        const scripts = doc.select("script");
        for (const script of scripts) {
            const scriptText = script.html;
            if (scriptText.includes("jwpConfig")) {
                // Priority 1: Get direct video links from embedded sources in the script
                const sourcesMatch = scriptText.match(/sources:\s*(\[.*?\])/);
                if (sourcesMatch && sourcesMatch[1]) {
                    try {
                        const sourcesArray = JSON.parse(sourcesMatch[1]);
                        for (const source of sourcesArray) {
                            let fileUrl = source.file;
                            if (fileUrl.startsWith("//")) {
                                fileUrl = "https:" + fileUrl;
                            }
                            videos.push({ url: fileUrl, originalUrl: fileUrl, quality: source.label });
                        }
                    } catch (e) { /* Parsing failed, try next method */ }
                }

                if (videos.length > 0) break; // Found sources, no need to check other scripts

                // Priority 2: Get video links from an API call URL in the script
                const apiMatch = scriptText.match(/url:\s*"([^"]+)"/);
                if (apiMatch && apiMatch[1] && apiMatch[1].includes("/api/")) {
                    try {
                        let apiUrl = apiMatch[1];
                        if (apiUrl.startsWith("//")) {
                             apiUrl = "https:" + apiUrl;
                        }
                        const apiRes = await this.client.get(apiUrl, this.getHeaders());
                        const apiData = JSON.parse(apiRes.body);
                        if (apiData.status === "ok" && apiData.sources) {
                           for (const source of apiData.sources) {
                               let fileUrl = source.file;
                               if (fileUrl.startsWith("//")) {
                                   fileUrl = "https:" + fileUrl;
                               }
                               videos.push({ url: fileUrl, originalUrl: fileUrl, quality: source.label });
                           }
                        }
                    } catch (e) { /* API call failed, try next method */ }
                }
                if (videos.length > 0) break;
            }
        }
        
        // Fallback: If no direct links found, get embed URLs from server buttons
        if (videos.length === 0) {
            const buttons = doc.select("div.text-center.list-server li button");
            for (const button of buttons) {
                const embedHtml = button.attr("data-embed");
                const srcMatch = embedHtml.match(/src=(?:"|&quot;)([^"&]+)/);
                if (srcMatch && srcMatch[1]) {
                    let embedUrl = srcMatch[1];
                    if (embedUrl.startsWith("//")) {
                        embedUrl = "https:" + embedUrl;
                    }
                    const serverName = button.text.trim();
                    videos.push({ url: embedUrl, originalUrl: embedUrl, quality: serverName });
                }
            }
        }

        // Filter out low-quality "Default" if other qualities exist, and sort by quality
        const filteredVideos = videos.filter(v => v.quality !== "Default" || videos.length === 1);
        return filteredVideos.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    }

    // This source does not support filters.
    getFilterList() {
        return [];
    }

    // Preferences are not needed for this source.
    getSourcePreferences() {
        return [];
    }
}