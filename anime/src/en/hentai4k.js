const mangayomiSources = [{
    "name": "Hentai4K",
    "id": 6901835741833131337,
    "lang": "en",
    "baseUrl": "https://hentai4k.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai4k.com",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentai4k.js"
}];


class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return this.getPreference("enable_latest_tab");
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }
    
    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        const pagePath = page > 1 ? `${page}/` : '';
        const url = `${this.getBaseUrl()}/most-popular/${pagePath}`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const pagePath = page > 1 ? `${page}/` : '';
        const url = `${this.getBaseUrl()}/latest-updates/${pagePath}`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        // Filters are not supported for this source
        const pageParam = page > 1 ? `?from_videos=${page}` : '';
        const url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}/${pageParam}`;
        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        
        const items = doc.select("div.thumb.item");
        for (const item of items) {
            const a = item.selectFirst("a");
            if (!a) continue;

            const name = a.attr("title").trim();
            const link = a.getHref;
            const imageUrl = a.selectFirst("img")?.getSrc;

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }
        
        const hasNextPage = doc.selectFirst("a.next") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("h1.title").text.trim();
        
        let imageUrl = doc.selectFirst("div.block-screenshots img")?.getSrc; // Fallback
        const scriptContent = doc.selectFirst('script:contains("flashvars")')?.text;
        if (scriptContent) {
            const imageUrlMatch = scriptContent.match(/preview_url:\s*'([^']*)'/);
            if (imageUrlMatch && imageUrlMatch[1]) {
                imageUrl = imageUrlMatch[1];
            }
        }

        const description = "";
        const link = url;
        const status = 1; // Completed

        const genre = [];
        const genreElements = doc.select("div.top-options a.btn");
        for (const element of genreElements) {
            const text = element.text.trim();
            if (text) {
                genre.push(text);
            }
        }

        const chapters = [{ name: "Watch", url: url }];

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const videoId = url.match(/\/videos\/(\d+)\//)?.[1];
        if (!videoId) return [];

        const embedUrl = `${this.getBaseUrl()}/embed/${videoId}`;
        const res = await this.client.get(embedUrl, this.getHeaders(url));
        const scriptContent = res.body;

        const configMatch = scriptContent.match(/var\s+\w+\s*=\s*({[\s\S]*?});/);
        if (!configMatch) return [];

        const configStr = configMatch[1];
        const videoList = [];

        const group = Math.floor(parseInt(videoId) / 1000) * 1000;
        const videoBaseUrl = `https://i.hentai4k.com/videos/${group}/${videoId}/${videoId}`;
        
        const qualities = {
            '2160p': 'preview_url4',
            '1080p': 'preview_url3',
            '720p': 'preview_url2',
            '480p': 'preview_url1',
        };

        for (const [quality, key] of Object.entries(qualities)) {
            if (configStr.includes(`'${key}'`)) {
                const videoUrl = quality === '480p' 
                    ? `${videoBaseUrl}.mp4` 
                    : `${videoBaseUrl}_${quality}.mp4`;
                
                videoList.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: quality,
                    headers: this.getHeaders(videoUrl)
                });
            }
        }

        return videoList;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Toggles the visibility of the 'Latest' tab for this source.",
                    value: true,
                }
            },
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source",
                    value: this.source.baseUrl,
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}
