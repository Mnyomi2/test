// ==Mangayomi==
// @name         Hentai JP
// @version      1.0.0
// @description  Hentai JP extension
// @author       Don
// @site         https://hentai.jp
// ==/Mangayomi==

const mangayomiSources = [{
    "name": "Hentai JP",
    "id": 8172938104,
    "lang": "en",
    "baseUrl": "https://hentai.jp",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai.jp",
    "typeSource": "single",
    "itemType": 1, // 1 for anime
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentaijp.js" // Fictional path
}];

// ------------  NEW CONSTANTS FOR HENTAI.JP  ------------
const ORDERS = [
    ["Most Recent", "mr"],
    ["Most Viewed", "mv"],
    ["Most Liked", "tf"],
    ["Most Discussed", "md"]
];

// A selection of popular tags with their IDs from the site.
// Format: ["Display Name", "ID"]
const TAGS = [
    ["3D", "1"], ["Ahegao", "5"], ["Anal", "7"], ["Big Boobs", "10"], ["Blowjob", "11"],
    ["Bondage", "12"], ["Cosplay", "17"], ["Creampie", "18"], ["Dark Skin", "19"], ["Deepthroat", "20"],
    ["Facial", "25"], ["Fantasy", "26"], ["Femdom", "27"], ["Futanari", "32"], ["Gangbang", "33"],
    ["Glasses", "34"], ["Handjob", "36"], ["Harem", "37"], ["Incest", "39"], ["Loli", "43"],
    ["Maid", "44"], ["Masturbation", "45"], ["Milf", "46"], ["Mind Control", "48"], ["Monster Girl", "49"],
    ["Nakadashi", "50"], ["Netorare", "52"], ["Nurse", "55"], ["Orgy", "56"], ["Paizuri", "57"],
    ["Pregnant", "60"], ["Rape", "62"], ["Schoolgirl", "64"], ["Sex Toys", "66"], ["Shota", "67"],
    ["Tentacles", "73"], ["Threesome", "74"], ["Tsundere", "76"], ["Ugly Bastard", "77"], ["Uncensored", "78"],
    ["X-ray", "82"], ["Yaoi", "83"], ["Yuri", "84"]
];
// ----------------------------------------------------

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

    // Parses a video item from a list page (popular, latest, search)
    _parseAnimeFromElement(element) {
        const linkElement = element.selectFirst("a.video-item__link-overlay");
        const imgElement = element.selectFirst("img.video-item__img");

        const name = imgElement.attr("alt");
        const link = linkElement.getHref; // This is a full URL, we need the relative path
        const relativeLink = link.replace(this.getBaseUrl(), "");
        const imageUrl = imgElement.getSrc;

        return { name, imageUrl, link: relativeLink };
    }

    async _getAnimePage(path) {
        const baseUrl = this.getBaseUrl();
        const res = await this.client.get(baseUrl + path, this.getHeaders());
        const doc = new Document(res.body);

        const list = doc.select("div.video-item").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("a[rel=next]");
        return { list, hasNextPage };
    }

    async getPopular(page) {
        // 'mv' is for 'Most Viewed'
        return this._getAnimePage(`/videos/?o=mv&p=${page}`);
    }

    async getLatestUpdates(page) {
        // 'mr' is for 'Most Recent'
        return this._getAnimePage(`/videos/?o=mr&p=${page}`);
    }

    async search(query, page, filters) {
        const getCheckBoxValues = (state) => state.filter(i => i.state).map(i => i.value);
        const getSelectValue = (filter) => filter.values[filter.state].value;

        let params = new URLSearchParams();
        params.set("p", page.toString());

        if (query) {
            params.set("q", query);
        }

        if (filters && filters.length > 0) {
            const order = getSelectValue(filters[0]);
            params.set("o", order);

            const includedTags = getCheckBoxValues(filters[1].state);
            includedTags.forEach(tagId => params.append("tag_ids[]", tagId));
        }

        const url = `${this.getBaseUrl()}/videos/?${params.toString()}`;
        
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = doc.select("div.video-item").map(el => this._parseAnimeFromElement(el));
        const hasNextPage = !!doc.selectFirst("a[rel=next]");
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const baseUrl = this.getBaseUrl();
        const pageUrl = baseUrl + url;
        const res = await this.client.get(pageUrl, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.video-title").text.trim();
        const imageUrl = doc.selectFirst("meta[property='og:image']").attr("content");
        const description = doc.selectFirst("div.video-description")?.text.trim() || "No description available.";
        const genre = doc.select("div.tag-list__item a").map(el => el.text.trim());
        const status = 1; // Completed, since each entry is a single video

        // Since each entry is a single video, we treat it as a "series" with one "chapter".
        const chapters = [{
            name: name, // The chapter name is the video title
            url: url    // The url to get videos is the same detail page url
        }];

        return {
            name,
            imageUrl,
            description,
            genre,
            status,
            chapters,
            link: pageUrl
        };
    }

    async getVideoList(url) {
        const baseUrl = this.getBaseUrl();
        const episodePageUrl = baseUrl + url;
        const res = await this.client.get(episodePageUrl, this.getHeaders(episodePageUrl));
        const doc = new Document(res.body);

        const videoElements = doc.select("video#video-player > source");
        if (videoElements.length === 0) {
            throw new Error("No video sources found on the page.");
        }

        let videos = videoElements.map(el => {
            const videoUrl = el.getSrc;
            const quality = `${el.attr("size")}p`; // e.g., "1080p", "720p"
            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: quality,
            };
        });

        const showPreferredOnly = this.getPreference("enable_preferred_quality_only") ?? true;

        if (showPreferredOnly) {
            const preferredQuality = this.getPreference("pref_quality") || "1080p";
            const preferredVideo = videos.find(video => video.quality === preferredQuality);
            if (preferredVideo) {
                return [preferredVideo];
            }
        }
        
        // Sort from highest to lowest quality
        videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
        return videos;
    }

    getFilterList() {
        const g = (name, value) => ({ type_name: "CheckBox", name, value });
        const f = (name, value) => ({ type_name: "SelectOption", name, value });

        const tags = TAGS.map(([name, value]) => g(name, value));
        const orders = ORDERS.map(([name, value]) => f(name, value));

        return [
            { type_name: "SelectFilter", name: "Sort by", state: 0, values: orders },
            { type_name: "GroupFilter", name: "Tags", state: tags },
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
                key: "pref_quality",
                listPreference: {
                    title: "Preferred quality",
                    summary: "Note: Not all videos have all qualities available.",
                    valueIndex: 0, // Default to 1080p
                    entries: ["1080p", "720p", "480p", "360p"],
                    entryValues: ["1080p", "720p", "480p", "360p"]
                }
            },
            {
                key: "enable_preferred_quality_only",
                switchPreferenceCompat: {
                    title: "Show Preferred Quality Only",
                    summary: "If enabled, only shows the selected quality. If disabled, shows all available qualities.",
                    value: true,
                }
            }
        ];
    }
}