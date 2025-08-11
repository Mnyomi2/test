const mangayomiSources = [{
    "name": "Hstream",
    "id": 3720491820,
    "lang": "en",
    "baseUrl": "https://hstream.moe",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hstream.moe",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.5.5",
    "pkgPath": "anime/src/en/hstream.js"
}];

// ------------  NEW CONSTANTS  ------------
const GENRES = [
    ["3D", "3d"], ["4K", "4k"], ["Ahegao", "ahegao"], ["Anal", "anal"], ["Bdsm", "bdsm"],
    ["Big Boobs", "big-boobs"], ["Blow Job", "blow-job"], ["Bondage", "bondage"], ["Boob Job", "boob-job"],
    ["Censored", "censored"], ["Comedy", "comedy"], ["Cosplay", "cosplay"], ["Creampie", "creampie"],
    ["Dark Skin", "dark-skin"], ["Elf", "elf"], ["Facial", "facial"], ["Fantasy", "fantasy"],
    ["Filmed", "filmed"], ["Foot Job", "foot-job"], ["Futanari", "futanari"], ["Gangbang", "gangbang"],
    ["Glasses", "glasses"], ["Hand Job", "hand-job"], ["Harem", "harem"], ["Horror", "horror"],
    ["Incest", "incest"], ["Inflation", "inflation"], ["Lactation", "lactation"], ["Loli", "loli"],
    ["Maid", "maid"], ["Masturbation", "masturbation"], ["Milf", "milf"], ["Mind Break", "mind-break"],
    ["Mind Control", "mind-control"], ["Monster", "monster"], ["Nekomimi", "nekomimi"], ["Ntr", "ntr"],
    ["Nurse", "nurse"], ["Orgy", "orgy"], ["Pov", "pov"], ["Pregnant", "pregnant"],
    ["Public Sex", "public-sex"], ["Rape", "rape"], ["Reverse Rape", "reverse-rape"], ["Rimjob", "rimjob"],
    ["Scat", "scat"], ["School Girl", "school-girl"], ["Shota", "shota"], ["Small Boobs", "small-boobs"],
    ["Succubus", "succubus"], ["Swim Suit", "swim-suit"], ["Teacher", "teacher"], ["Tentacle", "tentacle"],
    ["Threesome", "threesome"], ["Toys", "toys"], ["Trap", "trap"], ["Tsundere", "tsundere"],
    ["Ugly Bastard", "ugly-bastard"], ["Uncensored", "uncensored"], ["Vanilla", "vanilla"], ["Virgin", "virgin"],
    ["X-Ray", "x-ray"], ["Yuri", "yuri"]
];

const STUDIOS = [
    ["BOMB! CUTE! BOMB!", "bomb-cute-bomb"], ["BreakBottle", "breakbottle"], ["ChiChinoya", "chichinoya"],
    ["ChuChu", "chuchu"], ["Circle Tribute", "circle-tribute"], ["Collaboration Works", "collaboration-works"],
    ["Digital Works", "digital-works"], ["Discovery", "discovery"], ["Edge", "edge"],
    ["Gold Bear", "gold-bear"], ["Green Bunny", "green-bunny"], ["Himajin Planning", "himajin-planning"],
    ["King Bee", "king-bee"], ["L.", "l"], ["Lune Pictures", "lune-pictures"], ["MS Pictures", "ms-pictures"],
    ["Majin", "majin"], ["Mary Jane", "mary-jane"], ["Mediabank", "mediabank"],
    ["Mousou Senka", "mousou-senka"], ["Natural High", "natural-high"], ["Nihikime no Dozeu", "nihikime-no-dozeu"],
    ["Nur", "nur"], ["Pashmina", "pashmina"], ["Peak Hunt", "peak-hunt"], ["Pink Pineapple", "pink-pineapple"],
    ["Pixy Soft", "pixy-soft"], ["Pixy", "pixy"], ["PoRO", "poro"], ["Queen Bee", "queen-bee"],
    ["Rabbit Gate", "rabbit-gate"], ["SELFISH", "selfish"], ["Seven", "seven"], ["Showten", "showten"],
    ["Studio 1st", "studio-1st"], ["Studio Eromatick", "studio-eromatick"], ["Studio Fantasia", "studio-fantasia"],
    ["Suiseisha", "suiseisha"], ["Suzuki Mirano", "suzuki-mirano"], ["T-Rex", "t-rex"],
    ["Toranoana", "toranoana"], ["Union Cho", "union-cho"], ["Valkyria", "valkyria"],
    ["White Bear", "white-bear"], ["ZIZ", "ziz"]
];

const ORDERS = [
    ["View Count", "view-count"],
    ["A-Z", "az"],
    ["Z-A", "za"],
    ["Recently Uploaded", "recently-uploaded"],
    ["Recently Released", "recently-released"],
    ["Oldest Uploads", "oldest-uploads"],
    ["Oldest Releases", "oldest-releases"]
];
// -----------------------------------------

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        const overrideUrl = this.getPreference("override_base_url");
        return (overrideUrl || "").trim() || this.source.baseUrl.trim();
    }

    getHeaders(referer) {
        const baseUrl = this.getBaseUrl();
        return {
            "Referer": referer || baseUrl,
            "Origin": baseUrl
        };
    }

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
        const client = new Client();
        const baseUrl = this.getBaseUrl();
        const episodePageUrl = baseUrl + url;
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

        // NEW LOGIC: if "enable_feature_x" is true → single quality, else → all qualities
        const enableSingle = this.getPreference("enable_feature_x") === "true";
        if (enableSingle) {
            const preferredQuality = this.getPreference("hstream_pref_quality") || "1080p";
            const preferredVideo = videos.find(video => video.quality === preferredQuality);
            if (preferredVideo) {
                return [preferredVideo];
            }
        }

        videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        return videos;
    }

    getFilterList() {
        const g = (name, value) => ({ type_name: "CheckBox", name, value });
        const f = (name, value) => ({ type_name: "SelectOption", name, value });

        const genres = GENRES.map(([name, value]) => g(name, value));
        const studios = STUDIOS.map(([name, value]) => g(name, value));
        const orders = ORDERS.map(([name, value]) => f(name, value));

        return [
            { type_name: "SelectFilter", name: "Order by", state: 0, values: orders },
            { type_name: "GroupFilter", name: "Include Genres", state: genres },
            { type_name: "GroupFilter", name: "Exclude Genres (Blacklist)", state: genres },
            { type_name: "GroupFilter", name: "Studios", state: studios }
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
                    dialogMessage: `Default: ${this.source.baseUrl.trim()}`
                }
            },
            {
                key: "hstream_pref_quality",
                listPreference: {
                    title: "Preferred quality",
                    summary: "Note: Not all videos have all qualities available.",
                    valueIndex: 1,
                    entries: ["720p (HD)", "1080p (FULLHD)", "2160p (4K)"],
                    entryValues: ["720p", "1080p", "2160p"]
                }
            },
            {
                key: "enable_feature_x",
                switchPreferenceCompat: {
                    title: "Enable Feature X",
                    summary: "When enabled, only the selected preferred quality is shown; otherwise, all available qualities are listed.",
                    value: true
                }
            }
        ];
    }
}

