const mangayomiSources = [{
    "name": "AnimeOnsen",
    "id": 6902788326284542000,
    "lang": "all",
    "baseUrl": "https://animeonsen.xyz",
    "apiUrl": "https://api.animeonsen.xyz/v4",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://animeonsen.xyz",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/all/animeonsen.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://api.animeonsen.xyz/v4";
        this.AO_API_KEY = "3246734277686144";
        this.AO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.4044.138 Safari/537.36";
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.source.baseUrl;
    }

    getHeaders(url) {
        const headers = {
            "User-Agent": this.AO_USER_AGENT,
            "Referer": this.getBaseUrl(),
        };
        if (url.includes(this.apiUrl)) {
            headers["apikey"] = this.AO_API_KEY;
        }
        return headers;
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.apiUrl}/content/index?start=${(page - 1) * 20}&limit=20`;
        const res = await this.client.get(url, this.getHeaders(url));
        const data = JSON.parse(res.body);

        const list = data.content.map(item => ({
            name: item.content_title || item.content_title_en,
            link: item.content_id,
            imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}`
        }));

        const hasNextPage = data.cursor.next && data.cursor.next[0] === true;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        throw new Error("Not supported");
    }

    async search(query, page, filters) {
        // Search is not paginated by the source
        if (page > 1) {
            return { list: [], hasNextPage: false };
        }
        const url = `${this.apiUrl}/search/${query}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const data = JSON.parse(res.body);

        const list = data.result.map(item => ({
            name: item.content_title || item.content_title_en,
            link: item.content_id,
            imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}`
        }));
        
        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        const detailUrl = `${this.apiUrl}/content/${url}/extensive`;
        const episodesUrl = `${this.apiUrl}/content/${url}/episodes`;

        const detailRes = await this.client.get(detailUrl, this.getHeaders(detailUrl));
        const details = JSON.parse(detailRes.body);

        const name = details.content_title || details.content_title_en;
        const imageUrl = `${this.apiUrl}/image/210x300/${details.content_id}`;
        const link = `${this.getBaseUrl()}/details/${details.content_id}`;
        const description = details.mal_data?.synopsis || null;
        const author = details.mal_data?.studios?.map(s => s.name).join(', ') || null;
        const genre = details.mal_data?.genres?.map(g => g.name) || [];
        
        const statusText = details.mal_data?.status?.trim();
        let status = 5; // Unknown
        if (statusText === "finished_airing") {
            status = 1; // Completed
        } else if (statusText === "currently_airing") {
            status = 0; // Ongoing
        }

        const episodesRes = await this.client.get(episodesUrl, this.getHeaders(episodesUrl));
        const episodesData = JSON.parse(episodesRes.body);

        const chapters = Object.entries(episodesData).map(([epNum, item]) => ({
            name: `Episode ${epNum}: ${item.name}`,
            url: `${url}/video/${epNum}`,
            episode: parseFloat(epNum)
        }));

        chapters.sort((a, b) => b.episode - a.episode);

        return { name, imageUrl, description, link, status, genre, author, chapters };
    }

    async getVideoList(url) {
        const videoUrl = `${this.apiUrl}/content/${url}`;
        const res = await this.client.get(videoUrl, this.getHeaders(videoUrl));
        const videoData = JSON.parse(res.body);

        const streamUrl = videoData.uri.stream;
        const subtitleLangs = videoData.metadata.subtitles;

        let subtitles = Object.entries(videoData.uri.subtitles).map(([langPrefix, subUrl]) => ({
            file: subUrl,
            label: subtitleLangs[langPrefix] || langPrefix,
            langPrefix: langPrefix
        }));

        // Sort subtitles based on preference
        const preferredLang = this.getPreference("preferred_sub_lang") || "en-US";
        subtitles = subtitles.sort((a, b) => {
            if (a.langPrefix === preferredLang) return -1;
            if (b.langPrefix === preferredLang) return 1;
            return 0;
        });

        const video = {
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "Default (720p)",
            headers: this.getHeaders(streamUrl),
            subtitles: subtitles
        };
        
        return [video];
    }
    
    getFilterList() {
        return [];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_sub_lang",
            listPreference: {
                title: "Preferred subtitle language",
                summary: "%s",
                valueIndex: 0,
                entries: ["English", "Spanish", "Portuguese", "French", "German", "Italian", "Russian", "Arabic"],
                entryValues: ["en-US", "es-LA", "pt-BR", "fr-FR", "de-DE", "it-IT", "ru-RU", "ar-ME"],
            }
        }];
    }
}