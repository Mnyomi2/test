// --- METADATA ---
const mangayomiSources = [{
    "name": "Animerco",
    "id": 645698215,
    "lang": "ar",
    "baseUrl": "https://vip.animerco.org",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=animerco.org",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/animerco.js"
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

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/seasons/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.box-5x1.media-block");

        for (const item of items) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/episodes/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.media-block, div.pinned-card");

        for (const item of items) {
            const name = item.selectFirst("div.info h3")?.text.trim();
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");
            const seasonText = item.selectFirst("a.extra h4, span.anime-type")?.text;
            const episodeUrl = item.selectFirst("div.info a")?.attr("href");

            if (name && imageUrl && seasonText && episodeUrl) {
                // Step 1: Extract the full slug from the episode URL. This is more reliable than
                // generating one from the short title. The regex captures the content between
                // "/episodes/" and the URL-encoded Arabic word for "episode".
                const slugMatch = episodeUrl.match(/\/episodes\/(.+?)-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-\d+/);

                if (!slugMatch) continue;
                let fullSlug = slugMatch[1];

                // Step 2: Clean the extracted slug by removing any pre-existing "-season-X" suffix.
                // This handles site inconsistencies where the season is sometimes included in the episode URL.
                const baseSlug = fullSlug.replace(/-season-\d+$/, '');

                const seasonMatch = seasonText.match(/(\d+)/);
                if (!seasonMatch) continue;
                const seasonNumber = seasonMatch[1];
                
                // Step 3: Construct the final, correct series link using the cleaned base slug.
                const link = `/seasons/${baseSlug}-season-${seasonNumber}/`;

                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("nav.pagination-page a:last-child svg") != null;
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query)}`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body, res.url);

        const list = [];
        const items = doc.select("div.box-5x1.media-block");

        for (const item of items) {
            const linkElement = item.selectFirst("div.info a");
            const name = linkElement?.selectFirst("h3")?.text.trim();
            const link = linkElement?.attr("href")?.replace(this.getBaseUrl(), "");
            const imageUrl = item.selectFirst("a.image")?.attr("data-src");

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body, res.url);

        let name = doc.selectFirst("div.media-title > h1")?.text;
        
        if (name) {
            name = name.replace(/\s+(season|الموسم)\s+\d+\s*$/i, '').trim();
        }

        const imageUrl = doc.selectFirst("div.anime-card.player a.image")?.attr("data-src");
        let description = doc.selectFirst("div.media-story div.content p")?.text ?? "";
        const altTitle = doc.selectFirst("div.media-title h3")?.text;
        if (altTitle) {
            description += `\n\nAlternative title: ${altTitle?.trim() ?? ''}`;
        }
        
        const statusText = doc.selectFirst("div.status > a")?.text;
        let status = 5;
        if (statusText) {
            if (statusText.includes("يعرض الأن")) {
                status = 0;
            } else if (statusText.includes("مكتمل")) {
                status = 1;
            }
        }

        const genre = doc.select("div.genres a").map(e => e.text);
        const chapters = [];
        
        if (doc.location && doc.location.includes("/movies/")) {
            chapters.push({
                name: "Movie",
                url: url,
                scanlator: "1" // Movie "chapter" number
            });
        } else {
            const seasonNameFromTitle = doc.selectFirst("div.media-title h1")?.text;
            const seasonNumMatch = seasonNameFromTitle?.match(/(\d+)/);
            const seasonNum = seasonNumMatch ? parseInt(seasonNumMatch[1]) : 1;
            
            const episodeElements = doc.select("ul.episodes-lists li");
            for (const ep of episodeElements) {
                const epLink = ep.selectFirst("a.title");
                if (!epLink) continue;

                const epText = epLink.selectFirst("h3")?.text;
                const epNum = parseInt(ep.attr("data-number"));
                const epUrl = epLink.attr("href");

                if (epText && !isNaN(epNum) && epUrl) {
                    const scanlator = parseFloat(`${seasonNum}.${String(epNum).padStart(3, '0')}`);
                    chapters.push({
                        name: epText,
                        url: epUrl.replace(this.getBaseUrl(), ""),
                        scanlator: String(scanlator) // Ensure this is a string to avoid DB issues
                    });
                }
            }
        }
        
        chapters.sort((a, b) => parseFloat(b.scanlator) - parseFloat(a.scanlator));

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    async getVideoList(url) {
        const fullUrl = this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body, res.url);
        const players = doc.select("li.dooplay_player_option");
        const videos = [];

        const promises = players.map(player => {
            const postData = {
                "action": "doo_player_ajax",
                "post": player.attr("data-post"),
                "nume": player.attr("data-nume"),
                "type": player.attr("data-type")
            };
            const serverName = player.selectFirst("span.title")?.text ?? "Unknown Server";
            return this.client.post(`${this.getBaseUrl()}/wp-admin/admin-ajax.php`, postData, this.getHeaders(fullUrl))
                .then(playerRes => ({ playerRes, serverName }));
        });

        const results = await Promise.all(promises);

        for (const { playerRes, serverName } of results) {
            try {
                const embedUrl = JSON.parse(playerRes.body).embed_url.replace(/\\/g, "");
                if (embedUrl) {
                    videos.push({ url: embedUrl, quality: serverName, headers: this.getHeaders(embedUrl) });
                }
            } catch (e) {
                console.error(`Failed to parse player response for ${serverName}: ${e}`);
            }
        }
        
        const quality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const aQuality = a.quality.toLowerCase();
            const bQuality = b.quality.toLowerCase();
            if (aQuality.includes(quality.toLowerCase())) return -1;
            if (bQuality.includes(quality.toLowerCase())) return 1;
            return 0;
        });

        return videos;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary uses. Update the extension for permanent changes.",
                value: "https://vip.animerco.org",
                dialogTitle: "Override Base URL",
                dialogMessage: "Default: " + "https://vip.animerco.org",
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "Preferred quality",
                summary: "Preferred quality for video streaming",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "Doodstream", "StreamTape", "Mp4upload", "Okru"],
                entryValues: ["1080", "720", "480", "360", "Doodstream", "StreamTape", "Mp4upload", "Okru"],
            }
        }];
    }
}


