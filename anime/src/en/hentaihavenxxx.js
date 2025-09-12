const mangayomiSources = [{
    "name": "HentaiHavenxxx",
    "id": 169691022124,
    "lang": "en",
    "baseUrl": "https://hentaihaven.xxx",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaihaven.xxx",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "3.0.1",
    "pkgPath": "anime/src/en/hentaihavenxxx.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return this.getPreference("enable_latest_tab");
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        const url = page === 1 ?
            `${this.getBaseUrl()}/?m_orderby=views` :
            `${this.getBaseUrl()}/page/${page}/?m_orderby=views`;
        return this.parseDirectory(url);
    }

    async getLatestUpdates(page) {
        const url = page === 1 ?
            `${this.getBaseUrl()}/?m_orderby=new-manga` :
            `${this.getBaseUrl()}/page/${page}/?m_orderby=new-manga`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const params = [];
        params.push(`post_type=wp-manga`);

        if (query) {
            params.push(`s=${encodeURIComponent(query)}`);
        } else {
            params.push(`s=`);
        }

        const sortFilter = filters.find(f => f.name === "Sort by");
        if (sortFilter) {
            const sortValue = sortFilter.values[sortFilter.state].value;
            if (sortValue) {
                params.push(`m_orderby=${sortValue}`);
            }
        }

        const genreFilter = filters.find(f => f.name === "Genres");
        if (genreFilter) {
            const included = genreFilter.state
                .filter(g => g.state)
                .map(g => `genre[]=${g.value}`);
            if (included.length > 0) {
                params.push(...included);
            }
        }

        const url = page === 1 ?
            `${this.getBaseUrl()}/?${params.join("&")}` :
            `${this.getBaseUrl()}/page/${page}/?${params.join("&")}`;

        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.page-item-detail.video");

        for (const item of items) {
            const name = item.selectFirst("h3.h5 a").text.trim();
            const link = item.selectFirst("div.item-thumb a").getHref;
            const imageUrl = item.selectFirst("div.item-thumb img").getSrc;
            list.push({ name, imageUrl, link });
        }

        const hasNextPage = doc.selectFirst("a.nextpostslink") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.post-title h1").text.trim();
        const imageUrl = doc.selectFirst("div.summary_image img").getSrc;
        const descriptionText = doc.selectFirst("div.description-summary div.summary__content")?.text?.trim() ?? "";

        const altTitles = doc.selectFirst(".post-content_item:has(.summary-heading:contains(Alternative)) .summary-content")?.text?.trim();
        const description = altTitles ? `Alternative: ${altTitles}\n\n${descriptionText}` : descriptionText;
        
        const link = url;
        const status = 1;

        const genre = [];
        const genreElements = doc.select("div.genres-content a");
        for (const element of genreElements) {
            genre.push(element.text.trim());
        }

        const chapters = [];
        const episodeElements = doc.select("li.wp-manga-chapter");
        if (episodeElements.length > 0) {
            for (const element of episodeElements) {
                const a = element.selectFirst("a");
                const epName = a.text.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
                const epUrl = a.getHref;
                chapters.push({ name: epName, url: epUrl });
            }
            chapters.reverse();
        } else {
            chapters.push({ name: name, url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const body = res.body;

        const thumbnailUrlMatch = body.match(/<meta itemprop="thumbnailUrl" content="([^"]+)"/);
        if (!thumbnailUrlMatch || !thumbnailUrlMatch[1]) return [];

        const thumbnailUrl = thumbnailUrlMatch[1];
        // Example: https://himg.nl/images/hh/boku-no-pico-3/poster.jpg
        const slugMatch = thumbnailUrl.match(/\/hh\/([^\/]+)\/poster\.jpg/);
        if (!slugMatch || !slugMatch[1]) return [];

        const slug = slugMatch[1];
        const masterPlaylistUrl = `https://master-lengs.org/api/v3/hh/${slug}/master.m3u8`;
        
        const streams = [];

        if (this.getPreference("iptv_extract_qualities") && masterPlaylistUrl.toLowerCase().includes('.m3u8')) {
            try {
                const masterPlaylistContent = (await this.client.get(masterPlaylistUrl, this.getHeaders(masterPlaylistUrl))).body;
                const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
                let match;
                const parsedQualities = [];
                const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
                while ((match = regex.exec(masterPlaylistContent)) !== null) {
                    const resolution = match[1];
                    const bandwidth = match[2];
                    let qualityName = resolution ? `${resolution.split('x')[1]}p` : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                    let streamUrl = match[3].trim();
                    if (!streamUrl.startsWith('http')) streamUrl = baseUrl + streamUrl;
                    parsedQualities.push({ url: streamUrl, originalUrl: streamUrl, quality: qualityName, headers: this.getHeaders(streamUrl) });
                }
                if (parsedQualities.length > 0) {
                    streams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: `Auto (HLS)`, headers: this.getHeaders(masterPlaylistUrl) });
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    streams.push(...parsedQualities);
                    return streams;
                }
            } catch (e) { /* Fall through */ }
        }
        streams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: "Default", headers: this.getHeaders(masterPlaylistUrl) });
        return streams;
    }

    getFilterList() {
        const sortOptions = [
            { name: "Relevance", value: "" },
            { name: "Latest", value: "latest" },
            { name: "A-Z", value: "alphabet" },
            { name: "Rating", value: "rating" },
            { name: "Trending", value: "trending" },
            { name: "Most Views", value: "views" }
        ];

        const siteGenres = ["3d-hentai", "action", "adventure", "anal", "bestiality", "big-boobs", "blowjob", "bondage", "bukkake", "censored", "cheating", "comedy", "cosplay", "creampie", "dark-skin", "double-penetration", "dubbed", "futanari", "gangbang", "gender-bender", "glasses", "harem", "horror", "incest", "inflation", "lactation", "loli", "maid", "masturbation", "milf", "mind-break", "mind-control", "monster", "neko", "ntr", "nurse", "orgy", "pov", "pregnant", "public-sex", "rape", "reverse-rape", "school-girl", "scat", "shota", "softcore", "straight", "succubus", "tentacles", "threesome", "trap", "tsundere", "ugly-bastard", "uncensored", "vanilla", "virgin", "x-ray", "yaoi", "yuri"];

        const c = (name, value) => ({ type_name: "CheckBox", name, value });
        const toDisplayName = (str) => str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const genreCheckFilters = siteGenres.map(g => c(toDisplayName(g), g));

        return [
            { type_name: "SelectFilter", name: "Sort by", state: 0, values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) },
            { type_name: "GroupFilter", name: "Genres", state: genreCheckFilters },
        ];
    }

    getSourcePreferences() {
        return [{
            key: "enable_latest_tab",
            switchPreferenceCompat: {
                title: "Enable 'Latest' Tab",
                summary: "Toggles the visibility of the 'Latest' tab for this source.",
                value: true,
            }
        }, {
            key: "iptv_extract_qualities",
            switchPreferenceCompat: {
                title: "Enable Stream Quality Extraction",
                summary: "If a video provides multiple qualities (HLS/M3U8), this will list them. May not work for all videos.",
                value: false,
            }
        }, {
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Use a different mirror/domain for the source",
                value: this.source.baseUrl,
                dialogTitle: "Enter new Base URL",
                dialogMessage: "",
            }
        }];
    }
}