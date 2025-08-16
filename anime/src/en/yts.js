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
    constructor() {
        super();
        this.client = new Client();
    }

    // --- HELPERS ---

    getHeaders(url) {
        return {
            "Referer": this.source.baseUrl,
            "Origin": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    /**
     * Cleans the title using regex patterns similar to the Python script.
     * @param {string} title The original title.
     * @returns {string} The cleaned title.
     */
    cleanTitle(title) {
        let newTitle = title;
        const patterns = [
            /(?:\s*-\s*)?(?:4k|3d|uhd|hdr|1080p|720p)/i,
            /season\s*\d+/i,
            /\(\d{4}\)/, // Year in parentheses
        ];
        patterns.forEach(pattern => {
            newTitle = newTitle.replace(pattern, '');
        });
        return newTitle.trim();
    }

    /**
     * Parses a list of media items from the HTML document.
     * @param {Document} doc The HTML document to parse.
     * @returns {Array} A list of Media objects.
     */
    parseMediaList(doc) {
        const list = [];
        const items = doc.select("div.ml-item");

        for (const item of items) {
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;

            const name = this.cleanTitle(linkElement.getAttr("oldtitle"));
            const link = linkElement.getHref();
            const imageUrl = item.selectFirst("img").getAttr("data-original");
            // Skip latest episodes from appearing in movie/series lists
            if (link.includes("/episode/")) continue;
            
            list.push({ name, imageUrl, link });
        }
        return list;
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.source.baseUrl}/movies/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = this.parseMediaList(doc);
        const hasNextPage = doc.selectFirst('a.next.page-numbers, a[title="next"]') != null;
        
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/episode/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.ml-item");
        for (const item of items) {
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;

            // For latest episodes, we construct a more descriptive name
            const title = linkElement.getAttr("oldtitle");
            const seasonEpMatch = title.match(/Season (\d+) Episode (\d+)/i);
            let name = this.cleanTitle(title);
            if (seasonEpMatch) {
                name = `${name} - S${seasonEpMatch[1]}E${seasonEpMatch[2]}`;
            }

            const link = linkElement.getHref();
            const imageUrl = item.selectFirst("img").getAttr("data-original");
            
            list.push({ name, imageUrl, link });
        }

        const hasNextPage = doc.selectFirst('a.next.page-numbers, a[title="next"]') != null;
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        let url;
        if (query) {
             url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        } else {
            const genre = filters.find(f => f.name === "Genres")?.state.find(s => s.state);
            if (genre) {
                url = `${this.source.baseUrl}/genre/${genre.value}/page/${page}/`;
            } else {
                // Return popular if no query and no filter
                return this.getPopular(page);
            }
        }
        
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const list = this.parseMediaList(doc);
        const hasNextPage = doc.selectFirst('a.next.page-numbers, a[title="next"]') != null;

        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.mvic-desc h3").text;
        const imageUrl = doc.selectFirst("div.mvic-thumb img").getSrc;
        const description = doc.selectFirst("div.desc").text;
        
        const statusText = doc.selectFirst("p:contains(Status)").text.replace("Status:", "").trim();
        const status = statusText.toLowerCase() === "completed" ? 1 : 0;

        const genre = [];
        const genreElements = doc.select("p:contains(Genre) a");
        for (const element of genreElements) {
            genre.push(element.text);
        }

        const chapters = [];
        // Check if it's a TV series
        if (url.includes("/series/")) {
            const seasons = doc.select("div.tvseason");
            for (const season of seasons) {
                const seasonName = season.selectFirst("div.les-title").text; // "Season 1"
                const episodeElements = season.select("ul.les-episodes > li > a");
                for (const element of episodeElements) {
                    const epTitle = element.selectFirst(".ep-title").text;
                    const epDate = element.selectFirst(".ep-date").text;
                    
                    let dateUpload = 0;
                    try {
                        dateUpload = new Date(epDate).valueOf();
                    } catch (e) {
                        // ignore
                    }

                    chapters.push({
                        name: `${seasonName} - ${epTitle}`,
                        url: element.getHref(),
                        dateUpload: dateUpload.toString(),
                    });
                }
            }
        } else { // It's a movie
            chapters.push({
                name: "Play Movie",
                url: url,
                dateUpload: "0",
            });
        }

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const videoList = [];
        const nonceMatch = res.body.match(/var ajax_nonce = "([^"]+)"/);
        if (!nonceMatch) return [];

        const nonce = nonceMatch[1];
        const type = url.includes("/episode/") ? "episode" : "movie";
        const serverElements = doc.select("#server-list ul li a");
        
        for (const serverElement of serverElements) {
            const postIdMatch = serverElement.getAttr("onclick").match(/'(\d+)'/);
            if (!postIdMatch) continue;

            const postId = postIdMatch[1];
            const serverName = serverElement.text;

            const ajaxRes = await this.client.post(
                this.source.apiUrl,
                `action=player_ajax&postid=${postId}&nonce=${nonce}&type=${type}`,
                { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", ...this.getHeaders(this.source.apiUrl) }
            );

            const json = JSON.parse(ajaxRes.body);
            const iframeMatch = json.player.match(/src="([^"]+)"/);
            if (!iframeMatch) continue;

            const iframeUrl = iframeMatch[1];

            // Attempt to resolve Doodstream links
            if (iframeUrl.includes("dood")) {
                try {
                    const doodHeaders = { "Referer": iframeUrl, ...this.getHeaders(iframeUrl) };
                    const doodRes = await this.client.get(iframeUrl, doodHeaders);
                    const passMd5Match = doodRes.body.match(/\/pass_md5\/[^']+/);
                    if (passMd5Match) {
                        const passMd5Url = `https${new URL(iframeUrl).hostname}${passMd5Match[0]}`;
                        const finalVideoUrlRes = await this.client.get(passMd5Url, doodHeaders);
                        const finalVideoUrl = finalVideoUrlRes.body + "z" + Math.random().toString(36).substring(7); // Append random string as per Doodstream's method
                        videoList.push({
                            url: finalVideoUrl,
                            originalUrl: finalVideoUrl,
                            quality: `Doodstream - Auto`,
                            headers: doodHeaders,
                        });
                    }
                } catch (e) {
                     // Doodstream extraction failed, skip
                }
            }
        }
        
        return videoList;
    }
    
    getFilterList() {
        return [
            {
                type_name: "HeaderFilter",
                name: "NOTE: Search by text and by genre are mutually exclusive.",
            },
            {
                type_name: "GroupFilter",
                name: "Genres",
                state: [
                    { type_name: "CheckBox", name: "Action", value: "action"},
                    { type_name: "CheckBox", name: "Adventure", value: "adventure"},
                    { type_name: "CheckBox", name: "Animation", value: "animation"},
                    { type_name: "CheckBox", name: "Biography", value: "biography"},
                    { type_name: "CheckBox", name: "Comedy", value: "comedy"},
                    { type_name: "CheckBox", name: "Crime", value: "crime"},
                    { type_name: "CheckBox", name: "Documentary", value: "documentary"},
                    { type_name: "CheckBox", name: "Drama", value: "drama"},
                    { type_name: "CheckBox", name: "Family", value: "family"},
                    { type_name: "CheckBox", name: "Fantasy", value: "fantasy"},
                    { type_name: "CheckBox", name: "History", value: "history"},
                    { type_name: "CheckBox", name: "Horror", value: "horror"},
                    { type_name: "CheckBox", name: "Music", value: "music"},
                    { type_name: "CheckBox", name: "Mystery", value: "mystery"},
                    { type_name: "CheckBox", name: "Romance", value: "romance"},
                    { type_name: "CheckBox", name: "Sci-Fi", value: "sci-fi"},
                    { type_name: "CheckBox", name: "Thriller", value: "thriller"},
                    { type_name: "CheckBox", name: "War", value: "war"},
                    { type_name: "CheckBox", name: "Western", value: "western"},
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [];
    }
}
