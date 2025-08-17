const mangayomiSources = [{
    "name": "RouVideo (肉視頻)",
    "id": 543219876,
    "lang": "all",
    "baseUrl": "https://rou.video",
    "iconUrl": "https://rou.video/favicon.ico",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "isNsfw": true,
    "pkgPath": "anime/src/all/rouvideo.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://rou.video/api";
    }

    // Helper to create headers for API calls
    _getApiHeaders() {
        return {
            "Accept": "application/json, text/plain, */*",
            "Origin": this.source.baseUrl,
            "Referer": `${this.source.baseUrl}/`,
        };
    }

    // Helper to extract JSON from the __NEXT_DATA__ script tag in HTML
    _parseJsonFromHtml(html) {
        try {
            const scriptData = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            if (scriptData && scriptData[1]) {
                return JSON.parse(scriptData[1]);
            }
        } catch (e) {
            // Error parsing JSON, return null
        }
        return null;
    }

    // Helper to map the API's video object to Mangayomi's list item format
    _mapVideoToListItem(video) {
        return {
            name: video.title,
            link: `${this.source.baseUrl}/v/${video.id}`, // Link to the detail page
            imageUrl: video.coverUrl
        };
    }

    // Helper to parse a list page (popular, latest, search)
    _parseVideoListPage(json) {
        if (!json || !json.props || !json.props.pageProps) {
            return { list: [], hasNextPage: false };
        }
        const pageProps = json.props.pageProps;
        const videos = pageProps.videos || [];
        
        const list = videos.map(this._mapVideoToListItem);
        const hasNextPage = (pageProps.page || 1) < (pageProps.lastPage || 1);

        return { list, hasNextPage };
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/v?order=like&page=${page}`;
        const res = await this.client.get(url);
        const json = this._parseJsonFromHtml(res.body);
        return this._parseVideoListPage(json);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/v?order=latest&page=${page}`;
        const res = await this.client.get(url);
        const json = this._parseJsonFromHtml(res.body);
        return this._parseVideoListPage(json);
    }

    async search(query, page, filters) {
        const categoryFilter = filters.find(f => f.name === "Category");
        const categoryValue = categoryFilter ? categoryFilter.values[categoryFilter.state].value : "featured";

        let url;
        // Handle text search query
        if (query) {
            url = `${this.source.baseUrl}/search?q=${encodeURIComponent(query)}&page=${page}`;
            if (categoryValue && categoryValue !== "featured" && categoryValue !== "watching") {
                url += `&t=${categoryValue}`; // Add category to search
            }
            const res = await this.client.get(url);
            const json = this._parseJsonFromHtml(res.body);
            return this._parseVideoListPage(json);
        }

        // Handle category browsing (no text query)
        if (categoryValue === "watching") {
            const res = await this.client.get(`${this.apiUrl}/v/watching`, this._getApiHeaders());
            const videos = JSON.parse(res.body);
            const list = videos.map(this._mapVideoToListItem);
            return { list, hasNextPage: false }; // 'Watching' is a single list, no pagination
        } else if (categoryValue === "featured") {
            const res = await this.client.get(`${this.source.baseUrl}/home`);
            const json = this._parseJsonFromHtml(res.body);
            if (!json || !json.props || !json.props.pageProps) return { list: [], hasNextPage: false };
            const videos = json.props.pageProps.hotVideos || [];
            const list = videos.map(this._mapVideoToListItem);
            return { list, hasNextPage: false };
        } else {
            url = `${this.source.baseUrl}/t/${categoryValue}?page=${page}`;
            const res = await this.client.get(url);
            const json = this._parseJsonFromHtml(res.body);
            return this._parseVideoListPage(json);
        }
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const json = this._parseJsonFromHtml(res.body);
        if (!json || !json.props || !json.props.pageProps || !json.props.pageProps.video) {
            throw new Error("Could not parse video details.");
        }
        
        const video = json.props.pageProps.video;
        const videoId = video.id;

        let description = `${video.description}\n\n`;
        description += `Views: ${video.views}\n`;
        description += `Likes: ${video.likeCount}\n`;
        if (video.tags && video.tags.length > 0) {
            description += `Tags: ${video.tags.map(t => t.name).join(', ')}`;
        }

        return {
            name: video.title,
            imageUrl: video.coverUrl,
            description: description.trim(),
            link: url,
            chapters: [{
                name: "Video",
                // Pass the API URL to getVideoList, not the HTML page URL
                url: `${this.apiUrl}/v/${videoId}`
            }],
        };
    }

    async _parseHlsPlaylist(playlistUrl, referer) {
        try {
            const res = await this.client.get(playlistUrl, { "Referer": referer });
            const masterPlaylist = res.body;
            const videoList = [];
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);

            const streamRegex = /#EXT-X-STREAM-INF:.*?RESOLUTION=\d+x(\d+).*?\n(.*?)\s/g;
            let match;
            while ((match = streamRegex.exec(masterPlaylist)) !== null) {
                const quality = `${match[1]}p`;
                let streamUrl = match[2];
                if (!streamUrl.startsWith("http")) {
                    streamUrl = baseUrl + streamUrl;
                }
                videoList.push({
                    url: streamUrl,
                    originalUrl: streamUrl,
                    quality: quality,
                });
            }
            // If parsing fails or it's not a master playlist, return the original URL as a fallback
            if (videoList.length === 0) {
                 return [{ url: playlistUrl, originalUrl: playlistUrl, quality: "Default" }];
            }
             // Sort by quality descending (e.g., 1080p, 720p...)
            return videoList.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        } catch (e) {
            return [{ url: playlistUrl, originalUrl: playlistUrl, quality: "Failsafe" }];
        }
    }

    async getVideoList(url) {
        // 'url' is the API URL from getDetail
        const res = await this.client.get(url, this._getApiHeaders());
        const data = JSON.parse(res.body);
        const hlsUrl = data.video.videoUrl;

        if (!hlsUrl) {
            throw new Error("Video URL not found in API response.");
        }
        
        return this._parseHlsPlaylist(hlsUrl, `${this.source.baseUrl}/`);
    }

    getFilterList() {
        // Hardcoded categories based on the Kotlin source's filter options
        const categories = [
            { name: "Featured (推荐)", value: "featured" },
            { name: "Watching (观看中)", value: "watching" },
            { name: "Asian (亚洲)", value: "asian" },
            { name: "Western (欧美)", value: "western" },
            { name: "Anime (动漫)", value: "anime" },
            { name: "Chinese (国产)", value: "chinese" },
            { name: "Mature (熟女)", value: "mature" },
            { name: "Amateur (素人)", value: "amateur" },
        ];
        
        return [{
            type_name: "SelectFilter",
            name: "Category",
            state: 0,
            values: categories.map(cat => ({
                type_name: "SelectOption",
                name: cat.name,
                value: cat.value
            }))
        }];
    }
}