const mangayomiSources = [{
    "name": "HentaiHaven",
    "id": 1696954203651,
    "lang": "en",
    "baseUrl": "https://hentaihaven.co",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaihaven.co",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.6",
    "pkgPath": "anime/src/en/hentaihaven.js"
}];



class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    /**
     * Dynamically determines if the "Latest" tab should be shown based on user preference.
     */
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
        const url = `${this.getBaseUrl()}/?page=${page}`;
        return this.parseDirectory(url);
    }
    
    /**
     * Fetches the latest updates. This method is called only when the "Latest" tab is enabled
     * by the user in the source preferences. It mirrors the getPopular functionality.
     */
    async getLatestUpdates(page) {
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        const url = `${this.getBaseUrl()}/search/${query}?page=${page}`;
        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("a.a_item");

        for (const item of items) {
            const name = item.selectFirst("div.video_title").text;
            const link = this.getBaseUrl() + item.getHref;
            const imgElement = item.selectFirst("img");
            const imageUrl = this.getBaseUrl() + (imgElement.attr("data-src") || imgElement.getSrc);
            list.push({ name, imageUrl, link });
        }

        const hasNextPage = items.length > 0;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const seriesName = doc.selectFirst("span:contains(Series) + span.sub_r a")?.text;
        const name = seriesName ?? doc.selectFirst("h1.video_title").text;
        
        const imgElement = doc.selectFirst("div.cover img");
        const imageUrl = this.getBaseUrl() + (imgElement.attr("data-src") || imgElement.getSrc);

        const originalDescription = doc.selectFirst("div.video_description p")?.text?.trim() ?? "";
        
        const details = [];
        const brand = doc.selectFirst("span:contains(Brand) + span.sub_r")?.text;
        if (brand) details.push(`Brand: ${brand}`);

        const releaseDate = doc.selectFirst("span:contains(Release Date) + span.sub_r")?.text;
        if (releaseDate) details.push(`Release Date: ${releaseDate}`);
        
        const uploadDate = doc.selectFirst("span:contains(Upload Date) + span.sub_r")?.text;
        if (uploadDate) details.push(`Upload Date: ${uploadDate}`);

        const views = doc.selectFirst("span:contains(Views) + span.sub_r")?.text;
        if (views) details.push(`Views: ${views}`);

        const altTitles = doc.selectFirst("div.r_item.full span.sub_t")?.text;
        if (altTitles) details.push(`Alternate Titles: ${altTitles}`);

        let description = "";
        if (details.length > 0) {
            description += details.join("\n") + "\n\n";
        }
        description += originalDescription;

        const link = url;
        const status = 1;

        const genre = [];
        const genreElements = doc.select("div.video_tags > a[href*='/genre/']");
        for (const element of genreElements) {
            genre.push(element.text);
        }

        const chapters = [];
        const episodeElements = doc.select("div.mfs_item");

        if (episodeElements.length > 0) {
            for (const element of episodeElements) {
                const epName = element.selectFirst("div.infos .title a").text;
                const epUrl = this.getBaseUrl() + element.selectFirst("div.infos .title a").getHref;
                chapters.push({ name: epName, url: epUrl });
            }
            chapters.reverse();
        } else {
            const epName = doc.selectFirst("h1.video_title").text;
            chapters.push({ name: epName, url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        // --- Step 1: Standard video page scraping to find the initial stream URL ---
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const iframeSrc1 = doc.selectFirst("div.player iframe")?.getSrc;
        if (!iframeSrc1) return [];

        const res1 = await this.client.get(iframeSrc1, this.getHeaders(url));
        const doc1 = new Document(res1.body);
        const playerDataId = doc1.selectFirst("li[data-id]")?.attr("data-id");
        if (!playerDataId) return [];

        const playerUrl = "https://nhplayer.com" + playerDataId;
        const playerRes = await this.client.get(playerUrl, this.getHeaders(iframeSrc1));
        const scriptContent = playerRes.body;

        const streamUrlMatch = scriptContent.match(/file:\s*['"](.*?)['"]/);
        if (!streamUrlMatch || !streamUrlMatch[1]) return [];
        
        const masterPlaylistUrl = streamUrlMatch[1];
        const streams = [];

        // --- Step 2: Check preference and parse M3U8 if applicable ---
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
                    if (!streamUrl.startsWith('http')) {
                        streamUrl = baseUrl + streamUrl;
                    }

                    parsedQualities.push({
                        url: streamUrl,
                        originalUrl: streamUrl,
                        quality: qualityName,
                        headers: this.getHeaders(streamUrl)
                    });
                }
                
                if (parsedQualities.length > 0) {
                    streams.push({
                        url: masterPlaylistUrl,
                        originalUrl: masterPlaylistUrl,
                        quality: `Auto (HLS)`,
                        headers: this.getHeaders(masterPlaylistUrl)
                    });
                     // Sort qualities from highest to lowest
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    streams.push(...parsedQualities);
                    return streams;
                }
            } catch (e) {
                // If parsing fails, fall through to add the default stream
            }
        }

        // --- Step 3: Fallback to default behavior ---
        streams.push({
            url: masterPlaylistUrl,
            originalUrl: masterPlaylistUrl,
            quality: "Default",
            headers: this.getHeaders(masterPlaylistUrl)
        });

        return streams;
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Toggles the visibility of the 'Latest' tab for this source.",
                    value: false,
                }
            },
            {
                key: "iptv_extract_qualities",
                switchPreferenceCompat: {
                    title: "Enable Stream Quality Extraction",
                    summary: "If a video provides multiple qualities (HLS/M3U8), this will list them. May not work for all videos.",
                    value: false, // Default is disabled
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
