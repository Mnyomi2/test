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
        const url = page === 1 
            ? `${this.getBaseUrl()}/?m_orderby=views`
            : `${this.getBaseUrl()}/page/${page}/?m_orderby=views`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = page === 1
            ? `${this.getBaseUrl()}/?m_orderby=new-manga`
            : `${this.getBaseUrl()}/page/${page}/?m_orderby=new-manga`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : "";
        let url;

        if (query) {
            url = `${this.getBaseUrl()}/page/${page}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
        } else {
            url = page === 1 
                ? `${this.getBaseUrl()}/`
                : `${this.getBaseUrl()}/page/${page}/`;
        }

        if (sortValue) {
            url += (url.includes("?") ? "&" : "?") + `m_orderby=${sortValue}`;
        }
        
        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.page-item-detail");

        for (const item of items) {
            const nameElement = item.selectFirst("h3.h5 a");
            if (!nameElement) continue;

            const name = nameElement.text.trim();
            const link = nameElement.getHref;
            const imageUrl = item.selectFirst("div.item-thumb img")?.getSrc;

            if (name && link && imageUrl) {
                list.push({ name, imageUrl, link });
            }
        }
        
        const hasNextPage = doc.selectFirst("a.nextpostslink") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("div.post-title h1").text.trim();
        const imageUrl = doc.selectFirst("div.summary_image img")?.getSrc;
        const description = doc.selectFirst("div.summary__content")?.text?.trim() ?? "";
        const link = url;
        const status = 1; // Completed

        const genre = [];
        const genreElements = doc.select("div.genres-content a");
        for (const element of genreElements) {
            genre.push(element.text);
        }

        const chapters = [];
        const episodeElements = doc.select("li.wp-manga-chapter");
        for (const element of episodeElements) {
            const a = element.selectFirst("a");
            if (!a) continue;
            
            const dateSpanText = element.selectFirst("span.chapter-release-date")?.text ?? "";
            const epName = a.text.replace(dateSpanText, "").trim();
            const epUrl = a.getHref;
            chapters.push({ name: epName, url: epUrl });
        }
        
        chapters.reverse();

        if (chapters.length === 0) {
            chapters.push({ name: "Watch", url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const thumbnailUrl = doc.selectFirst('meta[itemprop="thumbnailUrl"]')?.attr("content");
        if (!thumbnailUrl) return [];
        
        const pathParts = thumbnailUrl.split('/');
        if (pathParts.length < 2) return [];
        
        const identifier = pathParts[pathParts.length - 2];
        if (!identifier) return [];

        const masterPlaylistUrl = `https://master-lengs.org/api/v3/hh/${identifier}/master.m3u8`;
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
                    
                    const preferredQuality = this.getPreference("preferred_quality");
                    if (preferredQuality !== "ask") {
                        if (preferredQuality === "best") {
                            return [parsedQualities[0]];
                        }
                        if (preferredQuality === "worst") {
                            return [parsedQualities[parsedQualities.length - 1]];
                        }
                        let targetStream = parsedQualities.find(q => q.quality.includes(preferredQuality));
                        if (!targetStream) {
                            const preferredNum = parseInt(preferredQuality);
                            targetStream = parsedQualities.find(q => parseInt(q.quality) <= preferredNum);
                        }
                        if (!targetStream) {
                            targetStream = parsedQualities[0];
                        }
                        return [targetStream];
                    }

                    return streams;
                }
            } catch (e) { /* Fall through */ }
        }
        streams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: "Default", headers: this.getHeaders(masterPlaylistUrl) });
        return streams;
    }

    getFilterList() {
        const sortOptions = [
            { name: "Default", value: "" },
            { name: "Latest", value: "latest" },
            { name: "A-Z", value: "alphabet" },
            { name: "Rating", value: "rating" },
            { name: "Trending", value: "trending" },
            { name: "Most Views", value: "views" },
        ];
        return [
            { 
                type_name: "SelectFilter", 
                name: "Sort by", 
                state: 0, 
                values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) 
            },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Toggles the visibility of the 'Latest' tab for this source.",
                    value: true,
                }
            },
            {
                key: "iptv_extract_qualities",
                switchPreferenceCompat: {
                    title: "Enable Stream Quality Extraction",
                    summary: "If a video provides multiple qualities (HLS/M3U8), this will list them. May not work for all videos.",
                    value: true,
                }
            },
            {
                key: "preferred_quality",
                listPreference: {
                    title: "Preferred Quality",
                    summary: "Select the quality to play by default. 'Ask' will show a selection dialog if multiple are found.",
                    entries: ["Best", "Worst", "1080p", "720p", "480p", "Ask"],
                    entryValues: ["best", "worst", "1080", "720", "480", "ask"],
                    valueIndex: 5
                }
            },
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source",
                    value: this.source.baseUrl,
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}
