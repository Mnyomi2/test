const mangayomiSources = [{
    "name": "AnimeOnsen",
    "id": 6902788326284542000,
    "lang": "all",
    "baseUrl": "https://animeonsen.xyz",
    "apiUrl": "https://api.animeonsen.xyz/v4",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://animeonsen.xyz",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.3.3",
    "pkgPath": "anime/src/all/animeonsen.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://api.animeonsen.xyz/v4";
        this.AO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
        
        // This static token might expire. If the source stops working, it may need to be updated.
        this.STATIC_BEARER_TOKEN = "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlZmF1bHQifQ.eyJpc3MiOiJodHRwczovL2F1dGguYW5pbWVvbnNlbi54eXovIiwiYXVkIjoiaHR0cHM6Ly9hcGkuYW5pbWVvbnNlbi54eXoiLCJpYXQiOjE3NTU0NTgzOTIsImV4cCI6MTc1NjA2MzE5Miwic3ViIjoiMDZkMjJiOTYtNjNlNy00NmE5LTgwZmMtZGM0NDFkNDFjMDM4LmNsaWVudCIsImF6cCI6IjA2ZDIyYjk2LTYzZTctNDZhOS04MGZjLWRjNDQxZDQxYzAzOCIsImd0eSI6ImNsaWVudF9jcmVkZW50aWFscyJ9.mjnUcC4AWhmIcdLsAjOEs4_BnvaYwGevp3uGN-BNrWnFlWW3csvchnYfIZYSM2WsUG690EtI3URWBLtOVCrGlRNHlRv50Jhc_-il2phCOOyZCIjqUWVU0hD9myIF-KycJo_UD9ETi3agXw7AlR_BeOmMmtug2_jpCcAUuFAGbvCsOo32DJVs2eAhVw27tudLvq-UBtA6OLY9jpSKmkgEr8LTcJY7gZ2s5Zr0pAGNicseOGwSpb1aWJ1bMpVCkbmYH1OEYrgN1P9BvaZq5ct9vaDIAqw7P5Dqh4wD_ObAJ5Dt-pL84GXI-W6mHyOZMgaqNt46OyCxK8Ue2n5RgQdHBw";
    }

    get supportsLatest() {
        return false;
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        const headers = {
            "User-Agent": this.AO_USER_AGENT,
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "Accept": "application/json, text/plain, */*",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
        };

        if (url.includes(this.apiUrl) && !url.includes("/image/")) {
            headers["Authorization"] = this.STATIC_BEARER_TOKEN;
        }
        return headers;
    }

    async getPopular(page) {
        const limit = 30;
        const start = (page - 1) * limit;
        const url = `${this.apiUrl}/content/index?start=${start}&limit=${limit}`;

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
        throw new Error("This source does not support latest updates.");
    }

    async search(query, page, filters) {
        if (page > 1) {
            return { list: [], hasNextPage: false };
        }
        const encodedQuery = encodeURIComponent(query);
        const url = `${this.apiUrl}/search/${encodedQuery}`;
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
        const detailRes = await this.client.get(detailUrl, this.getHeaders(detailUrl));
        const details = JSON.parse(detailRes.body);

        const name = details.content_title || details.content_title_en;
        const imageUrl = `${this.apiUrl}/image/210x300/${details.content_id}`;
        const link = `${this.getBaseUrl()}/details/${details.content_id}`;
        const description = details.mal_data?.synopsis || null;
        const author = details.mal_data?.studios?.map(s => s.name).join(', ') || null;
        const genre = details.mal_data?.genres?.map(g => g.name) || [];
        
        const statusText = details.mal_data?.status?.trim();
        let status;
        if (statusText === "finished_airing") {
            status = 1;
        } else if (statusText === "currently_airing") {
            status = 0;
        } else {
            status = 5;
        }
        
        const episodesUrl = `${this.apiUrl}/content/${url}/episodes`;
        const episodesRes = await this.client.get(episodesUrl, this.getHeaders(episodesUrl));
        const episodesData = JSON.parse(episodesRes.body);

        let chapters = Object.entries(episodesData).map(([epNum, item]) => ({
            name: `Episode ${epNum}: ${item.contentTitle_episode_en}`,
            url: `${url}/video/${epNum}`,
            episode: parseFloat(epNum)
        }));

        chapters = chapters.sort((a, b) => b.episode - a.episode);

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
        
        // Simplified sorting: Prioritize English ('en-US') if it exists.
        subtitles.sort((a, b) => {
            if (a.langPrefix === 'en-US' && b.langPrefix !== 'en-US') return -1;
            if (b.langPrefix === 'en-US' && a.langPrefix !== 'en-US') return 1;
            return 0; // Keep original order for other languages
        });

        const defaultVideo = {
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "Default (DASH)",
            headers: this.getHeaders(streamUrl),
            subtitles: subtitles
        };

        if (!this.getPreference("extract_qualities")) {
            return [defaultVideo];
        }

        const finalVideos = [];
        try {
            const manifestContent = (await this.client.get(streamUrl, this.getHeaders(streamUrl))).body;
            const regex = /<Representation.*?height="(\d+)"/g;
            let match;
            const qualities = new Set();

            while ((match = regex.exec(manifestContent)) !== null) {
                qualities.add(parseInt(match[1]));
            }

            if (qualities.size > 0) {
                finalVideos.push(defaultVideo);
                const sortedQualities = [...qualities].sort((a, b) => b - a);
                sortedQualities.forEach(height => {
                    finalVideos.push({
                        ...defaultVideo,
                        quality: `${height}p`
                    });
                });
                return finalVideos;
            } else {
                return [defaultVideo];
            }
        } catch (e) {
            return [defaultVideo];
        }
    }
    
    getFilterList() {
        return [];
    }
    
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Use a different mirror/domain for the source. Requires app restart.",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: `Default: ${this.source.baseUrl}`,
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: {
                title: "Enable Stream Quality Extraction",
                summary: "If a stream provides multiple qualities, this will list them. (e.g. 1080p, 720p)",
                value: true,
            }
        }];
    }
}