const mangayomiSources = [{
    "name": "Hstream",
    "id": 3720491820,
    "lang": "en",
    "baseUrl": "https://hstream.moe  ",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hstream.moe  ",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.4",
    "pkgPath": "anime/src/en/hstream.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // Returns the override URL from preferences if set, otherwise the default.
    getBaseUrl() {
        const overrideUrl = this.getPreference("override_base_url");
        // Trim both the override and the default source URL to handle extra spaces.
        return (overrideUrl || "").trim() || this.source.baseUrl.trim();
    }

    getHeaders(referer) {
        const baseUrl = this.getBaseUrl();
        return {
            "Referer": referer || baseUrl,
            "Origin": baseUrl
        };
    }

    // Helper function to parse anime from a list element
    _parseAnimeFromElement(element) {
        const baseUrl = this.getBaseUrl();
        const episodeUrl = element.getHref.replace(baseUrl, "");
        const imgElement = element.selectFirst("img");
        const fullName = imgElement.attr("alt");

        const seriesName = fullName.replace(/\s*-\s*\d+$/, '').trim();

        const seriesLink = episodeUrl
            .replace(/\/$/, '')
            .replace(/-[0-9]+$/, '');

        let imageRelativeSrc = imgElement.getSrc;
        if (imageRelativeSrc.includes("gallery-ep-")) {
            imageRelativeSrc = imageRelativeSrc
                .replace("/gallery-ep-", "/cover-ep-")
                .replace(/-[0-9]+-thumbnail\.webp$/, ".webp");
        }
        const imageUrl = baseUrl + imageRelativeSrc;
        
        return { name: seriesName, imageUrl, link: seriesLink };
    }

    // Helper to fetch and parse a page of anime
    async _getAnimePage(path) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(baseUrl + path, this.getHeaders());
        const doc = new Document(res.body);
        const list = doc.select("div.items-center div.w-full > a").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("span[aria-current] + a");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        return this._getAnimePage(`/search?order=view-count&page=${page}`);
    }

    async getLatestUpdates(page) {
        return this._getAnimePage(`/search?order=recently-uploaded&page=${page}`);
    }

    async search(query, page, filters) {
        const baseUrl = this.getBaseUrl();
        const getCheckBoxValues = (state) => state.filter(i => i.state).map(i => i.value);
        const getSelectValue = (filter) => filter.values[filter.state].value;
        let url = `${baseUrl}/search?page=${page}`;
        if (query) {
            url += `&search=${encodeURIComponent(query)}`;
        }
        if (filters && filters.length > 0) {
            const order = getSelectValue(filters[0]);
            const includedGenres = getCheckBoxValues(filters[1].state);
            const excludedGenres = getCheckBoxValues(filters[2].state);
            const studios = getCheckBoxValues(filters[3].state);
            url += `&order=${order}`;
            includedGenres.forEach(g => url += `&tags[]=${g}`);
            excludedGenres.forEach(g => url += `&blacklist[]=${g}`);
            studios.forEach(s => url += `&studios[]=${s}`);
        }
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = doc.select("div.items-center div.w-full > a").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("span[aria-current] + a");
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const baseUrl = this.getBaseUrl();
        const seriesPageUrl = baseUrl + url;
        const res = await this.client.get(seriesPageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const detailBlock = doc.selectFirst("div.bg-white.dark\\:bg-neutral-800.p-5");
        const name = detailBlock.selectFirst("h1").text.trim();
        let imageUrl = detailBlock.selectFirst("div.float-left img")?.getSrc;
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = baseUrl + imageUrl;
        }
        const description = detailBlock.selectFirst("p.font-bold:contains(Description) + p")?.text.trim();
        const genre = detailBlock.select("ul.list-none > li > a").map(el => el.text.trim());
        const status = 1;

        const chapterElements = doc.select("a:contains(Episodes) + div.grid > div > a");
        const chapters = chapterElements.map(el => {
            const episodeUrl = el.getHref.replace(baseUrl, "");
            const episodeName = el.selectFirst("img").attr("alt").trim();
            return { name: episodeName, url: episodeUrl };
        });

        return {
            name,
            imageUrl,
            description,
            genre,
            status,
            chapters: chapters.reverse(),
            link: seriesPageUrl
        };
    }

    async getVideoList(url) {
        // --- FIX: Create a new Client for each request to ensure a clean session ---
        const client = new Client();
        const baseUrl = this.getBaseUrl();
        const episodePageUrl = baseUrl + url;

        // Use the new, local client instance for this request.
        const res = await client.get(episodePageUrl, this.getHeaders(episodePageUrl));
        const doc = new Document(res.body);

        const subtitleLinkElement = doc.selectFirst('a[href$="/eng.ass"]');
        if (!subtitleLinkElement) {
            throw new Error("Could not find the subtitle link on the page. Video sources cannot be constructed.");
        }
        const subtitleUrl = subtitleLinkElement.getHref;

        const urlBase = subtitleUrl.replace('/eng.ass', '');
        
        const subtitles = [{ file: subtitleUrl, label: "English" }];

        const resolutions = ["720", "1080", "2160"];

        let videos = resolutions.map(res => {
            const videoUrl = `${urlBase}/${res}/manifest.mpd`;
            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${res}p`,
                subtitles: subtitles
            };
        });

        const preferredQuality = this.getPreference("hstream_pref_quality") || "720p";

        const preferredVideo = videos.find(video => video.quality === preferredQuality);

        if (preferredVideo) {
            return [preferredVideo];
        }

        videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        return videos;
    }

    getFilterList() {
        const g = (name, value) => ({ type_name: "CheckBox", name, value });
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        const genres = [
            g("3D", "3d"), g("4K", "4k"), g("X-Ray", "x-ray"), g("Yuri", "yuri"),
        ].sort((a,b) => a.name.localeCompare(b.name));
        const studios = [
            g("BOMB! CUTE! BOMB!", "bomb-cute-bomb"), g("BreakBottle", "breakbottle"), g("ChiChinoya", "chichinoya"),
            g("ChuChu", "chuchu"), g("Circle Tribute", "circle-tribute"), g("Collaboration Works", "collaboration-works"),
            g("Digital Works", "digital-works"), g("Discovery", "discovery"), g("Edge", "edge"), g("Gold Bear", "gold-bear"),
            g("Green Bunny", "green-bunny"), g("Himajin Planning", "himajin-planning"), g("King Bee", "king-bee"),
            g("L.", "l"), g("Lune Pictures", "lune-pictures"), g("MS Pictures", "ms-pictures"), g("Majin", "majin"),
            g("Mary Jane", "mary-jane"), g("Mediabank", "mediabank"), g("Mousou Senka", "mousou-senka"),
            g("Natural High", "natural-high"), g("Nihikime no Dozeu", "nihikime-no-dozeu"), g("Nur", "nur"),
            g("Pashmina", "pashmina"), g("Peak Hunt", "peak-hunt"), g("Pink Pineapple", "pink-pineapple"),
            g("Pixy Soft", "pixy-soft"), g("Pixy", "pixy"), g("PoRO", "poro"), g("Queen Bee", "queen-bee"),
            g("Rabbit Gate", "rabbit-gate"), g("SELFISH", "selfish"), g("Seven", "seven"), g("Showten", "showten"),
            g("Studio 1st", "studio-1st"), g("Studio Eromatick", "studio-eromatick"), g("Studio Fantasia", "studio-fantasia"),
            g("Suiseisha", "suiseisha"), g("Suzuki Mirano", "suzuki-mirano"), g("T-Rex", "t-rex"), g("Toranoana", "toranoana"),
            g("Union Cho", "union-cho"), g("Valkyria", "valkyria"), g("White Bear", "white-bear"), g("ZIZ", "ziz"),
        ].sort((a,b) => a.name.localeCompare(b.name));
        const orders = [
            f("View Count", "view-count"), f("A-Z", "az"), f("Z-A", "za"), f("Recently Uploaded", "recently-uploaded"),
            f("Recently Released", "recently-released"), f("Oldest Uploads", "oldest-uploads"), f("Oldest Releases", "oldest-releases"),
        ];
        return [
            { type_name: "SelectFilter", name: "Order by", state: 0, values: orders },
            { type_name: "GroupFilter", name: "Include Genres", state: genres },
            { type_name: "GroupFilter", name: "Exclude Genres (Blacklist)", state: genres },
            { type_name: "GroupFilter", name: "Studios", state: studios },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source. Requires app restart.",
                    value: this.source.baseUrl.trim(),
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: `Default: ${this.source.baseUrl.trim()}`,
                }
            },
            {
                key: "hstream_pref_quality",
                listPreference: {
                    title: "Preferred quality",
                    summary: "Note: Not all videos have all qualities available.",
                    valueIndex: 0, // Default to the first option, 720p
                    entries: ["720p (HD)", "1080p (FULLHD)", "2160p (4K)"],
                    entryValues: ["720p", "1080p", "2160p"],
                }
            }
        ];
    }
}
