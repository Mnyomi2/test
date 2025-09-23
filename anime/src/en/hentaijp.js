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

    _parseList(html) {
        const doc = new Document(html);
        const list = [];
        const items = doc.select("article.thumb-block");

        for (const item of items) {
            const linkElement = item.selectFirst("a");
            const imgElement = item.selectFirst(".post-thumbnail img");

            if (linkElement && imgElement) {
                const link = linkElement.attr("href");
                const name = linkElement.attr("title"); // Use title attribute which is consistently available
                const imageUrl = imgElement.attr("data-src") || imgElement.attr("src");

                list.push({ name, link, imageUrl });
            }
        }

        const hasNextPage = doc.selectFirst("a:contains(Next)") != null;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const url = page === 1 ?
            `${this.source.baseUrl}/category/engsub/?filter=latest` :
            `${this.source.baseUrl}/category/engsub/page/${page}/?filter=latest`;
        const res = await this.client.get(url);
        return this._parseList(res.body);
    }

    async getLatestUpdates(page) {
        const url = page === 1 ?
            `${this.source.baseUrl}/category/new-releases/?filter=latest` :
            `${this.source.baseUrl}/category/new-releases/page/${page}/?filter=latest`;
        const res = await this.client.get(url);
        return this._parseList(res.body);
    }

    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        const res = await this.client.get(url);
        return this._parseList(res.body);
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const name = doc.selectFirst("header.entry-header h1").text;
        const imageUrl = doc.selectFirst("meta[property='og:image']").attr("content");
        const genres = doc.select(".video-tags .tags-list a").map(e => e.text);
        
        const description = `Genres: ${genres.join(", ")}`;

        return {
            name: name,
            imageUrl: imageUrl,
            description: description,
            link: url,
            chapters: [{
                name: "Episode",
                url: url
            }],
            status: 0 // Completed
        };
    }

    async _extractDoodstreamVideos(url) {
        const videoList = [];
        try {
            const res = await this.client.get(url, { headers: { "Referer": this.source.baseUrl } });
            
            // Method 1: AJAX API call from script
            let apiMatch = res.body.match(/url:\s*"(\/\/(?:doodst\.com|doodstream\.cv)\/api\/[^"]+)"/);
            if (apiMatch) {
                const apiUrl = `https:${apiMatch[1]}`;
                const apiRes = await this.client.get(apiUrl, { headers: { "Referer": url } });
                const data = JSON.parse(apiRes.body);

                if (data.status === "ok" && data.sources) {
                    return data.sources.map(source => ({
                        url: `https:${source.file}`,
                        originalUrl: `https:${source.file}`,
                        quality: source.label,
                    }));
                }
            }

            // Method 2: Direct sources array in script
            const sourcesMatch = res.body.match(/sources:\s*(\[.*?\]),/);
            if (sourcesMatch) {
                const sources = JSON.parse(sourcesMatch[1]);
                return sources.map(source => ({
                    url: `https:${source.file}`,
                    originalUrl: `https:${source.file}`,
                    quality: source.label,
                }));
            }
        } catch (e) {
            console.error(`Error extracting from Doodstream URL ${url}: ${e}`);
        }
        return videoList;
    }

    async getVideoList(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const videoList = [];
        const serverButtons = doc.select(".list-server ul li button");

        for (const button of serverButtons) {
            const serverName = button.text.trim();
            if (button.hasAttr("data-embed")) {
                const embedHtml = button.attr("data-embed");
                const embedMatch = embedHtml.match(/src="([^"]+)"/);

                if (embedMatch) {
                    let embedUrl = embedMatch[1];
                    if (embedUrl.startsWith("//")) {
                        embedUrl = `https:${embedUrl}`;
                    }
                    
                    if (embedUrl.includes("doodst.com") || embedUrl.includes("doodstream.cv")) {
                        const doodVideos = await this._extractDoodstreamVideos(embedUrl);
                        for (const video of doodVideos) {
                            video.quality = `${serverName}: ${video.quality}`;
                            videoList.push(video);
                        }
                    } else {
                        // Fallback for other servers
                        videoList.push({
                            url: embedUrl,
                            originalUrl: embedUrl,
                            quality: serverName,
                        });
                    }
                }
            }
        }
        
        // Sort by quality to have higher resolutions first
        return videoList.sort((a, b) => (b.quality || "").localeCompare(a.quality || ""));
    }

    getFilterList() {
        return [];
    }
    
    getSourcePreferences() {
        return [];
    }
}
