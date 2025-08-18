const mangayomiSources = [{
    "name": "WitAnime",
    "id": 984372845,
    "lang": "ar",
    "baseUrl": "https://witanime.com",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://witanime.com",
    "typeSource": "multi",
    "itemType": 1,
    "version": "2.0.2",
    "pkgPath": "anime/src/ar/witanime.js"
}];


// --- CLASS ---
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
        };
    }

    // --- HELPER METHODS ---

    // A helper function to parse pages that list anime (popular, search, etc.)
    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.anime-card-container");

        for (const item of items) {
            const linkElement = item.selectFirst("div.anime-card-title h3 a");
            const imageElement = item.selectFirst("img.img-responsive");

            if (linkElement && imageElement) {
                let name = linkElement.text.trim();
                // Remove the leading colon if it exists
                if (name.startsWith(":")) {
                    name = name.substring(1).trim();
                }
                const link = linkElement.getHref.replace(this.source.baseUrl, '');
                const imageUrl = imageElement.getSrc;
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const path = `/قائمة-الانمي/page/${page}/`;
        return this.fetchAndParseCataloguePage(path);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/episode/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.anime-card-container");

        for (const item of items) {
            // The anime name and link are in the details section
            const animeTitleElement = item.selectFirst("div.anime-card-details h3 a");
            // The episode link is in the overlay
            const episodeLinkElement = item.selectFirst("a.overlay");
            const imageElement = item.selectFirst("img.img-responsive");

            if (animeTitleElement && episodeLinkElement && imageElement) {
                const name = animeTitleElement.text.trim();
                const link = episodeLinkElement.getHref.replace(this.source.baseUrl, '');
                const imageUrl = imageElement.getSrc;
                list.push({ name, imageUrl, link });
            }
        }
        
        // As requested, transform episode URLs to anime URLs
        const fixedList = list.map(item => ({
            ...item,
            link: item.link
                .replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "")
                .replace("/episode/", "/anime/")
        }));

        const hasNextPage = doc.selectFirst("a.next.page-numbers") != null;
        return { list: fixedList, hasNextPage: hasNextPage };
    }

    async search(query, page, filters) {
        // The site uses a standard WordPress search query structure
        const path = `/page/${page}/?s=${encodeURIComponent(query)}`;
        return this.fetchAndParseCataloguePage(path);
    }

    async getDetail(url) {
        const fullUrl = url.startsWith("http") ? url : this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.anime-details-title").text.trim();
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text.trim();
        const link = url;

        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;

        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text.trim());

        const chapters = [];
        const episodeElements = doc.select("div.episodes-card a");
        for (const element of episodeElements) {
            const onclickAttr = element.attr("onclick");
            if (!onclickAttr) continue;
            
            const base64Match = onclickAttr.match(/openEpisode\('([^']+)'\)/);
            if (base64Match && base64Match[1]) {
                try {
                    // atob is available in the Mangayomi runtime for base64 decoding
                    const decodedUrl = atob(base64Match[1]);
                    const name = element.selectFirst("h3").text.trim();
                    chapters.push({
                        name: name,
                        url: decodedUrl.replace(this.source.baseUrl, '')
                    });
                } catch(e) {
                    console.error("Failed to decode base64 URL for a chapter.");
                }
            }
        }
        
        // Remove potential duplicates and reverse to get oldest first
        const uniqueChapters = Array.from(new Map(chapters.map(item => [item.url, item])).values());
        uniqueChapters.reverse();

        return { name, imageUrl, description, link, status, genre, chapters: uniqueChapters };
    }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const fullUrl = url.startsWith("http") ? url : this.getBaseUrl() + url;
        const res = await this.client.get(fullUrl, this.getHeaders(fullUrl));
        const doc = new Document(res.body);
        let videos = [];
        const headers = this.getHeaders(fullUrl);

        const linkElements = doc.select('#episode-servers li a');
        for (const element of linkElements) {
            try {
                let streamUrl = element.attr('data-ep-url');
                const serverName = element.text.trim();

                // Handle the internal WitAnime player
                if (streamUrl.includes('/video-player/')) {
                    const embedHtml = (await this.client.get(streamUrl, headers)).body;
                    // Extract m3u8 link from the player
                    const sourceMatch = embedHtml.match(/source src="([^"]+)"/);
                    if (sourceMatch && sourceMatch[1]) {
                        videos.push({
                            url: sourceMatch[1],
                            originalUrl: sourceMatch[1],
                            quality: serverName,
                            headers: this.getHeaders(streamUrl)
                        });
                    }
                } 
                // Handle external embeds like Doodstream, StreamSB, etc.
                // Note: These often require specific extractors. For simplicity, we pass the embed URL.
                // The app's webview or a dedicated extractor would handle the final link.
                else if (serverName.toLowerCase().includes("dood")) {
                    videos.push({ url: streamUrl, quality: serverName, headers });
                } else if (serverName.toLowerCase().includes("streamsb")) {
                    videos.push({ url: streamUrl, quality: serverName, headers });
                } else {
                    // Add other servers as generic embeds
                     videos.push({ url: streamUrl, quality: serverName, headers });
                }

            } catch (e) { 
                console.error(`Failed to extract video from server: ${e}`);
            }
        }

        const preferredQuality = this.getPreference("preferred_quality") || "fhd";
        videos.sort((a, b) => {
            const aQuality = a.quality.toLowerCase();
            const bQuality = b.quality.toLowerCase();
            if (aQuality.includes(preferredQuality)) return -1;
            if (bQuality.includes(preferredQuality)) return 1;
            return 0; // Basic sort, can be improved
        });

        return videos;
    }

    // --- PREFERENCES ---
    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "تجاوز عنوان URL الأساسي",
                summary: "استخدم دومين مختلف للمصدر",
                value: this.source.baseUrl,
                dialogTitle: "أدخل عنوان URL الأساسي الجديد",
                dialogMessage: `الإفتراضي: ${this.source.baseUrl}`,
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي سيتم تفضيلها",
                valueIndex: 0,
                entries: ["FHD (1080p)", "HD (720p)", "SD (480p)"],
                entryValues: ["fhd", "hd", "sd"],
            }
        }];
    }

    // Filters are not implemented yet but can be added here
    getFilterList() {
        return [];
    }
}
