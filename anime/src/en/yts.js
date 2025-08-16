const mangayomiSources = [{
    "name": "YTS",
    "id": 6218732994783510,
    "lang": "en",
    "baseUrl": "https://ytstv.me",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://ytstv.me",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/yts.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    // The constructor is called when the class is initialized.
    constructor() {
        super(); // Always call the parent constructor.
        this.client = new Client(); // Initialize the HTTP client.
    }

    // --- PREFERENCES AND HEADERS ---

    /**
     * A helper function to get the base URL.
     * @returns {string} The base URL.
     */
    getBaseUrl() {
        return this.source.baseUrl;
    }

    /**
     * A helper function to create headers for HTTP requests.
     * @param {string} url The URL for which the headers are being created.
     * @returns {Object} A dictionary of headers.
     */
    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- CUSTOM HELPERS ---

    /**
     * Parses the movie list from a given document.
     * @param {Document} doc The document to parse.
     * @returns {Object} An object with a list of movies and a boolean indicating if there's a next page.
     */
    parseMovieList(doc) {
        const list = [];
        const items = doc.select("div.browse-movie-wrap");
        for (const item of items) {
            const titleElement = item.selectFirst("a.browse-movie-title");
            if (!titleElement) continue;

            const name = titleElement.text;
            const link = titleElement.getHref;
            const imageUrl = item.selectFirst("img.img-responsive").getSrc;
            list.push({ name, imageUrl, link });
        }
        const hasNextPage = doc.selectFirst("li a:contains(Next »)") != null;
        return { list, hasNextPage };
    }

    // --- CORE METHODS ---

    /**
     * Fetches the popular movies from the source.
     * @param {number} page The page number to fetch.
     * @returns {Object} An object with a list of movies and a boolean indicating if there's a next page.
     */
    async getPopular(page) {
        const url = `${this.getBaseUrl()}/browse-movies/0/all/all/0/featured/0/all?page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        return this.parseMovieList(doc);
    }

    /**
     * Fetches the latest updates from the source.
     * @param {number} page The page number to fetch.
     * @returns {Object} An object with a list of movies and a boolean indicating if there's a next page.
     */
    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/browse-movies?page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        return this.parseMovieList(doc);
    }

    /**
     * Searches for movies on the source.
     * @param {string} query The search query.
     * @param {number} page The page number to fetch.
     * @param {Array} filters A list of filters selected by the user.
     * @returns {Object} An object with a list of movies and a boolean indicating if there's a next page.
     */
    async search(query, page, filters) {
        let quality = "all";
        let genre = "all";
        let rating = "0";
        let sortBy = "date_added";
        let orderBy = "desc";

        for (const filter of filters) {
            if (filter.type_name === "SelectFilter") {
                const state = filter.values[filter.state];
                if (filter.name === "Quality") quality = state.value;
                if (filter.name === "Genre") genre = state.value;
                if (filter.name === "Rating") rating = state.value;
                if (filter.name === "Sort By") sortBy = state.value;
                if (filter.name === "Order By") orderBy = state.value;
            }
        }

        const url = `${this.getBaseUrl()}/browse-movies?query_term=${encodeURIComponent(query)}&quality=${quality}&genre=${genre}&minimum_rating=${rating}&sort_by=${sortBy}&order_by=${orderBy}&page=${page}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        return this.parseMovieList(doc);
    }

    /**
     * Fetches the details for a specific movie.
     * @param {string} url The URL of the movie.
     * @returns {Object} A MediaDetail object.
     */
    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("div#movie-info h1").text;
        const imageUrl = doc.selectFirst("div#movie-poster img").getSrc;
        const description = doc.select("div#movie-synopsis p").map(p => p.text).join("\n\n");
        const genreElements = doc.select("div#movie-info h2");
        const genre = genreElements.length > 1 ? genreElements.at(1).text.split(" / ").map(g => g.trim()) : [];
        const status = 1; // Completed

        const chapters = [];
        const year = doc.selectFirst("div#movie-info h2").text;
        const dateUpload = new Date(year).valueOf().toString();
        const torrentElements = doc.select("p.torrent-download a[href*='/torrent/download/']");
        
        for (const element of torrentElements) {
            const epName = element.text.trim();
            const epUrl = element.getHref;
            chapters.push({ name: epName, url: epUrl, dateUpload });
        }

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    /**
     * Fetches the list of video streams for a specific episode (torrent).
     * @param {string} url The URL of the torrent file.
     * @returns {Array} A list of Video objects.
     */
    async getVideoList(url) {
        // YTS provides torrent files, not direct video streams.
        // The app's video player cannot play torrents directly.
        // This method returns the torrent URL, which will allow users to
        // download the file using an external app, but it will not stream.
        return [{
            url: url,
            originalUrl: url,
            quality: "Torrent",
            headers: this.getHeaders(url)
        }];
    }

    // --- FILTERS ---

    /**
     * Defines the available filters for the source.
     * @returns {Array} A list of Filter objects.
     */
    getFilterList() {
        return [{
            type_name: "HeaderFilter",
            name: "Search Filters",
        }, {
            type_name: "SelectFilter",
            name: "Quality",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "All", value: "all" },
                { type_name: "SelectOption", name: "480p", value: "480p" },
                { type_name: "SelectOption", name: "720p", value: "720p" },
                { type_name: "SelectOption", name: "1080p", value: "1080p" },
                { type_name: "SelectOption", name: "1080p.x265", value: "1080p-x265" },
                { type_name: "SelectOption", name: "2160p", value: "2160p" },
                { type_name: "SelectOption", name: "3D", value: "3D" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "Genre",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "All", value: "all" }, { type_name: "SelectOption", name: "Action", value: "action" }, { type_name: "SelectOption", name: "Adventure", value: "adventure" }, { type_name: "SelectOption", name: "Animation", value: "animation" }, { type_name: "SelectOption", name: "Biography", value: "biography" }, { type_name: "SelectOption", name: "Comedy", value: "comedy" }, { type_name: "SelectOption", name: "Crime", value: "crime" }, { type_name: "SelectOption", name: "Documentary", value: "documentary" }, { type_name: "SelectOption", name: "Drama", value: "drama" }, { type_name: "SelectOption", name: "Family", value: "family" }, { type_name: "SelectOption", name: "Fantasy", value: "fantasy" }, { type_name: "SelectOption", name: "Film-Noir", value: "film-noir" }, { type_name: "SelectOption", name: "Game-Show", value: "game-show" }, { type_name: "SelectOption", name: "History", value: "history" }, { type_name: "SelectOption", name: "Horror", value: "horror" }, { type_name: "SelectOption", name: "Music", value: "music" }, { type_name: "SelectOption", name: "Musical", value: "musical" }, { type_name: "SelectOption", name: "Mystery", value: "mystery" }, { type_name: "SelectOption", name: "News", value: "news" }, { type_name: "SelectOption", name: "Reality-TV", value: "reality-tv" }, { type_name: "SelectOption", name: "Romance", value: "romance" }, { type_name: "SelectOption", name: "Sci-Fi", value: "sci-fi" }, { type_name: "SelectOption", name: "Sport", value: "sport" }, { type_name: "SelectOption", name: "Talk-Show", value: "talk-show" }, { type_name: "SelectOption", name: "Thriller", value: "thriller" }, { type_name: "SelectOption", name: "War", value: "war" }, { type_name: "SelectOption", name: "Western", value: "western" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "Rating",
            state: 0,
            values: [
                { type_name: "SelectOption", name: "All", value: "0" }, { type_name: "SelectOption", name: "9+", value: "9" }, { type_name: "SelectOption", name: "8+", value: "8" }, { type_name: "SelectOption", name: "7+", value: "7" }, { type_name: "SelectOption", name: "6+", value: "6" }, { type_name: "SelectOption", name: "5+", value: "5" }, { type_name: "SelectOption", name: "4+", value: "4" }, { type_name: "SelectOption", name: "3+", value: "3" }, { type_name: "SelectOption", name: "2+", value: "2" }, { type_name: "SelectOption", name: "1+", value: "1" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "Sort By",
            state: 6, // Default to Latest
            values: [
                { type_name: "SelectOption", name: "Title", value: "title" }, { type_name: "SelectOption", name: "Year", value: "year" }, { type_name: "SelectOption", name: "Rating", value: "rating" }, { type_name: "SelectOption", name: "Peers", value: "peers" }, { type_name: "SelectOption", name: "Seeds", value: "seeds" }, { type_name: "SelectOption", name: "Downloads", value: "download_count" }, { type_name: "SelectOption", name: "Latest", value: "date_added" }, { type_name: "SelectOption", name: "Likes", value: "like_count" }
            ]
        }, {
            type_name: "SelectFilter",
            name: "Order By",
            state: 0, // Default to Descending
            values: [
                { type_name: "SelectOption", name: "Descending", value: "desc" },
                { type_name: "SelectOption", name: "Ascending", value: "asc" }
            ]
        }];
    }
}
    getSourcePreferences() {
        return [];
    }
}
