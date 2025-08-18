const mangayomiSources = [{
    "name": "Animeiat",
    "id": 1701240113941,
    "lang": "ar",
    "baseUrl": "https://animeiat.co",
    "apiUrl": "https://api.animeiat.co/v1",
    "iconUrl": "https://raw.githubusercontent.com/Mnyomi2/Mnyomi2/refs/heads/main/Mnyomi2/icon/animeiat.png",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/animeiat.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders(url) {
        return {
            "Referer": this.source.baseUrl,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- CORE METHODS ---

    /**
     * Helper to parse anime lists from API responses (Popular, Search, Latest)
     * @param {string} body The JSON response body.
     * @param {boolean} isFromStickyEndpoint This is true ONLY for the old sticky-episodes endpoint.
     * @returns {Object} An object with a list of anime and a boolean indicating if there's a next page.
     */
    parseAnimeList(body, isFromStickyEndpoint = false) {
        const responseJson = JSON.parse(body);
        // Gracefully handle if API response is invalid
        if (!responseJson || !responseJson.data || !responseJson.meta) {
            return { list: [], hasNextPage: false };
        }

        const list = responseJson.data.map(item => {
            // The sticky endpoint has a different structure ('title', 'episode slug')
            // The regular anime endpoint has ('anime_name', 'anime slug')
            const name = isFromStickyEndpoint ? item.title : item.anime_name;
            const link = isFromStickyEndpoint ?
                `/anime/${item.slug.split("-episode-")[0]}` :
                `/anime/${item.slug}`;
            const imageUrl = `https://api.animeiat.co/storage/${item.poster_path}`;
            return { name, imageUrl, link };
        });

        const hasNextPage = responseJson.meta.current_page < responseJson.meta.last_page;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        try {
            const url = `${this.source.apiUrl}/anime?page=${page}`;
            const res = await this.client.get(url, this.getHeaders(url));
            return this.parseAnimeList(res.body, false);
        } catch (e) {
            console.error(`Failed to get popular anime: ${e}`);
            return { list: [], hasNextPage: false };
        }
    }

    // --- START OF MODIFIED FUNCTION ---
    async getLatestUpdates(page) {
        try {
            // Changed the URL to fetch ongoing anime instead of sticky episodes.
            const url = `${this.source.apiUrl}/anime?page=${page}&status=ongoing`;
            const res = await this.client.get(url, this.getHeaders(url));
            // The response format is now the standard anime list, so the second argument is false.
            return this.parseAnimeList(res.body, false);
        } catch (e) {
            console.error(`Failed to get latest updates: ${e}`);
            return { list: [], hasNextPage: false };
        }
    }
    // --- END OF MODIFIED FUNCTION ---

    async search(query, page, filters) {
        try {
            let url;
            if (query) {
                url = `${this.source.apiUrl}/anime?q=${encodeURIComponent(query)}&page=${page}`;
            } else {
                let type = "";
                let status = "";

                for (const filter of filters) {
                    if (filter.type_name === "SelectFilter") {
                        const selectedValue = filter.values[filter.state].value;
                        if (filter.name === "النوع") type = selectedValue;
                        else if (filter.name === "الحالة") status = selectedValue;
                    }
                }

                url = `${this.source.apiUrl}/anime?page=${page}`;
                if (type) url += `&type=${type}`;
                if (status) url += `&status=${status}`;
            }

            const res = await this.client.get(url, this.getHeaders(url));
            return this.parseAnimeList(res.body, false);
        } catch (e) {
            console.error(`Failed to perform search: ${e}`);
            return { list: [], hasNextPage: false };
        }
    }

    async getDetail(url) {
        try {
            // Fetch anime details
            const detailUrl = `${this.source.apiUrl}${url}`;
            const detailRes = await this.client.get(detailUrl, this.getHeaders(detailUrl));
            const details = JSON.parse(detailRes.body).data;

            const name = details.anime_name;
            const imageUrl = `https://api.animeiat.co/storage/${details.poster_path}`;
            const description = details.story;
            const link = url;
            const statusMap = { "ongoing": 0, "completed": 1 };
            const status = statusMap[details.status] ?? 5; // 5 = UNKNOWN
            const genre = details.genres.map(g => g.name);
            const author = details.studios.map(s => s.name).join(", "); 

            // Fetch episodes (paginated)
            const chapters = [];
            let episodesUrl = `${detailUrl}/episodes`;
            while (episodesUrl) {
                const episodesRes = await this.client.get(episodesUrl, this.getHeaders(episodesUrl));
                const episodesJson = JSON.parse(episodesRes.body);

                for (const ep of episodesJson.data) {
                    chapters.push({
                        name: ep.title,
                        url: `episode/${ep.slug}`,
                        episode_number: ep.number 
                    });
                }
                episodesUrl = episodesJson.links.next;
            }

            chapters.reverse();

            return { name, imageUrl, description, link, status, genre, author, chapters };
        } catch (e) {
            console.error(`Failed to get anime details for URL ${url}: ${e}`);
            return { name: "Error loading details", link: url, chapters: [] };
        }
    }

    async getVideoList(url) {
        try {
            const slug = url.substring(url.indexOf('/') + 1);
            if (!slug) return [];

            const watchPageUrl = `https://ww1.animeiat.tv/watch/${slug}`;
            const watchPageRes = await this.client.get(watchPageUrl, this.getHeaders(watchPageUrl));
            const html = watchPageRes.body;

            const videoIdMatch = html.match(/video:\{.*?slug:"(.*?)"/);
            if (!videoIdMatch || !videoIdMatch[1]) {
                console.error("Could not find video ID in the watch page HTML.");
                return [];
            }
            const videoId = videoIdMatch[1];

            const videoApiUrl = `${this.source.apiUrl}/video/${videoId}/download`;
            const videoRes = await this.client.get(videoApiUrl, this.getHeaders(videoApiUrl));
            const videoJson = JSON.parse(videoRes.body);

            if (!videoJson || !videoJson.data) {
                return [];
            }

            const streams = videoJson.data.map(source => ({
                url: source.file,
                originalUrl: source.file,
                quality: source.label,
                headers: this.getHeaders(source.file)
            }));
            
            const preferredQuality = this.getPreference("preferred_quality");
            if (preferredQuality) {
                streams.sort((a, b) => {
                    const aHasQuality = a.quality.includes(preferredQuality);
                    const bHasQuality = b.quality.includes(preferredQuality);
                    if (aHasQuality && !bHasQuality) return -1;
                    if (!bHasQuality && aHasQuality) return 1;
                    return 0;
                });
            }
       
            return streams;
        } catch (e) {
            console.error(`Failed to get video list for URL ${url}: ${e}`);
            return [];
        }
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        return [{
            type_name: "HeaderFilter",
            name: "فلترة الموقع",
        }, {
            type_name: "SelectFilter",
            name: "النوع",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "اختر", value: "" },
                { type_name: "SelectOption", name: "فيلم", value: "movie" },
                { type_name: "SelectOption", name: "اوفا", value: "ova" },
                { type_name: "SelectOption", name: "اونا", value: "ona" },
                { type_name: "SelectOption", name: "حلقة خاصة", value: "special" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "الحالة",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "اختر", value: "" },
                { type_name: "SelectOption", name: "جارى رفعة", value: "uploading" },
                { type_name: "SelectOption", name: "مكتمل", value: "completed" },
                { type_name: "SelectOption", name: "يعرض حاليا", value: "ongoing" },
                { type_name: "SelectOption", name: "قريبا", value: "upcoming" }
            ]
        }];
    }

    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "Preferred quality",
                summary: "Select the quality to be prioritized",
                valueIndex: 0, // Default to 1080p
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}
