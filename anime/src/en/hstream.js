const mangayomiSources = [{
    "name": "Hstream",
    "id": 3720491820,
    "lang": "en",
    "baseUrl": "https://hstream.moe",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hstream.moe",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
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

    getHeaders(referer = this.source.baseUrl) {
        return {
            "Referer": referer,
            "Origin": this.source.baseUrl
        };
    }

    // Helper function to parse anime from a list element
    _parseAnimeFromElement(element) {
        const url = element.getHref;
        const episode = url.substring(url.lastIndexOf("-") + 1, url.lastIndexOf("/"));
        const name = element.selectFirst("img").attr("alt");
        const imageUrl = `${this.source.baseUrl}/images${url.substring(0, url.lastIndexOf("-"))}/cover-ep-${episode}.webp`;
        return { name, imageUrl, link: url };
    }

    // Helper to fetch and parse a page of anime
    async _getAnimePage(path) {
        const res = await this.client.get(this.source.baseUrl + path, this.getHeaders());
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
        const getCheckBoxValues = (state) => state.filter(i => i.state).map(i => i.value);
        const getSelectValue = (filter) => filter.values[filter.state].value;

        let url = `${this.source.baseUrl}/search?page=${page}`;
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
        const res = await this.client.get(this.source.baseUrl + url, this.getHeaders());
        const doc = new Document(res.body);

        const floatleft = doc.selectFirst("div.relative > div.justify-between > div");
        const name = floatleft.selectFirst("div > h1").text;
        const imageUrl = doc.selectFirst("div.float-left > img.object-cover")?.getSrc;
        const genre = doc.select("ul.list-none > li > a").map(el => el.text);
        const description = doc.selectFirst("div.relative > p.leading-tight")?.text;
        const status = 1; // Completed

        const toDate = (dateStr) => {
            if (!dateStr) return "0";
            try {
                return new Date(dateStr.trim()).getTime().toString();
            } catch (e) {
                return "0";
            }
        };

        const dateUploadStr = doc.selectFirst("a:has(i.fa-upload)")?.text.replace(/\|/g, "");
        const dateUpload = toDate(dateUploadStr);

        const epNumStr = url.substring(url.lastIndexOf("-") + 1, url.lastIndexOf("/"));
        
        const chapters = [{
            name: `Episode ${epNumStr}`,
            url: url,
            dateUpload: dateUpload
        }];

        return {
            name,
            imageUrl,
            description,
            genre,
            status,
            chapters,
            link: this.source.baseUrl + url
        };
    }

    async getVideoList(url) {
        const episodePageUrl = this.source.baseUrl + url;
        const res = await this.client.get(episodePageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const csrfToken = doc.selectFirst('meta[name="csrf-token"]').attr("content");
        const episodeId = doc.selectFirst("input#e_id").attr("value");

        const playerApiUrl = `${this.source.baseUrl}/player/api`;
        const headers = {
            "Referer": episodePageUrl,
            "Origin": this.source.baseUrl,
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": csrfToken,
            "Content-Type": "application/json;charset=UTF-8"
        };
        const payload = JSON.stringify({ "episode_id": episodeId });

        const apiRes = await this.client.post(playerApiUrl, headers, payload);
        const data = JSON.parse(apiRes.body);

        const urlBase = data.stream_domains[0] + "/" + data.stream_url;
        const subtitles = [{ file: `${urlBase}/eng.ass`, label: "English" }];

        const getVideoUrlPath = (isLegacy, resolution) => {
            if (isLegacy) {
                return resolution === "720" ? "/x264.720p.mp4" : `/av1.${resolution}.webm`;
            } else {
                return `/${resolution}/manifest.mpd`;
            }
        };

        const resolutions = ["720", "1080"];
        if (data.resolution === "4k") {
            resolutions.push("2160");
        }

        let videos = resolutions.map(res => {
            const videoUrl = urlBase + getVideoUrlPath(data.legacy !== 0, res);
            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: `${res}p`,
                subtitles: subtitles
            };
        });

        const preferredQuality = this.getPreference("hstream_pref_quality") || "720p";
        videos.sort((a, b) => {
            const aIsPreferred = a.quality.includes(preferredQuality);
            const bIsPreferred = b.quality.includes(preferredQuality);
            if (aIsPreferred && !bIsPreferred) return -1;
            if (!aIsPreferred && bIsPreferred) return 1;

            const aRes = parseInt(a.quality);
            const bRes = parseInt(b.quality);
            return bRes - aRes;
        });

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
        return [{
            key: "hstream_pref_quality",
            listPreference: {
                title: "Preferred quality",
                summary: "Note: Not all videos have all qualities available.",
                valueIndex: 0,
                entries: ["720p (HD)", "1080p (FULLHD)", "2160p (4K)"],
                entryValues: ["720p", "1080p", "2160p"],
            }
        }];
    }
}