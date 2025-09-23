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
        if (!a) return null;
        
        const href = a.getHref;
        if (!href) return null;
        
        const name = a.attr("title") || a.attr("data-title");
        if (!name) return null;
        
        const link = href.replace(this.getBaseUrl(), "");

        const img = a.selectFirst("img");
        let imageUrl = "";
        if (img) {
            imageUrl = img.attr("data-src") || img.getSrc;
            if (imageUrl && !imageUrl.startsWith("http")) {
                imageUrl = imageUrl.startsWith("//") ? "https:" + imageUrl : this.getBaseUrl() + imageUrl;
            }
        }
       
        return { name, imageUrl: imageUrl || "", link };
    }

    async _getAnimePage(path) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(baseUrl + path, this.getHeaders());
        const doc = new Document(res.body);
        
        // Target items inside the specific container div for more accuracy.
        const list = doc.select("div.videos-list article.thumb-block")
            .map(el => this._parseAnimeFromElement(el))
            .filter(Boolean); // Safely remove any null entries to prevent crashes.

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
        
        const list = doc.select("div.videos-list article.thumb-block")
            .map(el => this._parseAnimeFromElement(el))
            .filter(Boolean); // Safely remove any null entries.

        const hasNextPage = !!doc.selectFirst("a:contains(Next)");
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const baseUrl = this.getBaseUrl();
        const detailPageUrl = baseUrl + url;
        const res = await this.client.get(detailPageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const titleElement = doc.selectFirst("header.entry-header h1");
        if (!titleElement) {
             throw new Error("Could not find title on page.");
        }
        const name = titleElement.text.trim();
        
        const genre = doc.select("div.video-tags a.label").map(el => el.text.trim());
        const status = 1; // Completed
        
        // Each post is a single episode, using the same URL as the detail page.
        const chapters = [{ name: name, url: url }];

        return {
            name,
            imageUrl: "", // App will use the thumbnail from the list view.
            genre,
            status,
            chapters,
            link: detailPageUrl,
            description: "" 
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
                const sourcesMatch = scriptText.match(/sources:\s*(\[.*?\])/);
                if (sourcesMatch && sourcesMatch[1]) {
                    try {
                        const sourcesArray = JSON.parse(sourcesMatch[1].replace(/\\/g, ''));
                        for (const source of sourcesArray) {
                            let fileUrl = source.file;
                            if (fileUrl.startsWith("//")) {
                                fileUrl = "https:" + fileUrl;
                            }
                            videos.push({ url: fileUrl, originalUrl: fileUrl, quality: source.label });
                        }
                    } catch (e) { /* Ignore parsing errors */ }
                }

                if (videos.length > 0) break;

                const apiMatch = scriptText.match(/url:\s*"(https?:)?\/\/([^"]+\/api\/[^"]+)"/);
                if (apiMatch) {
                    try {
                        let apiUrl = apiMatch[0].split('"')[1];
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
                    } catch (e) { /* Ignore API errors */ }
                }
                if (videos.length > 0) break;
            }
        }
        
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
        
        const qualityOrder = ["Original", "1080p", "720p", "360p", "Default"];
        const seenQualities = new Set();
        const uniqueVideos = videos.filter(video => {
            if (!video.quality || seenQualities.has(video.quality)) {
                return false;
            }
            seenQualities.add(video.quality);
            return true;
        });
        
        return uniqueVideos.sort((a, b) => {
            const indexA = qualityOrder.indexOf(a.quality);
            const indexB = qualityOrder.indexOf(b.quality);
            return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
        });
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [];
    }
}
