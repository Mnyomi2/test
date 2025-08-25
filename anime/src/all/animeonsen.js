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
        this.AO_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0";
        
        // This static token might expire. If the source stops working, it may need to be updated.
        this.STATIC_BEARER_TOKEN = "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlZmF1bHQifQ.eyJpc3MiOiJodHRwczovL2F1dGguYW5pbWVvbnNlbi54eXovIiwiYXVkIjoiaHR0cHM6Ly9hcGkuYW5pbWVvbnNlbi54eXoiLCJpYXQiOjE3NTYxNTUyMjksImV4cCI6MTc1Njc2MDAyOSwic3ViIjoiMDZkMjJiOTYtNjNlNy00NmE5LTgwZmMtZGM0NDFkNDFjMDM4LmNsaWVudCIsImF6cCI6IjA2ZDIyYjk2LTYzZTctNDZhOS04MGZjLWRjNDQxZDQxYzAzOCIsImd0eSI6ImNsaWVudF9jcmVkZW50aWFscyJ9.q8sO_RW-u7EX7TTLJoNzVVB02br8DgZJrX4buZ2hAvRnSXOwHYSzqv3uO98bBI-3To1SdpkLSsmlyBj30a-9EqaOxcZ015W3WiAGf8_3_Qw2jHnX2G_OQNy_nEV7YR5LA4FqBgGKTaknKz-Xhq9IGwJf9p6uIQ734U9P9WXX7Bz-Z23l9CbK27MPt_6nz8oAk0R9pxKpe9jtYh45DnBD8MpCy1WqC7zOh_Y-tjLaetWYEA4xr6Upy0rlxnAgENeUmHe4HPfIS5ggy4LouXCs94xlGL8SjoUNTbontMidwHARUR96mz_4LhX8NvCqYq2jrC5VlJr2LzUIpiR0KJO18A";
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

        const items = data?.content || [];
        const list = items.map(item => ({
            name: item.content_title || item.content_title_en,
            link: item.content_id,
            imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}.webp`
        }));
        const hasNextPage = data?.cursor?.next?.[0] === true;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        if (page > 1) {
            return { list: [], hasNextPage: false };
        }

        const url = `${this.apiUrl}/content/index/recent/spotlight`;
        const res = await this.client.get(url, this.getHeaders(url));
        const data = JSON.parse(res.body);
        
        const items = Array.isArray(data) ? data : [];
        const list = items.map(item => ({
            name: item.content_title || item.content_title_en,
            link: item.content_id,
            imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}.webp`
        }));
        
        return { list, hasNextPage: false };
    }

    async search(query, page, filters) {
        let genre = "";
        const genreFilter = filters?.find(f => f.name === "Genre");
        if (genreFilter && genreFilter.state > 0) {
            genre = genreFilter.values[genreFilter.state].value;
        }

        if (query) {
            if (page > 1) return { list: [], hasNextPage: false };
            const url = `${this.apiUrl}/search/${encodeURIComponent(query)}`;
            const res = await this.client.get(url, this.getHeaders(url));
            const data = JSON.parse(res.body);
            const items = data?.result || [];
            const list = items.map(item => ({
                name: item.content_title || item.content_title_en,
                link: item.content_id,
                imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}.webp`
            }));
            return { list, hasNextPage: false };
        }

        if (genre) {
            const limit = 30;
            const start = (page - 1) * limit;
            const url = `${this.apiUrl}/content/index/genre/${genre}?start=${start}&limit=${limit}`;
            const res = await this.client.get(url, this.getHeaders(url));
            const data = JSON.parse(res.body);
            // FIX: Genre endpoint returns a `result` array, not a `content` array.
            const items = data?.result || [];
            const list = items.map(item => ({
                name: item.content_title || item.content_title_en,
                link: item.content_id,
                imageUrl: `${this.apiUrl}/image/210x300/${item.content_id}.webp`
            }));
            // FIX: Genre endpoint does not provide a cursor, so infer `hasNextPage`.
            const hasNextPage = list.length === limit;
            return { list, hasNextPage };
        }

        return this.getPopular(page);
    }

    async getDetail(url) {
        const detailUrl = `${this.apiUrl}/content/${url}/extensive`;
        const detailRes = await this.client.get(detailUrl, this.getHeaders(detailUrl));
        const details = JSON.parse(detailRes.body);

        const name = details.content_title || details.content_title_en;
        const imageUrl = `${this.apiUrl}/image/210x300/${details.content_id}.webp`;
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
        
        subtitles.sort((a, b) => {
            if (a.langPrefix === 'en-US') return -1;
            if (b.langPrefix === 'en-US') return 1;
            return 0;
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
        const genres = [
            { name: "Any", value: "" }, { name: "Action", value: "action" },
            { name: "Adult Cast", value: "adult-cast" }, { name: "Adventure", value: "adventure" },
            { name: "Anthropomorphic", value: "anthropomorphic" }, { name: "Avant Garde", value: "avant-garde" },
            { name: "Award Winning", value: "award-winning" }, { name: "Childcare", value: "childcare" },
            { name: "Combat Sports", value: "combat-sports" }, { name: "Comedy", value: "comedy" },
            { name: "Cute Girls Doing Cute Things", value: "cgdct" }, { name: "Delinquents", value: "delinquents" },
            { name: "Detective", value: "detective" }, { name: "Drama", value: "drama" },
            { name: "Ecchi", value: "ecchi" }, { name: "Fantasy", value: "fantasy" },
            { name: "Gag Humor", value: "gag-humor" }, { name: "Gore", value: "gore" },
            { name: "Gourmet", value: "gourmet" }, { name: "Harem", value: "harem" },
            { name: "High Stakes Game", value: "high-stakes-game" }, { name: "Historical", value: "historical" },
            { name: "Horror", value: "horror" }, { name: "Idols (Male)", value: "idols-male" },
            { name: "Isekai", value: "isekai" }, { name: "Iyashikei", value: "iyashikei" },
            { name: "Love Polygon", value: "love-polygon" }, { name: "Magical Sex Shift", value: "magical-sex-shift" },
            { name: "Martial Arts", value: "martial-arts" }, { name: "Mecha", value: "mecha" },
            { name: "Medical", value: "medical" }, { name: "Military", value: "military" },
            { name: "Music", value: "music" }, { name: "Mystery", value: "mystery" },
            { name: "Mythology", value: "mythology" }, { name: "Organized Crime", value: "organized-crime" },
            { name: "Otaku Culture", value: "otaku-culture" }, { name: "Parody", value: "parody" },
            { name: "Performing Arts", value: "performing-arts" }, { name: "Pets", value: "pets" },
            { name: "Psychological", value: "psychological" }, { name: "Racing", value: "racing" },
            { name: "Reincarnation", value: "reincarnation" }, { name: "Reverse Harem", value: "reverse-harem" },
            { name: "Romance", value: "romance" }, { name: "Romantic Subtext", value: "romantic-subtext" },
            { name: "Samurai", value: "samurai" }, { name: "School", value: "school" },
            { name: "Sci-Fi", value: "sci-fi" }, { name: "Seinen", value: "seinen" },
            { name: "Shoujo", value: "shoujo" }, { name: "Shoujo Ai", value: "shoujo-ai" },
            { name: "Shounen", value: "shounen" }, { name: "Slice of Life", value: "slice-of-life" },
            { name: "Space", value: "space" }, { name: "Sports", value: "sports" },
            { name: "Strategy Game", value: "strategy-game" }, { name: "Super Power", value: "super-power" },
            { name: "Supernatural", value: "supernatural" }, { name: "Survival", value: "survival" },
            { name: "Suspense", value: "suspense" }, { name: "Team Sports", value: "team-sports" },
            { name: "Time Travel", value: "time-travel" }, { name: "Vampire", value: "vampire" },
            { name: "Video Game", value: "video-game" }, { name: "Visual Arts", value: "visual-arts" },
            { name: "Workplace", value: "workplace" }
        ];

        return [{
            type_name: "SelectFilter",
            name: "Genre",
            state: 0,
            values: genres.map(g => ({ type_name: "SelectOption", name: g.name, value: g.value }))
        }];
    }
    
    getSourcePreferences() {
        return [{
            key: "enable_latest_tab",
            switchPreferenceCompat: {
                title: "Enable 'Latest' Tab",
                summary: "Toggles the visibility of the 'Latest' tab.",
                value: false,
            }
        }, {
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
                value: false,
            }
        }];
    }
}
