const mangayomiSources = [{
    "name": "Animeiat",
    "id": 1701240113941,
    "lang": "ar",
    "baseUrl": "https://animeiat.co",
    "apiUrl": "https://api.animeiat.co/v1",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://animeiat.co",
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
     * @param {boolean} isLatest Is this from the latest updates endpoint?
     * @returns {Object} An object with a list of anime and a boolean indicating if there's a next page.
     */
    parseAnimeList(body, isLatest = false) {
        const responseJson = JSON.parse(body);
        const list = [];

        for (const item of responseJson.data) {
            const name = isLatest ? item.title : item.anime_name;
            const link = isLatest ?
                `/anime/${item.slug.split("-episode-")[0]}` :
                `/anime/${item.slug}`;
            const imageUrl = `https://api.animeiat.co/storage/${item.poster_path}`;
            list.push({ name, imageUrl, link });
        }

        const hasNextPage = responseJson.meta.current_page < responseJson.meta.last_page;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const url = `${this.source.apiUrl}/anime?page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        return this.parseAnimeList(res.body);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.apiUrl}/home/sticky-episodes?page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        return this.parseAnimeList(res.body, true);
    }

    async search(query, page, filters) {
        if (query) {
            const url = `${this.source.apiUrl}/anime?q=${encodeURIComponent(query)}&page=${page}`;
            const res = await this.client.get(url, this.getHeaders(url));
            return this.parseAnimeList(res.body);
        }

        const filterList = this.getFilterList();
        let type = "";
        let status = "";

        for (const filter of filters) {
            if (filter.type_name === "SelectFilter") {
                const selectedValue = filter.values[filter.state].value;
                if (filter.name === "النوع") {
                    type = selectedValue;
                } else if (filter.name === "الحالة") {
                    status = selectedValue;
                }
            }
        }

        let url = `${this.source.apiUrl}/anime?page=${page}`;
        if (type) url += `&type=${type}`;
        if (status) url += `&status=${status}`;

        const res = await this.client.get(url, this.getHeaders(url));
        return this.parseAnimeList(res.body);
    }

    async getDetail(url) {
        // Fetch anime details
        const detailUrl = `${this.source.apiUrl}${url}`;
        const detailRes = await this.client.get(detailUrl, this.getHeaders(detailUrl));
        const details = JSON.parse(detailRes.body).data;

        const name = details.anime_name;
        const imageUrl = `https://api.animeiat.co/storage/${details.poster_path}`;
        const description = details.story;
        const link = url;
        const statusMap = { "ongoing": 0, "completed": 1 };
        const status = statusMap[details.status] ?? 5;
        const genre = details.genres.map(g => g.name);

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
                    // API doesn't provide date or scanlator
                });
            }
            episodesUrl = episodesJson.links.next;
        }

        chapters.reverse();

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        // Step 1: Get the episode page to find the hash
        const episodeUrl = `${this.source.apiUrl}/${url}`;
        const episodeRes = await this.client.get(episodeUrl, this.getHeaders(episodeUrl));
        const hash = JSON.parse(episodeRes.body).data.hash;
        if (!hash) return [];

        // Step 2: Decode the hash to get the player ID
        const decodedString = atob(hash);
        const playerID = JSON.parse(decodedString)[1];
        if (!playerID) return [];

        // Step 3: Get the video links using the player ID
        const videoApiUrl = `${this.source.apiUrl}/video/${playerID}`;
        const videoRes = await this.client.get(videoApiUrl, this.getHeaders(videoApiUrl));
        const videoJson = JSON.parse(videoRes.body);

        const streams = videoJson.data.sources.map(source => ({
            url: source.file,
            originalUrl: source.file,
            quality: `${source.label} ${source.quality}`,
            headers: this.getHeaders(source.file)
        }));
        
        // Sort by preferred quality
        const preferredQuality = this.getPreference("preferred_quality");
        if(preferredQuality) {
             streams.sort((a, b) => {
                const aContains = a.quality.includes(preferredQuality);
                const bContains = b.quality.includes(preferredQuality);
                if (aContains && !bContains) return -1;
                if (!aContains && bContains) return 1;
                return 0;
            });
        }
       
        return streams;
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
            values: [{ type_name: "SelectOption", name: "اختر", value: "" },
                { type_name: "SelectOption", name: "فيلم", value: "movie" },
                { type_name: "SelectOption", name: "اوفا", value: "ova" },
                { type_name: "SelectOption", name: "اونا", value: "ona" },
                { type_name: "SelectOption", name: "حلقة خاصة", value: "special" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "الحالة",
            state: 0,
            values: [{ type_name: "SelectOption", name: "اختر", value: "" },
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
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}